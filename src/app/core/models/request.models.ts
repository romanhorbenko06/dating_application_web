export type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

/** Лайк. Створюється як PENDING; метч виникає, коли адресат натисне accept. */
export interface RequestResponse {
  requestId: number;
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  toUserName: string;
  message: string | null;
  status: RequestStatus;
  createdAt: string;
  /**
   * Подробиці про відправника — бекенд віддає їх разом зі списком, щоб картка
   * «вас вподобали» не добирала анкету окремим запитом на кожен рядок.
   */
  fromUserDateOfBirth: string | null;
  fromUserCity: string | null;
  fromUserPhotoCount: number;
  /** Спільні теми відправника й отримувача. Симетрично для вхідних і надісланих. */
  sharedTagCount: number;
}
