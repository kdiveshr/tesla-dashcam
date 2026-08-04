import { Injectable } from '@angular/core';

import { TeslaClip } from '../interfaces/tesla-clip.interface';
import { TeslaSegment } from '../interfaces/tesla-segment.interface';
import { TeslaRecording } from '../interfaces/tesla-recording.interface';


@Injectable({
  providedIn: 'root',
})
export class TeslaRecordingService {


  buildRecordings(
    clips: TeslaClip[]
  ): TeslaRecording[] {


    const folders =
      this.groupByFolder(clips);


    return Array.from(
      folders.entries()
    )
    .map(([folderName, folderClips]) => {


      return {

        folderName,

        clipType:
  folderClips[0]?.clipType ?? 'unknown',

        segments:
          this.buildSegments(folderClips)

      };


    });


  }





  private groupByFolder(
    clips: TeslaClip[]
  ): Map<string, TeslaClip[]> {


    const result =
      new Map<string, TeslaClip[]>();


    for (const clip of clips) {


      const folder =
        this.extractFolder(
          clip.relativePath
        );


      const existing =
        result.get(folder) ?? [];


      existing.push(clip);


      result.set(
        folder,
        existing
      );

    }


    return result;

  }





  private buildSegments(
    clips: TeslaClip[]
  ): TeslaSegment[] {


    const groups =
      new Map<string, TeslaClip[]>();


    for (const clip of clips) {


      const key =
        clip.timestamp.toISOString();


      const existing =
        groups.get(key) ?? [];


      existing.push(clip);


      groups.set(
        key,
        existing
      );

    }



    return Array.from(groups.values())
      .map(files =>
        this.createSegment(files)
      )
      .sort(
        (a,b) =>
          a.timestamp.getTime()
          -
          b.timestamp.getTime()
      );

  }





  private createSegment(
    clips: TeslaClip[]
  ): TeslaSegment {


    const segment: TeslaSegment = {

      timestamp:
        clips[0].timestamp

    };


    for (const clip of clips) {


      switch(clip.camera) {


        case 'front':
          segment.front = clip;
          break;


        case 'back':
          segment.back = clip;
          break;


        case 'left_repeater':
          segment.leftRepeater = clip;
          break;


        case 'right_repeater':
          segment.rightRepeater = clip;
          break;

      }

    }


    return segment;

  }





  private extractFolder(
    path: string
  ): string {


    const parts =
      path.split('/');


    return parts.length > 1
      ? parts[parts.length - 2]
      : 'unknown';

  }





  


}