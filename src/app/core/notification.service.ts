import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { NotificationResponse } from './models/notification.models';
import { WsService } from './ws.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private ws = inject(WsService);

  static readonly PAGE_SIZE = 20;

  /** Спільний лічильник: його показує значок у шапці на кожній сторінці. */
  readonly unreadCount = signal(0);

  constructor() {
    this.ws.events.subscribe((event) => {
      if (event.type !== 'NOTIFICATION') return;

      // Навмисно перезапитуємо, а не робимо +1: сповіщення про повідомлення
      // ЗГОРТАЮТЬСЯ — подія може бути оновленням наявного запису, і тоді
      // непрочитаних не побільшало. Запит дешевий (SELECT COUNT).
      this.refreshUnread();
    });

    // Значок у шапці після обриву показував би застарілу цифру
    this.ws.reconnected.subscribe(() => this.refreshUnread());
  }

  list(page = 0, unreadOnly = false): Observable<NotificationResponse[]> {
    // Пагінація ЗСУВОМ, не курсором: згортання NEW_MESSAGE оновлює createdAt
    // і піднімає запис нагору, тобто порядок мінливий і курсор за id був би хибним.
    const params = new HttpParams()
      .set('page', page)
      .set('size', NotificationService.PAGE_SIZE)
      .set('unreadOnly', unreadOnly);

    return this.http.get<NotificationResponse[]>('/api/notifications', { params });
  }

  refreshUnread(): void {
    this.http
      .get<{ unreadCount: number }>('/api/notifications/unread-count')
      .subscribe({ next: ({ unreadCount }) => this.unreadCount.set(unreadCount) });
  }

  markAllRead(): Observable<{ markedCount: number }> {
    return this.http
      .put<{ markedCount: number }>('/api/notifications/read-all', {})
      .pipe(tap(() => this.unreadCount.set(0)));
  }
}
