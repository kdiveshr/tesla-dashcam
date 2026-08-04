import { Component } from '@angular/core';

import { TeslaImport } from '../../core/services/tesla-import';
import { TeslaStore } from '../../core/services/tesla-store';
import { MatButtonModule } from '@angular/material/button';
import { inject } from '@angular/core';
import { TeslaRecordingService } from '../../core/services/tesla-recording';
import { Telemetry } from '../../core/services/telemetry';
import { Router } from '@angular/router';
@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    MatButtonModule,
  ],
  templateUrl: './upload.html',
  styleUrl: './upload.scss',
})
export class Upload {
private readonly recordingService =
  inject(TeslaRecordingService);
private readonly telemetry = inject(Telemetry);

  isImporting = false;


 constructor(
  private readonly teslaImport: TeslaImport,
  private readonly teslaStore: TeslaStore,
  private readonly router: Router,
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

    this.isImporting = true;
    void this.telemetry.importFiles(files);


    this.teslaImport
      .importFiles(files)
      .subscribe({
      next: clips => {

  this.teslaStore.setClips(clips);


const recordings =
  this.recordingService.buildRecordings(clips);


this.teslaStore.setRecordings(
  recordings
);


        this.isImporting = false;

        if (recordings.length > 0) {
          this.teslaStore.selectRecording(recordings[0]);
          void this.router.navigate(['/player']);
        }
}
      });

  }


}
