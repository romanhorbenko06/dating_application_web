import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ChatResponse, MessageResponse } from './models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);

  /** Скільки повідомлень тягнемо за раз (бекенд дозволяє до 200). */
  static readonly PAGE_SIZE = 50;

  /** Скільки чатів показує сторінка списку за раз. */
  static readonly CHATS_PAGE_SIZE = 20;

  /**
   * Стільки просять екрани, яким потрібні ВСІ чати: там не список, а перевірка
   * «чи є вже чат» і лічильник збігів. 100 — стеля бекенду; за нею лічильник
   * почав би занижувати, але для цього треба сотню взаємних симпатій.
   */
  static readonly ALL_CHATS = 100;

  getChats(page = 0, size = ChatService.CHATS_PAGE_SIZE): Observable<ChatResponse[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ChatResponse[]>('/api/chats', { params });
  }

  getChat(chatId: number): Observable<ChatResponse> {
    return this.http.get<ChatResponse>(`/api/chats/${chatId}`);
  }

  /**
   * Історія. Пагінація КУРСОРНА: `before` — це messageId, старіший за який брати.
   * Зсув тут не годиться, бо чат поповнюється просто під час читання й сторінки
   * зсувалися б. Відповідь завжди в хронологічному порядку.
   */
  getMessages(chatId: number, before?: number): Observable<MessageResponse[]> {
    let params = new HttpParams().set('limit', ChatService.PAGE_SIZE);
    if (before != null) params = params.set('before', before);

    return this.http.get<MessageResponse[]>(`/api/chats/${chatId}/messages`, { params });
  }

  /**
   * Надсилання ЛИШЕ через REST: бекенд спершу пише в БД, потім сам пушить
   * обом у сокет. Вхідні кадри WebSocket він свідомо ігнорує.
   */
  send(chatId: number, content: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/chats/messages', { chatId, content });
  }

  edit(messageId: number, content: string): Observable<MessageResponse> {
    return this.http.put<MessageResponse>(`/api/chats/messages/${messageId}`, { content });
  }

  /** М'яке видалення: у відповідь приходить те саме повідомлення з isDeleted = true. */
  remove(messageId: number): Observable<MessageResponse> {
    return this.http.delete<MessageResponse>(`/api/chats/messages/${messageId}`);
  }

  /** Ідемпотентно: повторний виклик дає markedCount = 0 і не шле квитанцію. */
  markRead(chatId: number): Observable<{ markedCount: number }> {
    return this.http.put<{ markedCount: number }>(`/api/chats/${chatId}/read`, {});
  }
}
