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
  cameraForwardMeters: 1.65,
  vehicleWidthMeters: 1.5,
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

    // Low-pass filter the steering input. Raw telemetry steering angle is
    // noisy frame-to-frame; integrating raw noise directly into yaw is what
    // produces the sharp, unnatural kink in the path. Alpha ~0.15-0.25 gives
    // a responsive but stable curve.
    const rawSteeringDeg = sample?.steeringAngleDegrees ?? 0;
    const alpha = 0.18;
    this.smoothedSteeringDeg += (rawSteeringDeg - this.smoothedSteeringDeg) * alpha;
    const steeringDegrees = this.smoothedSteeringDeg;

    const wheelbase = 2.875;
    const steeringRad = (steeringDegrees * Math.PI) / 180;
    const wheelAngleRad = steeringRad / 14.0;
    const curvature = Math.tan(wheelAngleRad) / wheelbase;

    // A constant-curvature (bicycle model) extrapolation of the CURRENT
    // steering angle is only physically believable for a short distance —
    // it says nothing about how the road actually curves further out.
    // Left unbounded, integrating curvature over a long distance makes
    // currentYaw run past 90°, at which point cos(yaw) goes negative and
    // the path starts moving backward in Z while still swinging in X —
    // producing a "hook" that curls up and off the road. Two guards fix it:
    //  1. Shorten the projected distance when curvature is sharp.
    //  2. Hard-clamp total heading deviation so it can never fold back.
    const curvatureSeverity = Math.min(1, Math.abs(curvature) * 12); // 0 = straight, 1 = sharp

    // Kept deliberately short and starting a few meters ahead of the
    // camera rather than right under the hood — matching the reference
    // proportions (small, contained shape well below the horizon) rather
    // than stretching close to the vanishing point where any error is
    // amplified. baseMaxDistance is now the whole visible length of the
    // path, not just a curvature-shortening ceiling.
    const baseMaxDistance = Math.min(9, Math.max(5, speedMps * 0.55 + 4));
    const maxDistanceMeters = baseMaxDistance * (1 - curvatureSeverity * 0.55);
    const startOffsetMeters = -1.0; // gap between camera and where the path begins

    const maxYawRad = (40 * Math.PI) / 180; // never let the path fold past ±40°

    const center3D: Array<{ x: number; y: number; z: number }> = [];
    const stepMeters = 0.45;

    let currentX = 0;
    let currentZ = 0;
    let currentYaw = 0;

    for (let distance = 0; distance <= maxDistanceMeters; distance += stepMeters) {
      if (distance === 0) {
        center3D.push({ x: 0, y: 0, z: cal.cameraForwardMeters + startOffsetMeters });
        continue;
      }

      if (Math.abs(curvature) < 0.0001) {
        currentZ += stepMeters;
      } else {
        const deltaYaw = curvature * stepMeters;
        const nextYaw = currentYaw + deltaYaw;

        // Stop extending the path once it would fold past the clamp —
        // truncating here (rather than clamping and continuing) avoids a
        // long straight tail glued on at a weird angle.
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

    const halfWidth = cal.vehicleWidthMeters / 2.0;

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

      const left3D = { x: pt.x - dx, y: 0, z: pt.z - dz };
      const right3D = { x: pt.x + dx, y: 0, z: pt.z + dz };

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