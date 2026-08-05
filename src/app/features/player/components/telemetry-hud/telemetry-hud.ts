import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { TeslaTelemetrySample } from '../../../../core/interfaces/tesla-telemetry.interface';

@Component({
  selector: 'app-telemetry-hud',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './telemetry-hud.html',
  styleUrl: './telemetry-hud.scss',
})
export class TelemetryHud {
  @Input()
  sample?: TeslaTelemetrySample;

  get speedKph(): number | undefined {
    return this.sample?.speedKph === undefined
      ? undefined
      : Math.round(this.sample.speedKph);
  }

  get autopilotLabel(): string | undefined {
    return this.sample?.autopilot?.fsdState?.replaceAll('_', ' ');
  }

  get turnSignalLabel(): string | undefined {
    const signal = this.sample?.turnSignal;
    return signal && signal !== 'off' ? signal.toUpperCase() : undefined;
  }

  get headingDegrees(): number | undefined {
    return this.sample?.headingDegrees;
  }

  get compassLabel(): string {
    const heading = this.headingDegrees ?? 0;
    const normalized = ((heading % 360) + 360) % 360;

    if (normalized >= 337.5 || normalized < 22.5) {
      return 'N';
    }
    if (normalized < 67.5) {
      return 'NE';
    }
    if (normalized < 112.5) {
      return 'E';
    }
    if (normalized < 157.5) {
      return 'SE';
    }
    if (normalized < 202.5) {
      return 'S';
    }
    if (normalized < 247.5) {
      return 'SW';
    }
    if (normalized < 292.5) {
      return 'W';
    }
    return 'NW';
  }

  get batteryPercent(): number | undefined {
    return this.sample?.batteryPercent;
  }

  get steeringRotation(): number {
    return this.sample?.steeringAngleDegrees ?? 0;
  }

  get steeringVisual(): string {
    return `rotate(${this.steeringRotation}deg)`;
  }

  get brakeStatus(): string {
    return this.sample?.brakeApplied ? 'ON' : 'OFF';
  }

  get acceleratorValue(): number {
    return this.sample?.acceleratorPedal ?? 0;
  }

  get leftSignalActive(): boolean {
    return this.sample?.turnSignal === 'left';
  }

  get rightSignalActive(): boolean {
    return this.sample?.turnSignal === 'right';
  }

  get hazardSignalActive(): boolean {
    return this.sample?.turnSignal === 'hazard';
  }
}
