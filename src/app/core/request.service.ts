import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { RequestResponse } from './models/request.models';

export interface AcceptResponse {
  message: string;
  chatId: number;
}

/** Симпатії (UC-08, UC-09). */
@Injectable({ providedIn: 'root' })
export class RequestService {
  private http = inject(HttpClient);

  send(toUserId: number, message?: string): Observable<RequestResponse> {
    return this.http.post<RequestResponse>('/api/requests/send', { toUserId, message });
  }

  skip(userId: number): Observable<unknown> {
    return this.http.post(`/api/requests/skip/${userId}`, {});
  }

  skipped(): Observable<{ userId: number; name: string }[]> {
    return this.http.get<{ userId: number; name: string }[]>('/api/requests/skipped');
  }

  /** Розмір для підрахунку: з дефолтними 50 лічильник занижувався б. */
  static readonly ALL = 100;

  /** Накопичувальний лічильник: довжина списку після відповідей показувала б нуль. */
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

  accept(requestId: number): Observable<AcceptResponse> {
    return this.http.post<AcceptResponse>(`/api/requests/${requestId}/accept`, {});
  }

  reject(requestId: number): Observable<unknown> {
    return this.http.post(`/api/requests/${requestId}/reject`, {});
  }
}
