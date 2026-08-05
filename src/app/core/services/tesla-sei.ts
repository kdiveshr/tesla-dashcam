import { Injectable } from '@angular/core';

import { TeslaClip } from '../interfaces/tesla-clip.interface';
import {
  TeslaAutopilotState,
  TeslaGear,
  TeslaTelemetrySample,
  TeslaTurnSignal,
} from '../interfaces/tesla-telemetry.interface';

interface SeiExtraction {
  durationSeconds: number;
  samples: TeslaTelemetrySample[];
}

@Injectable({ providedIn: 'root' })
export class TeslaSei {
  async extract(clip: TeslaClip, timelineStartSeconds = 0): Promise<SeiExtraction> {
    const buffer = await clip.file.arrayBuffer();
    const view = new DataView(buffer);
    const durations = this.readFrameDurations(view);
    const mdat = this.findBox(view, 0, view.byteLength, 'mdat');
    const samples: TeslaTelemetrySample[] = [];
    let cursor = mdat.start;
    let frameIndex = 0;
    let pendingPayload: Uint8Array | undefined;
    let elapsedSeconds = 0;

    while (cursor + 4 <= mdat.end) {
      const length = view.getUint32(cursor);
      cursor += 4;

      if (length < 1 || cursor + length > mdat.end) {
        break;
      }

      const nal = new Uint8Array(buffer, cursor, length);
      cursor += length;
      const type = nal[0] & 0x1f;

      if (type === 6) {
        pendingPayload = this.extractProtobufPayload(nal);
        continue;
      }

      if (type !== 1 && type !== 5) {
        continue;
      }

      if (pendingPayload) {
        const sample = this.decodeSample(
          pendingPayload,
          new Date(clip.timestamp.getTime() + elapsedSeconds * 1_000),
          timelineStartSeconds + elapsedSeconds,
        );

        if (sample) {
          samples.push(sample);
        }
      }

      pendingPayload = undefined;
      elapsedSeconds += durations[frameIndex] ?? 0;
      frameIndex++;
    }

    return {
      durationSeconds: durations.reduce((total, duration) => total + duration, 0),
      samples,
    };
  }

  private readFrameDurations(view: DataView): number[] {
    const moov = this.findBox(view, 0, view.byteLength, 'moov');
    const trak = this.findBox(view, moov.start, moov.end, 'trak');
    const mdia = this.findBox(view, trak.start, trak.end, 'mdia');
    const minf = this.findBox(view, mdia.start, mdia.end, 'minf');
    const stbl = this.findBox(view, minf.start, minf.end, 'stbl');
    const mdhd = this.findBox(view, mdia.start, mdia.end, 'mdhd');
    const stts = this.findBox(view, stbl.start, stbl.end, 'stts');
    const version = view.getUint8(mdhd.start);
    const timescale = view.getUint32(mdhd.start + (version === 1 ? 20 : 12));
    const entryCount = view.getUint32(stts.start + 4);
    const durations: number[] = [];
    let cursor = stts.start + 8;

    for (let index = 0; index < entryCount; index++) {
      const count = view.getUint32(cursor);
      const delta = view.getUint32(cursor + 4) / timescale;
      durations.push(...Array.from({ length: count }, () => delta));
      cursor += 8;
    }

    return durations;
  }

  private findBox(view: DataView, start: number, end: number, name: string): { start: number; end: number } {
    for (let cursor = start; cursor + 8 <= end;) {
      let size = view.getUint32(cursor);
      const type = this.readAscii(view, cursor + 4, 4);
      let headerSize = 8;

      if (size === 1) {
        size = Number((BigInt(view.getUint32(cursor + 8)) << 32n) | BigInt(view.getUint32(cursor + 12)));
        headerSize = 16;
      } else if (size === 0) {
        size = end - cursor;
      }

      if (size < headerSize || cursor + size > end) {
        break;
      }

      if (type === name) {
        return { start: cursor + headerSize, end: cursor + size };
      }

      cursor += size;
    }

    throw new Error(`MP4 box ${name} was not found.`);
  }

