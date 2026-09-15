import { HttpErrorResponse } from '@angular/common/http';

import { fieldErrorsOf, messageOf, retryAfterOf } from './api-error';

/**
 * Розбір помилок бекенду. Саме тут вирішується, що побачить людина замість
 * англомовної відповіді сервера, тож помилка цього модуля виглядає як
 * «застосунок пише незрозуміле», а не як збій.
 */
describe('api-error', () => {
  const error = (status: number, body: unknown) =>
    new HttpErrorResponse({ status, error: body });

  describe('messageOf', () => {
    it('перекладає відомі повідомлення бекенду', () => {
      expect(messageOf(error(400, { message: 'Email already registered' })))
        .toBe('Ця пошта вже зареєстрована.');
    });

    it('незнайоме повідомлення показує як є, а не ховає за «щось пішло не так»', () => {
      expect(messageOf(error(400, { message: 'Something very specific happened' })))
        .toBe('Something very specific happened');
    });

    it('429 перетворює на зрозумілий час очікування', () => {
      expect(messageOf(error(429, { retryAfterSeconds: 900 })))
        .toBe('Забагато спроб. Спробуйте за 15 хв.');
    });

    it('429 без числа не показує «за 0 хв»', () => {
      expect(messageOf(error(429, {}))).toBe('Забагато спроб. Спробуйте трохи пізніше.');
    });

    it('відсутність сервера пояснює прямо, а не загальною фразою', () => {
      expect(messageOf(error(0, null))).toContain('Немає зв’язку із сервером');
    });

    it('бан показує причину, яку вказав адміністратор', () => {
      const message = messageOf(
        error(403, { message: 'Account is permanently blocked', reason: 'спам' }),
      );

      expect(message).toContain('Акаунт заблоковано назавжди');
      expect(message).toContain('спам');
    });

    it('помилки полів не дублюються в шапці — вони вже під полями', () => {
      expect(messageOf(error(400, { message: 'Validation failed', fieldErrors: { email: 'погана' } })))
        .toBe('Перевірте правильність заповнення полів.');
    });

    it('не-HTTP помилка дає запасний текст', () => {
      expect(messageOf(new Error('щось у коді'), 'запасний')).toBe('запасний');
    });
  });

  describe('retryAfterOf', () => {
    it('дістає час очікування з 429', () => {
      expect(retryAfterOf(error(429, { retryAfterSeconds: 42 }))).toBe(42);
    });

    it('для інших статусів нічого не повертає', () => {
      expect(retryAfterOf(error(400, { retryAfterSeconds: 42 })))
        .toBeNull();
    });

    it('нуль або відсутнє значення — це «невідомо», а не 0 секунд', () => {
      expect(retryAfterOf(error(429, { retryAfterSeconds: 0 }))).toBeNull();
      expect(retryAfterOf(error(429, {}))).toBeNull();
    });
  });

  describe('fieldErrorsOf', () => {
    it('повертає помилки полів для підсвічування форми', () => {
      expect(fieldErrorsOf(error(400, { fieldErrors: { email: 'Невірний формат' } })))
        .toEqual({ email: 'Невірний формат' });
    });

    it('без них повертає порожній обʼєкт, а не undefined', () => {
      expect(fieldErrorsOf(error(500, {}))).toEqual({});
      expect(fieldErrorsOf('не помилка HTTP')).toEqual({});
    });
  });
});
