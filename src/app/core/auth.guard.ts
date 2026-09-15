import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Не пускає на закриті маршрути без токена. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;

  // returnUrl — щоб після входу повернути людину туди, куди вона йшла
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Дзеркальна перевірка: залогіненому нема чого робити на екранах входу й реєстрації. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) return true;

  return router.createUrlTree([auth.isAdmin() ? '/admin' : '/feed']);
};

/**
 * Дзеркало adminGuard: екрани знайомств ховаються від адміністратора.
 * У нього немає анкети, тож стрічка, симпатії, чати, сповіщення й профіль
 * для нього порожні за визначенням — ведемо одразу в модерацію.
 * Чужі анкети (/users/:id) лишаються доступними: без них не переглянути фото
 * порушника під час розгляду скарги.
 */
export const daterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? router.createUrlTree(['/admin']) : true;
};

/**
 * Ховає адмінські екрани від дейтерів. Це зручність, а не захист:
 * навіть якщо хтось відкриє маршрут напряму, кожен запит усередині
 * впреться в @PreAuthorize на бекенді й отримає 403.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAdmin() ? true : router.createUrlTree(['/feed']);
};
