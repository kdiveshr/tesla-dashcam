import { Injectable } from '@angular/core';
import { TeslaTelemetrySample } from '../interfaces/tesla-telemetry.interface';

export interface Point2D {
  x: number;
  y: number;
}

export interface PathRibbon {
  leftBoundary: Point2D[];
  rightBoundary: Point2D[];
  centerPath: Point2D[];
  polygon: Point2D[];
}

export interface CameraCalibration {
  cameraHeightMeters: number;   // height of camera lens above ground
  cameraPitchDegrees: number;   // negative = tilted down
  cameraForwardMeters: number;  // how far forward of camera the "front" of the path starts
  vehicleWidthMeters: number;
  focalLengthScale: number;     // fx/fy as a fraction of canvas width
  horizonOffsetRatio: number;   // fine-tune where horizon lands vertically
}

/**
 * IMPORTANT: these four numbers are the ONLY things that should control where
 * the path lands on screen. There must be no per-point fudge factor applied
 * after projection — if the path doesn't sit on the road, these numbers are
 * wrong for your actual camera, not the math.
 *
 * How to calibrate against real footage:
 *  1. Pause on a frame with a long straight stretch of road with visible
 *     lane markings of known width (US lane ≈ 3.6m, adjust for your region).
 *  2. Measure, in pixels, the on-screen width between the lane lines at two
 *     known distances (e.g. 5m and 20m ahead — use lane-marking dash length/
 *     gap standards, or a known landmark, to estimate distance).
 *  3. Solve for focalLengthScale so that projected width at those two
 *     distances matches the measured pixel width (fx = width_px * distance_m
 *     / lane_width_m).
 *  4. Adjust cameraPitchDegrees until the horizon line (where the projected
 *     "infinitely far" point lands) matches the real horizon in the footage.
 *  5. cameraHeightMeters should just be the physical mount height — measure
 *     it directly (typically 1.1–1.4m for a windshield-mounted dashcam near
 *     the mirror).
 */
const DEFAULT_CALIBRATION: CameraCalibration = {
  cameraHeightMeters: 1.2,
  cameraPitchDegrees: -6,
  cameraForwardMeters: 3.2,
  vehicleWidthMeters: 1.3,
  focalLengthScale: 0.62,
  horizonOffsetRatio: 0.0,
};

@Injectable({ providedIn: 'root' })
export class FsdPathCalculator {
  // Smoothed steering state, persisted across frames to kill sensor jitter.
  private smoothedSteeringDeg = 0;

