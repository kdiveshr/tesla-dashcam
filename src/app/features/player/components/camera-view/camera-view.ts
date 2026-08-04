import {
  Component,
  Input,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-camera-view',
  standalone: true,
  templateUrl: './camera-view.html',
  styleUrl: './camera-view.scss',
})

export class CameraView {






  @Input()
  label = 'Camera';
@Output()
metadataLoaded = new EventEmitter<void>();
@Output()
ended = new EventEmitter<void>();
  @Output()
  timeUpdated = new EventEmitter<number>();
  @Input()
  source?: string;


  @ViewChild('video')
  video?: ElementRef<HTMLVideoElement>;


  getVideoElement(): HTMLVideoElement | undefined {

    return this.video?.nativeElement;

  }
  getDuration(): number {
  return this.getVideoElement()?.duration ?? 0;
}

onEnded(): void {

  this.ended.emit();

}
onMetadataLoaded(): void {

  console.log(
    this.label,
    'metadata loaded'
  );

  this.metadataLoaded.emit();

}

  onTimeUpdate(): void {
    const currentTime = this.getVideoElement()?.currentTime;

    if (currentTime !== undefined) {
      this.timeUpdated.emit(currentTime);
    }
  }

}
