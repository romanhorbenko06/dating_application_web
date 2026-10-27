import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { PublicProfile } from './models/profile.models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private http = inject(HttpClient);

  getById(userId: number): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`/api/users/${userId}`);
  }
}
