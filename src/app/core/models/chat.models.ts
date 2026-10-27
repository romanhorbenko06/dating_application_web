import { IslandGame } from './island.models';
import { NotificationResponse } from './notification.models';

export interface ChatResponse {
  chatId: number;
  user1Id: number;
  user1Name: string;
  user2Id: number;
  user2Name: string;
  user1DateOfBirth: string | null;
  user1City: string | null;
  user2DateOfBirth: string | null;
  user2City: string | null;
  sharedTagCount: number;
}

/** Видалення м'яке: content стерто, тож у шаблоні спершу перевіряємо isDeleted. */
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

export interface ReadReceipt {
  chatId: number;
  readerId: number;
  messageIds: number[];
}

/** Конверт {type, payload}; після перевірки type TypeScript звужує payload. */
export type WsEvent =
  | { type: 'NEW_MESSAGE'; payload: MessageResponse }
  | { type: 'MESSAGE_EDITED'; payload: MessageResponse }
  | { type: 'MESSAGE_DELETED'; payload: MessageResponse }
  | { type: 'READ_RECEIPT'; payload: ReadReceipt }
  | { type: 'NOTIFICATION'; payload: NotificationResponse }
  | { type: 'ISLAND_UPDATED'; payload: IslandGame };
