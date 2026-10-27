import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthService } from './auth.service';
import { UserResponse, UserUpdateRequest } from './models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /** PATCH, щоб невідомі цій версії фронта поля не затирались; явний null очищає поле. */
  updateProfile(userId: number, changes: Partial<UserUpdateRequest>): Observable<UserResponse> {
    return this.http
      .patch<UserResponse>(`/api/users/${userId}`, changes)
      .pipe(tap((user) => this.auth.currentUser.set(user)));
  }

  deleteAccount(userId: number): Observable<unknown> {
    return this.http.delete(`/api/users/${userId}`);
  }
}
