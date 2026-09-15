import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { AppShell } from '../../layout/app-shell/app-shell';
import { messageOf } from '../../core/api-error';
import { NotificationResponse } from '../../core/models/notification.models';
import { NotificationService } from '../../core/notification.service';
import { plural } from '../../core/profile-format';
import { WsService } from '../../core/ws.service';

/** UC-11: центр сповіщень. */
@Component({
  selector: 'app-notifications',
  imports: [NgTemplateOutlet, RouterLink, AppShell],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css',
})
export class Notifications implements OnInit, OnDestroy {
  private service = inject(NotificationService);
  private ws = inject(WsService);

  readonly items = signal<NotificationResponse[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);
  readonly unreadOnly = signal(false);

  private page = 0;
  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  /** Спільний лічильник із сервісу — той самий, що світиться в бічній панелі. */
  readonly unreadCount = this.service.unreadCount;

  /** Макет ділить стрічку на «сьогодні» й «раніше» — межа по календарному дню. */
  readonly todayItems = computed(() => this.items().filter((item) => this.isToday(item.createdAt)));
  readonly earlierItems = computed(() =>
    this.items().filter((item) => !this.isToday(item.createdAt)),
  );

  readonly summary = computed(() => {
    const unread = this.unreadCount();
    const base = this.unreadOnly() ? 'Показані лише непрочитані' : 'Симпатії, збіги та повідомлення';

    if (unread === 0) return `${base} · усе прочитано`;

    return `${base} · ${unread} ${plural(unread, 'непрочитане', 'непрочитані', 'непрочитаних')}`;
  });

  ngOnInit(): void {
    this.reload();

    this.ws.connect();
    // Сповіщення, що прилетіло у відкриту сторінку, має з'явитись без перезавантаження
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type === 'NOTIFICATION') this.reload();
    });
    // Сповіщення, що прийшли під час обриву, інакше з'явилися б лише після F5
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.reload());
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  toggleUnreadOnly(): void {
    this.unreadOnly.set(!this.unreadOnly());
    this.reload();
  }

  markAllRead(): void {
    this.service.markAllRead().subscribe({
      next: () => this.reload(),
      error: (err) => this.error.set(messageOf(err, 'Не вдалося позначити прочитаними.')),
    });
  }

  loadMore(): void {
    if (this.loadingMore()) return;

    this.loadingMore.set(true);
    this.page++;

    this.service.list(this.page, this.unreadOnly()).subscribe({
      next: (batch) => {
        this.items.update((list) => [...list, ...batch]);
        this.hasMore.set(batch.length >= NotificationService.PAGE_SIZE);
        this.loadingMore.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити ще.'));
        this.loadingMore.set(false);
      },
    });
  }

  /** Іконка типу — щоб список читався одним поглядом. */
  icon(item: NotificationResponse): string {
    switch (item.type) {
      case 'NEW_LIKE':
        return '♡';
      case 'NEW_MATCH':
        return '✦';
      default:
        return '✉';
    }
  }

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  /** Текст під тип події. NEW_MESSAGE згорнутий, тому показуємо кількість. */
  text(item: NotificationResponse): string {
    switch (item.type) {
      case 'NEW_LIKE':
        return `${item.actorName} вподобав(-ла) вашу анкету`;
      case 'NEW_MATCH':
        return `Взаємна симпатія: ${item.actorName}`;
      case 'NEW_MESSAGE': {
        const count = item.messageCount ?? 1;
        return count > 1
          ? `${item.actorName}: ${count} нових повідомлень`
          : `${item.actorName} надіслав(-ла) повідомлення`;
      }
      default:
        return item.type;
    }
  }

  /**
   * Другий рядок картки. Тексту самого повідомлення бекенд у сповіщенні не віддає,
   * тож для NEW_MESSAGE пишемо, куди веде картка, а не вигаданий уривок.
   */
  hint(item: NotificationResponse): string {
    switch (item.type) {
      case 'NEW_MATCH':
        return 'Фото розблоковано, чат створено';
      case 'NEW_LIKE':
        return 'Відповідайте, щоб відкрити фото';
      default:
        return 'Перейти до листування';
    }
  }

  /** Куди вести з картки: у чат, якщо він уже є, інакше — у симпатії чи на анкету. */
  link(item: NotificationResponse): unknown[] {
    if (item.chatId != null) return ['/chats', item.chatId];
    return item.type === 'NEW_LIKE' ? ['/likes'] : ['/users', item.actorId];
  }

  when(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    const today = new Date();
    const sameDay =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate();

    if (sameDay) {
      return date.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    }

    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000) === 1) return 'вчора';

    return date.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
  }

  private isToday(iso: string): boolean {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate()
    );
  }

  private reload(): void {
    this.page = 0;
    this.error.set(null);

    this.service.list(0, this.unreadOnly()).subscribe({
      next: (batch) => {
        this.items.set(batch);
        this.hasMore.set(batch.length >= NotificationService.PAGE_SIZE);
        this.loading.set(false);
        this.service.refreshUnread();
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити сповіщення.'));
        this.loading.set(false);
      },
    });
  }
}
