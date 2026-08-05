import { Injectable } from '@angular/core';

import { FsdProjectedPoint } from './fsd-path';

@Injectable({ providedIn: 'root' })
export class VideoExportService {
  async exportFrontCamera(
    source: string | undefined,
    projectedPath: FsdProjectedPoint[] = [],
  ): Promise<void> {
    if (!source) {
      return;
    }

    const video = document.createElement('video');
    video.src = source;
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';

    await new Promise<void>((resolve, reject) => {
      const onLoaded = (): void => {
        cleanup();
        resolve();
      };
      const onError = (): void => {
        cleanup();
        reject(new Error('Unable to load the source video for export.'));
      };

      const cleanup = (): void => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas export is not supported in this browser.');
    }

    const stream = canvas.captureStream(30);
    const mimeType = this.getSupportedMimeType();
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined,
    );
    const chunks: BlobPart[] = [];
    let rafId = 0;

    recorder.ondataavailable = event => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    const renderFrame = (): void => {
      if (video.ended || video.paused) {
        return;
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.drawFsdPath(context, canvas.width, canvas.height, projectedPath);
      rafId = requestAnimationFrame(renderFrame);
    };

    const stopExport = (): void => {
      cancelAnimationFrame(rafId);
      recorder.stop();
    };

    await new Promise<void>((resolve, reject) => {
      video.addEventListener('ended', () => {
        stopExport();
        resolve();
      }, { once: true });
      video.addEventListener('error', () => {
        stopExport();
        reject(new Error('Playback failed while exporting the clip.'));
      }, { once: true });

      recorder.onstop = () => {
        const blob = new Blob(chunks, {
          type: mimeType ?? 'video/webm',
        });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `tesla-dashcam-${Date.now()}.${this.getFileExtension(mimeType)}`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(downloadUrl);
      };

      recorder.start();
      video.currentTime = 0;
      video.play();
      renderFrame();
    });
  }

  private drawFsdPath(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    path: FsdProjectedPoint[],
  ): void {
    if (path.length < 2) {
      return;
    }

    context.save();
    context.beginPath();

    path.forEach((point, index) => {
      const x = width * 0.5 + point.x * 28;
      const y = height * 0.72 - point.y * 18;

      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });

    context.strokeStyle = 'rgba(74, 156, 255, 1)';
    context.lineWidth = 4;
    context.shadowColor = 'rgba(74, 156, 255, 0.8)';
    context.shadowBlur = 14;
    context.stroke();
    context.restore();
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
