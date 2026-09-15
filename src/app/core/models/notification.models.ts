/** Типи подій центру сповіщень (FR-19). Фронт малює текст і посилання за цим полем. */
export type NotificationType = 'NEW_LIKE' | 'NEW_MATCH' | 'NEW_MESSAGE';

/**
 * Запис у центрі сповіщень.
 *
 * `chatId` порожній для NEW_LIKE — чату ще немає, він з'являється лише на метчі.
 * `messageCount` заповнений для NEW_MESSAGE: бекенд ЗГОРТАЄ повідомлення з одного
 * чату в один запис і рахує їх, замість плодити десятки рядків.
 */
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
