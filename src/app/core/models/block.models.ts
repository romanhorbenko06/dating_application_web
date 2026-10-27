/** Особисте блокування; бан від адміністратора — BlockedUser в admin.models. */
export interface BlockResponse {
  blockId: number;
  blockedUserId: number;
  blockedUserName: string;
  createdAt: string;
}
