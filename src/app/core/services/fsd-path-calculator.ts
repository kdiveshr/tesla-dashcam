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
  /** Height of front camera above road plane in meters */
  cameraHeightMeters: number;
  /** Downward pitch angle of camera in degrees (e.g. -4.2) */
  cameraPitchDegrees: number;
  /** Distance of camera forward from vehicle center/rear axle in meters */
  cameraForwardMeters: number;
  /** Vehicle width in meters */
  vehicleWidthMeters: number;
  /** Field of view scaling factor */
  focalLengthScale: number;
  /** Vertical principal point offset ratio (0 to 0.2) */
  horizonOffsetRatio: number;
}

const DEFAULT_CALIBRATION: CameraCalibration = {
  cameraHeightMeters: 1.35,
  cameraPitchDegrees: -4.2,
  cameraForwardMeters: 2.1,
  vehicleWidthMeters: 1.95,
  focalLengthScale: 0.82,
  horizonOffsetRatio: 0.04,
};

@Injectable({ providedIn: 'root' })
export class FsdPathCalculator {
  /**
   * Calculates the projected FSD path ribbon and boundary points on a 2D canvas.
   */
  calculatePath(
    sample: TeslaTelemetrySample | undefined,
    canvasWidth: number,
    canvasHeight: number,
    customCalibration?: Partial<CameraCalibration>,
  ): PathRibbon {
    const cal = { ...DEFAULT_CALIBRATION, ...customCalibration };

    if (canvasWidth <= 0 || canvasHeight <= 0) {
      return { leftBoundary: [], rightBoundary: [], centerPath: [], polygon: [] };
    }

    const steeringDegrees = sample?.steeringAngleDegrees ?? 0;
    const speedKph = sample?.speedKph ?? 0;
    const speedMps = (speedKph * 1000) / 3600;

    // Kinematic bicycle model calculations
    const wheelbase = 2.875; // Tesla Model 3/Y wheelbase in meters
    const steeringRad = (steeringDegrees * Math.PI) / 180;
    // Steering ratio ~ 14:1
    const wheelAngleRad = steeringRad / 14.0;

    const curvature = Math.tan(wheelAngleRad) / wheelbase;

    // Generate 3D trajectory points along forward distance Z (from 1m to 45m ahead)
    const center3D: Array<{ x: number; y: number; z: number }> = [];
    const stepMeters = 1.0;
    const maxDistanceMeters = Math.min(45, Math.max(18, speedMps * 2.5 + 15));

    let currentX = 0;
    let currentZ = 0;
    let currentYaw = 0;

    for (let distance = 0; distance <= maxDistanceMeters; distance += stepMeters) {
      if (distance === 0) {
        center3D.push({ x: 0, y: 0, z: cal.cameraForwardMeters });
        continue;
      }

      if (Math.abs(curvature) < 0.0001) {
        // Straight line
        currentZ += stepMeters;
      } else {
        // Curved arc
        const deltaYaw = curvature * stepMeters;
        currentYaw += deltaYaw;
        currentZ += stepMeters * Math.cos(currentYaw);
        currentX += stepMeters * Math.sin(currentYaw);
      }

      center3D.push({
        x: currentX,
        y: 0, // Ground plane relative to road
        z: currentZ + cal.cameraForwardMeters,
      });
    }

    // Offset left and right boundaries by half vehicle width
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

      // Calculate tangent angle for boundary offset
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

      const leftProj = this.project3DTo2D(left3D, cal, fx, fy, cx, cy, cosPitch, sinPitch, canvasWidth, canvasHeight);
      const rightProj = this.project3DTo2D(right3D, cal, fx, fy, cx, cy, cosPitch, sinPitch, canvasWidth, canvasHeight);
      const centerProj = this.project3DTo2D(pt, cal, fx, fy, cx, cy, cosPitch, sinPitch, canvasWidth, canvasHeight);

      if (leftProj && rightProj && centerProj) {
        leftBoundary2D.push(leftProj);
        rightBoundary2D.push(rightProj);
        centerPath2D.push(centerProj);
      }
    }

    // Build ribbon polygon (left boundary forward, right boundary backward)
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

  private project3DTo2D(
    point: { x: number; y: number; z: number },
    cal: CameraCalibration,
    fx: number,
    fy: number,
    cx: number,
    cy: number,
    cosPitch: number,
    sinPitch: number,
    canvasWidth: number,
    canvasHeight: number,
  ): Point2D | undefined {
    // Camera-relative coordinates (Camera is at Y = cameraHeight)
    const xc = point.x;
    const yc = point.y - cal.cameraHeightMeters;
    const zc = point.z;

    // Apply pitch rotation (around X axis)
    const yRot = yc * cosPitch - zc * sinPitch;
    const zRot = yc * sinPitch + zc * cosPitch;

    // Depth check - point must be in front of camera
    if (zRot <= 0.8) {
      return undefined;
    }

    // Pinhole camera projection
    const u = (fx * xc) / zRot + cx;
    const v = (-fy * yRot) / zRot + cy;

    // Reject points far off screen
    if (v < 0 || v > canvasHeight * 1.2 || u < -canvasWidth * 0.5 || u > canvasWidth * 1.5) {
      return undefined;
    }

    return { x: u, y: v };
  }
}
