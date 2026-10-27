import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BlockResponse } from './models/block.models';

/** Скарга йде адміністратору; блокування діє одразу й симетрично. */
@Injectable({ providedIn: 'root' })
export class ModerationService {
  private http = inject(HttpClient);

  fileComplaint(reportedUserId: number, reason: string): Observable<unknown> {
    return this.http.post('/api/complaints', { reportedUserId, reason });
  }

  blockUser(userId: number): Observable<unknown> {
    return this.http.post(`/api/blocks/${userId}`, {});
  }

  myBlocks(): Observable<BlockResponse[]> {
    return this.http.get<BlockResponse[]>('/api/blocks');
  }

  /** Чат, що зник при блокуванні, сам собою не повертається. */
  unblockUser(userId: number): Observable<unknown> {
    return this.http.delete(`/api/blocks/${userId}`);
  }
}
