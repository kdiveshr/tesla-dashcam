import { TeslaSegment } from './tesla-segment.interface';

export interface TeslaRecording {
  /**
   * Example:
   * 2026-07-31_19-28-57
   */
  folderName: string;

  /**
   * SavedClips / SentryClips / RecentClips
   */
  clipType: string;

  /**
   * event.json if present
   */
  eventJsonPath?: string;

  /**
   * thumb.png if present
   */
  thumbnailPath?: string;

  /**
   * Ordered segments belonging to this recording.
   */
  segments: TeslaSegment[];
}