import { TeslaClip } from './tesla-clip.interface';


export interface TeslaEvent {

  timestamp: Date;

  front?: TeslaClip;

  back?: TeslaClip;

  leftRepeater?: TeslaClip;

  rightRepeater?: TeslaClip;

}