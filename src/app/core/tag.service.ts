import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TagResponse } from './models/tag.models';

@Injectable({ providedIn: 'root' })
export class TagService {
  private http = inject(HttpClient);

  /** Повний довідник. Створювати теги користувач не може — лише обирати з готових. */
  getAll(): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>('/api/tags');
  }

  getMy(): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>('/api/tags/my');
  }

  /** Теги чужої анкети. Бекенд закриває їх тим самим canViewProfile, що й сам профіль. */
  getForUser(userId: number): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>(`/api/tags/user/${userId}`);
  }

  add(tagId: number): Observable<unknown> {
    return this.http.post(`/api/tags/my/${tagId}`, {});
  }

  remove(tagId: number): Observable<unknown> {
    return this.http.delete(`/api/tags/my/${tagId}`);
  }
}
