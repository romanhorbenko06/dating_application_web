import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, switchMap, tap } from 'rxjs';

import { LoginResponse, MessageResponse, RegisterRequest } from './models/auth.models';
import { Role } from './models/enums';
import { UserResponse } from './models/user.models';

/**
 * Дані, які треба пронести з екрана реєстрації на екран введення коду.
 * Зберігаємо всю заявку, а не лише пароль: без неї не можна повторно
 * надіслати код — /register приймає повний профіль.
 */
interface PendingRegistration {
  request: RegisterRequest;
  password: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private static readonly TOKEN_KEY = 'dating_app_token';

  /**
   * Зберігаємо ЧИСТИЙ JWT, без префікса 'Bearer '.
   * Бекенд віддає його з префіксом, але WebSocket (/ws/chat?token=...) чекає саме сирий токен,
   * а заголовок Authorization однаково збирає інтерсептор. Тримати одну форму — менше плутанини.
   */
  readonly token = signal<string | null>(readStoredToken());
  readonly isLoggedIn = computed(() => this.token() !== null);

  /**
   * Роль із claim'а токена — ЛИШЕ для вигляду інтерфейсу (показати пункт «Модерація»).
   * Це не захист: справжню роль бекенд бере з БД на кожному запиті, і підроблений
   * токен там нічого не відкриє. Тому клієнтську перевірку тримаємо окремо й не плутаємо.
   */
  readonly role = computed<Role | null>(() => roleFromToken(this.token()));
  readonly isAdmin = computed(() => this.role() === 'ADMIN');

  /** Профіль поточного користувача; null, поки не завантажений. */
  readonly currentUser = signal<UserResponse | null>(null);

  /**
   * Пароль між кроками register → verify живе ТІЛЬКИ в пам'яті.
   * У localStorage його класти не можна, а перезавантаження сторінки на кроці коду
   * поверне людину на форму реєстрації — це свідомий компроміс.
   */
  private pending = signal<PendingRegistration | null>(null);
  readonly pendingEmail = computed(() => this.pending()?.request.email ?? null);

  /**
   * Крок 1. Користувач ще НЕ створюється: бекенд лише шле 6-значний код на пошту.
   * Пароль сюди не йде — його чекає /verify, тому запам'ятовуємо його локально.
   */
  register(request: RegisterRequest, password: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/auth/register', request).pipe(
      tap(() => this.pending.set({ request, password })),
    );
  }

  /**
   * Крок 2. Код із листа створює акаунт. Токена /verify не повертає,
   * тому одразу логінимось — інакше людина після реєстрації опинилася б на екрані входу.
   */
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

  /**
   * Надіслати код ще раз. Бекенд на повторний /register просто перезаписує
   * запис у verification_codes і шле новий код — окремого ендпоінта не треба.
   */
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

  /** Свій профіль. Викликається після входу — саме він підтверджує, що токен живий. */
  loadCurrentUser(): Observable<UserResponse> {
    return this.http
      .get<UserResponse>('/api/users/me')
      .pipe(tap((user) => this.currentUser.set(user)));
  }

  /**
   * Бекенд заносить jti токена в чорний список і рве відкриті WebSocket-сесії.
   * Токен викидаємо в будь-якому разі: навіть якщо запит не дійшов, з погляду
   * користувача він розлогінений, а ендпоінт ідемпотентний.
   */
  logout(): Observable<unknown> {
    return this.http.post('/api/auth/logout', {}).pipe(
      catchError(() => of(null)),
      tap(() => this.clearSession()),
    );
  }

  /** Викликається також інтерсептором, коли токен протух (401). */
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

// localStorage може кинути виняток (приватний режим, заборонені site data),
// тож усі звернення до нього загорнуті — застосунок має працювати й без нього.

/** Розбір payload JWT (base64url) — без перевірки підпису, вона тут і не потрібна. */
function roleFromToken(token: string | null): Role | null {
  if (!token) return null;

  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    // atob дає рядок байтів — кирилицю в claim'ах коректно розбирає лише TextDecoder
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
