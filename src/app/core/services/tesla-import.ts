import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

import {
  TeslaClip,
  TeslaCamera,
  TeslaClipType,
} from '../interfaces/tesla-clip.interface';

import { FilenameParser } from './filename-parser';


@Injectable({
  providedIn: 'root',
})
export class TeslaImport {


  constructor(
    private readonly filenameParser: FilenameParser
  ) {}



  importFiles(
    files: File[]
  ): Observable<TeslaClip[]> {


    const clips =
      files
        .filter(file => this.isVideoFile(file))
        .map(file => this.createClip(file));


    return of(clips);

  }



  private isVideoFile(
    file: File
  ): boolean {


    return (
      file.type === 'video/mp4' ||
      file.name.toLowerCase().endsWith('.mp4')
    );

  }




  private createClip(
    file: File
  ): TeslaClip {


    const metadata =
      this.filenameParser.parse(
        file.name
      );


    return {

      file,

      fileName:
        file.name,


      relativePath:
        this.getRelativePath(file),


      camera:
        metadata?.camera ??
        'unknown',


      clipType:
        this.detectClipType(file),


      timestamp:
        metadata?.timestamp ??
        new Date(file.lastModified),


      url:
        URL.createObjectURL(file),

    };

  }




  private getRelativePath(
    file: File
  ): string {


    const path =
      (
        file as File &
        {
          webkitRelativePath?: string
        }
      )
      .webkitRelativePath;


    return path ?? file.name;

  }





  private detectClipType(
    file: File
  ): TeslaClipType {


    const path =
      this.getRelativePath(file)
        .toLowerCase();



    if (
      path.includes('recentclips')
    ) {

      return 'recent';

    }



    if (
      path.includes('savedclips')
    ) {

      return 'saved';

    }



    if (
      path.includes('sentryclips')
    ) {

      return 'sentry';

    }



    return 'unknown';

  }


}