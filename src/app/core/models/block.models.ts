/**
 * Запис зі списку «мої блокування» (GET /api/blocks).
 * Не плутати з {@link BlockedUser} в admin.models: там бан від адміністратора,
 * тут — особисте блокування одного користувача іншим.
 */
export interface BlockResponse {
  blockId: number;
  blockedUserId: number;
  blockedUserName: string;
  createdAt: string;
}
