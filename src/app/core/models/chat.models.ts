import { NotificationResponse } from './notification.models';

/** Чат між двома учасниками метчу (GET /api/chats). */
export interface ChatResponse {
  chatId: number;
  user1Id: number;
  user1Name: string;
  user2Id: number;
  user2Name: string;
  /** Вік і місто обох учасників — хто з них співрозмовник, вирішує клієнт. */
  user1DateOfBirth: string | null;
  user1City: string | null;
  user2DateOfBirth: string | null;
  user2City: string | null;
  /** Скільки тем збігається в учасників чату. */
  sharedTagCount: number;
}

/**
 * Повідомлення. Видалення М'ЯКЕ: рядок лишається у стрічці з isDeleted = true,
 * а content бекенд стирає — тому в шаблоні спершу перевіряємо isDeleted.
 */
export interface MessageResponse {
  messageId: number;
  chatId: number;
  senderId: number;
  senderName: string;
  content: string | null;
  sentAt: string;
  isRead: boolean;
  editedAt: string | null;
  isDeleted: boolean;
}

/** Квитанція прочитання: які саме повідомлення співрозмовник щойно побачив. */
export interface ReadReceipt {
  chatId: number;
  readerId: number;
  messageIds: number[];
}

/**
 * Конверт WebSocket-події з бекенду: {type, payload}.
 * Розмічений об'єднанням — після перевірки event.type TypeScript сам звужує payload.
 */
export type WsEvent =
  | { type: 'NEW_MESSAGE'; payload: MessageResponse }
  | { type: 'MESSAGE_EDITED'; payload: MessageResponse }
  | { type: 'MESSAGE_DELETED'; payload: MessageResponse }
  | { type: 'READ_RECEIPT'; payload: ReadReceipt }
  | { type: 'NOTIFICATION'; payload: NotificationResponse };
