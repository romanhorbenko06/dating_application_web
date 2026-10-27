import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, switchMap, tap } from 'rxjs';

import { LoginResponse, MessageResponse, RegisterRequest } from './models/auth.models';
import { Role } from './models/enums';
import { UserResponse } from './models/user.models';

/** Вся заявка, бо для повторного надсилання коду /register приймає повний профіль. */
interface PendingRegistration {
  request: RegisterRequest;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private static readonly TOKEN_KEY = 'dating_app_token';

  /** Чистий JWT без 'Bearer ': WebSocket чекає саме сирий токен. */
  readonly token = signal<string | null>(readStoredToken());
  readonly isLoggedIn = computed(() => this.token() !== null);

  /** Роль із токена лише для інтерфейсу; справжню бекенд бере з БД. */
  readonly role = computed<Role | null>(() => roleFromToken(this.token()));
  readonly isAdmin = computed(() => this.role() === 'ADMIN');

  readonly currentUser = signal<UserResponse | null>(null);

  /** Пароль між register і verify лише в пам'яті; перезавантаження поверне на форму реєстрації. */
  private pending = signal<PendingRegistration | null>(null);
  readonly pendingEmail = computed(() => this.pending()?.request.email ?? null);

  register(request: RegisterRequest, password: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/auth/register', request).pipe(
      tap(() => this.pending.set({ request, password })),
    );
  }

  /** /verify токена не повертає, тож одразу логінимось. */
  verifyAndLogin(verificationCode: string): Observable<LoginResponse> {
    const pending = this.pending();
    if (!pending) {
      throw new Error('Немає незавершеної реєстрації');
    }

    const body = {
      email: pending.request.email,
      password: pending.password,
      verificationCode,
    };

    return this.http.post<MessageResponse>('/api/auth/verify', body).pipe(
      switchMap(() => this.login(pending.request.email, pending.password)),
      tap(() => this.pending.set(null)),
    );
  }

  /** Повторний /register перезаписує код, окремого ендпоінта не треба. */
  resendCode(): Observable<MessageResponse> {
    const pending = this.pending();
    if (!pending) throw new Error('Немає незавершеної реєстрації');

    return this.http.post<MessageResponse>('/api/auth/register', pending.request);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>('/api/auth/login', { email, password })
      .pipe(tap((response) => this.storeToken(response.token)));
  }

  loadCurrentUser(): Observable<UserResponse> {
    return this.http
      .get<UserResponse>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  /** Токен викидаємо в будь-якому разі: ендпоінт ідемпотентний. */
  logout(): Observable<unknown> {
    return this.http.post('/api/auth/logout', {}).pipe(
      catchError(() => of(null)),
      tap(() => this.clearSession()),
    );
  }

  clearSession(): void {
    this.token.set(null);
    this.currentUser.set(null);
    this.pending.set(null);
    safeRemove(AuthService.TOKEN_KEY);
  }

  private storeToken(tokenWithPrefix: string): void {
    const raw = tokenWithPrefix.startsWith('Bearer ')
      ? tokenWithPrefix.slice('Bearer '.length)
      : tokenWithPrefix;

    this.token.set(raw);
    safeWrite(AuthService.TOKEN_KEY, raw);
  }
}

// localStorage може кинути виняток (приватний режим), тож звернення загорнуті.

function roleFromToken(token: string | null): Role | null {
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    // Кирилицю в claim'ах коректно розбирає лише TextDecoder
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const json = JSON.parse(new TextDecoder().decode(bytes)) as { role?: string };

    return json.role === 'ADMIN' || json.role === 'DATER' ? json.role : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    return localStorage.getItem('dating_app_token');
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* лишаємось залогіненими лише до перезавантаження сторінки */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* нічого не вдієш */
  }
}
