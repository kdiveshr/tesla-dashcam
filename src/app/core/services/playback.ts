import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import { TeslaEvent } from '../interfaces/tesla-event.interface';
import { TeslaClip } from '../interfaces/tesla-clip.interface';
import { TeslaRecording } from '../interfaces/tesla-recording.interface';
import { PlaybackSegment } from '../models/playback-segment';

export interface PlaybackPosition {
  segmentIndex: number;
  localTime: number;
  segmentChanged: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class Playback {
  private syncInterval?: number;
  private videos: HTMLVideoElement[] = [];
  private segments: PlaybackSegment[] = [];
  private recording?: TeslaRecording;
  private currentSegment = 0;
  private playing = false;

  private readonly currentSegmentSubject = new BehaviorSubject<number>(0);
  readonly currentSegment$ = this.currentSegmentSubject.asObservable();

  registerVideos(videos: HTMLVideoElement[]): void {
    this.videos = videos;
  }

  async play(): Promise<void> {
    await Promise.all(this.videos.map(video => video.play()));
    this.playing = true;
    this.startSync();
  }

  pause(): void {
    this.videos.forEach(video => video.pause());
    this.playing = false;
    this.stopSync();
  }

  seek(time: number): PlaybackPosition | undefined {
    const target = this.getPosition(time);

    if (!target) {
      return undefined;
    }

    const segmentChanged = target.segmentIndex !== this.currentSegment;
    this.setCurrentSegment(target.segmentIndex);

    if (!segmentChanged) {
      this.seekVideos(target.localTime);
    }

    return { ...target, segmentChanged };
  }

  nextSegment(): boolean {
    if (!this.recording || this.currentSegment >= this.recording.segments.length - 1) {
      return false;
    }

    this.setCurrentSegment(this.currentSegment + 1);
    return true;
  }

  seekVideos(time: number): void {
    this.videos.forEach(video => {
      video.currentTime = time;
    });
  }

  setPlaybackRate(rate: number): void {
    this.videos.forEach(video => {
      video.playbackRate = rate;
    });
  }

  async loadRecording(recording: TeslaRecording): Promise<void> {
    this.pause();
    this.recording = recording;
    this.buildTimeline(recording.segments.map(() => 0));
    this.setCurrentSegment(0);

    const durations = await Promise.all(
      recording.segments.map(segment => this.readSegmentDuration(segment)),
    );

    if (this.recording !== recording) {
      return;
    }

    this.buildTimeline(durations.map((duration, index) =>
      Math.max(duration, this.segments[index]?.duration ?? 0),
    ));
  }

  setCurrentSegmentDuration(duration: number): void {
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const segment = this.segments[this.currentSegment];

    if (!segment || Math.abs(segment.duration - duration) < 0.01) {
      return;
    }

    const durations = this.segments.map(item => item.duration);
    durations[this.currentSegment] = duration;
    this.buildTimeline(durations);
  }

  getCurrentEvent(): TeslaEvent | undefined {
    return this.recording?.segments[this.currentSegment];
  }

  getCurrentSegment(): number {
    return this.currentSegment;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  getCurrentTime(localTime: number): number {
    return (this.segments[this.currentSegment]?.start ?? 0) + localTime;
  }

  getDuration(): number {
    return this.segments.at(-1)
      ? this.segments.at(-1)!.start + this.segments.at(-1)!.duration
      : 0;
  }

  getTimelineSegments(): PlaybackSegment[] {
    return this.segments.map(segment => ({ ...segment }));
  }

  clear(): void {
    this.pause();
    this.videos = [];
    this.segments = [];
    this.recording = undefined;
    this.setCurrentSegment(0);
  }

  private buildTimeline(durations: number[]): void {
    let start = 0;

    this.segments = durations.map((duration, index) => {
      const segment = {
        index,
        start,
        duration,
      };
      start += segment.duration;
      return segment;
    });
  }

  private getPosition(time: number): Omit<PlaybackPosition, 'segmentChanged'> | undefined {
    const clampedTime = Math.max(0, Math.min(time, this.getDuration()));
    const segment = this.segments.find(item =>
      clampedTime < item.start + item.duration,
    ) ?? this.segments.at(-1);

    if (!segment) {
      return undefined;
    }

    return {
      segmentIndex: segment.index,
      localTime: Math.min(clampedTime - segment.start, segment.duration),
    };
  }

  private setCurrentSegment(index: number): void {
    this.currentSegment = index;
    this.currentSegmentSubject.next(index);
  }

  private async readSegmentDuration(event: TeslaEvent): Promise<number> {
    const clips = [
      event.front,
      event.back,
      event.leftRepeater,
      event.rightRepeater,
    ].filter((clip): clip is TeslaClip => !!clip);

    for (const clip of clips) {
      const duration = await this.readVideoDuration(clip.url);

      if (duration > 0) {
        return duration;
      }
    }

    return 0;
  }

  private readVideoDuration(source: string): Promise<number> {
    return new Promise(resolve => {
      const video = document.createElement('video');
      const timeout = window.setTimeout(() => finish(0), 10_000);

      const finish = (duration: number): void => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onMetadataLoaded);
        video.removeEventListener('error', onError);
        video.removeAttribute('src');
        video.load();
        resolve(duration);
      };

      const onMetadataLoaded = (): void => {
        const duration = video.duration;
        finish(Number.isFinite(duration) && duration > 0 ? duration : 0);
      };

      const onError = (): void => finish(0);

      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', onMetadataLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.src = source;
    });
  }

  private startSync(): void {
    this.stopSync();
    this.syncInterval = window.setInterval(() => {
      const [master, ...followers] = this.videos;

      if (!master) {
        return;
      }

      followers.forEach(video => {
        if (Math.abs(video.currentTime - master.currentTime) > 0.05) {
          video.currentTime = master.currentTime;
        }
      });
    }, 500);
  }

  private stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = undefined;
    }
  }
}