  calculatePath(
    sample: TeslaTelemetrySample | undefined,
    canvasWidth: number,
    canvasHeight: number,
    customCalibration?: Partial<CameraCalibration>,
    futureSamples: TeslaTelemetrySample[] = [],
  ): PathRibbon {
    const empty: PathRibbon = {
      leftBoundary: [],
      rightBoundary: [],
      centerPath: [],
      polygon: [],
    };

    if (canvasWidth <= 0 || canvasHeight <= 0) return empty;

    const speedKph = sample?.speedKph ?? 0;

    // Hard stop condition: no path at all when halted.
    if (speedKph < 1.8) {
      this.smoothedSteeringDeg = sample?.steeringAngleDegrees ?? this.smoothedSteeringDeg;
      return empty;
    }

    const cal = { ...DEFAULT_CALIBRATION, ...customCalibration };
    const speedMps = (speedKph * 1000) / 3600;
    const baseMaxDistance = Math.min(9, Math.max(5, speedMps * 0.55 + 4));
    const startOffsetMeters = 0; // path starts as close to the camera as the calibration allows
    const stepMeters = 0.45;

    // Preferred path: the vehicle's OWN recorded trajectory. This is ground
    // truth — it always matches the road, curves and all, because it's
    // literally where the car drove. Falls back to the steering-angle
    // extrapolation model only when GPS/heading data isn't usable (e.g.
    // GPS dropout, no lookahead samples available, or right at the very
    // end of the recording).
    let center3D = this.buildTrajectoryFromGps(sample, futureSamples, cal, baseMaxDistance, stepMeters, startOffsetMeters);

    if (!center3D) {
      center3D = this.buildTrajectoryFromSteering(sample, cal, baseMaxDistance, stepMeters, startOffsetMeters);
    }

    if (center3D.length < 2) return empty;

    const halfWidth = cal.vehicleWidthMeters / 2.0;
    // Extra progressive narrowing beyond ordinary camera-perspective
    // shrinkage: width_at_distance = halfWidth * (1 - taperStrength * t),
    // where t goes 0 (at the vehicle) -> 1 (at the far end of the path).
    // This is monotonic — always full width at the start, always narrower
    // further out — unlike the earlier ramp attempt, so it can't bulge.
    // Raise taperStrength for a more aggressive point-like narrowing,
    // lower it for a more constant-width ribbon.
    const taperStrength = 0.65;
    const maxDistanceMeters = baseMaxDistance;

    const leftBoundary2D: Point2D[] = [];
    const rightBoundary2D: Point2D[] = [];
    const centerPath2D: Point2D[] = [];

    const fx = canvasWidth * cal.focalLengthScale;
    const fy = canvasWidth * cal.focalLengthScale;
    const cx = canvasWidth / 2.0;
    const cy = canvasHeight / 2.0 + canvasHeight * cal.horizonOffsetRatio;

    const pitchRad = (cal.cameraPitchDegrees * Math.PI) / 180;
    const cosPitch = Math.cos(pitchRad);
    const sinPitch = Math.sin(pitchRad);

    for (let i = 0; i < center3D.length; i++) {
      const pt = center3D[i];

      let yaw = 0;
      if (i < center3D.length - 1) {
        const next = center3D[i + 1];
        yaw = Math.atan2(next.x - pt.x, next.z - pt.z);
      } else if (i > 0) {
        const prev = center3D[i - 1];
        yaw = Math.atan2(pt.x - prev.x, pt.z - prev.z);
      }

      const dx = Math.cos(yaw) * halfWidth;
      const dz = -Math.sin(yaw) * halfWidth;

      const distanceAlongPath = i * stepMeters;
      const t = Math.min(1, distanceAlongPath / Math.max(1, maxDistanceMeters));
      const taperFactor = 1 - t * taperStrength;

      const left3D = { x: pt.x - dx * taperFactor, y: 0, z: pt.z - dz * taperFactor };
      const right3D = { x: pt.x + dx * taperFactor, y: 0, z: pt.z + dz * taperFactor };

      const leftProj = this.project3DTo2D(left3D, fx, fy, cx, cy, cosPitch, sinPitch, cal, canvasWidth, canvasHeight);
      const rightProj = this.project3DTo2D(right3D, fx, fy, cx, cy, cosPitch, sinPitch, cal, canvasWidth, canvasHeight);
      const centerProj = this.project3DTo2D(pt, fx, fy, cx, cy, cosPitch, sinPitch, cal, canvasWidth, canvasHeight);

      if (leftProj && rightProj && centerProj) {
        leftBoundary2D.push(leftProj);
        rightBoundary2D.push(rightProj);
        centerPath2D.push(centerProj);
      }
    }

    // Once the camera stops emitting valid (in-frame) points, stop —
    // don't let the polygon skip gaps and jump back into frame further out,
    // which also reads as "floating" disconnected geometry.
    const polygon: Point2D[] = [
      ...leftBoundary2D,
      ...([...rightBoundary2D].reverse()),
    ];

    return {
      leftBoundary: leftBoundary2D,
      rightBoundary: rightBoundary2D,
      centerPath: centerPath2D,
      polygon,
    };
  }

