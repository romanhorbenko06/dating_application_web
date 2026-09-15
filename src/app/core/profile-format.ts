import {
  CHILDREN_STATUS_LABELS,
  ChildrenStatus,
  DATING_GOAL_LABELS,
  DatingGoal,
  EDUCATION_LEVEL_LABELS,
  EducationLevel,
  GENDER_LABELS,
  Gender,
  TEMPERAMENT_LABELS,
  Temperament,
} from './models/enums';
import { UserResponse } from './models/user.models';

/** Прочерк для незаповнених полів — щоб порожнеча в анкеті виглядала однаково всюди. */
export const EMPTY = '—';

/** Вік у повних роках. Бекенд віддає лише дату народження, вік рахує клієнт. */
export function ageFrom(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;

  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();

  // День народження цього року ще не настав — рік не зараховуємо
  const hadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());

  if (!hadBirthday) age--;

  return age >= 0 ? age : null;
}

export const genderLabel = (value: Gender | null) => (value ? GENDER_LABELS[value] : EMPTY);
export const goalLabel = (value: DatingGoal | null) => (value ? DATING_GOAL_LABELS[value] : EMPTY);
export const educationLabel = (value: EducationLevel | null) =>
  value ? EDUCATION_LEVEL_LABELS[value] : EMPTY;
export const temperamentLabel = (value: Temperament | null) =>
  value ? TEMPERAMENT_LABELS[value] : EMPTY;
export const childrenLabel = (value: ChildrenStatus | null) =>
  value ? CHILDREN_STATUS_LABELS[value] : EMPTY;

/** Дата у звичному вигляді 02.07.1995 замість ISO-рядка з бекенду. */
export function formatDate(iso: string | null): string {
  if (!iso) return EMPTY;

  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? EMPTY : date.toLocaleDateString('uk-UA');
}

/**
 * Українська множина: 1 світлину, 2 світлини, 5 світлин.
 * Потрібна в підказках «додати ще N…», де форма слова змінюється з числом.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;

  return many;
}

/**
 * «сьогодні», «вчора», «3 дні тому». Рахуємо в КАЛЕНДАРНИХ днях, а не в добах:
 * симпатія, надіслана вчора о 23:00, має лишитися «вчора», а не «сьогодні».
 */
export function agoLabel(iso: string | null): string {
  if (!iso) return EMPTY;

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return EMPTY;

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000);

  if (days <= 0) return 'сьогодні';
  if (days === 1) return 'вчора';

  return `${days} ${plural(days, 'день', 'дні', 'днів')} тому`;
}

/**
 * Заповненість анкети у відсотках. Рахуємо всі поля, які людина може заповнити,
 * плюс наявність фото й тегів — саме цього бракує «порожнім» анкетам у стрічці.
 */
export function profileCompleteness(
  user: UserResponse | null,
  photoCount: number,
  tagCount: number,
): number {
  if (!user) return 0;

  const checks = [
    !!user.name,
    !!user.dateOfBirth,
    !!user.gender,
    !!user.datingGoal,
    !!user.city,
    !!user.characterisation,
    !!user.educationLevel,
    !!user.temperament,
    !!user.childrenStatus,
    photoCount > 0,
    tagCount > 0,
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
