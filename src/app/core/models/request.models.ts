export type RequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';

export interface RequestResponse {
  requestId: number;
  fromUserId: number;
  fromUserName: string;
  toUserId: number;
  toUserName: string;
  message: string | null;
  status: RequestStatus;
  createdAt: string;
  fromUserDateOfBirth: string | null;
  fromUserCity: string | null;
  fromUserPhotoCount: number;
  sharedTagCount: number;
}