  /**
   * Builds the centerline from the vehicle's own recorded GPS trajectory
   * over the next few seconds — ground truth, since it's literally where
   * the car went. Returns undefined (triggering the steering-model
   * fallback) if there isn't enough usable GPS lookahead data.
   */
  private buildTrajectoryFromGps(
    sample: TeslaTelemetrySample | undefined,
    futureSamples: TeslaTelemetrySample[],
    cal: CameraCalibration,
    maxDistanceMeters: number,
    stepMeters: number,
    startOffsetMeters: number,
  ): Array<{ x: number; y: number; z: number }> | undefined {
    const originLat = sample?.latitude;
    const originLng = sample?.longitude;
    const headingDeg = sample?.headingDegrees;

    if (originLat == null || originLng == null || headingDeg == null || futureSamples.length < 2) {
      return undefined;
    }

    const headingRad = (headingDeg * Math.PI) / 180;
    // Vehicle-forward unit vector in (east, north): heading 0° = north.
    const fwdEast = Math.sin(headingRad);
    const fwdNorth = Math.cos(headingRad);
    // Vehicle-right unit vector (90° clockwise from forward).
    const rightEast = Math.cos(headingRad);
    const rightNorth = -Math.sin(headingRad);

    const latRad = (originLat * Math.PI) / 180;
    const metersPerDegLat = 111320;
    const metersPerDegLng = 111320 * Math.cos(latRad);

    // Raw (forward, lateral) points relative to the vehicle, ahead only.
    const raw: Array<{ forward: number; lateral: number }> = [];
    for (const s of futureSamples) {
      if (s.latitude == null || s.longitude == null) continue;
      const east = (s.longitude - originLng) * metersPerDegLng;
      const north = (s.latitude - originLat) * metersPerDegLat;
      const forward = east * fwdEast + north * fwdNorth;
      const lateral = east * rightEast + north * rightNorth;
      if (forward <= 0.15) continue; // behind/at the vehicle — GPS noise at low speed
      if (forward > maxDistanceMeters + 5) break; // no need to look further than we'll draw
      raw.push({ forward, lateral });
    }

    if (raw.length < 2) return undefined;

    // Sort and drop any non-monotonic backtracking (GPS jitter can produce
    // a point that's briefly "behind" the previous one).
    raw.sort((a, b) => a.forward - b.forward);
    const monotonic: Array<{ forward: number; lateral: number }> = [raw[0]];
    for (let i = 1; i < raw.length; i++) {
      if (raw[i].forward > monotonic[monotonic.length - 1].forward + 0.05) {
        monotonic.push(raw[i]);
      }
    }
    if (monotonic.length < 2) return undefined;

    // Light smoothing on the lateral component only — raw consumer GPS is
    // noisy enough to visibly jitter the path frame-to-frame if used as-is.
    const smoothed = monotonic.map((pt, i) => {
      const prev = monotonic[Math.max(0, i - 1)];
      const next = monotonic[Math.min(monotonic.length - 1, i + 1)];
      return { forward: pt.forward, lateral: (prev.lateral + pt.lateral + next.lateral) / 3 };
    });

    // Resample onto an even step grid via linear interpolation so the rest
    // of the pipeline (which assumes uniform spacing between indices) works
    // unchanged, and prepend the vehicle's own position as the start point.
    const result: Array<{ x: number; y: number; z: number }> = [];
    let si = 0;
    for (let d = 0; d <= Math.min(maxDistanceMeters, smoothed[smoothed.length - 1].forward); d += stepMeters) {
      while (si < smoothed.length - 2 && smoothed[si + 1].forward < d) si++;
      const a = smoothed[si];
      const b = smoothed[Math.min(smoothed.length - 1, si + 1)];
      const span = Math.max(0.0001, b.forward - a.forward);
      const frac = Math.min(1, Math.max(0, (d - a.forward) / span));
      const lateral = a.lateral + (b.lateral - a.lateral) * frac;

      result.push({
        x: lateral,
        y: 0,
        z: d + cal.cameraForwardMeters + startOffsetMeters,
      });
    }

    return result.length >= 2 ? result : undefined;
  }

