import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/** Ендпоінти, які працюють БЕЗ токена — підставляти заголовок нема сенсу. */
const PUBLIC_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/verify'];

/**
 * Єдине місце, де до запиту додається Authorization.
 * Завдяки цьому жоден сервіс і жоден компонент про токен не думає.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isPublic = PUBLIC_ENDPOINTS.some((url) => req.url.startsWith(url));
  const token = auth.token();

  const request =
    token && !isPublic
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((error: unknown) => {
      // 401 означає одне з трьох: токен протух (година життя), його відкликали
      // через logout, або акаунт забанили. Реакція в усіх випадках однакова.
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        auth.clearSession();
        router.navigate(['/login'], { queryParams: { expired: 1 } });
      }
      return throwError(() => error);
    }),
  );
};
