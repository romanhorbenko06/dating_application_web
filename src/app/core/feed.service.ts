import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiErrorBody } from './api-error';
import { FeedFilters, PublicProfile } from './models/profile.models';

const NO_MORE_PROFILES = 'No more profiles';

@Injectable({ providedIn: 'root' })
export class FeedService {
  private http = inject(HttpClient);

  getNext(filters: FeedFilters): Observable<PublicProfile> {
    return this.http.get<PublicProfile>('/api/users/next', { params: this.toParams(filters) });
  }

  /** Перший елемент дорівнює getNext, тож у смузі показуємо з другого. */
  getUpcoming(filters: FeedFilters, limit = 5): Observable<PublicProfile[]> {
    return this.http.get<PublicProfile[]>('/api/users/feed', {
      params: this.toParams(filters).set('limit', limit),
    });
  }

  private toParams(filters: FeedFilters): HttpParams {
    let params = new HttpParams();

    if (filters.gender) params = params.set('gender', filters.gender);
    if (filters.minAge != null) params = params.set('minAge', filters.minAge);
    if (filters.maxAge != null) params = params.set('maxAge', filters.maxAge);
    if (filters.city) params = params.set('city', filters.city);
    if (filters.datingGoal) params = params.set('datingGoal', filters.datingGoal);

    return params;
  }

  /** Порожня стрічка — звичайна 400, тож розпізнаємо за текстом. */
  isFeedEmpty(err: unknown): boolean {
    return (
      err instanceof HttpErrorResponse &&
      err.status === 400 &&
      (err.error as ApiErrorBody | null)?.message === NO_MORE_PROFILES
    );
  }
}
