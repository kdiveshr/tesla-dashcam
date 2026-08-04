import { Component } from '@angular/core';

import { TeslaImport } from '../../core/services/tesla-import';
import { TeslaClip } from '../../core/interfaces/tesla-clip.interface';
import { TeslaStore } from '../../core/services/tesla-store';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { TeslaEventService } from '../../core/services/tesla-event';
import { inject } from '@angular/core';
import { TeslaRecordingService } from '../../core/services/tesla-recording';
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
  ],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class Upload {
private readonly recordingService =
  inject(TeslaRecordingService);

  clips: TeslaClip[] = [];


 constructor(
  private readonly teslaImport: TeslaImport,
  private readonly teslaStore: TeslaStore,
  private readonly teslaEventService: TeslaEventService
) {}


  onFolderSelected(
    event: Event
  ): void {


    const input =
      event.target as HTMLInputElement;


    if (!input.files) {
      return;
    }


    const files =
      Array.from(input.files);


    this.teslaImport
      .importFiles(files)
      .subscribe({
      next: clips => {

  this.clips = clips;


  this.teslaStore.setClips(clips);


const recordings =
  this.recordingService.buildRecordings(clips);


this.teslaStore.setRecordings(
  recordings
);


if (recordings.length > 0) {

  this.teslaStore.selectRecording(
    recordings[0]
  );

}
console.log(
  'Tesla recordings',
  recordings
);

console.log('Imported clips:', clips);
  const events =
    this.teslaEventService.groupClips(
      clips
    );


  console.log('Grouped events:', events);



this.teslaStore.setRecordings(
  recordings
);
}
      });

  }


}