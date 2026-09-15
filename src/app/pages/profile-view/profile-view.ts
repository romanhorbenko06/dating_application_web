import { Component, OnInit, Signal, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { PhotoContent } from '../../core/models/photo.models';
import { PublicProfile } from '../../core/models/profile.models';
import { TagResponse } from '../../core/models/tag.models';
import { ModerationService } from '../../core/moderation.service';
import { PhotoService } from '../../core/photo.service';
import {
  EMPTY,
  ageFrom,
  childrenLabel,
  educationLabel,
  genderLabel,
  goalLabel,
  temperamentLabel,
} from '../../core/profile-format';
import { ProfileService } from '../../core/profile.service';
import { RequestService } from '../../core/request.service';
import { TagService } from '../../core/tag.service';
import { PhotoVariants, ThumbnailService } from '../../core/thumbnail.service';
import { PhotoLightbox } from '../../components/photo-lightbox/photo-lightbox';
import { AppShell } from '../../layout/app-shell/app-shell';

/**
 * Заготовки першого повідомлення. Підставляється РЕАЛЬНИЙ спільний тег —
 * жодних вигаданих фактів про людину тут немає.
 */
const STARTERS = [
  'З чого почалася твоя любов до теми {}?',
  'Що цікавого в темі {} трапилося останнім часом?',
  'Порадиш щось у темі {}?',
];

/** UC-07: детальний перегляд чужої анкети. */
@Component({
  selector: 'app-profile-view',
  imports: [ReactiveFormsModule, RouterLink, AppShell, PhotoLightbox],
  templateUrl: './profile-view.html',
  styleUrl: './profile-view.css',
})
export class ProfileView implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private profileService = inject(ProfileService);
  private photoService = inject(PhotoService);
  private tagService = inject(TagService);
  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private moderation = inject(ModerationService);
  private requests = inject(RequestService);
  private fb = inject(FormBuilder);
  private thumbnails = inject(ThumbnailService);

  readonly userId = Number(this.route.snapshot.paramMap.get('id'));

  readonly profile = signal<PublicProfile | null>(null);
  readonly photos = signal<PhotoContent[]>([]);
  readonly tags = signal<TagResponse[]>([]);
  private myTagIds = signal<Set<number>>(new Set());
  /** Чат існує лише після метчу — отже, він же і є ознакою взаємності. */
  readonly chatId = signal<number | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busy = signal(false);
  readonly reporting = signal(false);
  readonly confirmingBlock = signal(false);

  /** Наявність фото = доступ відкрито. */
  readonly unlocked = computed(() => this.photos().length > 0);

  /** Адміністратор дивиться анкети для модерації, а не для знайомств. */
  readonly isAdmin = this.auth.isAdmin;

  /**
   * Саме ВЗАЄМНІСТЬ, а не просто доступ до фото. Бекенд відкриває світлини
   * адміністраторові теж (PhotoService.canViewPhotos), тож без цієї перевірки
   * модератор бачив би банер «взаємний збіг» на кожній чужій анкеті.
   */
  readonly matched = computed(() => this.unlocked() && !this.isAdmin());

  readonly sharedTags = computed(() => {
    const mine = this.myTagIds();
    return this.tags().filter((tag) => mine.has(tag.tagId));
  });

  readonly mainPhoto = computed(
    () => this.photos().find((photo) => photo.isMain) ?? this.photos()[0] ?? null,
  );

  readonly restPhotos = computed(() =>
    this.photos().filter((photo) => photo.photoId !== this.mainPhoto()?.photoId),
  );

  /** Порядок для перегляду: головне фото першим, далі решта. */
  readonly orderedPhotos = computed(() => {
    const main = this.mainPhoto();
    return main ? [main, ...this.restPhotos()] : this.restPhotos();
  });

  /** Індекс відкритого фото; null — перегляд закритий. */
  readonly lightboxIndex = signal<number | null>(null);

  /** Наш профіль — щоб порівняти мету, дітей і місто. */
  readonly me = this.auth.currentUser;

  readonly myTagCount = computed(() => this.myTagIds().size);

  /** Частка ваших інтересів, що збіглися; null — коли своїх тегів ще немає. */
  readonly matchPercent = computed(() => {
    const mine = this.myTagCount();
    if (!mine) return null;
    return Math.round((this.sharedTags().length / mine) * 100);
  });

  /** Довжина кола радіуса 25 — 157.1; зміщення показує незаповнену частину. */
  readonly donutOffset = computed(() => (157.1 * (100 - (this.matchPercent() ?? 0))) / 100);

  /** Теми для першого повідомлення — рівно зі спільних тегів, до трьох штук. */
  readonly starters = computed(() =>
    this.sharedTags()
      .slice(0, 3)
      .map((tag, i) => STARTERS[i % STARTERS.length].replace('{}', tag.tagName)),
  );

  /**
   * Що спільного — лише те, що справді можна порівняти за наявними полями.
   * Ніяких вигаданих збігів на кшталт «активності» чи «онлайн».
   */
  readonly commonalities = computed(() => {
    const them = this.profile();
    const me = this.me();
    if (!them || !me) return [];

    const items: string[] = [];
    const shared = this.sharedTags();

    if (shared.length > 0) {
      items.push(shared.map((tag) => tag.tagName).join(', '));
    }
    if (me.datingGoal && me.datingGoal === them.datingGoal) {
      items.push(`Мета: ${goalLabel(them.datingGoal)}`);
    }
    if (me.childrenStatus && me.childrenStatus === them.childrenStatus) {
      items.push(childrenLabel(them.childrenStatus));
    }
    if (me.city && them.city && me.city.trim().toLowerCase() === them.city.trim().toLowerCase()) {
      items.push(`Обоє з міста ${them.city}`);
    }

    return items;
  });

  /** Кількість фото людини — бекенд віддає її і до взаємної симпатії. */
  readonly photoCount = computed(() => this.profile()?.photoCount ?? 0);

  /** Розмиті плитки під закритим фото: показуємо стільки, скільки фото насправді є. */
  readonly lockedTiles = computed(() =>
    Array.from({ length: Math.min(this.photoCount(), 4) }, (_, i) => i),
  );

  readonly reportForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
  });

  readonly empty = EMPTY;
  readonly genderLabel = genderLabel;
  readonly goalLabel = goalLabel;
  readonly educationLabel = educationLabel;
  readonly temperamentLabel = temperamentLabel;
  readonly childrenLabel = childrenLabel;

  ngOnInit(): void {
    forkJoin({
      profile: this.profileService.getById(this.userId),
      // Другорядні дані не мають ламати сторінку — на помилці підставляємо порожнє
      photos: this.photoService.getPhotoContents(this.userId).pipe(catchError(() => of([]))),
      tags: this.tagService.getForUser(this.userId).pipe(catchError(() => of([]))),
      myTags: this.tagService.getMy().pipe(catchError(() => of([]))),
      chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ profile, photos, tags, myTags, chats }) => {
        this.profile.set(profile);
        this.photos.set(photos);
        this.tags.set(tags);
        this.myTagIds.set(new Set(myTags.map((tag) => tag.tagId)));

        const chat = chats.find(
          (c) => c.user1Id === this.userId || c.user2Id === this.userId,
        );
        this.chatId.set(chat?.chatId ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити анкету.'));
        this.loading.set(false);
      },
    });
  }

  /** Дрібні знімки під головним фото — беруть зменшений варіант. */
  variants(photo: PhotoContent): Signal<PhotoVariants | null> {
    return this.thumbnails.variants(photo, [160, 320]);
  }

  age(): string {
    const years = ageFrom(this.profile()?.dateOfBirth ?? null);
    return years === null ? EMPTY : `${years}`;
  }

  initial(): string {
    return this.profile()?.name.charAt(0).toUpperCase() ?? '?';
  }

  /** Друга плитка в банері метчу — це ми самі. */
  myInitial(): string {
    return this.me()?.name.charAt(0).toUpperCase() ?? '?';
  }

  isShared(tag: TagResponse): boolean {
    return this.myTagIds().has(tag.tagId);
  }

  /** Пропустити просто зі сторінки анкети — той самий ендпоінт, що у стрічці. */
  skip(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.requests.skip(target.userId).subscribe({
      next: () => this.router.navigate(['/feed']),
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося пропустити анкету.'));
        this.busy.set(false);
      },
    });
  }

  like(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.requests.send(target.userId).subscribe({
      next: (request) => {
        if (request.status === 'ACCEPTED') {
          // Людина вподобала нас раніше — лайк одразу став метчем, і фото вже відкриті
          this.notice.set('Взаємно! Чат створено, а фото щойно відкрилися');
          this.photoService
            .getPhotoContents(this.userId)
            .pipe(catchError(() => of([] as PhotoContent[])))
            .subscribe((photos) => this.photos.set(photos));
        } else {
          this.notice.set('Симпатію надіслано — фото відкриються, якщо вам відповідять взаємністю');
        }
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося надіслати симпатію.'));
        this.busy.set(false);
      },
    });
  }

  submitReport(): void {
    const target = this.profile();
    if (!target || this.reportForm.invalid || this.busy()) return;

    this.busy.set(true);
    this.moderation.fileComplaint(target.userId, this.reportForm.getRawValue().reason).subscribe({
      next: () => {
        this.reporting.set(false);
        this.reportForm.reset();
        this.busy.set(false);
        this.notice.set('Скаргу надіслано на розгляд адміністратора');
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося надіслати скаргу.'));
        this.busy.set(false);
      },
    });
  }

  block(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.moderation.blockUser(target.userId).subscribe({
      next: () => {
        this.confirmingBlock.set(false);
        this.notice.set(`Заблоковано: ${target.name}. Ви зникли одне в одного зі стрічки й чатів.`);
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося заблокувати користувача.'));
        this.busy.set(false);
      },
    });
  }
}
