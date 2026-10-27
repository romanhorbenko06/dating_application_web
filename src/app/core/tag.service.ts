import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { TagResponse } from './models/tag.models';

@Injectable({ providedIn: 'root' })
export class TagService {
  private http = inject(HttpClient);

  getAll(): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>('/api/tags');
  }

  getMy(): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>('/api/tags/my');
  }

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
