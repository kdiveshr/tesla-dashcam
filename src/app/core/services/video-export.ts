import { Injectable } from '@angular/core';
import { TeslaTelemetrySample } from '../interfaces/tesla-telemetry.interface';
import { FsdPathCalculator } from './fsd-path-calculator';

export type ExportLayout = 'front' | 'quad-grid' | 'pip';

export interface ExportSources {
  front?: string;
  left?: string;
  right?: string;
  rear?: string;
}

export interface LoadedVideos {
  front?: HTMLVideoElement;
  left?: HTMLVideoElement;
  right?: HTMLVideoElement;
  rear?: HTMLVideoElement;
}

export interface ExportOptions {
  layout: ExportLayout;
  includeTelemetryHud: boolean;
  includeFsdPath: boolean;
  telemetrySample?: TeslaTelemetrySample;
  onProgress?: (progress: number) => void;
}

@Injectable({ providedIn: 'root' })
export class VideoExportService {
  constructor(private readonly fsdPathCalculator: FsdPathCalculator) {}

  async exportVideo(
    sources: ExportSources,
    options: ExportOptions,
  ): Promise<void> {
    const layout = options.layout;
    const frontSrc = sources.front;
    const leftSrc = sources.left;
    const rightSrc = sources.right;
    const rearSrc = sources.rear;

    if (!frontSrc && !leftSrc && !rightSrc && !rearSrc) {
      throw new Error('No video sources provided for export.');
    }

    // Load available video elements into memory
    const videoMap = await this.loadVideoElements(sources);

    // Canvas resolution (1920x1080 for crisp output)
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas 2D context is not supported.');
    }

    const masterVideo = videoMap.front ?? videoMap.left ?? videoMap.right ?? videoMap.rear;
    if (!masterVideo) {
      throw new Error('Failed to initialize master video source.');
    }

    const duration = masterVideo.duration || 10;
    const stream = canvas.captureStream(30);
    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    let rafId = 0;

    const renderLoop = (): void => {
      if (masterVideo.ended || masterVideo.paused) {
        return;
      }

      const currentTime = masterVideo.currentTime;
      if (options.onProgress && duration > 0) {
        options.onProgress(Math.min(100, Math.round((currentTime / duration) * 100)));
      }

      ctx.fillStyle = '#050a12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (layout === 'front') {
        this.renderFrontLayout(ctx, canvas.width, canvas.height, videoMap.front, options);
      } else if (layout === 'quad-grid') {
        this.renderQuadGrid(ctx, canvas.width, canvas.height, videoMap, options);
      } else if (layout === 'pip') {
        this.renderPipLayout(ctx, canvas.width, canvas.height, videoMap, options);
      }

      if (options.includeTelemetryHud) {
        this.drawTelemetryHudOverlay(ctx, canvas.width, canvas.height, options.telemetrySample);
      }

