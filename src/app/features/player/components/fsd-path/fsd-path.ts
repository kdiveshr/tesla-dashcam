import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TeslaTelemetrySample } from '../../../../core/interfaces/tesla-telemetry.interface';
import { FsdPathCalculator, Point2D } from '../../../../core/services/fsd-path-calculator';

@Component({
  selector: 'app-fsd-path',
  standalone: true,
  templateUrl: './fsd-path.html',
  styleUrl: './fsd-path.scss',
})
export class FsdPath implements AfterViewInit, OnChanges, OnDestroy {
  @Input() sample?: TeslaTelemetrySample;
  @Input() enabled = true;
  @Input() showLaneBoundaries = true;

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private animationId = 0;
  private animOffset = 0;
  private resizeObserver?: ResizeObserver;

  constructor(private readonly pathCalculator: FsdPathCalculator) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const container = canvas.parentElement;
    if (container) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateCanvasSize();
        this.render();
      });
      this.resizeObserver.observe(container);
    }

    this.updateCanvasSize();
    this.startAnimationLoop();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sample'] || changes['enabled'] || changes['showLaneBoundaries']) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    this.resizeObserver?.disconnect();
  }

  render(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.enabled) {
      return;
    }

    const ribbon = this.pathCalculator.calculatePath(this.sample, canvas.width, canvas.height);

    if (ribbon.polygon.length < 3) {
      return;
    }

    // 1. Draw Glowing FSD Path Ribbon Fill
    ctx.save();
    ctx.beginPath();
    const [first, ...rest] = ribbon.polygon;
    ctx.moveTo(first.x, first.y);
    for (const pt of rest) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * 0.3);
    gradient.addColorStop(0, 'rgba(0, 217, 255, 0.55)');
    gradient.addColorStop(0.6, 'rgba(0, 162, 255, 0.35)');
    gradient.addColorStop(1, 'rgba(0, 120, 255, 0.05)');

    ctx.fillStyle = gradient;
    ctx.fill();

    // Ribbon Stroke/Glow
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00e5ff';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();

    // 2. Draw Lane Boundaries if enabled
    if (this.showLaneBoundaries) {
      this.drawDashedBoundary(ctx, ribbon.leftBoundary);
      this.drawDashedBoundary(ctx, ribbon.rightBoundary);
    }

    // 3. Draw Moving Directional Chevrons
    this.drawChevrons(ctx, ribbon.centerPath);
  }

  private updateCanvasSize(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

  private startAnimationLoop(): void {
    const speedKph = this.sample?.speedKph ?? 20;
    const speedFactor = Math.max(0.5, speedKph / 10.0);
    this.animOffset = (this.animOffset + speedFactor * 0.04) % 1.0;

    this.render();
    this.animationId = requestAnimationFrame(() => this.startAnimationLoop());
  }

  private drawDashedBoundary(ctx: CanvasRenderingContext2D, points: Point2D[]): void {
    if (points.length < 2) {
      return;
    }

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.setLineDash([12, 8]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  private drawChevrons(ctx: CanvasRenderingContext2D, centerPath: Point2D[]): void {
    if (centerPath.length < 4) {
      return;
    }

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;

    const chevronSpacing = 4; // every N points
    const offsetIndex = Math.floor(this.animOffset * chevronSpacing);

    for (let i = offsetIndex; i < centerPath.length - 2; i += chevronSpacing) {
      const pt = centerPath[i];
      const nextPt = centerPath[i + 1];

      const angle = Math.atan2(nextPt.y - pt.y, nextPt.x - pt.x);
      const size = Math.max(6, 18 - (i * 0.3)); // scale smaller toward horizon

      ctx.save();
      ctx.translate(pt.x, pt.y);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(-size * 0.6, -size * 0.5);
      ctx.lineTo(size * 0.4, 0);
      ctx.lineTo(-size * 0.6, size * 0.5);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();
  }
}
