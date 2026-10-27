import { HttpErrorResponse } from '@angular/common/http';

/**
 * Розбір помилок бекенду:
 *  - 400 валідація    → { message, fieldErrors }
 *  - 400 бізнес-логіка → { message }
 *  - 403 бан           → { message, reason }
 *  - 429 ліміт         → { message, retryAfterSeconds }
 */
export interface ApiErrorBody {
  message?: string;
  error?: string;
  status?: number;
  reason?: string;
  retryAfterSeconds?: number;
  fieldErrors?: Record<string, string>;
}

export function fieldErrorsOf(err: unknown): Record<string, string> {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as ApiErrorBody | null;
    if (body?.fieldErrors) return body.fieldErrors;
  }
  return {};
}

/** Беремо з тіла: заголовок Retry-After ще має бути відкритий CORS. */
export function retryAfterOf(err: unknown): number | null {
  if (!(err instanceof HttpErrorResponse) || err.status !== 429) return null;

  const seconds = (err.error as ApiErrorBody | null)?.retryAfterSeconds;
  return typeof seconds === 'number' && seconds > 0 ? seconds : null;
}

/** Найчастіші англійські повідомлення бекенду перекладаємо, решту показуємо як є. */
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
  // «Острів на двох»
  'An island game is already in progress': 'Партія вже йде — продовжуйте її.',
  'You already have an island in this chat': 'У цьому чаті ваш острів уже є.',
  'Your invitation was declined; only your partner can start a new game':
    'Запрошення відхилено. Нову гру може почати лише співрозмовник.',
  'Invitation has already been answered': 'На запрошення вже відповіли.',
  'Waiting for your partner to accept': 'Чекаємо, поки співрозмовник прийме запрошення.',
  'The island game has expired': 'Час на цей крок минув — партію завершено.',
  'This step has not started yet': 'Цей крок ще не почався.',
  'You have already made your pick': 'Свій набір ви вже здали.',
  'You have already made your guess': 'Здогад ви вже зробили.',
  'Make your own pick first': 'Спершу оберіть свої предмети.',
  'You have already answered': 'Ви вже відповіли.',
  'Items must be different': 'Предмети мають бути різними.',
  'You can only keep items that one of you picked': 'Лишити можна лише те, що обрав хтось із вас.',
  'Island name is required': 'Дайте острову назву.',
  'Photo file is empty': 'Файл порожній.',
  'Chat not found': 'Чат не знайдено.',
  'Message not found': 'Повідомлення не знайдено.',
};

export function messageOf(err: unknown, fallback = 'Щось пішло не так. Спробуйте ще раз.'): string {
  if (!(err instanceof HttpErrorResponse)) return fallback;

  if (err.status === 0) {
    return 'Немає зв’язку із сервером. Перевірте, чи запущений бекенд на порту 8080.';
  }

  const body = err.error as ApiErrorBody | null;

  // Рядок замість JSON — відповів dev-сервер, тобто проксі не працює.
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

  if (err.status === 403 && body?.reason) {
    const head = body.message ? (TRANSLATIONS[body.message] ?? body.message) : 'Доступ заборонено';
    return `${head}. Причина: ${body.reason}`;
  }

  if (body?.fieldErrors && Object.keys(body.fieldErrors).length > 0) {
    return 'Перевірте правильність заповнення полів.';
  }

  const message = body?.message;
  if (!message) return fallback;

  // Деякі повідомлення мають суфікс, напр. «Photo limit reached (max 6)»
  const known = Object.keys(TRANSLATIONS).find((key) => message.startsWith(key));
  return known ? TRANSLATIONS[known] : message;
}
