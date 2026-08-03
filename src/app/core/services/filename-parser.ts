import { Injectable } from '@angular/core';

import {
  TeslaCamera,
} from '../interfaces/tesla-clip.interface';

import {
  TeslaFilenameMetadata,
} from '../interfaces/tesla-filename.interface';


@Injectable({
  providedIn: 'root',
})
export class FilenameParser {


 parse(
  fileName: string
): TeslaFilenameMetadata | null {


  const name =
    fileName
      .replace('.mp4', '')
      .toLowerCase();


  const match =
    name.match(
      /^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})-(.+)$/
    );


  if (!match) {

    return null;

  }


  const date =
    match[1];


  const time =
    match[2];


  const cameraText =
    match[3];



  const timestamp =
    this.parseTimestamp(
      date,
      time
    );


  const camera =
    this.parseCamera(
      cameraText
    );


  if (!timestamp) {

    return null;

  }


  return {

    timestamp,

    camera,

  };

}



  private parseTimestamp(
    date: string,
    time: string
  ): Date | null {


    const value =
      `${date}T${time.replace(/-/g, ':')}`;


    const result =
      new Date(value);


    if (isNaN(result.getTime())) {

      return null;

    }


    return result;

  }




  private parseCamera(
    value: string
  ): TeslaCamera {


    if (value.includes('front')) {

      return 'front';

    }


    if (
      value.includes('back') ||
      value.includes('rear')
    ) {

      return 'back';

    }


    if (value.includes('left')) {

      return 'left_repeater';

    }


    if (value.includes('right')) {

      return 'right_repeater';

    }


    return 'unknown';

  }


}