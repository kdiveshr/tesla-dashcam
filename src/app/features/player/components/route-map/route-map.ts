import {
  AfterViewChecked,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';

import { TeslaTelemetrySample } from '../../../../core/interfaces/tesla-telemetry.interface';

@Component({
  selector: 'app-route-map',
  standalone: true,
  template: '<canvas #canvas></canvas>',
  styles: [
    `:host { display:block; width:100%; min-height:180px; border-radius:12px; overflow:hidden; background:linear-gradient(180deg, rgba(16,24,37,0.8), rgba(8,12,18,0.95)); border:1px solid rgba(147,197,253,0.2); }`,
    `canvas { display:block; width:100%; height:180px; }`,
  ],
})
export class RouteMap implements AfterViewChecked {
  @Input()
  samples: TeslaTelemetrySample[] = [];

  @Input()
  currentTime = 0;

  @ViewChild('canvas')
  canvas?: ElementRef<HTMLCanvasElement>;

  ngAfterViewChecked(): void {
    this.draw();
  }

  private draw(): void {
    const element = this.canvas?.nativeElement;

    if (!element) {
      return;
    }

    const context = element.getContext('2d');

    if (!context) {
      return;
    }

    const width = element.clientWidth || 360;
    const height = element.clientHeight || 180;

    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }

    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(8, 13, 20, 0.92)';
    context.fillRect(0, 0, width, height);

    const validSamples = this.samples.filter(
      sample => sample.latitude !== undefined && sample.longitude !== undefined,
    );

    if (validSamples.length < 2) {
      return;
    }

    const minLat = Math.min(...validSamples.map(sample => sample.latitude ?? 0));
    const maxLat = Math.max(...validSamples.map(sample => sample.latitude ?? 0));
    const minLon = Math.min(...validSamples.map(sample => sample.longitude ?? 0));
    const maxLon = Math.max(...validSamples.map(sample => sample.longitude ?? 0));

    const routePoints = validSamples.map(sample => {
      const x = ((sample.longitude ?? 0) - minLon) / Math.max(0.000001, maxLon - minLon);
      const y = ((sample.latitude ?? 0) - minLat) / Math.max(0.000001, maxLat - minLat);
      return {
        x: x * (width - 32) + 16,
        y: (1 - y) * (height - 32) + 16,
      };
    });

    context.beginPath();
    routePoints.forEach((point, index) => {
      if (index === 0) {
        context.moveTo(point.x, point.y);
      } else {
        context.lineTo(point.x, point.y);
      }
    });
    context.strokeStyle = 'rgba(96, 165, 250, 0.95)';
    context.lineWidth = 3;
    context.stroke();

    const currentSample = validSamples
      .filter(sample => sample.playbackTimeSeconds !== undefined)
      .filter(sample => (sample.playbackTimeSeconds ?? 0) <= this.currentTime)
      .at(-1) ?? validSamples[validSamples.length - 1];

    const currentIndex = validSamples.findIndex(sample => sample.timestamp.getTime() === currentSample.timestamp.getTime());
    const currentPoint = routePoints[currentIndex >= 0 ? currentIndex : routePoints.length - 1];

    if (currentPoint) {
      context.beginPath();
      context.arc(currentPoint.x, currentPoint.y, 6, 0, Math.PI * 2);
      context.fillStyle = '#7dd3fc';
      context.fill();
      context.strokeStyle = '#e0f2fe';
      context.lineWidth = 2;
      context.stroke();
    }
  }
}
