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
}
