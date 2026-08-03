import { TeslaClip } from './tesla-clip.interface';

export interface TeslaSegment {
  /**
   * Timestamp parsed from the filename.
   * Example: 2026-07-31T19:24:33Z
   */
  timestamp: Date;

  front?: TeslaClip;

  rear?: TeslaClip;

  leftRepeater?: TeslaClip;

  rightRepeater?: TeslaClip;
}