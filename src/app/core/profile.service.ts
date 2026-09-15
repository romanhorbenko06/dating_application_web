import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PublicProfile } from './models/profile.models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);

  /** Чужа анкета (UC-07). Бекенд закриває її для заблокованих і забанених — 403. */
  getById(userId: number): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`/api/users/${userId}`);
  }
}
