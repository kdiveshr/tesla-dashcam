import { Injectable } from '@angular/core';


@Injectable({
  providedIn: 'root',
})
export class Playback {

private syncInterval?: number;
  private videos: HTMLVideoElement[] = [];



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

  }


}