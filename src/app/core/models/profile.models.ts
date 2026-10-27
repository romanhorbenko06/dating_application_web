import { ChildrenStatus, DatingGoal, EducationLevel, Gender, Temperament } from './enums';

/** Чужа анкета: без email. */
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
  photoCount?: number;
}

export interface FeedFilters {
  gender?: Gender;
  minAge?: number;
  maxAge?: number;
  city?: string;
  datingGoal?: DatingGoal;
}
