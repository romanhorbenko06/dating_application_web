import { Component, ElementRef, OnDestroy, OnInit, Signal, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { ChatResponse, MessageResponse, WsEvent } from '../../core/models/chat.models';
import { PhotoContent } from '../../core/models/photo.models';
import { PublicProfile } from '../../core/models/profile.models';
import { TagResponse } from '../../core/models/tag.models';
import { ModerationService } from '../../core/moderation.service';
import { PhotoService } from '../../core/photo.service';
import { ageFrom, goalLabel } from '../../core/profile-format';
import { ProfileService } from '../../core/profile.service';
import { TagService } from '../../core/tag.service';
import { PhotoVariants, ThumbnailService } from '../../core/thumbnail.service';
import { WsService } from '../../core/ws.service';
import { AppShell } from '../../layout/app-shell/app-shell';

/** Скільки спільних тем показує бічна панель; решта ховається за лічильником. */
const SIDE_TAGS_LIMIT = 6;

/** UC-10: сама переписка — історія, надсилання, редагування, видалення, real-time. */
@Component({
  selector: 'app-chat-room',
  imports: [ReactiveFormsModule, RouterLink, AppShell],
  templateUrl: './chat-room.html',
  styleUrl: './chat-room.css',
})
export class ChatRoom implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private ws = inject(WsService);
  private fb = inject(FormBuilder);
  private tagService = inject(TagService);
  private profileService = inject(ProfileService);
  private photoService = inject(PhotoService);
  private moderation = inject(ModerationService);
  private thumbnails = inject(ThumbnailService);

  private readonly scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');

  readonly chatId = Number(this.route.snapshot.paramMap.get('id'));

  readonly chat = signal<ChatResponse | null>(null);
  /** Анкета співрозмовника — для бічної панелі: місто, мета, вік. */
  readonly companion = signal<PublicProfile | null>(null);
  /** Фото відкриті: у чаті ми вже за визначенням у взаємній симпатії. */
  readonly companionPhotos = signal<PhotoContent[]>([]);
  readonly companionTags = signal<TagResponse[]>([]);
  private myTagIds = signal<Set<number>>(new Set());

  readonly sharedTags = computed(() => {
    const mine = this.myTagIds();
    return this.companionTags().filter((tag) => mine.has(tag.tagId));
  });

  /**
   * У панелі показуємо лише перші кілька тем: повний перелік однаково є в анкеті,
   * а довгий список забирав би висоту саме там, де вона потрібна блоку дій.
   */
  readonly visibleSharedTags = computed(() => this.sharedTags().slice(0, SIDE_TAGS_LIMIT));
  readonly hiddenSharedTagCount = computed(() =>
    Math.max(0, this.sharedTags().length - SIDE_TAGS_LIMIT),
  );

  readonly messages = signal<MessageResponse[]>([]);
  readonly myId = signal<number | null>(null);

  readonly loading = signal(true);
  readonly loadingOlder = signal(false);
  readonly sending = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /** Сторінка була повною — отже, вище майже напевно є ще повідомлення. */
  readonly hasMore = signal(false);

  readonly editingId = signal<number | null>(null);

  /** Пошук працює по вже завантажених повідомленнях — окремого ендпоінта немає. */
  readonly searching = signal(false);
  readonly searchQuery = signal('');

  readonly reporting = signal(false);
  readonly confirmingBlock = signal(false);
  readonly busy = signal(false);

  readonly form = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  readonly editForm = this.fb.nonNullable.group({
    content: ['', [Validators.required, Validators.maxLength(2000)]],
  });

  readonly reportForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
  });

  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  readonly goalLabel = goalLabel;

  readonly companionName = computed(() => {
    const chat = this.chat();
    if (!chat) return '';
    return chat.user1Id === this.myId() ? chat.user2Name : chat.user1Name;
  });

  readonly companionId = computed(() => {
    const chat = this.chat();
    if (!chat) return null;
    return chat.user1Id === this.myId() ? chat.user2Id : chat.user1Id;
  });

  /** Вік беремо з чату — бекенд віддає його разом зі списком учасників. */
  readonly companionAge = computed(() => {
    const chat = this.chat();
    if (!chat) return null;
    return ageFrom(chat.user1Id === this.myId() ? chat.user2DateOfBirth : chat.user1DateOfBirth);
  });

  readonly companionCity = computed(() => {
    const chat = this.chat();
    if (!chat) return null;
    return chat.user1Id === this.myId() ? chat.user2City : chat.user1City;
  });

  /** Частка ВАШИХ тем, що збіглися; null — коли своїх тегів ще немає. */
  readonly matchPercent = computed(() => {
    const mine = this.myTagIds().size;
    if (!mine) return null;
    return Math.round((this.sharedTags().length / mine) * 100);
  });

  /** Довжина кола радіуса 25 — 157.1; зміщення показує незаповнену частину. */
  readonly donutOffset = computed(() => (157.1 * (100 - (this.matchPercent() ?? 0))) / 100);

  /** Головне фото співрозмовника — обличчя бічної панелі. */
  readonly mainPhoto = computed(
    () => this.companionPhotos().find((photo) => photo.isMain) ?? this.companionPhotos()[0] ?? null,
  );

  readonly visibleMessages = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.messages();

    return this.messages().filter(
      (message) => !message.isDeleted && (message.content ?? '').toLowerCase().includes(query),
    );
  });

  ngOnInit(): void {
    forkJoin({
      me: this.auth.loadCurrentUser(),
      chat: this.chatService.getChat(this.chatId),
      messages: this.chatService.getMessages(this.chatId),
    }).subscribe({
      next: ({ me, chat, messages }) => {
        this.myId.set(me.userId);
        this.chat.set(chat);
        this.messages.set(messages);
        this.hasMore.set(messages.length >= ChatService.PAGE_SIZE);
        this.loading.set(false);
        this.scrollToBottomSoon();
        this.markRead();
        this.loadCompanion();
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося відкрити чат.'));
        this.loading.set(false);
      },
    });

    this.ws.connect();
    this.wsSub = this.ws.events.subscribe((event) => this.handleEvent(event));
    // Поки з'єднання не було, пуші губилися — добираємо пропущене
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.resync());
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  isMine(message: MessageResponse): boolean {
    return message.senderId === this.myId();
  }

  time(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
  }

  /** Мініатюри в бічній панелі — до 160px, повний знімок їм ні до чого. */
  variants(photo: PhotoContent): Signal<PhotoVariants | null> {
    return this.thumbnails.variants(photo, [160, 320]);
  }

  /** Роздільник дня ставимо там, де дата змінилася — і завжди перед першим. */
  startsNewDay(index: number): boolean {
    const list = this.visibleMessages();
    if (index === 0) return true;

    return this.dayOf(list[index].sentAt) !== this.dayOf(list[index - 1].sentAt);
  }

  dayLabel(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);

    if (days === 0) return 'сьогодні';
    if (days === 1) return 'вчора';

    return date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleSearch(): void {
    this.searching.update((on) => !on);
    if (!this.searching()) this.searchQuery.set('');
  }

  send(): void {
    if (this.form.invalid || this.sending()) return;

    const content = this.form.getRawValue().content.trim();
    if (!content) return;

    this.sending.set(true);
    this.error.set(null);

    this.chatService.send(this.chatId, content).subscribe({
      next: (message) => {
        // Те саме повідомлення прилетить ще й сокетом — upsert прибирає дубль
        this.upsert(message);
        this.form.reset();
        this.sending.set(false);
        this.scrollToBottomSoon();
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося надіслати повідомлення.'));
        this.sending.set(false);
      },
    });
  }

  loadOlder(): void {
    const oldest = this.messages()[0];
    if (!oldest || this.loadingOlder()) return;

    this.loadingOlder.set(true);

    // Курсор — messageId, а не час: id унікальний, тож сторінки не злипаються
    this.chatService.getMessages(this.chatId, oldest.messageId).subscribe({
      next: (older) => {
        this.messages.update((list) => [...older, ...list]);
        this.hasMore.set(older.length >= ChatService.PAGE_SIZE);
        this.loadingOlder.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити давніші повідомлення.'));
        this.loadingOlder.set(false);
      },
    });
  }

  startEdit(message: MessageResponse): void {
    this.editingId.set(message.messageId);
    this.editForm.setValue({ content: message.content ?? '' });
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(): void {
    const messageId = this.editingId();
    if (messageId === null || this.editForm.invalid) return;

    this.chatService.edit(messageId, this.editForm.getRawValue().content).subscribe({
      next: (message) => {
        this.upsert(message);
        this.editingId.set(null);
      },
      error: (err) => this.error.set(messageOf(err, 'Не вдалося змінити повідомлення.')),
    });
  }

  remove(message: MessageResponse): void {
    this.chatService.remove(message.messageId).subscribe({
      // Видалення м'яке: у відповідь те саме повідомлення з isDeleted = true
      next: (updated) => this.upsert(updated),
      error: (err) => this.error.set(messageOf(err, 'Не вдалося видалити повідомлення.')),
    });
  }

  submitReport(): void {
    const id = this.companionId();
    if (id === null || this.reportForm.invalid || this.busy()) return;

    this.busy.set(true);
    this.moderation.fileComplaint(id, this.reportForm.getRawValue().reason).subscribe({
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
    const id = this.companionId();
    if (id === null || this.busy()) return;

    this.busy.set(true);
    this.moderation.blockUser(id).subscribe({
      // Чат зникає для обох — лишатись на його сторінці більше немає сенсу
      next: () => this.router.navigate(['/chats']),
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося заблокувати користувача.'));
        this.busy.set(false);
      },
    });
  }

  private handleEvent(event: WsEvent): void {
    // Сокет спільний на весь застосунок — чужі чати відсіюємо
    if (event.payload.chatId !== this.chatId) return;

    switch (event.type) {
      case 'NEW_MESSAGE':
        this.upsert(event.payload);
        this.scrollToBottomSoon();
        // Прийшло від співрозмовника й вікно відкрите — одразу позначаємо прочитаним
        if (event.payload.senderId !== this.myId()) this.markRead();
        break;

      case 'MESSAGE_EDITED':
      case 'MESSAGE_DELETED':
        this.upsert(event.payload);
        break;

      case 'NOTIFICATION':
        // Центр сповіщень (UC-11) — не справа вікна чату
        break;

      case 'READ_RECEIPT': {
        // Квитанція від співрозмовника: мої повідомлення стали прочитаними
        if (event.payload.readerId === this.myId()) return;
        const ids = new Set(event.payload.messageIds);
        this.messages.update((list) =>
          list.map((m) => (ids.has(m.messageId) ? { ...m, isRead: true } : m)),
        );
        break;
      }
    }
  }

  /** Додає нове або замінює наявне повідомлення, тримаючи порядок за messageId. */
  private upsert(message: MessageResponse): void {
    this.messages.update((list) => {
      const index = list.findIndex((m) => m.messageId === message.messageId);
      if (index >= 0) {
        const copy = [...list];
        copy[index] = message;
        return copy;
      }
      return [...list, message].sort((a, b) => a.messageId - b.messageId);
    });
  }

  /**
   * Бічна панель другорядна й не має блокувати відкриття чату,
   * тому анкету, теги й фото вантажимо окремо від переписки.
   */
  private loadCompanion(): void {
    const id = this.companionId();
    if (id === null) return;

    forkJoin({
      profile: this.profileService.getById(id).pipe(catchError(() => of(null))),
      theirTags: this.tagService.getForUser(id).pipe(catchError(() => of([]))),
      myTags: this.tagService.getMy().pipe(catchError(() => of([]))),
      photos: this.photoService.getPhotoContents(id).pipe(catchError(() => of([]))),
    }).subscribe(({ profile, theirTags, myTags, photos }) => {
      this.companion.set(profile);
      this.companionTags.set(theirTags);
      this.myTagIds.set(new Set(myTags.map((tag) => tag.tagId)));
      this.companionPhotos.set(photos);
    });
  }

  private dayOf(iso: string): string {
    return iso.slice(0, 10);
  }

  /**
   * Після перепідключення: свіжа сторінка історії поверх наявної.
   * upsert зливає її з уже завантаженим, тож давніші сторінки, які
   * користувач догортав, лишаються на місці.
   */
  private resync(): void {
    this.chatService.getMessages(this.chatId).subscribe({
      next: (messages) => {
        messages.forEach((message) => this.upsert(message));
        this.markRead();
      },
      error: () => {},
    });
  }

  private markRead(): void {
    this.chatService.markRead(this.chatId).subscribe({ error: () => {} });
  }

  /** Прокрутка після того, як Angular перемалює список. */
  private scrollToBottomSoon(): void {
    setTimeout(() => {
      const element = this.scroller()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
}
