export type TeslaCamera =
  | 'front'
  | 'back'
  | 'left_repeater'
  | 'right_repeater'
  | 'unknown';


export type TeslaClipType =
  | 'recent'
  | 'saved'
  | 'sentry'
  | 'unknown';


export interface TeslaClip {
  file: File;

  fileName: string;

  relativePath: string;

  camera: TeslaCamera;

  clipType: TeslaClipType;

  timestamp: Date;

  url: string;
}