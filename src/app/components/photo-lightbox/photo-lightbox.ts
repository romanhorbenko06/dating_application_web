import { DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  OnDestroy,
  Signal,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { PhotoContent } from '../../core/models/photo.models';
import { PhotoVariants, ThumbnailService } from '../../core/thumbnail.service';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const TAP_SCALE = 2.4;
const SWIPE_THRESHOLD = 40;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 32;

interface Point {
  x: number;
  y: number;
}

/** Повноекранний перегляд фото. Трансформація translate(offset) scale(scale) з origin у центрі. */
@Component({
  selector: 'app-photo-lightbox',
  imports: [DecimalPipe],
  templateUrl: './photo-lightbox.html',
  styleUrl: './photo-lightbox.css',
})
export class PhotoLightbox implements OnDestroy {
  readonly photos = input.required<PhotoContent[]>();
  readonly startIndex = input(0);
  readonly closed = output<void>();

  private thumbnails = inject(ThumbnailService);

  private readonly overlay = viewChild<ElementRef<HTMLDivElement>>('overlay');
  private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');

  readonly index = signal(0);
  readonly scale = signal(1);
  readonly offset = signal<Point>({ x: 0, y: 0 });
  readonly dragging = signal(false);

  readonly current = computed(() => this.photos()[this.index()] ?? null);
  readonly total = computed(() => this.photos().length);
  readonly zoomed = computed(() => this.scale() > 1.02);

  readonly transform = computed(() => {
    const { x, y } = this.offset();
    return `translate(${x}px, ${y}px) scale(${this.scale()})`;
  });

  private decoded = new Set<number>();

  private pinch: { dist: number; scale: number; offset: Point; anchor: Point } | null = null;
  private drag: { x: number; y: number; offset: Point } | null = null;
  private swipeStartX: number | null = null;
  private lastTap: { time: number; x: number; y: number } | null = null;
  /** Після дотику браузер шле ще й click — його треба проковтнути. */
  private ignoreClickUntil = 0;

  constructor() {
    effect(() => {
      this.index.set(Math.min(this.startIndex(), Math.max(this.photos().length - 1, 0)));
    });

    effect(() => this.overlay()?.nativeElement.focus());

    // Сусідні фото декодуємо заздалегідь, щоб не було затримки при гортанні.
    effect(() => this.preloadNeighbours(this.index()));

    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = '';
  }

  close(): void {
    this.closed.emit();
  }

  next(): void {
    if (this.total() < 2) return;
    this.resetZoom();
    this.index.update((i) => (i + 1) % this.total());
  }

  prev(): void {
    if (this.total() < 2) return;
    this.resetZoom();
    this.index.update((i) => (i - 1 + this.total()) % this.total());
  }

  select(i: number): void {
    this.resetZoom();
    this.index.set(i);
  }

  thumb(photo: PhotoContent): Signal<PhotoVariants | null> {
    return this.thumbnails.variants(photo, [128, 256]);
  }

  resetZoom(): void {
    this.scale.set(1);
    this.offset.set({ x: 0, y: 0 });
  }

  onClick(event: MouseEvent): void {
    if (Date.now() < this.ignoreClickUntil) return;

    if (this.zoomed()) this.resetZoom();
    else this.zoomTo(TAP_SCALE, { x: event.clientX, y: event.clientY });
  }

  onMouseDown(event: MouseEvent): void {
    if (!this.zoomed()) return;

    event.preventDefault();
    this.drag = { x: event.clientX, y: event.clientY, offset: this.offset() };
    this.dragging.set(true);
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.drag) return;

    this.setOffset({
      x: this.drag.offset.x + (event.clientX - this.drag.x),
      y: this.drag.offset.y + (event.clientY - this.drag.y),
    });
  }

  onMouseUp(): void {
    this.drag = null;
    this.dragging.set(false);
  }

  onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0], event.touches[1]];
      this.pinch = {
        dist: this.distance(a, b),
        scale: this.scale(),
        offset: this.offset(),
        anchor: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 },
      };
      this.swipeStartX = null;
      this.drag = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) return;

    if (this.zoomed()) {
      this.drag = { x: touch.clientX, y: touch.clientY, offset: this.offset() };
      this.dragging.set(true);
    } else {
      this.swipeStartX = touch.clientX;
    }
  }

  onTouchMove(event: TouchEvent): void {
    if (this.pinch && event.touches.length === 2) {
      event.preventDefault();

      const ratio = this.distance(event.touches[0], event.touches[1]) / this.pinch.dist;
      const target = this.clampScale(this.pinch.scale * ratio);
      this.zoomTo(target, this.pinch.anchor, this.pinch);
      return;
    }

    if (this.drag && event.touches.length === 1) {
      event.preventDefault();

      const touch = event.touches[0];
      this.setOffset({
        x: this.drag.offset.x + (touch.clientX - this.drag.x),
        y: this.drag.offset.y + (touch.clientY - this.drag.y),
      });
    }
  }

  onTouchEnd(event: TouchEvent): void {
    this.ignoreClickUntil = Date.now() + 400;

    const wasPinching = this.pinch !== null;
    this.pinch = null;
    this.drag = null;
    this.dragging.set(false);

    if (wasPinching && this.scale() <= 1.05) this.resetZoom();

    const touch = event.changedTouches[0];
    if (!touch || wasPinching) {
      this.swipeStartX = null;
      return;
    }

    if (this.swipeStartX !== null) {
      const delta = touch.clientX - this.swipeStartX;
      this.swipeStartX = null;

      if (Math.abs(delta) >= SWIPE_THRESHOLD) {
        if (delta < 0) this.next();
        else this.prev();
        this.lastTap = null;
        return;
      }
    }

    this.handleTap(touch.clientX, touch.clientY);
  }

  private handleTap(x: number, y: number): void {
    const now = Date.now();
    const previous = this.lastTap;

    const isDouble =
      previous !== null &&
      now - previous.time < DOUBLE_TAP_MS &&
      Math.hypot(x - previous.x, y - previous.y) < DOUBLE_TAP_SLOP;

    if (isDouble) {
      this.lastTap = null;
      if (this.zoomed()) this.resetZoom();
      else this.zoomTo(TAP_SCALE, { x, y });
      return;
    }

    this.lastTap = { time: now, x, y };
  }

  onKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        this.close();
        break;
      case 'ArrowRight':
        this.next();
        break;
      case 'ArrowLeft':
        this.prev();
        break;
      case '0':
        this.resetZoom();
        break;
    }
  }

  /**
   * Масштабує до target, лишаючи anchor на місці: t₁ = a − s₁·(a − t₀)/s₀,
   * де a — anchor відносно центру кадру.
   */
  private zoomTo(
    target: number,
    anchor: Point,
    from: { scale: number; offset: Point } = { scale: this.scale(), offset: this.offset() },
  ): void {
    const frame = this.frame()?.nativeElement;
    if (!frame) return;

    const rect = frame.getBoundingClientRect();
    const a: Point = {
      x: anchor.x - (rect.left + rect.width / 2),
      y: anchor.y - (rect.top + rect.height / 2),
    };

    const next = this.clampScale(target);
    this.scale.set(next);
    this.setOffset({
      x: a.x - (next * (a.x - from.offset.x)) / from.scale,
      y: a.y - (next * (a.y - from.offset.y)) / from.scale,
    });
  }

  /** Не дає відтягнути знімок за його межі. */
  private setOffset(value: Point): void {
    const image = this.image()?.nativeElement;
    const frame = this.frame()?.nativeElement;

    if (!image || !frame) {
      this.offset.set(value);
      return;
    }

    const scale = this.scale();
    const maxX = Math.max(0, (image.offsetWidth * scale - frame.clientWidth) / 2);
    const maxY = Math.max(0, (image.offsetHeight * scale - frame.clientHeight) / 2);

    this.offset.set({
      x: Math.min(Math.max(value.x, -maxX), maxX),
      y: Math.min(Math.max(value.y, -maxY), maxY),
    });
  }

  private clampScale(value: number): number {
    return Math.min(Math.max(value, MIN_SCALE), MAX_SCALE);
  }

  private distance(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  private preloadNeighbours(index: number): void {
    const list = this.photos();
    if (list.length < 2) return;

    for (const i of [(index + 1) % list.length, (index - 1 + list.length) % list.length]) {
      const photo = list[i];
      if (!photo || this.decoded.has(photo.photoId)) continue;

      this.decoded.add(photo.photoId);
      const image = new Image();
      image.src = photo.dataUri;
      image.decode?.().catch(() => {});
    }
  }
}
