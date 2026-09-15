import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BlockResponse } from './models/block.models';

/**
 * Дії проти іншого користувача. Дві різні речі, які легко переплутати:
 *  - скарга йде адміністратору на розгляд (UC-13);
 *  - блокування діє одразу й СИМЕТРИЧНО: ви зникаєте одне в одного зі стрічки,
 *    з чатів і з фото, незалежно від того, хто натиснув.
 */
@Injectable({ providedIn: 'root' })
export class ModerationService {
  private http = inject(HttpClient);

  fileComplaint(reportedUserId: number, reason: string): Observable<unknown> {
    return this.http.post('/api/complaints', { reportedUserId, reason });
  }

  blockUser(userId: number): Observable<unknown> {
    return this.http.post(`/api/blocks/${userId}`, {});
  }

  /** Кого я заблокував. Зворотного списку («хто заблокував мене») свідомо немає. */
  myBlocks(): Observable<BlockResponse[]> {
    return this.http.get<BlockResponse[]>('/api/blocks');
  }

  /**
   * Зняти блокування. Симетрію теж знімає: анкети знову видно одна одній.
   * Чат, який зник при блокуванні, сам собою не повертається — переписка
   * лишилася в базі, але потрапити в неї можна лише через список чатів.
   */
  unblockUser(userId: number): Observable<unknown> {
    return this.http.delete(`/api/blocks/${userId}`);
  }
}
