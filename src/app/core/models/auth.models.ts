import { DatingGoal, Gender } from './enums';

/** Тіло POST /api/auth/register. Паролю тут НЕМАЄ — він іде на кроці verify. */
export interface RegisterRequest {
  email: string;
  name: string;
  gender: Gender;
  dateOfBirth: string; // ISO 'YYYY-MM-DD' — бекенд чекає LocalDate
  city?: string;
  datingGoal: DatingGoal;
}

/** Тіло POST /api/auth/verify. Саме тут створюється користувач і задається пароль. */
export interface VerifyRequest {
  email: string;
  password: string;
  verificationCode: string; // рівно 6 цифр
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Успішний вхід. `token` приходить уже з префіксом 'Bearer '. */
export interface LoginResponse {
  message: string;
  token: string;
  date: string;
}

export interface MessageResponse {
  message: string;
  date: string;
}
