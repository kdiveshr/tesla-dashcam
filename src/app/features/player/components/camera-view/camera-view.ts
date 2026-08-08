import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';
import { TeslaTelemetrySample } from '../../../../core/interfaces/tesla-telemetry.interface';
import { FsdPath } from '../fsd-path/fsd-path';

@Component({
  selector: 'app-camera-view',
  standalone: true,
  imports: [FsdPath],
  templateUrl: './camera-view.html',
  styleUrl: './camera-view.scss',
})
export class CameraView {
  @Input() label = 'Camera';
  @Input() source?: string;
  @Input() sample?: TeslaTelemetrySample;
  @Input() showFsdPath = false;

  @Output() metadataLoaded = new EventEmitter<void>();
  @Output() ended = new EventEmitter<void>();
  @Output() timeUpdated = new EventEmitter<number>();

  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;

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
    this.metadataLoaded.emit();
  }

  onTimeUpdate(): void {
    const currentTime = this.getVideoElement()?.currentTime;
    if (currentTime !== undefined) {
      this.timeUpdated.emit(currentTime);
    }
  }
}
