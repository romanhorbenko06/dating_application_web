import { ChildrenStatus, DatingGoal, EducationLevel, Gender, Temperament } from './enums';

/** GET /api/users/me — власний профіль, єдине місце, де бекенд віддає email. */
export interface UserResponse {
  userId: number;
  name: string;
  email: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  characterisation: string | null;
  city: string | null;
  datingGoal: DatingGoal | null;
  educationLevel: EducationLevel | null;
  temperament: Temperament | null;
  childrenStatus: ChildrenStatus | null;
}

/**
 * Тіло PUT /api/users/{id}. Це ПОВНА заміна анкети: поле, якого немає в запиті,
 * бекенд затирає в null. Тому форма редагування завжди надсилає всі поля одразу.
 */
export interface UserUpdateRequest {
  name: string;
  gender: Gender;
  dateOfBirth: string;
  characterisation: string | null;
  city: string | null;
  datingGoal: DatingGoal;
  educationLevel: EducationLevel | null;
  temperament: Temperament | null;
  childrenStatus: ChildrenStatus | null;
}
