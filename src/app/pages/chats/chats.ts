import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { ChatResponse, MessageResponse } from '../../core/models/chat.models';
import { RequestResponse } from '../../core/models/request.models';
import { TagResponse } from '../../core/models/tag.models';
import { ageFrom, plural } from '../../core/profile-format';
import { RequestService } from '../../core/request.service';
import { TagService } from '../../core/tag.service';
import { WsService } from '../../core/ws.service';
import { AppShell } from '../../layout/app-shell/app-shell';

/** Рядок списку: чат разом з останнім повідомленням для прев'ю. */
interface ChatRow {
  chat: ChatResponse;
  companionId: number;
  companionName: string;
  last: MessageResponse | null;
  /** Скільки повідомлень співрозмовника ще не прочитано на завантаженій сторінці. */
  unreadCount: number;
}

/** Вкладки над списком. «Нові збіги» — чати, у яких ще нема жодного повідомлення. */
type ChatFilter = 'all' | 'unread' | 'fresh';

/** Скільки карток показує блок «Нові збіги без розмови». */
const FRESH_PREVIEW_LIMIT = 4;

/** UC-10, частина перша: список діалогів. */
@Component({
  selector: 'app-chats',
  imports: [RouterLink, AppShell],
  templateUrl: './chats.html',
  styleUrl: './chats.css',
})
export class Chats implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private ws = inject(WsService);
  private requests = inject(RequestService);
  private tagService = inject(TagService);

  readonly rows = signal<ChatRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');

  /** Вхідні симпатії — потрібні лише порожньому екрану, тому вантажимо їх окремо. */
  readonly incoming = signal<RequestResponse[]>([]);
  private myTagCount = signal(0);
  private myTagIds = signal<Set<number>>(new Set());

  readonly filter = signal<ChatFilter>('all');
  readonly markingAll = signal(false);

  /** Сторінка списку чатів; догортані сторінки лишаються на екрані. */
  private page = 0;
  readonly hasMore = signal(false);
  readonly loadingMore = signal(false);

  /** Спільні теми зі співрозмовником, який зараз у фокусі бічної панелі. */
  readonly focusTags = signal<TagResponse[]>([]);
  private focusTagsFor: number | null = null;

  private myId = signal<number | null>(null);
  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  readonly unreadRows = computed(() => this.rows().filter((row) => row.unreadCount > 0));
  /** Метч є, розмови ще немає — саме тут найчастіше потрібен поштовх. */
  readonly freshRows = computed(() => this.rows().filter((row) => !row.last));

  readonly visibleRows = computed(() => {
    const query = this.search().trim().toLowerCase();

    const byFilter =
      this.filter() === 'unread'
        ? this.unreadRows()
        : this.filter() === 'fresh'
          ? this.freshRows()
          : this.rows();

    if (!query) return byFilter;

    // Шукаємо і за іменем, і за текстом останнього повідомлення — саме його видно в рядку
    return byFilter.filter(
      (row) =>
        row.companionName.toLowerCase().includes(query) ||
        (row.last?.content ?? '').toLowerCase().includes(query),
    );
  });

  /** Кого показує темна картка вгорі панелі: остання розмова, що чекає відповіді. */
  readonly waitingRow = computed(() => this.unreadRows()[0] ?? null);

  /** Чиї теми показує блок «Про що поговорити»: той, хто чекає, інакше — свіжий метч. */
  readonly focusRow = computed(() => this.waitingRow() ?? this.freshRows()[0] ?? null);

  readonly freshPreview = computed(() => this.freshRows().slice(0, FRESH_PREVIEW_LIMIT));

  readonly unreadTotal = computed(() =>
    this.rows().reduce((sum, row) => sum + row.unreadCount, 0),
  );

  /** Підпис під заголовком: «3 діалоги · 1 непрочитане повідомлення». */
  readonly summary = computed(() => {
    const chats = this.rows().length;
    if (chats === 0) return 'Поки що жодного діалогу';

    const unread = this.unreadTotal();
    const chatsPart = `${chats} ${plural(chats, 'діалог', 'діалоги', 'діалогів')}`;
    const unreadPart = unread
      ? `${unread} ${plural(unread, 'непрочитане повідомлення', 'непрочитані повідомлення', 'непрочитаних повідомлень')}`
      : 'усе прочитано';

    return `${chatsPart} · ${unreadPart}`;
  });

  /** Картки вхідних симпатій у бічній панелі порожнього екрана. */
  readonly waitingCards = computed(() =>
    this.incoming().map((request) => ({
      userId: request.fromUserId,
      name: request.fromUserName,
      age: ageFrom(request.fromUserDateOfBirth),
      percent: this.myTagCount()
        ? Math.round((request.sharedTagCount / this.myTagCount()) * 100)
        : null,
    })),
  );

  ngOnInit(): void {
    this.load();

    this.ws.connect();
    // Нове повідомлення має одразу підняти прев'ю в списку
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type === 'NEW_MESSAGE') this.applyIncoming(event.payload);
    });
    // Обрив з'єднання лишає список застарілим — перечитуємо його після повернення
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.load());
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  setFilter(value: ChatFilter): void {
    this.filter.set(value);
  }

  /**
   * Позначає прочитаними всі діалоги одразу. Окремого ендпоінта для цього немає,
   * тож шлемо по запиту на чат — їх одиниці, і кожен ідемпотентний.
   */
  markAllRead(): void {
    const unread = this.unreadRows();
    if (unread.length === 0 || this.markingAll()) return;

    this.markingAll.set(true);
    forkJoin(
      unread.map((row) =>
        this.chatService.markRead(row.chat.chatId).pipe(catchError(() => of(null))),
      ),
    ).subscribe(() => {
      const done = new Set(unread.map((row) => row.chat.chatId));
      this.rows.update((rows) =>
        rows.map((row) => (done.has(row.chat.chatId) ? { ...row, unreadCount: 0 } : row)),
      );
      this.markingAll.set(false);
      this.refreshFocusTags();
    });
  }

  /** Відсоток збігу тем — та сама формула, що на сторінці симпатій. */
  percent(row: ChatRow): number | null {
    const mine = this.myTagCount();
    return mine ? Math.round((row.chat.sharedTagCount / mine) * 100) : null;
  }

  /**
   * Колір плитки-аватара виводимо з id: та сама людина завжди має той самий
   * відтінок, і список не зливається в однакову масу.
   */
  avatarStyle(userId: number): string {
    const hue = (userId * 47) % 360;
    return `linear-gradient(150deg, hsl(${hue} 45% 82%), hsl(${hue} 30% 55%))`;
  }

  /** «чекає з 14:32» — час останнього повідомлення того, хто чекає відповіді. */
  waitingSince(): string {
    const row = this.waitingRow();
    return row ? this.when(row) : '';
  }

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  preview(row: ChatRow): string {
    if (!row.last) return 'Повідомлень ще немає — привітайтесь першим';
    if (row.last.isDeleted) return 'Повідомлення видалено';

    const mine = row.last.senderId === this.myId();
    return (mine ? 'Ви: ' : '') + (row.last.content ?? '');
  }

  /** Останнє слово за нами й воно вже прочитане — показуємо подвійну галочку. */
  showTicks(row: ChatRow): boolean {
    return !!row.last && row.last.senderId === this.myId() && !row.last.isDeleted;
  }

  isRead(row: ChatRow): boolean {
    return !!row.last?.isRead;
  }

  when(row: ChatRow): string {
    if (!row.last) return '';

    const date = new Date(row.last.sentAt);
    if (Number.isNaN(date.getTime())) return '';

    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

    if (days === 0) {
      return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    }
    if (days === 1) return 'вчора';

    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  }

  /**
   * Наступна сторінка чатів. Дублі відсіюємо навмисно: між запитами до когось
   * могло прийти повідомлення, чат піднявся вгору — і та сама розмова прийшла б
   * і на першій сторінці, і на другій.
   */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;

    this.loadingMore.set(true);
    const next = this.page + 1;

    this.chatService
      .getChats(next)
      .pipe(switchMap((chats) => this.withPreviews(chats)))
      .subscribe({
        next: (rows) => {
          this.page = next;
          this.hasMore.set(rows.length >= ChatService.CHATS_PAGE_SIZE);
          this.rows.update((current) => {
            const known = new Set(current.map((row) => row.chat.chatId));
            return this.sortRows([
              ...current,
              ...rows.filter((row) => !known.has(row.chat.chatId)),
            ]);
          });
          this.loadingMore.set(false);
          this.refreshFocusTags();
        },
        error: (err) => {
          this.error.set(messageOf(err, 'Не вдалося завантажити ще чати.'));
          this.loadingMore.set(false);
        },
      });
  }

  private load(): void {
    this.page = 0;
    this.auth
      .loadCurrentUser()
      .pipe(
        switchMap((me) => {
          this.myId.set(me.userId);
          // Свої теги потрібні кожному рядку: відсоток збігу рахується від них
          return forkJoin({
            chats: this.chatService.getChats(),
            myTags: this.tagService.getMy().pipe(catchError(() => of([] as TagResponse[]))),
          });
        }),
        switchMap(({ chats, myTags }) => {
          this.myTagCount.set(myTags.length);
          this.myTagIds.set(new Set(myTags.map((tag) => tag.tagId)));
          return this.withPreviews(chats);
        }),
      )
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.hasMore.set(rows.length >= ChatService.CHATS_PAGE_SIZE);
          this.loading.set(false);
          this.refreshFocusTags();
          // Порожній екран пояснює, звідки беруться чати, — і показує, хто вже чекає
          if (rows.length === 0) this.loadWaiting();
        },
        error: (err) => {
          this.error.set(messageOf(err, 'Не вдалося завантажити чати.'));
          this.loading.set(false);
        },
      });
  }

  private loadWaiting(): void {
    this.requests
      .incoming()
      .pipe(catchError(() => of([] as RequestResponse[])))
      .subscribe((incoming) => this.incoming.set(incoming));
  }

  /**
   * Спільні теми для блоку «Про що поговорити». Запит точковий і лише про одну
   * людину — ту, що у фокусі: список тем чату бекенд не віддає, тільки їхню кількість.
   */
  private refreshFocusTags(): void {
    const row = this.focusRow();
    if (!row) {
      this.focusTags.set([]);
      this.focusTagsFor = null;
      return;
    }
    if (row.companionId === this.focusTagsFor) return;

    this.focusTagsFor = row.companionId;
    this.tagService
      .getForUser(row.companionId)
      .pipe(catchError(() => of([] as TagResponse[])))
      .subscribe((tags) => {
        // Поки летів запит, фокус міг перемкнутись на іншу людину
        if (this.focusTagsFor !== row.companionId) return;

        const mine = this.myTagIds();
        this.focusTags.set(tags.filter((tag) => mine.has(tag.tagId)));
      });
  }

  /**
   * Прев'ю останнього повідомлення бекенд у списку чатів не віддає,
   * тому доганяємо його точковим запитом на кожен чат (їх одиниці).
   */
  private withPreviews(chats: ChatResponse[]): Observable<ChatRow[]> {
    if (chats.length === 0) return of([]);

    return forkJoin(
      chats.map((chat) =>
        this.chatService.getMessages(chat.chatId).pipe(
          catchError(() => of([] as MessageResponse[])),
          map((messages) => this.toRow(chat, messages)),
        ),
      ),
    ).pipe(map((rows) => this.sortRows(rows)));
  }

  private toRow(chat: ChatResponse, messages: MessageResponse[]): ChatRow {
    const iAmFirst = chat.user1Id === this.myId();

    return {
      chat,
      companionId: iAmFirst ? chat.user2Id : chat.user1Id,
      companionName: iAmFirst ? chat.user2Name : chat.user1Name,
      last: messages.at(-1) ?? null,
      // Рахуємо по завантаженій сторінці (до 50 останніх) — окремого лічильника бекенд не має
      unreadCount: messages.filter((m) => m.senderId !== this.myId() && !m.isRead).length,
    };
  }

  private applyIncoming(message: MessageResponse): void {
    this.rows.update((rows) =>
      this.sortRows(
        rows.map((row) =>
          row.chat.chatId === message.chatId
            ? {
                ...row,
                last: message,
                unreadCount:
                  message.senderId === this.myId() ? row.unreadCount : row.unreadCount + 1,
              }
            : row,
        ),
      ),
    );

    // Нове повідомлення могло змінити, хто саме чекає на відповідь
    this.refreshFocusTags();
  }

  /** Найсвіжіші розмови зверху; чати без повідомлень — у кінці. */
  private sortRows(rows: ChatRow[]): ChatRow[] {
    return [...rows].sort((a, b) => {
      if (!a.last && !b.last) return 0;
      if (!a.last) return 1;
      if (!b.last) return -1;
      return b.last.sentAt.localeCompare(a.last.sentAt);
    });
  }
}
