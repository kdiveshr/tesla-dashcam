import { TeslaSegment } from './tesla-segment.interface';
import { TeslaClipType } from './tesla-clip.interface';


export interface TeslaRecording {

  /**
   * Example:
   * 2026-07-31_19-28-57
   */
  folderName: string;


  /**
   * recent / saved / sentry
   */
  clipType: TeslaClipType;


  /**
   * event.json if available
   */
  eventJsonPath?: string;


  /**
   * thumb.png if available
   */
  thumbnailPath?: string;


  /**
   * Ordered one-minute segments
   */
  segments: TeslaSegment[];

}