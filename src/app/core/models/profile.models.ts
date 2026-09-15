import { ChildrenStatus, DatingGoal, EducationLevel, Gender, Temperament } from './enums';

/**
 * Чужа анкета (GET /api/users/next, GET /api/users/{id}).
 * Те саме, що UserResponse, але БЕЗ email — бекенд свідомо його не віддає стороннім.
 */
export interface PublicProfile {
  userId: number;
  name: string;
  gender: Gender | null;
  dateOfBirth: string | null;
  characterisation: string | null;
  city: string | null;
  datingGoal: DatingGoal | null;
  educationLevel: EducationLevel | null;
  temperament: Temperament | null;
  childrenStatus: ChildrenStatus | null;
  /** Скільки фото має людина. Видно й до метчу — самі фото ні. */
  photoCount?: number;
}

/** Параметри стрічки (UC-06). Порожні поля просто не потрапляють у запит. */
export interface FeedFilters {
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  city?: string;
  datingGoal?: DatingGoal;
}
