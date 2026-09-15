import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { PhotoGallery } from '../../components/photo-gallery/photo-gallery';
import { AppShell } from '../../layout/app-shell/app-shell';
import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { BlockResponse } from '../../core/models/block.models';
import { PhotoContent } from '../../core/models/photo.models';
import { TagResponse } from '../../core/models/tag.models';
import { ModerationService } from '../../core/moderation.service';
import { PhotoService } from '../../core/photo.service';
import { RequestService } from '../../core/request.service';
import {
  EMPTY,
  ageFrom,
  formatDate,
  childrenLabel,
  educationLabel,
  genderLabel,
  goalLabel,
  plural,
  profileCompleteness,
  temperamentLabel,
} from '../../core/profile-format';
import { TagService } from '../../core/tag.service';
import { UserService } from '../../core/user.service';
import { WsService } from '../../core/ws.service';

/** Пункт списку «що додати»: виконане лишається в списку, але викресленим. */
interface Todo {
  text: string;
  done: boolean;
}

/** Скільки тегів вважаємо достатнім, щоб стрічці було за чим ранжувати. */
const ENOUGH_TAGS = 5;

/** UC-04: перегляд власної анкети. */
@Component({
  selector: 'app-profile',
  imports: [RouterLink, PhotoGallery, AppShell],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private photoService = inject(PhotoService);
  private tagService = inject(TagService);
  private requests = inject(RequestService);
  private chatService = inject(ChatService);
  private moderation = inject(ModerationService);
  private userService = inject(UserService);
  private router = inject(Router);
  private ws = inject(WsService);

  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  readonly user = this.auth.currentUser;
  readonly photos = signal<PhotoContent[]>([]);
  readonly tags = signal<TagResponse[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly maxPhotos = PhotoService.MAX_PHOTOS;

  /** Кого я заблокував. Єдине місце в застосунку, звідки блокування можна зняти. */
  readonly blocks = signal<BlockResponse[]>([]);
  /** id того, кого саме зараз розблоковуємо — щоб підсвітити лише його кнопку. */
  readonly unblocking = signal<number | null>(null);
  readonly blockError = signal<string | null>(null);

  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  /**
   * Скільки людей вподобали анкету за весь час. Саме накопичувально, як і сусідні
   * «взаємні збіги»: показник «скільки ЧЕКАЄ відповіді» обнулявся б щоразу, коли
   * користувач розбирає симпатії, і плитка виглядала б зламаною.
   */
  readonly incomingLikes = signal(0);
  /** Взаємні збіги = чати: чат створюється саме в момент метчу. */
  readonly matches = signal(0);

  // Шаблонні хелпери — форматування живе в одному місці й перевикористовується стрічкою
  readonly empty = EMPTY;
  readonly genderLabel = genderLabel;
  readonly goalLabel = goalLabel;
  readonly educationLabel = educationLabel;
  readonly temperamentLabel = temperamentLabel;
  readonly childrenLabel = childrenLabel;
  readonly formatDate = formatDate;

  /** Заповненість анкети — та сама формула, що й у підказках на сторінці симпатій. */
  readonly completeness = computed(() =>
    profileCompleteness(this.user(), this.photos().length, this.tags().length),
  );

  /** Підказки «що додати» — усі до одної рахуються з реальних даних анкети. */
  readonly todos = computed<Todo[]>(() => {
    const photosLeft = this.maxPhotos - this.photos().length;
    const tagsLeft = ENOUGH_TAGS - this.tags().length;
    const hasBio = !!this.user()?.characterisation;

    return [
      {
        text:
          photosLeft > 0
            ? `Додати ще ${photosLeft} ${plural(photosLeft, 'світлину', 'світлини', 'світлин')}`
            : `Усі ${this.maxPhotos} світлин на місці`,
        done: photosLeft <= 0,
      },
      {
        text:
          tagsLeft > 0
            ? `Обрати ще ${tagsLeft} ${plural(tagsLeft, 'інтерес', 'інтереси', 'інтересів')}`
            : 'Інтересів достатньо для ранжування',
        done: tagsLeft <= 0,
      },
      {
        text: hasBio ? 'Заповнити «Про себе»' : 'Заповнити «Про себе» — головний текст анкети',
        done: hasBio,
      },
    ];
  });

  ngOnInit(): void {
    this.ws.connect();

    // Лічильники «вподобали вас» і «взаємні збіги» — це живі числа: поки анкета
    // відкрита, симпатія може прийти або стати взаємною. Без цього вони показували
    // б стан на момент завантаження сторінки й розходилися з розділом «Симпатії».
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type !== 'NOTIFICATION') return;
      if (event.payload.type === 'NEW_LIKE' || event.payload.type === 'NEW_MATCH') {
        this.refreshCounters();
      }
    });
    // Під час обриву події губляться — після повернення перечитуємо числа
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.refreshCounters());

    // Спершу профіль: id потрібен, щоб запитати фото. Далі решта паралельно.
    // Лічильники другорядні — їхня помилка не має ламати анкету, тож гасимо її.
    this.auth
      .loadCurrentUser()
      .pipe(
        switchMap((user) =>
          forkJoin({
            photos: this.photoService.getPhotoContents(user.userId),
            tags: this.tagService.getMy(),
            likeCount: this.requests.incomingCount().pipe(catchError(() => of(0))),
            chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
            blocks: this.moderation.myBlocks().pipe(catchError(() => of([]))),
          }),
        ),
      )
      .subscribe({
        next: ({ photos, tags, likeCount, chats, blocks }) => {
          this.photos.set(photos);
          this.tags.set(tags);
          this.incomingLikes.set(likeCount);
          this.matches.set(chats.length);
          this.blocks.set(blocks);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(messageOf(err, 'Не вдалося завантажити анкету.'));
          this.loading.set(false);
        },
      });
  }

  age(): string {
    const years = ageFrom(this.user()?.dateOfBirth ?? null);
    return years === null ? EMPTY : `${years}`;
  }

  initial(): string {
    return this.user()?.name.charAt(0).toUpperCase() ?? '?';
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  /** Перечитує лише лічильники — анкету, фото й теги чіпати не треба. */
  private refreshCounters(): void {
    forkJoin({
      likeCount: this.requests.incomingCount().pipe(catchError(() => of(0))),
      chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
    }).subscribe(({ likeCount, chats }) => {
      this.incomingLikes.set(likeCount);
      this.matches.set(chats.length);
    });
  }

  /** Фото, яке інші побачать першим після метчу. */
  mainPhoto() {
    return this.photos().find((photo) => photo.isMain) ?? this.photos()[0] ?? null;
  }

  /** Дата блокування — для розуміння «коли я це зробив», час тут зайвий. */
  blockedOn(iso: string): string {
    return formatDate(iso);
  }

  unblock(block: BlockResponse): void {
    if (this.unblocking() !== null) return;

    this.unblocking.set(block.blockedUserId);
    this.blockError.set(null);

    this.moderation.unblockUser(block.blockedUserId).subscribe({
      next: () => {
        this.blocks.update((list) => list.filter((b) => b.blockId !== block.blockId));
        this.unblocking.set(null);
      },
      error: (err) => {
        this.blockError.set(messageOf(err, 'Не вдалося зняти блокування.'));
        this.unblocking.set(null);
      },
    });
  }

  /**
   * Видалення власного акаунта. Токен гасимо локально, а не через /logout:
   * користувача вже немає в базі, і запит на вихід дав би помилку на порожньому місці.
   */
  deleteAccount(): void {
    const userId = this.user()?.userId;
    if (!userId || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    this.userService.deleteAccount(userId).subscribe({
      next: () => {
        this.auth.clearSession();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.deleteError.set(messageOf(err, 'Не вдалося видалити акаунт.'));
        this.deleting.set(false);
        this.confirmingDelete.set(false);
      },
    });
  }
}
