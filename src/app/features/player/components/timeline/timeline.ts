import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { DatePipe, DecimalPipe } from '@angular/common';
import { MatSliderModule } from '@angular/material/slider';
import { MatInputModule } from '@angular/material/input';

export interface TimelineClip {
  index: number;
  start: number;
  duration: number;
  timestamp: Date;
}

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    DecimalPipe,
    DatePipe,
    MatSliderModule,
    MatInputModule,
  ],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss',
})
export class Timeline {

  @Input()
  currentTime = 0;

  @Input()
  duration = 0;

  @Input()
  clips: TimelineClip[] = [];

  @Output()
  seek = new EventEmitter<number>();

  zoom = 1;

  get pixelsPerSecond(): number {
    return 2 * this.zoom;
  }

  get trackWidth(): number {
    return Math.max(320, this.duration * this.pixelsPerSecond);
  }

  getClipWidth(clip: TimelineClip): number {
    return Math.max(clip.duration * this.pixelsPerSecond, 8);
  }

  formatTime(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    const remainingSeconds = seconds % 60;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedSeconds = remainingSeconds.toString().padStart(2, '0');

    return hours > 0
      ? `${hours}:${formattedMinutes}:${formattedSeconds}`
      : `${formattedMinutes}:${formattedSeconds}`;
  }

  onSeek(value: number): void {
    this.seek.emit(value);
  }

  selectClip(clip: TimelineClip): void {
    this.seek.emit(clip.start);
  }

  zoomIn(): void {
    this.zoom = Math.min(this.zoom * 2, 8);
  }

  zoomOut(): void {
    this.zoom = Math.max(this.zoom / 2, 0.5);
  }

  isActive(clip: TimelineClip): boolean {
    const end = clip.start + clip.duration;
    return this.currentTime >= clip.start &&
      (this.currentTime < end || (end === this.duration && this.currentTime === end));
  }

}
