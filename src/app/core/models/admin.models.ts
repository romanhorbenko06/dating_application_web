/**
 * Стани скарги. REJECTED і RESOLVED — РІЗНІ речі: resolved означає, що порушення
 * підтвердилось і вжито заходів, rejected — що скарга виявилась безпідставною (FR-21.2).
 */
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

/** Акаунт, забанений адміністратором. Розблокування не передбачено. */
export interface BlockedUser {
  userId: number;
  name: string;
  email: string;
  blockedAt: string;
  blockReason: string | null;
}
