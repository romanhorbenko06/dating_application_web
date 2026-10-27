import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ChatResponse, MessageResponse } from './models/chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);

  /** Бекенд дозволяє до 200. */
  static readonly PAGE_SIZE = 50;

  static readonly CHATS_PAGE_SIZE = 20;

  /** Для перевірки «чи є чат» і лічильника збігів; 100 — стеля бекенду. */
  static readonly ALL_CHATS = 100;

  getChats(page = 0, size = ChatService.CHATS_PAGE_SIZE): Observable<ChatResponse[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<ChatResponse[]>('/api/chats', { params });
  }

  getChat(chatId: number): Observable<ChatResponse> {
    return this.http.get<ChatResponse>(`/api/chats/${chatId}`);
  }

  /** Курсорна пагінація: before — messageId; відповідь у хронологічному порядку. */
  getMessages(chatId: number, before?: number): Observable<MessageResponse[]> {
    let params = new HttpParams().set('limit', ChatService.PAGE_SIZE);
    if (before != null) params = params.set('before', before);

    return this.http.get<MessageResponse[]>(`/api/chats/${chatId}/messages`, { params });
  }

  /** Лише через REST: бекенд пише в БД і сам пушить обом. */
  send(chatId: number, content: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>('/api/chats/messages', { chatId, content });
  }

  edit(messageId: number, content: string): Observable<MessageResponse> {
    return this.http.put<MessageResponse>(`/api/chats/messages/${messageId}`, { content });
  }

  remove(messageId: number): Observable<MessageResponse> {
    return this.http.delete<MessageResponse>(`/api/chats/messages/${messageId}`);
  }

  markRead(chatId: number): Observable<{ markedCount: number }> {
    return this.http.put<{ markedCount: number }>(`/api/chats/${chatId}/read`, {});
  }
}
