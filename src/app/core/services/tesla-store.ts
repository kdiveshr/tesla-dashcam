import { Injectable } from '@angular/core';

import {
  BehaviorSubject,
  Observable,
} from 'rxjs';

import { TeslaClip } from '../interfaces/tesla-clip.interface';
import { TeslaRecording } from '../interfaces/tesla-recording.interface';


@Injectable({
  providedIn: 'root',
})
export class TeslaStore {


  private readonly clipsSubject =
    new BehaviorSubject<TeslaClip[]>([]);


  readonly clips$: Observable<TeslaClip[]> =
    this.clipsSubject.asObservable();



  private readonly recordingsSubject =
    new BehaviorSubject<TeslaRecording[]>([]);


  readonly recordings$: Observable<TeslaRecording[]> =
    this.recordingsSubject.asObservable();



  private readonly selectedRecordingSubject =
    new BehaviorSubject<TeslaRecording | null>(null);


  readonly selectedRecording$ =
    this.selectedRecordingSubject.asObservable();



  setClips(
    clips: TeslaClip[]
  ): void {

    this.clipsSubject.next(clips);

  }




  setRecordings(
    recordings: TeslaRecording[]
  ): void {

    this.recordingsSubject.next(recordings);

  }




  selectRecording(
    recording: TeslaRecording
  ): void {

    this.selectedRecordingSubject.next(recording);

  }




  clear(): void {

    this.clipsSubject.next([]);

    this.recordingsSubject.next([]);

    this.selectedRecordingSubject.next(null);

  }

}