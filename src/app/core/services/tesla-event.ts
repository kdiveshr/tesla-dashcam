import { Injectable } from '@angular/core';

import {
  TeslaClip,
  TeslaCamera,
} from '../interfaces/tesla-clip.interface';

import {
  TeslaEvent as TeslaEventModel,
} from '../interfaces/tesla-event.interface';

@Injectable({
  providedIn: 'root',
})
export class TeslaEventService {


  groupClips(
    clips: TeslaClip[]
  ): TeslaEventModel[] {


    const groups =
      new Map<string, TeslaEventModel>();


    for (const clip of clips) {


      const key =
        clip.timestamp.toISOString();



      if (!groups.has(key)) {

        groups.set(
          key,
          {
            timestamp: clip.timestamp,
          }
        );

      }



      const event =
        groups.get(key)!;


      this.assignCamera(
        event,
        clip
      );

    }



    return Array.from(
      groups.values()
    )
    .sort(
      (a, b) =>
        a.timestamp.getTime()
        -
        b.timestamp.getTime()
    );

  }



  private assignCamera(
    event: TeslaEventModel,
    clip: TeslaClip
  ): void {


    switch (clip.camera) {


      case 'front':

        event.front = clip;

        break;


      case 'back':

        event.back = clip;

        break;


      case 'left_repeater':

        event.leftRepeater = clip;

        break;


      case 'right_repeater':

        event.rightRepeater = clip;

        break;

    }

  }


}