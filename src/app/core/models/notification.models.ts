export type NotificationType =
  | 'NEW_LIKE'
  | 'NEW_MATCH'
  | 'NEW_MESSAGE'
  | 'ISLAND_INVITE'
  | 'ISLAND_UPDATE'
  | 'ISLAND_COMPLETED';

/** chatId порожній для NEW_LIKE; messageCount — скільки повідомлень згорнуто для NEW_MESSAGE. */
export interface NotificationResponse {
  notificationId: number;
  type: NotificationType;
  actorId: number;
  actorName: string;
  chatId: number | null;
  messageCount: number | null;
  isRead: boolean;
  createdAt: string;
}
