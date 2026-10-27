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

  readonly unreadCount = signal(0);

  constructor() {
    this.ws.events.subscribe((event) => {
      if (event.type !== 'NOTIFICATION') return;

      // Перезапитуємо, а не +1: сповіщення згортаються, і подія може бути оновленням.
      this.refreshUnread();
    });

    this.ws.reconnected.subscribe(() => this.refreshUnread());
  }

  list(page = 0, unreadOnly = false): Observable<NotificationResponse[]> {
    // Зсувом, не курсором: згортання NEW_MESSAGE змінює порядок.
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
