import { Component, Signal, computed, inject, input, signal } from '@angular/core';

import { PhotoContent } from '../../core/models/photo.models';
import { PhotoVariants, ThumbnailService } from '../../core/thumbnail.service';
import { PhotoLightbox } from '../photo-lightbox/photo-lightbox';

@Component({
  selector: 'app-photo-gallery',
  imports: [PhotoLightbox],
  templateUrl: './photo-gallery.html',
  styleUrl: './photo-gallery.css',
})
export class PhotoGallery {
  readonly photos = input.required<PhotoContent[]>();
  readonly emptyText = input('Фотографій ще немає');

  private thumbnails = inject(ThumbnailService);

  readonly openIndex = signal<number | null>(null);

  readonly ordered = computed(() =>
    [...this.photos()].sort((a, b) => Number(b.isMain) - Number(a.isMain)),
  );

  variants(photo: PhotoContent): Signal<PhotoVariants | null> {
    return this.thumbnails.variants(photo, [160, 320, 640]);
  }

  open(index: number): void {
    this.openIndex.set(index);
  }
}
