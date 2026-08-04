import {
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';

import { Subscription } from 'rxjs';
import { Timeline } from './components/timeline/timeline';
import { TeslaStore } from '../../core/services/tesla-store';
import { Playback } from '../../core/services/playback';
import { TeslaClip } 
from '../../core/interfaces/tesla-clip.interface';
import {
  TeslaEvent,
} from '../../core/interfaces/tesla-event.interface';

import { CameraView } from './components/camera-view/camera-view';
import { TeslaRecording } 
from '../../core/interfaces/tesla-recording.interface';

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [
    CameraView,
    Timeline,
  ],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class Player implements OnInit, OnDestroy {
frontSegments: TeslaClip[] = [];
private loadedVideos = 0;

private readonly expectedVideos = 4;
leftSegments: TeslaClip[] = [];
frontSource?: string;

leftSource?: string;

rightSource?: string;

rearSource?: string;
rightSegments: TeslaClip[] = [];

rearSegments: TeslaClip[] = [];
recording?: TeslaRecording;
private timer?: number;
segments: TeslaEvent[] = [];

  private subscription?: Subscription;



  @ViewChildren(CameraView)
  cameras!: QueryList<CameraView>;

currentTime = 0;
currentSegment = 0;
duration = 0;

  constructor(
    private readonly teslaStore: TeslaStore,
    private readonly playback: Playback,
  ) {}



  ngOnInit(): void {


    this.subscription =
  this.teslaStore.selectedRecording$
    .subscribe(recording => {


      if (recording) {


        console.log(
          'PLAYER RECORDING',
          recording
        );


        this.recording =
          recording;
if(recording){

this.frontSegments =
 recording.segments
 .map(s => s.front)
 .filter(
   (x): x is TeslaClip => !!x
 );


this.leftSegments =
 recording.segments
 .map(s => s.leftRepeater)
 .filter(
   (x): x is TeslaClip => !!x
 );


this.rightSegments =
 recording.segments
 .map(s => s.rightRepeater)
 .filter(
   (x): x is TeslaClip => !!x
 );


this.rearSegments =
 recording.segments
 .map(s => s.back)
 .filter(
   (x): x is TeslaClip => !!x
 );


}

        this.segments =
          recording.segments;


        this.playback.loadRecording(
  recording
);
this.updateCurrentSources();


      }


    });


  }

nextSegment(): void {

  const moved =
    this.playback.nextSegment();

  if (!moved) {
    return;
  }

  this.updateCurrentSources();

  this.loadedVideos = 0;

}


seek(time: number): void {

  this.currentTime = time;

  this.playback.seek(time);

}

  ngAfterViewInit(): void {


    this.cameras.changes
      .subscribe(() => {

        this.registerVideos();

      });


    this.registerVideos();

  }




 registerVideos(): void {

  const cameraViews = this.cameras.toArray();

  const videos = cameraViews
    .map(camera => camera.getVideoElement())
    .filter(
      (video): video is HTMLVideoElement => !!video
    );

  this.playback.registerVideos(videos);

  // Use the Front camera as the master duration.
  this.duration = this.playback.getDuration();

}



private startTimeline(): void {

  if (this.timer) {
    clearInterval(this.timer);
  }

  this.timer = window.setInterval(() => {

    const master =
      this.cameras.first?.getVideoElement();

    if (!master) {
      return;
    }

    this.currentTime =
      this.currentSegment * 60 +
      master.currentTime;

  }, 100);

}

  ngOnDestroy(): void {

    this.subscription?.unsubscribe();

    this.playback.clear();
    if (this.timer) {
  clearInterval(this.timer);
}

  }
  onCameraLoaded(): void {

  this.loadedVideos++;

  console.log(
    'Video loaded',
    this.loadedVideos,
    '/',
    this.expectedVideos
  );

  if (this.loadedVideos === this.expectedVideos) {

    console.log('All videos ready');

    this.loadedVideos = 0;

    this.registerVideos();

    this.play();

  }

}

play(): void {

  this.playback.play();
  this.startTimeline();

}


pause(): void {

  this.playback.pause();
  if (this.timer) {
  clearInterval(this.timer);
}

}private getCurrentEvent(): TeslaEvent | undefined {

  return this.playback.getCurrentEvent();

}

private updateCurrentSources(): void {

  const event =
    this.getCurrentEvent();

  if (!event) {
    return;
  }

  this.frontSource = event.front?.url;

  this.leftSource =
    event.leftRepeater?.url;

  this.rightSource =
    event.rightRepeater?.url;

  this.rearSource =
    event.back?.url;

}

}