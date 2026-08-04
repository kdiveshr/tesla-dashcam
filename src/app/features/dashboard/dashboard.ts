import { Component, OnDestroy, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { TeslaRecording } from '../../core/interfaces/tesla-recording.interface';
import { TeslaStore } from '../../core/services/tesla-store';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit, OnDestroy {
  recordings: TeslaRecording[] = [];
  private subscription?: Subscription;

  constructor(
    private readonly teslaStore: TeslaStore,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.subscription = this.teslaStore.recordings$.subscribe(recordings => {
      this.recordings = recordings;
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  openRecording(recording: TeslaRecording): void {
    this.teslaStore.selectRecording(recording);
    void this.router.navigate(['/player']);
  }

  getCameraCount(recording: TeslaRecording): number {
    const firstSegment = recording.segments[0];
    return [
      firstSegment?.front,
      firstSegment?.back,
      firstSegment?.leftRepeater,
      firstSegment?.rightRepeater,
    ].filter(Boolean).length;
  }
}
