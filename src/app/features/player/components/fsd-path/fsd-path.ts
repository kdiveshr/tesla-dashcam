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
import { FsdPathCalculator, PathRibbon, Point2D } from '../../../../core/services/fsd-path-calculator';

@Component({
  selector: 'app-fsd-path',
  standalone: true,
  templateUrl: './fsd-path.html',
  styleUrl: './fsd-path.scss',
})
export class FsdPath implements AfterViewInit, OnChanges, OnDestroy {
  @Input() sample?: TeslaTelemetrySample;
  @Input() enabled = true;

  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private animationId = 0;
  private animOffset = 0;
  private resizeObserver?: ResizeObserver;

  constructor(private readonly pathCalculator: FsdPathCalculator) {}

  ngAfterViewInit(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

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
    if (changes['sample'] || changes['enabled']) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
  }

  render(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.enabled) return;

    const ribbon = this.pathCalculator.calculatePath(
      this.sample,
      canvas.width,
      canvas.height,
    );

    // Halted, or path too short to draw — render nothing. This is the
    // single source of truth for "no path at a stop": the calculator
    // returns an empty ribbon below the speed threshold, and we bail here.
    if (ribbon.polygon.length < 3) return;

    const isBraking = this.sample?.brakeApplied === true;

    // ---------- Banded chevron ribbon (the stripes ARE the path) ----------
    this.drawChevronRibbon(ctx, ribbon, isBraking);

    // ---------- Clean outline around the whole ribbon ----------
    ctx.save();
    ctx.beginPath();
    const [first, ...rest] = ribbon.polygon;
    ctx.moveTo(first.x, first.y);
    for (const pt of rest) ctx.lineTo(pt.x, pt.y);
    ctx.closePath();
    ctx.strokeStyle = isBraking ? 'rgba(120, 190, 255, 0.45)' : 'rgba(140, 210, 255, 0.60)';
    ctx.lineWidth = 1.25;
    ctx.shadowColor = 'rgba(0, 120, 200, 0.3)';
    ctx.shadowBlur = 1;
    ctx.stroke();
    ctx.restore();
  }

  private updateCanvasSize(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

  private startAnimationLoop(): void {
    const speedKph = this.sample?.speedKph ?? 0;

    if (speedKph >= 1.8) {
      const isBraking = this.sample?.brakeApplied === true;
      // Braking should read as an obvious, unmistakable change: the band
      // pattern visibly slows its forward scroll almost to a crawl, rather
      // than a subtle opacity tweak.
      const brakeFactor = isBraking ? 0.12 : 1.0;
      const speedFactor = Math.max(0.05, (speedKph / 75) * brakeFactor);
      this.animOffset = (this.animOffset + speedFactor * 0.03) % 1.0;
    }

    this.render();
    this.animationId = requestAnimationFrame(() => this.startAnimationLoop());
  }

  /**
   * Draws the path as a continuous strip of large chevron-shaped bands,
   * alternating between a darker and lighter blue, tiled edge-to-edge with
   * no gaps — matching Tesla's actual FSD visualization style. The bands
   * themselves are shaped like chevrons (both the near and far edge of each
   * band are pulled forward into a "^" point along the direction of travel)
   * rather than drawing separate small arrow glyphs on top of a plain fill.
   */
  private drawChevronRibbon(
    ctx: CanvasRenderingContext2D,
    ribbon: PathRibbon,
    isBraking: boolean,
  ): void {
    const { leftBoundary: left, rightBoundary: right, centerPath: center } = ribbon;
    const n = center.length;
    if (n < 4) return;

    // Number of depth-samples per stripe. Lower = more, tighter stripes.
    const bandSize = 5;
    // How far the chevron point is pulled forward relative to its edge —
    // controls how "pointy" each band looks. ~55% of a band's depth reads
    // close to the reference image.
    const apexPull = Math.max(1, Math.round(bandSize * 0.55));

    // Scroll the band pattern forward over time so it reads as motion,
    // exactly like the previous per-chevron animation did.
    const scrollOffset = Math.floor(this.animOffset * bandSize);

    const colorDark: [number, number, number, number] = isBraking
      ? [15, 60, 130, 0.60]
      : [8, 80, 190, 0.62];
    const colorLight: [number, number, number, number] = isBraking
      ? [70, 140, 220, 0.78]
      : [70, 165, 255, 0.85];

    const rgba = (c: [number, number, number, number], mult: number) =>
      `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(c[3] * mult).toFixed(3)})`;

    ctx.save();
    // Removed the heavy glow — on a solid opaque fill it reads as a light
    // source hovering above the road rather than paint on the asphalt.
    // A thin, tight shadow is enough to keep edges crisp without a halo.
    ctx.shadowColor = 'rgba(0, 120, 200, 0.4)';
    ctx.shadowBlur = 1;

    let bandIndex = 0;
    for (let i = -scrollOffset; i < n - 1; i += bandSize) {
      const near = Math.max(0, i);
      const far = Math.min(n - 1, i + bandSize);
      if (far <= near) continue;

      const nearApexIdx = Math.min(n - 1, near + apexPull);
      const farApexIdx = Math.min(n - 1, far + apexPull);

      const nearApex: Point2D = center[nearApexIdx];
      const farApex: Point2D = center[farApexIdx];

      // Depth-based fade: bands further from the camera get noticeably
      // dimmer, the way a flat surface receding into the dark actually
      // would. Without this every band is equally bright regardless of
      // distance, which is a strong "flat sticker over the video" cue
      // rather than "lying on the ground receding away from you".
      const depthT = far / (n - 1); // 0 = at camera, 1 = at path's far end
      const fade = 1 - Math.pow(depthT, 1.4) * 0.72; // keep at least ~28% near the far tip

      ctx.fillStyle = rgba(bandIndex % 2 === 0 ? colorDark : colorLight, fade);

      ctx.beginPath();
      ctx.moveTo(left[near].x, left[near].y);
      ctx.lineTo(nearApex.x, nearApex.y);
      ctx.lineTo(right[near].x, right[near].y);
      ctx.lineTo(right[far].x, right[far].y);
      ctx.lineTo(farApex.x, farApex.y);
      ctx.lineTo(left[far].x, left[far].y);
      ctx.closePath();
      ctx.fill();

      bandIndex++;
    }

    ctx.restore();
  }
}