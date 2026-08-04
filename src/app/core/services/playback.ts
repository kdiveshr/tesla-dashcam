import { Injectable } from '@angular/core';
import { PlaybackSegment } from '../models/playback-segment';
import { TeslaEvent } from '../interfaces/tesla-event.interface';
import { BehaviorSubject } from 'rxjs';
import { TeslaRecording } from '../interfaces/tesla-recording.interface';
@Injectable({
  providedIn: 'root',
})
export class Playback {

private syncInterval?: number;
  private videos: HTMLVideoElement[] = [];
private segments: PlaybackSegment[] = [];

private totalDuration = 0;
private events: TeslaEvent[] = [];
private recording?: TeslaRecording;

private currentSegment = 0;


private currentSegmentSubject =
  new BehaviorSubject<number>(0);


readonly currentSegment$ =
  this.currentSegmentSubject.asObservable();

  registerVideos(
    videos: HTMLVideoElement[]
  ): void {

    this.videos = videos;

  }
private startSync(): void {


  this.stopSync();


  this.syncInterval =
    window.setInterval(() => {


      if (this.videos.length < 2) {

        return;

      }


      const master =
        this.videos[0];


      const masterTime =
        master.currentTime;



      this.videos
        .slice(1)
        .forEach(video => {


          if (
            Math.abs(
              video.currentTime -
              masterTime
            ) > 0.05
          ) {


            video.currentTime =
              masterTime;


          }


        });



    }, 500);


}



private stopSync(): void {


  if (this.syncInterval) {


    clearInterval(
      this.syncInterval
    );


    this.syncInterval =
      undefined;


  }

}


  async play(): Promise<void> {


  await Promise.all(
    this.videos.map(video =>
      video.play()
    )
  );


  this.startSync();

}



  pause(): void {


  this.videos.forEach(video => {

    video.pause();

  });


  this.stopSync();

}



  seek(
    time: number
  ): void {

    this.videos.forEach(video => {

      video.currentTime = time;

    });

  }



  setPlaybackRate(
    rate: number
  ): void {

    this.videos.forEach(video => {

      video.playbackRate = rate;

    });

  }



  clear(): void {

  this.videos = [];

  this.events = [];

  this.segments = [];

  this.currentSegmentSubject.next(0);

}
buildTimeline(events: TeslaEvent[]) {


  this.events = events;


  this.segments = [];


  let current = 0;


  events.forEach((event,index)=>{


    this.segments.push({

      index,

      start: current,

      duration: 60

    });


    current += 60;


  });


  this.totalDuration = current;


  console.log(
    'Playback timeline',
    this.segments
  );

}
nextSegment(): boolean {

  if (!this.recording) {

    return false;

  }

  if (
    this.currentSegment >=
    this.recording.segments.length - 1
  ) {

    console.log(
      'Recording finished'
    );

    return false;

  }

  this.currentSegment++;

  this.currentSegmentSubject.next(
    this.currentSegment
  );

  return true;

}



getSegmentEvent(
  index:number
): TeslaEvent | undefined {


  return this.events[index];

}



getDuration(): number {


  return this.totalDuration;


}
loadRecording(
  recording: TeslaRecording
): void {

  this.recording = recording;

  this.currentSegment = 0;

  this.buildTimeline(
    recording.segments
  );

}
getCurrentEvent():
  TeslaEvent | undefined {

  return this.recording?.segments[
    this.currentSegment
  ];

}
getCurrentSegment(): number {

  return this.currentSegment;

}
}
