import { DatingGoal, Gender } from './enums';

/** Пароля тут немає — він іде на кроці verify. */
export interface RegisterRequest {
  email: string;
  name: string;
  gender: Gender;
  dateOfBirth: string;
  city?: string;
  datingGoal: DatingGoal;
}

export interface VerifyRequest {
  email: string;
  password: string;
  verificationCode: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** token приходить з префіксом 'Bearer '. */
export interface LoginResponse {
  message: string;
  token: string;
  date: string;
}

export interface MessageResponse {
  message: string;
  date: string;
}
