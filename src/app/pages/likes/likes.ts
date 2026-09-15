import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { ChatResponse } from '../../core/models/chat.models';
import { RequestResponse } from '../../core/models/request.models';
import { PhotoService } from '../../core/photo.service';
import { agoLabel, ageFrom, plural, profileCompleteness } from '../../core/profile-format';
import { RequestService } from '../../core/request.service';
import { TagService } from '../../core/tag.service';
import { WsService } from '../../core/ws.service';
import { AppShell } from '../../layout/app-shell/app-shell';

/** Результат щойно прийнятої симпатії — показуємо банер «Взаємно». */
interface MatchInfo {
  userId: number;
  name: string;
  chatId: number;
}

/**
 * Скільки карток «чекають відповіді» показує БІЧНА панель. Решта ховається за
 * лічильником: панель вузька й фіксованої ширини, і два десятки карток розтягували б
 * її на кілька екранів, відсуваючи все інше вниз.
 */
const SIDE_WAITING_LIMIT = 4;

/** UC-09: хто вподобав вас і кого вподобали ви. */
@Component({
  selector: 'app-likes',
  imports: [RouterLink, AppShell],
  templateUrl: './likes.html',
  styleUrl: './likes.css',
})
export class Likes implements OnInit, OnDestroy {
  private requests = inject(RequestService);
  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private tagService = inject(TagService);
  private photoService = inject(PhotoService);
  private ws = inject(WsService);

  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  readonly incoming = signal<RequestResponse[]>([]);
  readonly sent = signal<RequestResponse[]>([]);
  private chats = signal<ChatResponse[]>([]);
  private myId = signal<number | null>(null);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);
  readonly match = signal<MatchInfo | null>(null);

  /** Власні показники для блоку «що підвищує шанси» на порожньому екрані. */
  readonly myPhotoCount = signal(0);
  readonly myTagCount = signal(0);
  readonly tagTotal = signal(0);

  readonly maxPhotos = PhotoService.MAX_PHOTOS;
  readonly agoLabel = agoLabel;

  readonly completeness = computed(() =>
    profileCompleteness(this.auth.currentUser(), this.myPhotoCount(), this.myTagCount()),
  );

  /**
   * Взаємні збіги беремо з ЧАТІВ, а не зі списку надісланих: чат створюється
   * рівно в момент метчу, незалежно від того, хто кого вподобав першим.
   * Симпатії, прийняті самим користувачем, у /requests/sent не потрапляють узагалі.
   */
  readonly matched = computed(() =>
    this.chats().map((chat) => {
      const iAmFirst = chat.user1Id === this.myId();

      return {
        chatId: chat.chatId,
        userId: iAmFirst ? chat.user2Id : chat.user1Id,
        name: iAmFirst ? chat.user2Name : chat.user1Name,
        age: ageFrom(iAmFirst ? chat.user2DateOfBirth : chat.user1DateOfBirth),
        city: iAmFirst ? chat.user2City : chat.user1City,
        percent: this.percentOf(chat.sharedTagCount),
      };
    }),
  );

  readonly incomingCards = computed(() =>
    this.incoming().map((request) => ({
      request,
      userId: request.fromUserId,
      name: request.fromUserName,
      age: ageFrom(request.fromUserDateOfBirth),
      city: request.fromUserCity,
      shared: request.sharedTagCount,
      percent: this.percentOf(request.sharedTagCount),
      photoCount: request.fromUserPhotoCount,
    })),
  );

  readonly waiting = computed(() => this.sent().filter((r) => r.status === 'PENDING'));
  readonly declined = computed(() => this.sent().filter((r) => r.status === 'REJECTED'));

  readonly waitingPreview = computed(() => this.waiting().slice(0, SIDE_WAITING_LIMIT));
  readonly waitingHidden = computed(() =>
    Math.max(0, this.waiting().length - SIDE_WAITING_LIMIT),
  );
  readonly waitingHiddenLabel = computed(() => {
    const hidden = this.waitingHidden();
    return `і ще ${hidden} ${plural(hidden, 'анкета', 'анкети', 'анкет')}`;
  });

  ngOnInit(): void {
    this.load();

    this.ws.connect();
    // Поки сторінка відкрита, симпатію могли прийняти з іншого пристрою — і людина,
    // з якою вже є чат, висіла б у списку до перезавантаження вручну.
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type === 'NOTIFICATION' && event.payload.type === 'NEW_MATCH') {
        this.load(false);
      }
    });
    // Під час обриву події губляться безслідно — після повернення перечитуємо список
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.load(false));
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  accept(request: RequestResponse): void {
    if (this.busyId() !== null) return;

    this.busyId.set(request.requestId);
    this.error.set(null);

    this.requests.accept(request.requestId).subscribe({
      next: (response) => {
        // Саме тут виникає метч: створено чат, фотографії відкрились обом
        this.match.set({
          userId: request.fromUserId,
          name: request.fromUserName,
          chatId: response.chatId,
        });
        this.incoming.update((list) => list.filter((r) => r.requestId !== request.requestId));
        this.busyId.set(null);
        this.load(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося прийняти симпатію.'));
        this.busyId.set(null);
      },
    });
  }

  reject(request: RequestResponse): void {
    if (this.busyId() !== null) return;

    this.busyId.set(request.requestId);
    this.error.set(null);

    this.requests.reject(request.requestId).subscribe({
      next: () => {
        this.incoming.update((list) => list.filter((r) => r.requestId !== request.requestId));
        this.busyId.set(null);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося відхилити симпатію.'));
        this.busyId.set(null);
      },
    });
  }

  /**
   * Сумісність — частка ВАШИХ тем, що збіглися. Спільні теми рахує бекенд,
   * тут лишається поділити на свої; без власних тегів відсоток безглуздий.
   */
  private percentOf(shared: number): number | null {
    const mine = this.myTagCount();
    return mine ? Math.round((shared / mine) * 100) : null;
  }

  private load(showSpinner = true): void {
    if (showSpinner) this.loading.set(true);
    this.error.set(null);

    forkJoin({
      me: this.auth.loadCurrentUser(),
      incoming: this.requests.incoming(),
      sent: this.requests.sent(),
      chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
      myTags: this.tagService.getMy().pipe(catchError(() => of([]))),
      allTags: this.tagService.getAll().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ me, incoming, sent, chats, myTags, allTags }) => {
        this.myId.set(me.userId);
        this.incoming.set(incoming);
        this.sent.set(sent);
        this.chats.set(chats);
        this.myTagCount.set(myTags.length);
        this.tagTotal.set(allTags.length);
        this.loading.set(false);

        // Другим кроком, бо власний id стає відомий лише з /users/me.
        // Лише метадані: для лічильника «N з 6» пікселі тягнути ні до чого
        this.photoService
          .getPhotos(me.userId)
          .pipe(catchError(() => of([])))
          .subscribe((photos) => this.myPhotoCount.set(photos.length));
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити симпатії.'));
        this.loading.set(false);
      },
    });
  }
}
