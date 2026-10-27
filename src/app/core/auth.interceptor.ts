import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const PUBLIC_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/verify'];

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
      // Протух, відкликаний або бан — реакція однакова.
      if (error instanceof HttpErrorResponse && error.status === 401 && !isPublic) {
        auth.clearSession();
        router.navigate(['/login'], { queryParams: { expired: 1 } });
      }
      return throwError(() => error);
    }),
  );
};
