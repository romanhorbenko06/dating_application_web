import { ChildrenStatus, DatingGoal, EducationLevel, Gender, Temperament } from './enums';

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

/** PUT — повна заміна анкети, тож форма завжди шле всі поля. */
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
