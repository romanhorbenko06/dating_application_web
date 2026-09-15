import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthService } from './auth.service';
import { UserResponse, UserUpdateRequest } from './models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  /**
   * PATCH, а не PUT: поля, яких немає в тілі, бекенд лишає як були. Форма шле всі відомі
   * їй поля, тож видимої різниці сьогодні немає — але коли в анкеті з'явиться
   * поле, про яке ця версія фронта не знає, PUT затер би його, а PATCH ні.
   *
   * Очистити поле можна явним null: бекенд відрізняє «ключа немає в тілі»
   * від «ключ прийшов зі значенням null».
   *
   * Після збереження оновлюємо профіль у AuthService, щоб екран перегляду
   * показав свіжі дані без зайвого запиту.
   */
  updateProfile(userId: number, changes: Partial<UserUpdateRequest>): Observable<UserResponse> {
    return this.http
      .patch<UserResponse>(`/api/users/${userId}`, changes)
      .pipe(tap((user) => this.auth.currentUser.set(user)));
  }

  /**
   * Самовидалення акаунта. Незворотне: бекенд стирає анкету, фото (разом
   * із файлами на диску), симпатії, чати з усім листуванням і сповіщення.
   */
  deleteAccount(userId: number): Observable<unknown> {
    return this.http.delete(`/api/users/${userId}`);
  }
}
