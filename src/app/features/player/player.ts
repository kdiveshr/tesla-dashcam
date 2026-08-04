import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { Subscription } from 'rxjs';

import { Playback } from '../../core/services/playback';
import { TeslaStore } from '../../core/services/tesla-store';
import { Telemetry } from '../../core/services/telemetry';
import { TeslaRecording } from '../../core/interfaces/tesla-recording.interface';
import { TeslaTelemetrySample } from '../../core/interfaces/tesla-telemetry.interface';
import { CameraView } from './components/camera-view/camera-view';
import { TelemetryHud } from './components/telemetry-hud/telemetry-hud';
import { Timeline, TimelineClip } from './components/timeline/timeline';

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CameraView, TelemetryHud, Timeline],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class Player implements OnInit, AfterViewInit, OnDestroy {
  recording?: TeslaRecording;
  frontSource?: string;
  leftSource?: string;
  rightSource?: string;
  rearSource?: string;
  currentTime = 0;
  duration = 0;
  timelineClips: TimelineClip[] = [];
  telemetrySample?: TeslaTelemetrySample;

  @ViewChildren(CameraView)
  cameras!: QueryList<CameraView>;

  private subscription?: Subscription;
  private telemetrySubscription?: Subscription;
  private timer?: number;
  private loadedVideos = 0;
  private pendingSeekTime?: number;
  private resumeAfterLoad = false;
  private recordingLoadId = 0;

  constructor(
    private readonly teslaStore: TeslaStore,
    private readonly playback: Playback,
    private readonly telemetry: Telemetry,
  ) {}

  ngOnInit(): void {
    this.telemetrySubscription = this.telemetry.samples$.subscribe(() => {
      this.updateTelemetry();
    });

    this.subscription = this.teslaStore.selectedRecording$.subscribe(recording => {
      if (!recording) {
        this.recording = undefined;
        this.clearSources();
        return;
      }

      this.recording = recording;
      this.telemetrySample = undefined;
      void this.telemetry.importRecording(recording);
      this.loadedVideos = 0;
      this.pendingSeekTime = undefined;
      this.resumeAfterLoad = false;
      const loadId = ++this.recordingLoadId;
      void this.playback.loadRecording(recording).then(() => {
        if (loadId === this.recordingLoadId) {
          this.duration = this.playback.getDuration();
          this.refreshTimelineClips();
        }
      });
      this.duration = 0;
      this.currentTime = 0;
      this.refreshTimelineClips();
      this.updateCurrentSources();
    });
  }

  ngAfterViewInit(): void {
    this.cameras.changes.subscribe(() => this.registerVideos());
    this.registerVideos();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    this.telemetrySubscription?.unsubscribe();
    this.stopTimeline();
    this.playback.clear();
  }

  play(): void {
    void this.playback.play();
    this.startTimeline();
  }

  pause(): void {
    this.playback.pause();
    this.stopTimeline();
  }

  seek(time: number): void {
    const position = this.playback.seek(time);

    if (!position) {
      return;
    }

    this.currentTime = this.playback.getCurrentTime(position.localTime);

    if (position.segmentChanged) {
      this.pause();
      this.pendingSeekTime = position.localTime;
      this.updateTelemetry();
      this.updateCurrentSources();
      return;
    }

    this.updateTelemetry();
  }

  nextSegment(): void {
    const shouldResume = this.playback.isPlaying();

    if (!this.playback.nextSegment()) {
      this.pause();
      return;
    }

    this.playback.pause();
    this.stopTimeline();
    this.resumeAfterLoad = shouldResume;
    this.loadedVideos = 0;
    this.updateCurrentSources();
  }

  onCameraLoaded(): void {
    this.loadedVideos++;

    if (this.loadedVideos < this.getSourceCount()) {
      return;
    }

    this.loadedVideos = 0;
    this.registerVideos();
    const masterDuration = this.cameras
      .toArray()
      .map(camera => camera.getDuration())
      .find(duration => duration > 0);

    if (masterDuration) {
      this.playback.setCurrentSegmentDuration(masterDuration);
      this.duration = this.playback.getDuration();
      this.refreshTimelineClips();
    }

    if (this.pendingSeekTime !== undefined) {
      this.playback.seekVideos(this.pendingSeekTime);
      this.currentTime = this.playback.getCurrentTime(this.pendingSeekTime);
      this.pendingSeekTime = undefined;
    }

    if (this.resumeAfterLoad) {
      this.resumeAfterLoad = false;
      this.play();
    }
  }

  onMasterTimeUpdated(localTime: number): void {
    this.currentTime = this.playback.getCurrentTime(localTime);
    this.updateTelemetry();
  }

  private registerVideos(): void {
    const videos = this.cameras
      .toArray()
      .map(camera => camera.getVideoElement())
      .filter((video): video is HTMLVideoElement => !!video);

    this.playback.registerVideos(videos);
  }

  private updateCurrentSources(): void {
    const event = this.playback.getCurrentEvent();
    this.frontSource = event?.front?.url;
    this.leftSource = event?.leftRepeater?.url;
    this.rightSource = event?.rightRepeater?.url;
    this.rearSource = event?.back?.url;
  }

  private clearSources(): void {
    this.frontSource = undefined;
    this.leftSource = undefined;
    this.rightSource = undefined;
    this.rearSource = undefined;
  }

  private refreshTimelineClips(): void {
    const segments = this.playback.getTimelineSegments();

    this.timelineClips = segments.map(segment => ({
      ...segment,
      timestamp: this.recording?.segments[segment.index]?.timestamp ?? new Date(0),
    }));
  }

  private getSourceCount(): number {
    return [
      this.frontSource,
      this.leftSource,
      this.rightSource,
      this.rearSource,
    ].filter((source): source is string => !!source).length;
  }

  private updateTelemetry(): void {
    this.telemetrySample = this.telemetry.getSampleAtPlaybackTime(this.currentTime);
  }

  private startTimeline(): void {
    this.stopTimeline();
    this.timer = window.setInterval(() => {
      const master = this.cameras.first?.getVideoElement();

      if (master) {
        this.currentTime = this.playback.getCurrentTime(master.currentTime);
        this.updateTelemetry();
      }
    }, 100);
  }

  private stopTimeline(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
