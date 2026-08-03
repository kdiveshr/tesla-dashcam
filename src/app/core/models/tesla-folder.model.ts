import {
  TeslaClip,
  TeslaClipType,
} from '../interfaces/tesla-clip.interface';


export interface TeslaFolder {

  name: string;

  clips: TeslaClip[];

  totalFiles: number;

  totalVideos: number;

}


export interface TeslaClipCollection {

  recentClips: TeslaClip[];

  savedClips: TeslaClip[];

  sentryClips: TeslaClip[];

}


export function createEmptyTeslaCollection(): TeslaClipCollection {

  return {
    recentClips: [],
    savedClips: [],
    sentryClips: [],
  };

}