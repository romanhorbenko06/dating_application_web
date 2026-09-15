import { Injectable, OnDestroy, Signal, signal } from '@angular/core';

import { PhotoContent } from './models/photo.models';

/** Ширини варіантів. 128 — смуга мініатюр, 320 — плитки галереї, 640 — щільні екрани. */
const DEFAULT_WIDTHS = [128, 320, 640];
const JPEG_QUALITY = 0.72;

/**
 * Зменшені копії фотографій для `srcset`.
 *
 * Навіщо: бекенд віддає ОДИН розмір — повний base64 у `dataUri`. Підставляти
 * його в мініатюру 58px означає, що браузер декодує повнорозмірний знімок
 * заради плитки завбільшки з ніготь. Варіанти малюємо на клієнті через canvas,
 * один раз на фото.
 *
 * ЧОМУ САМЕ blob:, а не data: — критично. У `data:image/jpeg;base64,…` є кома,
 * а кома в `srcset` розділяє кандидатів. Перевірено в Chrome: зі списком
 * з data-URI браузер обирає НЕ той варіант (для слота 64px брав 512px-джерело).
 * З blob:-адресами вибір правильний, а заразом кожен кандидат у DOM важить
 * ~60 символів замість десятків кілобайт.
 *
 * Мережу це не економить (байти вже приїхали з API) — економить декодування,
 * растеризацію та вагу атрибутів. Мережу вирішив би окремий ендпоінт бекенду.
 */
/** Готові варіанти одного фото: рядок для srcset і найменша копія для src. */
export interface PhotoVariants {
  srcset: string;
  smallest: string;
}

@Injectable({ providedIn: 'root' })
export class ThumbnailService implements OnDestroy {
  private cache = new Map<number, ReturnType<typeof signal<PhotoVariants | null>>>();
  /** Створені об'єктні URL — щоб звільнити пам'ять при знищенні сервісу. */
  private objectUrls: string[] = [];

  ngOnDestroy(): void {
    for (const url of this.objectUrls) URL.revokeObjectURL(url);
    this.objectUrls = [];
  }

  /**
   * Сигнал із рядком srcset. Спершу null — шаблон показує оригінал з `src`;
   * коли варіанти готові, сигнал оновлюється й браузер обирає потрібний.
   */
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
      // Найменша копія стає значенням src: інакше повний base64 лишався б
      // у DOM кожної плитки як запасний варіант
      let smallest = '';

      for (const width of widths) {
        // Збільшувати сенсу немає: варіант, ширший за оригінал, гірший за оригінал
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

      // Оригінал теж має бути blob-адресою: один data:-кандидат зі своєю комою
      // зламав би розбір усього списку
      const original = await fetch(photo.dataUri).then((response) => response.blob());
      const originalUrl = this.keep(URL.createObjectURL(original));
      parts.push(`${originalUrl} ${image.naturalWidth}w`);

      return { srcset: parts.join(', '), smallest: smallest || originalUrl };
    } catch {
      // Будь-яка невдача означає лише, що лишиться оригінал у src
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
