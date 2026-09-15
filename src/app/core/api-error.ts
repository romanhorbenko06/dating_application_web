import { HttpErrorResponse } from '@angular/common/http';

/**
 * Розбір помилок бекенду. Формати тіла, які реально трапляються:
 *  - 400 валідація    → { message: 'Validation failed', fieldErrors: { email: '...' } }
 *  - 400 бізнес-логіка → { message: 'Email already registered' }
 *  - 403 бан акаунта   → { message: 'Account is permanently blocked', reason: '...' }
 *  - 429 ліміт спроб   → { message: 'Too many attempts...', retryAfterSeconds: 900 }
 */
export interface ApiErrorBody {
  message?: string;
  error?: string;
  status?: number;
  reason?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
}

/** Помилки конкретних полів форми, якщо бекенд їх повернув. */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | null;
    if (body?.fieldErrors) return body.fieldErrors;
  }
  return {};
}

/**
 * Скільки секунд лишилось до зняття ліміту, якщо сервер це сказав.
 * Бекенд віддає число і в тілі (`retryAfterSeconds`), і заголовком `Retry-After`
 * — беремо тіло: воно приходить завжди, а заголовок ще має бути відкритий CORS.
 */
export function retryAfterOf(err: unknown): number | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 429) return null;

  const seconds = (err.error as ApiErrorBody | null)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? seconds : null;
}

/**
 * Бекенд відповідає англійською (і це нормально — API не прив'язаний до мови інтерфейсу).
 * Найчастіші повідомлення перекладаємо тут, решту показуємо як є: краще незнайомий
 * текст від сервера, ніж загальне «щось пішло не так», яке нічого не пояснює.
 */
const TRANSLATIONS: Record<string, string> = {
  'User not found': 'Анкету не знайдено — можливо, акаунт видалено.',
  'No more profiles': 'Анкети закінчились.',
  'You already liked this user': 'Ви вже вподобали цю людину.',
  'You are already matched with this user': 'У вас уже взаємна симпатія.',
  'Administrators cannot be liked': 'Адміністратора не можна вподобати.',
  'You cannot like yourself': 'Не можна вподобати самого себе.',
  'Interaction with this user is not available': 'Взаємодія з цим користувачем недоступна.',
  'Request already processed': 'Цю симпатію вже опрацьовано.',
  'Email already registered': 'Ця пошта вже зареєстрована.',
  'Invalid verification code': 'Невірний код підтвердження.',
  'Verification code expired': 'Термін дії коду минув. Зареєструйтесь ще раз.',
  'No verification code found': 'Код не знайдено. Почніть реєстрацію спочатку.',
  'Invalid email or password': 'Невірна пошта або пароль.',
  'Account is permanently blocked': 'Акаунт заблоковано назавжди',
  'Photo limit reached': 'Досягнуто ліміту фотографій.',
  'Photo file is empty': 'Файл порожній.',
  'Chat not found': 'Чат не знайдено.',
  'Message not found': 'Повідомлення не знайдено.',
};

/** Один рядок, який не соромно показати користувачеві. */
export function messageOf(err: unknown, fallback = 'Щось пішло не так. Спробуйте ще раз.'): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;

  // Сервер не відповів узагалі: не запущений, впав або немає мережі
  if (err.status === 0) {
    return 'Немає зв’язку із сервером. Перевірте, чи запущений бекенд на порту 8080.';
  }

  const body = err.error as ApiErrorBody | null;

  // Бекенд завжди відповідає JSON. Якщо в тілі рядок (типово — HTML-сторінка помилки),
  // значить відповів не він, а dev-сервер: проксі не працює й запит нікуди не пішов.
  if (typeof err.error === 'string' && err.status === 404) {
    return 'Запит не дійшов до сервера. Перезапустіть ng serve, щоб підхопився proxy.conf.json.';
  }

  if (err.status === 429) {
    const seconds = body?.retryAfterSeconds ?? 0;
    const minutes = Math.ceil(seconds / 60);
    return minutes > 0
      ? `Забагато спроб. Спробуйте за ${minutes} хв.`
      : 'Забагато спроб. Спробуйте трохи пізніше.';
  }

  // Бан адміністратором: причина лежить окремим полем
  if (err.status === 403 && body?.reason) {
    const head = body.message ? (TRANSLATIONS[body.message] ?? body.message) : 'Доступ заборонено';
    return `${head}. Причина: ${body.reason}`;
  }

  // Помилки полів уже показані під самими полями — у шапці даємо загальний текст
  if (body?.fieldErrors && Object.keys(body.fieldErrors).length > 0) {
    return 'Перевірте правильність заповнення полів.';
  }

  const message = body?.message;
  if (!message) return fallback;

  // Деякі повідомлення бекенд збирає з префіксом (напр. «Photo limit reached (max 6)»)
  const known = Object.keys(TRANSLATIONS).find((key) => message.startsWith(key));
  return known ? TRANSLATIONS[known] : message;
}
