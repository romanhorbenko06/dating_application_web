import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { RequestResponse } from './models/request.models';

/** Відповідь на прийняття симпатії: разом із метчем створюється чат. */
export interface AcceptResponse {
  message: string;
  chatId: number;
}

/**
 * Симпатії (UC-08, UC-09). Уся робота з таблицею Request — і лайки зі стрічки,
 * і вхідні/надіслані списки — зібрана в одному місці.
 */
@Injectable({ providedIn: 'root' })
export class RequestService {
  private http = inject(HttpClient);

  /** Лайк створює PENDING-запит; метч виникає лише після accept з боку адресата. */
  send(toUserId: number, message?: string): Observable<RequestResponse> {
    return this.http.post<RequestResponse>('/api/requests/send', { toUserId, message });
  }

  /** Пропуск прибирає профіль зі стрічки назавжди (лише для того, хто пропустив). */
  skip(userId: number): Observable<unknown> {
    return this.http.post(`/api/requests/skip/${userId}`, {});
  }

  /** Кого користувач пропустив. Бекенд віддає лише id та ім'я. */
  skipped(): Observable<{ userId: number; name: string }[]> {
    return this.http.get<{ userId: number; name: string }[]>('/api/requests/skipped');
  }

  /**
   * Стільки просять екрани, яким треба ПОРАХУВАТИ симпатії, а не показати сторінку.
   * Без явного розміру бекенд віддав би 50 — і лічильник тихо занижував би.
   */
  static readonly ALL = 100;

  /**
   * Скільки людей вподобали вас ЗА ВЕСЬ ЧАС — для плитки в анкеті. Довжина списку
   * тут не годиться: список посторінковий і містить лише тих, хто ще чекає відповіді,
   * тож після відповіді на всі симпатії показував би нуль.
   */
  incomingCount(): Observable<number> {
    return this.http
      .get<{ count: number }>('/api/requests/incoming/count')
      .pipe(map((body) => body.count));
  }

  incoming(size = RequestService.ALL): Observable<RequestResponse[]> {
    const params = new HttpParams().set('size', size);
    return this.http.get<RequestResponse[]>('/api/requests/incoming', { params });
  }

  sent(): Observable<RequestResponse[]> {
    return this.http.get<RequestResponse[]>('/api/requests/sent');
  }

  /** Саме тут виникає метч: створюється чат і відкриваються фотографії обох. */
  accept(requestId: number): Observable<AcceptResponse> {
    return this.http.post<AcceptResponse>(`/api/requests/${requestId}/accept`, {});
  }

  reject(requestId: number): Observable<unknown> {
    return this.http.post(`/api/requests/${requestId}/reject`, {});
  }
}
