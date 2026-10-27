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

/** Заготовки першого повідомлення з реальним спільним тегом. */
const STARTERS = [
  'З чого почалася твоя любов до теми {}?',
  'Що цікавого в темі {} трапилося останнім часом?',
  'Порадиш щось у темі {}?',
];

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
  /** Чат існує лише після метчу, тож він і є ознакою взаємності. */
  readonly chatId = signal<number | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busy = signal(false);
  readonly reporting = signal(false);
  readonly confirmingBlock = signal(false);

  readonly unlocked = computed(() => this.photos().length > 0);

  readonly isAdmin = this.auth.isAdmin;

  /** Саме взаємність: фото бекенд відкриває й адміністраторові. */
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

  readonly orderedPhotos = computed(() => {
    const main = this.mainPhoto();
    return main ? [main, ...this.restPhotos()] : this.restPhotos();
  });

  readonly lightboxIndex = signal<number | null>(null);

  readonly me = this.auth.currentUser;

  readonly myTagCount = computed(() => this.myTagIds().size);

  readonly matchPercent = computed(() => {
    const mine = this.myTagCount();
    if (!mine) return null;
    return Math.round((this.sharedTags().length / mine) * 100);
  });

  readonly donutOffset = computed(() => (157.1 * (100 - (this.matchPercent() ?? 0))) / 100);

  readonly starters = computed(() =>
    this.sharedTags()
      .slice(0, 3)
      .map((tag, i) => STARTERS[i % STARTERS.length].replace('{}', tag.tagName)),
  );

  /** Лише те, що справді можна порівняти за наявними полями. */
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

  /** Бекенд віддає кількість і до взаємної симпатії. */
  readonly photoCount = computed(() => this.profile()?.photoCount ?? 0);

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
      // Другорядні дані не мають ламати сторінку
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

  myInitial(): string {
    return this.me()?.name.charAt(0).toUpperCase() ?? '?';
  }

  isShared(tag: TagResponse): boolean {
    return this.myTagIds().has(tag.tagId);
  }

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
          // Людина вподобала нас раніше — лайк одразу став метчем
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