  /**
   * Fallback: extrapolates the CURRENT steering angle forward using a
   * bicycle model. Only physically believable for a short distance since
   * it can't know how the road curves beyond the current instant — used
   * only when GPS lookahead isn't available.
   */
  private buildTrajectoryFromSteering(
    sample: TeslaTelemetrySample | undefined,
    cal: CameraCalibration,
    maxDistanceMeters: number,
    stepMeters: number,
    startOffsetMeters: number,
  ): Array<{ x: number; y: number; z: number }> {
    // Low-pass filter the steering input. Raw telemetry steering angle is
    // noisy frame-to-frame; integrating raw noise directly into yaw is what
    // produces a sharp, unnatural kink in the path. Alpha ~0.15-0.25 gives
    // a responsive but stable curve.
    const rawSteeringDeg = sample?.steeringAngleDegrees ?? 0;
    const alpha = 0.18;
    this.smoothedSteeringDeg += (rawSteeringDeg - this.smoothedSteeringDeg) * alpha;
    const steeringDegrees = this.smoothedSteeringDeg;

    const wheelbase = 2.875;
    const steeringRad = (steeringDegrees * Math.PI) / 180;
    const wheelAngleRad = steeringRad / 14.0;
    const curvature = Math.tan(wheelAngleRad) / wheelbase;

    // A constant-curvature extrapolation left unbounded makes currentYaw
    // run past 90° over a long distance, at which point cos(yaw) goes
    // negative and the path folds back on itself. Two guards fix it:
    // shorten the distance when curvature is sharp, and hard-clamp total
    // heading deviation so it can never fold back.
    const curvatureSeverity = Math.min(1, Math.abs(curvature) * 12);
    const distanceLimit = maxDistanceMeters * (1 - curvatureSeverity * 0.55);
    const maxYawRad = (40 * Math.PI) / 180;

    const center3D: Array<{ x: number; y: number; z: number }> = [];
    let currentX = 0;
    let currentZ = 0;
    let currentYaw = 0;

    for (let distance = 0; distance <= distanceLimit; distance += stepMeters) {
      if (distance === 0) {
        center3D.push({ x: 0, y: 0, z: cal.cameraForwardMeters + startOffsetMeters });
        continue;
      }

      if (Math.abs(curvature) < 0.0001) {
        currentZ += stepMeters;
      } else {
        const deltaYaw = curvature * stepMeters;
        const nextYaw = currentYaw + deltaYaw;
        if (Math.abs(nextYaw) > maxYawRad) break;
        currentYaw = nextYaw;
        currentZ += stepMeters * Math.cos(currentYaw);
        currentX += stepMeters * Math.sin(currentYaw);
      }

      center3D.push({
        x: currentX,
        y: 0,
        z: currentZ + cal.cameraForwardMeters + startOffsetMeters,
      });
    }

    return center3D;
  }

  /**
   * Pure pinhole projection of a ground-plane point (y = 0 is the road
   * surface). No post-hoc offsets. If this doesn't land on the road in your
   * footage, the fix is to adjust cameraHeightMeters / cameraPitchDegrees /
   * focalLengthScale in CameraCalibration — never add a correction here.
   */
  private project3DTo2D(
    point: { x: number; y: number; z: number },
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    cosPitch: number,
    sinPitch: number,
    cal: CameraCalibration,
    canvasWidth: number,
    canvasHeight: number,
  ): Point2D | undefined {
    const xc = point.x;
    const yc = point.y - cal.cameraHeightMeters; // road surface is cal.cameraHeightMeters below the lens
    const zc = point.z;

    // Rotate into camera-pitch frame
    const yRot = yc * cosPitch - zc * sinPitch;
    const zRot = yc * sinPitch + zc * cosPitch;

    if (zRot <= 0.5) return undefined; // behind or at the camera plane

    const u = (fx * xc) / zRot + cx;
    const v = (-fy * yRot) / zRot + cy;

    if (
      v < -canvasHeight * 0.05 ||
      v > canvasHeight * 1.05 ||
      u < -canvasWidth * 0.2 ||
      u > canvasWidth * 1.2
    ) {
      return undefined;
    }

    return { x: u, y: v };
  }
}