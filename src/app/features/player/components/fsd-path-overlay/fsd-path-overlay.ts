import {
  AfterViewChecked,
  Component,
  ElementRef,
  Input,
  ViewChild,
} from '@angular/core';

import { FsdProjectedPoint } from '../../../../core/services/fsd-path';

@Component({
  selector: 'app-fsd-path-overlay',
  standalone: true,
  template: '<canvas #canvas></canvas>',
  styles: [
    `:host { position:absolute; inset:0; display:block; pointer-events:none; z-index:3; }`,
    `canvas { width:100%; height:100%; display:block; }`,
  ],
})
export class FsdPathOverlay implements AfterViewChecked {
  @Input()
  points: FsdProjectedPoint[] = [];

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

    const width = element.clientWidth || 640;
    const height = element.clientHeight || 360;

    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }

    context.clearRect(0, 0, width, height);

    if (this.points.length < 2) {
      return;
    }

    const horizonY = height * 0.3;
    const originX = width * 0.5;
    const originY = height * 0.92;

    context.beginPath();

    this.points.forEach((point, index) => {
      const x = originX + point.x * width * 0.28;
      const y = originY - (point.y * (originY - horizonY));

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    const gradient = context.createLinearGradient(0, height * 0.9, 0, horizonY);
    gradient.addColorStop(0, 'rgba(96, 214, 255, 0.20)');
    gradient.addColorStop(0.4, 'rgba(64, 170, 255, 0.80)');
    gradient.addColorStop(1, 'rgba(98, 220, 255, 1)');

    context.strokeStyle = gradient;
    context.lineWidth = 4;
    context.shadowColor = 'rgba(98, 220, 255, 0.9)';
    context.shadowBlur = 16;
    context.stroke();
    context.shadowBlur = 0;

    const finalPoint = this.points[this.points.length - 1];
    const terminalX = originX + finalPoint.x * width * 0.28;
    const terminalY = originY - (finalPoint.y * (originY - horizonY));

    context.beginPath();
    context.arc(terminalX, terminalY, 7, 0, Math.PI * 2);
    context.fillStyle = 'rgba(137, 232, 255, 1)';
    context.fill();

    context.beginPath();
    context.arc(terminalX, terminalY, 12, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(137, 232, 255, 0.35)';
    context.lineWidth = 2;
    context.stroke();
  }
}
