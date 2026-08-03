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
onMetadataLoaded(): void {

  this.metadataLoaded.emit();

}

}