export type TeslaGear = 'park' | 'reverse' | 'neutral' | 'drive' | 'unknown';
export type TeslaTurnSignal = 'off' | 'left' | 'right' | 'hazard';

export interface TeslaAutopilotState {
  enabled: boolean;
  fsdEnabled?: boolean;
  fsdState?: string;
}

export interface TeslaTelemetrySample {
  /** Absolute recording time used to align this sample with a video segment. */
  timestamp: Date;
  /** Offset on the recording timeline, in seconds. */
  playbackTimeSeconds?: number;
  frameSequenceNumber?: number;
  speedKph?: number;
  latitude?: number;
  longitude?: number;
  headingDegrees?: number;
  steeringAngleDegrees?: number;
  acceleratorPedal?: number;
  brakeApplied?: boolean;
  turnSignal?: TeslaTurnSignal;
  gear?: TeslaGear;
  autopilot?: TeslaAutopilotState;
  batteryPercent?: number;
  linearAccelerationMps2?: {
    x?: number;
    y?: number;
    z?: number;
  };
}
