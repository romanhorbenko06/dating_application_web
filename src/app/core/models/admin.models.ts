/** RESOLVED — порушення підтвердилось, REJECTED — скарга безпідставна. */
export type ComplaintStatus = 'PENDING' | 'REVIEWED' | 'RESOLVED' | 'REJECTED';

export interface ComplaintResponse {
  complaintId: number;
  reporterId: number;
  reporterName: string;
  reportedUserId: number;
  reportedUserName: string;
  reason: string;
  status: ComplaintStatus;
  createdAt: string;
}

export interface BlockedUser {
  userId: number;
  name: string;
  email: string;
  blockedAt: string;
  blockReason: string | null;
}
