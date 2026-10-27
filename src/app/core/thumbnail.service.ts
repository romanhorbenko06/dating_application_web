import { Injectable, OnDestroy, Signal, signal } from '@angular/core';

import { PhotoContent } from './models/photo.models';

const DEFAULT_WIDTHS = [128, 320, 640];
const JPEG_QUALITY = 0.72;

/**
 * Зменшені копії фото для srcset, щоб мініатюри не декодували повний знімок.
 * Саме blob:, а не data: — кома в data-URI ламає розбір srcset.
 */
export interface PhotoVariants {
  srcset: string;
  smallest: string;
}

@Injectable({ providedIn: 'root' })
export class ThumbnailService implements OnDestroy {
  private cache = new Map<number, ReturnType<typeof signal<PhotoVariants | null>>>();
  private objectUrls: string[] = [];

  ngOnDestroy(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
  }

  /** Спершу null — шаблон показує оригінал, далі браузер обирає варіант. */
  variants(photo: PhotoContent, widths: number[] = DEFAULT_WIDTHS): Signal<PhotoVariants | null> {
    const existing = this.cache.get(photo.photoId);
    if (existing) return existing.asReadonly();

    const state = signal<PhotoVariants | null>(null);
    this.cache.set(photo.photoId, state);

    void this.build(photo, widths).then((value) => state.set(value));

    return state.asReadonly();
  }

  private async build(photo: PhotoContent, widths: number[]): Promise<PhotoVariants | null> {
    try {
      const image = await this.load(photo.dataUri);
      const parts: string[] = [];
      // Найменша копія стає src, щоб повний base64 не лежав у DOM кожної плитки
      let smallest = '';

      for (const width of widths) {
        if (width >= image.naturalWidth) break;

        const height = Math.round((image.naturalHeight / image.naturalWidth) * width);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');
        if (!context) return null;

        context.drawImage(image, 0, 0, width, height);
        const url = await this.toObjectUrl(canvas);
        if (!smallest) smallest = url;
        parts.push(`${url} ${width}w`);
      }

      // Оригінал теж blob: один data-кандидат зламав би весь srcset
      const original = await fetch(photo.dataUri).then((response) => response.blob());
      const originalUrl = this.keep(URL.createObjectURL(original));
      parts.push(`${originalUrl} ${image.naturalWidth}w`);

      return { srcset: parts.join(', '), smallest: smallest || originalUrl };
    } catch {
      return null;
    }
  }

  private toObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(this.keep(URL.createObjectURL(blob))) : reject(new Error('no blob'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    });
  }

  private keep(url: string): string {
    this.objectUrls.push(url);
    return url;
  }

  private load(dataUri: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не вдалося прочитати зображення'));
      image.src = dataUri;
    });
  }
}
