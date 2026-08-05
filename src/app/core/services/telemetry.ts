import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { TelemetryParser } from '../interfaces/telemetry-parser.interface';
import { TeslaRecording } from '../interfaces/tesla-recording.interface';
import {
  TeslaGear,
  TeslaTelemetrySample,
  TeslaTurnSignal,
} from '../interfaces/tesla-telemetry.interface';
import { TeslaSei } from './tesla-sei';

@Injectable({ providedIn: 'root' })
export class Telemetry {
  private readonly samplesSubject = new BehaviorSubject<TeslaTelemetrySample[]>([]);
  readonly samples$ = this.samplesSubject.asObservable();

  private readonly currentSampleSubject = new BehaviorSubject<TeslaTelemetrySample | undefined>(undefined);
  readonly currentSample$ = this.currentSampleSubject.asObservable();

  private readonly parsers: TelemetryParser[] = [new JsonTelemetryParser()];
  private importVersion = 0;

  constructor(private readonly teslaSei: TeslaSei) {}

  async importFiles(files: File[]): Promise<TeslaTelemetrySample[]> {
    const parsed = await Promise.all(
      files.map(file => this.parseFile(file)),
    );
    const samples = parsed
      .flat()
      .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime());

    this.samplesSubject.next(samples);
    this.currentSampleSubject.next(samples.at(-1) ?? undefined);
    return samples;
  }

  async importRecording(recording: TeslaRecording): Promise<TeslaTelemetrySample[]> {
    const version = ++this.importVersion;
    let timelineStartSeconds = 0;
    const samples: TeslaTelemetrySample[] = [];

    for (const segment of recording.segments) {
      const clip = segment.front ?? segment.back ?? segment.leftRepeater ?? segment.rightRepeater;

      if (!clip) {
        continue;
      }

      try {
        const extracted = await this.teslaSei.extract(clip, timelineStartSeconds);
        timelineStartSeconds += extracted.durationSeconds;
        samples.push(...extracted.samples);
      } catch {
        // Older clips or malformed recordings may not contain Tesla SEI metadata.
      }
    }

    if (version !== this.importVersion) {
      return [];
    }

    this.samplesSubject.next(samples);
    this.currentSampleSubject.next(samples.at(-1) ?? undefined);
    return samples;
  }

  getSampleAt(timestamp: Date): TeslaTelemetrySample | undefined {
    const samples = this.samplesSubject.value;
    const target = timestamp.getTime();

    for (let index = samples.length - 1; index >= 0; index--) {
      if (samples[index].timestamp.getTime() <= target) {
        return samples[index];
      }
    }

    return samples[0];
  }

  getSampleAtPlaybackTime(timeSeconds: number): TeslaTelemetrySample | undefined {
    const samples = this.samplesSubject.value;

    for (let index = samples.length - 1; index >= 0; index--) {
      if ((samples[index].playbackTimeSeconds ?? Infinity) <= timeSeconds) {
        return samples[index];
      }
    }

    return samples[0];
  }

  setCurrentSample(sample?: TeslaTelemetrySample): void {
    this.currentSampleSubject.next(sample);
  }

  clear(): void {
    this.samplesSubject.next([]);
    this.currentSampleSubject.next(undefined);
  }

  private async parseFile(file: File): Promise<TeslaTelemetrySample[]> {
    const parser = this.parsers.find(candidate => candidate.canParse(file));
    return parser ? parser.parse(file) : [];
  }
}

class JsonTelemetryParser implements TelemetryParser {
  canParse(file: File): boolean {
    return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
  }

  async parse(file: File): Promise<TeslaTelemetrySample[]> {
    try {
      const document = JSON.parse(await file.text()) as unknown;
      const records = Array.isArray(document)
        ? document
        : this.getSamples(document);

      return records
        .map(record => this.normalize(record))
        .filter((sample): sample is TeslaTelemetrySample => !!sample);
    } catch {
      return [];
    }
  }

  private getSamples(document: unknown): unknown[] {
    if (!document || typeof document !== 'object') {
      return [];
    }

    const value = document as Record<string, unknown>;
    return Array.isArray(value['samples']) ? value['samples'] : [];
  }

  private normalize(record: unknown): TeslaTelemetrySample | undefined {
    if (!record || typeof record !== 'object') {
      return undefined;
    }

    const value = record as Record<string, unknown>;
    const timestamp = this.toDate(value['timestamp'] ?? value['time']);

    if (!timestamp) {
      return undefined;
    }

    const autopilotEnabled = this.toBoolean(value['autopilotEnabled']);
    const fsdEnabled = this.toBoolean(value['fsdEnabled']);

    return {
      timestamp,
      speedKph: this.toNumber(value['speedKph'] ?? value['speed_kph']),
      latitude: this.toNumber(value['latitude'] ?? value['lat']),
      longitude: this.toNumber(value['longitude'] ?? value['lng'] ?? value['lon']),
      steeringAngleDegrees: this.toNumber(value['steeringAngleDegrees'] ?? value['steering_angle']),
      acceleratorPedal: this.toNumber(value['acceleratorPedal'] ?? value['accelerator']),
      brakeApplied: this.toBoolean(value['brakeApplied'] ?? value['brake']),
      turnSignal: this.toTurnSignal(value['turnSignal']),
      gear: this.toGear(value['gear']),
      autopilot: autopilotEnabled === undefined && fsdEnabled === undefined
        ? undefined
        : { enabled: autopilotEnabled ?? false, fsdEnabled, fsdState: this.toString(value['fsdState']) },
      batteryPercent: this.toNumber(value['batteryPercent'] ?? value['battery']),
    };
  }

  private toDate(value: unknown): Date | undefined {
    const date = new Date(typeof value === 'number' && value < 10_000_000_000 ? value * 1_000 : String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private toNumber(value: unknown): number | undefined {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private toBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private toString(value: unknown): string | undefined {
    return typeof value === 'string' ? value : undefined;
  }

  private toGear(value: unknown): TeslaGear | undefined {
    return ['park', 'reverse', 'neutral', 'drive', 'unknown'].includes(String(value))
      ? String(value) as TeslaGear
      : undefined;
  }

  private toTurnSignal(value: unknown): TeslaTurnSignal | undefined {
    return ['off', 'left', 'right', 'hazard'].includes(String(value))
      ? String(value) as TeslaTurnSignal
      : undefined;
  }
}