      rafId = requestAnimationFrame(renderLoop);
    };

    const stopExport = (): void => {
      cancelAnimationFrame(rafId);
      recorder.stop();
      this.cleanupVideos(videoMap);
    };

    await new Promise<void>((resolve, reject) => {
      masterVideo.addEventListener('ended', () => {
        stopExport();
        resolve();
      }, { once: true });

      masterVideo.addEventListener('error', () => {
        stopExport();
        reject(new Error('Playback error occurred during export.'));
      }, { once: true });

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType ?? 'video/webm' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `tesla-dashcam-${layout}-${Date.now()}.${this.getFileExtension(mimeType)}`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
      };

      recorder.start();
      this.playAllVideos(videoMap);
      renderLoop();
    });
  }

  private async loadVideoElements(sources: ExportSources): Promise<LoadedVideos> {
    const map: LoadedVideos = {};
    const entries = Object.entries(sources) as Array<[keyof ExportSources, string | undefined]>;

    await Promise.all(
      entries.map(async ([key, url]) => {
        if (!url) return;
        const video = document.createElement('video');
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';

        await new Promise<void>((resolve, reject) => {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true });
          video.addEventListener('error', () => reject(new Error(`Failed to load ${key} video.`)), { once: true });
        });

        map[key] = video;
      })
    );

    return map;
  }

  private playAllVideos(videoMap: LoadedVideos): void {
    const videos = [videoMap.front, videoMap.left, videoMap.right, videoMap.rear].filter(
      (v): v is HTMLVideoElement => !!v
    );
    videos.forEach(v => {
      v.currentTime = 0;
      void v.play();
    });
  }

  private cleanupVideos(videoMap: LoadedVideos): void {
    const videos = [videoMap.front, videoMap.left, videoMap.right, videoMap.rear].filter(
      (v): v is HTMLVideoElement => !!v
    );
    videos.forEach(v => {
      v.pause();
      v.removeAttribute('src');
      v.load();
    });
  }

  private renderFrontLayout(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frontVideo?: HTMLVideoElement,
    options?: ExportOptions,
  ): void {
    if (frontVideo) {
      ctx.drawImage(frontVideo, 0, 0, width, height);
    }

    if (options?.includeFsdPath) {
      this.drawFsdPathOverlay(ctx, 0, 0, width, height, options.telemetrySample);
    }
  }

  private renderQuadGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    videos: LoadedVideos,
    options?: ExportOptions,
  ): void {
    const halfW = width / 2;
    const halfH = height / 2;

    // Top-Left: Front
    if (videos.front) {
      ctx.drawImage(videos.front, 0, 0, halfW, halfH);
      if (options?.includeFsdPath) {
        this.drawFsdPathOverlay(ctx, 0, 0, halfW, halfH, options.telemetrySample);
      }
    }
    this.drawLabel(ctx, 'FRONT', 16, 32);

    // Top-Right: Rear
    if (videos.rear) {
      ctx.drawImage(videos.rear, halfW, 0, halfW, halfH);
    }
    this.drawLabel(ctx, 'REAR', halfW + 16, 32);

    // Bottom-Left: Left Repeater
    if (videos.left) {
      ctx.drawImage(videos.left, 0, halfH, halfW, halfH);
    }
    this.drawLabel(ctx, 'LEFT REPEATER', 16, halfH + 32);

    // Bottom-Right: Right Repeater
    if (videos.right) {
      ctx.drawImage(videos.right, halfW, halfH, halfW, halfH);
    }
    this.drawLabel(ctx, 'RIGHT REPEATER', halfW + 16, halfH + 32);

    // Grid divider lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(halfW, 0); ctx.lineTo(halfW, height);
    ctx.moveTo(0, halfH); ctx.lineTo(width, halfH);
    ctx.stroke();
  }

  private renderPipLayout(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    videos: LoadedVideos,
    options?: ExportOptions,
  ): void {
    // Main background: Front Camera
    if (videos.front) {
      ctx.drawImage(videos.front, 0, 0, width, height);
      if (options?.includeFsdPath) {
        this.drawFsdPathOverlay(ctx, 0, 0, width, height, options.telemetrySample);
      }
    }

    // PiP Overlay Thumbnails (Bottom-Right)
    const pipW = width * 0.22;
    const pipH = height * 0.22;
    const margin = 20;

    const pipSources: Array<{ key: keyof LoadedVideos; label: string }> = [
      { key: 'left', label: 'LEFT' },
      { key: 'rear', label: 'REAR' },
      { key: 'right', label: 'RIGHT' },
    ];

    let currentX = width - (pipW + margin) * pipSources.length;
    const currentY = height - pipH - margin - 90; // offset above bottom HUD

    pipSources.forEach(pip => {
      const v = videos[pip.key];
      if (v) {
        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(currentX, currentY, pipW, pipH);
        ctx.drawImage(v, currentX, currentY, pipW, pipH);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(currentX, currentY, pipW, pipH);
        this.drawLabel(ctx, pip.label, currentX + 8, currentY + 20, 11);
        ctx.restore();
      }
      currentX += pipW + margin;
    });
  }

  private drawFsdPathOverlay(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    sample?: TeslaTelemetrySample,
  ): void {
    const ribbon = this.fsdPathCalculator.calculatePath(sample, width, height);
    if (ribbon.polygon.length < 3) return;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.beginPath();
    const [first, ...rest] = ribbon.polygon;
    ctx.moveTo(first.x, first.y);
    for (const pt of rest) {
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, height, 0, height * 0.3);
    gradient.addColorStop(0, 'rgba(0, 217, 255, 0.55)');
    gradient.addColorStop(1, 'rgba(0, 120, 255, 0.05)');

    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  private drawTelemetryHudOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    sample?: TeslaTelemetrySample,
  ): void {
    const hudH = 75;
    const hudY = height - hudH;

    ctx.save();
    // Translucent glassmorphism bar at bottom
    ctx.fillStyle = 'rgba(10, 16, 26, 0.82)';
    ctx.fillRect(0, hudY, width, hudH);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, hudY, width, hudH);

    // Speedometer
    const speed = sample?.speedKph !== undefined ? Math.round(sample.speedKph) : 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`${speed}`, 40, hudY + 48);
    ctx.fillStyle = '#38bdf8';
    ctx.font = '14px sans-serif';
    ctx.fillText('KM/H', 40 + (speed > 99 ? 65 : 45), hudY + 48);

    // Gear
    const gear = sample?.gear?.toUpperCase() ?? 'D';
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText(`GEAR: ${gear}`, 220, hudY + 46);

    // Steering Angle
    const steering = sample?.steeringAngleDegrees !== undefined ? `${Math.round(sample.steeringAngleDegrees)}°` : '0°';
    ctx.fillStyle = '#38bdf8';
    ctx.font = '20px sans-serif';
    ctx.fillText(`STEER: ${steering}`, 400, hudY + 46);

    // Autopilot Status
    const apEnabled = sample?.autopilot?.enabled;
    const fsdEnabled = sample?.autopilot?.fsdEnabled;
    let apLabel = 'MANUAL';
    let apColor = '#94a3b8';

    if (fsdEnabled) {
      apLabel = 'FSD ACTIVE';
      apColor = '#00f0ff';
    } else if (apEnabled) {
      apLabel = 'AUTOPILOT';
      apColor = '#3b82f6';
    }

    ctx.fillStyle = apColor;
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(apLabel, width - 240, hudY + 46);

    // Watermark / Timestamp
    const timestampStr = sample?.timestamp ? new Date(sample.timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
    ctx.fillStyle = '#64748b';
    ctx.font = '14px sans-serif';
    ctx.fillText(`TeslaCam • ${timestampStr}`, width - 460, hudY + 46);

    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fontSize = 14): void {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - 4, y - fontSize, ctx.measureText(text).width + 12, fontSize + 8);
    ctx.fillStyle = '#00f0ff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private getSupportedMimeType(): string | undefined {
    const candidates = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1.4D401E,mp4a.40.2',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ];

    return candidates.find(candidate => MediaRecorder.isTypeSupported(candidate));
  }

  private getFileExtension(mimeType: string | undefined): string {
    if (mimeType?.startsWith('video/mp4')) {
      return 'mp4';
    }
    return 'webm';
  }
}
