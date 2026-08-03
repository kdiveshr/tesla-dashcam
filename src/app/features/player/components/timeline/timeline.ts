import {
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { DecimalPipe } from '@angular/common';
import { MatSliderModule } from '@angular/material/slider';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [
    DecimalPipe,
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

  @Output()
  seek = new EventEmitter<number>();

  onSeek(value: number): void {
    this.seek.emit(value);
  }

}