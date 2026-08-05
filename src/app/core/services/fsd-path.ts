import { Injectable } from '@angular/core';

import { TeslaTelemetrySample } from '../interfaces/tesla-telemetry.interface';

export interface FsdProjectedPoint {
  x: number;
  y: number;
  headingDegrees: number;
  speedKph: number;
}

@Injectable({ providedIn: 'root' })
export class FsdPathService {
  buildPredictedPath(
    samples: TeslaTelemetrySample[],
    horizonSeconds = 6,
    samplesPerSecond = 14,
  ): FsdProjectedPoint[] {
    const validSamples = samples.filter(
      sample => sample.headingDegrees !== undefined && sample.speedKph !== undefined,
    );

    if (validSamples.length === 0) {
      return [];
    }

    const base = validSamples[validSamples.length - 1];
    const baseHeading = base.headingDegrees ?? 0;
    const baseSpeed = base.speedKph ?? 0;
    const steeringAverage = this.averageSteering(validSamples);
    const points: FsdProjectedPoint[] = [];
    const steps = Math.max(1, Math.round(horizonSeconds * samplesPerSecond));

    for (let step = 0; step <= steps; step++) {
      const progress = step / Math.max(1, steps);
      const timeOffset = progress * horizonSeconds;
      const speedKph = this.estimateSpeed(validSamples, timeOffset, baseSpeed);
      const steeringInfluence = this.clamp(steeringAverage / 28, -1, 1);
      const distanceMeters = (speedKph / 3.6) * timeOffset;

      const heading = this.estimateHeading(validSamples, progress, baseHeading, steeringInfluence);
      const worldX = distanceMeters * Math.sin(this.toRadians(heading));
      const worldY = distanceMeters * Math.cos(this.toRadians(heading));
      const roadYawDelta = this.toRadians(steeringInfluence * 22) * (0.25 + progress * 1.5);
      const lateralOffset = Math.sin(roadYawDelta) * Math.max(0.2, distanceMeters * 0.08);

      const cameraX = (worldX + lateralOffset) / 10;
      const cameraY = 0.12 + (worldY / 55) * 0.9;

      points.push({
        x: this.clamp(cameraX, -1.8, 1.8),
        y: this.clamp(cameraY, 0.08, 1),
        headingDegrees: heading,
        speedKph,
      });
    }

    return points;
  }

  private averageSteering(samples: TeslaTelemetrySample[]): number {
    const recent = samples.slice(-10);
    if (recent.length === 0) {
      return 0;
    }

    const steering = recent.reduce((total, sample) => total + (sample.steeringAngleDegrees ?? 0), 0);
    return steering / recent.length;
  }

  private estimateHeading(
    samples: TeslaTelemetrySample[],
    progress: number,
    fallbackHeading: number,
    steeringInfluence: number,
  ): number {
    const recentAverage = samples.slice(-6).reduce((total, sample) => total + (sample.headingDegrees ?? fallbackHeading), 0)
      / Math.max(1, samples.slice(-6).length);

    const curvature = steeringInfluence * (8 + progress * 26);
    return (recentAverage + curvature) % 360;
  }

  private estimateSpeed(
    samples: TeslaTelemetrySample[],
    timeOffset: number,
    fallbackSpeed: number,
  ): number {
    if (samples.length === 0) {
      return fallbackSpeed;
    }

    const recent = samples.slice(-5);
    const avgSpeed = recent.reduce((total, sample) => total + (sample.speedKph ?? 0), 0) /
      Math.max(1, recent.length);

    return Math.max(0, avgSpeed * (0.9 + (1 - Math.min(timeOffset / 6, 1)) * 0.15));
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
