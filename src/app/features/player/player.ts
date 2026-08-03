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

import {
  TeslaEvent,
} from '../../core/interfaces/tesla-event.interface';

import { CameraView } from './components/camera-view/camera-view';


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


  events: TeslaEvent[] = [];


  private subscription?: Subscription;



  @ViewChildren(CameraView)
  cameras!: QueryList<CameraView>;

currentTime = 0;

duration = 0;

  constructor(
    private readonly teslaStore: TeslaStore,
    private readonly playback: Playback,
  ) {}



  ngOnInit(): void {


    this.subscription =
      this.teslaStore.events$
        .subscribe(events => {

          this.events = events;

        });


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
  const frontCamera =
    cameraViews.find(camera => camera.label === 'Front');

  if (frontCamera) {
    this.duration = frontCamera.getDuration();
  }

}





  ngOnDestroy(): void {

    this.subscription?.unsubscribe();

    this.playback.clear();

  }

play(): void {

  this.playback.play();

}


pause(): void {

  this.playback.pause();

}
}