  private extractProtobufPayload(nal: Uint8Array): Uint8Array | undefined {
    if (nal.length < 4 || nal[1] !== 5) {
      return undefined;
    }

    let offset = 3;
    while (nal[offset] === 0x42) {
      offset++;
    }

    if (offset <= 3 || nal[offset] !== 0x69) {
      return undefined;
    }

    return this.stripEmulationBytes(nal.subarray(offset + 1, nal.length - 1));
  }

  private decodeSample(payload: Uint8Array, timestamp: Date, playbackTimeSeconds: number): TeslaTelemetrySample | undefined {
    const fields = new Map<number, number>();
    let offset = 0;

    try {
      while (offset < payload.length) {
        const key = this.readVarint(payload, offset);
        offset = key.nextOffset;
        const field = Number(key.value >> 3n);
        const wireType = Number(key.value & 7n);
        let value: number;

        if (wireType === 0) {
          const result = this.readVarint(payload, offset);
          value = Number(result.value);
          offset = result.nextOffset;
        } else if (wireType === 1) {
          value = new DataView(payload.buffer, payload.byteOffset + offset, 8).getFloat64(0, true);
          offset += 8;
        } else if (wireType === 5) {
          value = new DataView(payload.buffer, payload.byteOffset + offset, 4).getFloat32(0, true);
          offset += 4;
        } else {
          return undefined;
        }

        fields.set(field, value);
      }
    } catch {
      return undefined;
    }

    if (fields.size === 0) {
      return undefined;
    }

    const left = fields.get(7) === 1;
    const right = fields.get(8) === 1;

    return {
      timestamp,
      playbackTimeSeconds,
      frameSequenceNumber: fields.get(3),
      speedKph: this.mpsToKph(fields.get(4)),
      acceleratorPedal: fields.get(5),
      steeringAngleDegrees: fields.get(6),
      turnSignal: this.getTurnSignal(left, right),
      brakeApplied: fields.get(9) === 1,
      autopilot: this.getAutopilot(fields.get(10)),
      gear: this.getGear(fields.get(2)),
      latitude: fields.get(11),
      longitude: fields.get(12),
      headingDegrees: fields.get(13),
      linearAccelerationMps2: {
        x: fields.get(14),
        y: fields.get(15),
        z: fields.get(16),
      },
    };
  }

  private readVarint(data: Uint8Array, offset: number): { value: bigint; nextOffset: number } {
    let value = 0n;
    let shift = 0n;

    while (offset < data.length) {
      const byte = data[offset++];
      value |= BigInt(byte & 0x7f) << shift;

      if ((byte & 0x80) === 0) {
        return { value, nextOffset: offset };
      }

      shift += 7n;
    }

    throw new Error('Unexpected end of protobuf varint.');
  }

  private stripEmulationBytes(data: Uint8Array): Uint8Array {
    const bytes: number[] = [];
    let zeros = 0;

    for (const byte of data) {
      if (zeros >= 2 && byte === 3) {
        zeros = 0;
        continue;
      }

      bytes.push(byte);
      zeros = byte === 0 ? zeros + 1 : 0;
    }

    return Uint8Array.from(bytes);
  }

  private readAscii(view: DataView, start: number, length: number): string {
    return String.fromCharCode(...Array.from({ length }, (_, index) => view.getUint8(start + index)));
  }

  private mpsToKph(value: number | undefined): number | undefined {
    return value === undefined ? undefined : value * 3.6;
  }

  private getGear(value: number | undefined): TeslaGear | undefined {
    return ({ 0: 'park', 1: 'drive', 2: 'reverse', 3: 'neutral' } as Record<number, TeslaGear>)[value ?? -1];
  }

  private getTurnSignal(left: boolean, right: boolean): TeslaTurnSignal | undefined {
    if (left && right) return 'hazard';
    if (left) return 'left';
    if (right) return 'right';
    return undefined;
  }

  private getAutopilot(value: number | undefined): TeslaAutopilotState | undefined {
    if (value === undefined) return undefined;

    const state = ['NONE', 'SELF_DRIVING', 'AUTOSTEER', 'TACC'][value] ?? 'UNKNOWN';
    return {
      enabled: value > 0,
      fsdEnabled: value === 1,
      fsdState: state,
    };
  }
}
