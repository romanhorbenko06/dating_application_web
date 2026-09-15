import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BlockedUser, ComplaintResponse, ComplaintStatus } from './models/admin.models';

/** Модерація (UC-13, UC-14). Усі ендпоінти під ROLE_ADMIN на бекенді. */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  /** Розмір сторінки для списків модерації. */
  static readonly PAGE_SIZE = 50;

  /** Без статусу — усі скарги, включно з опрацьованими (потрібно для історії модерації). */
  getComplaints(status?: ComplaintStatus): Observable<ComplaintResponse[]> {
    const params = status ? new HttpParams().set('status', status) : undefined;
    return this.http.get<ComplaintResponse[]>('/api/admin/complaints', { params });
  }

  getComplaintsAboutUser(userId: number): Observable<ComplaintResponse[]> {
    return this.http.get<ComplaintResponse[]>(`/api/admin/complaints/user/${userId}`);
  }

  review(complaintId: number): Observable<ComplaintResponse> {
    return this.http.put<ComplaintResponse>(`/api/admin/complaints/${complaintId}/review`, {});
  }

  /** Порушення підтвердилось і заходи вжито. */
  resolve(complaintId: number): Observable<ComplaintResponse> {
    return this.http.put<ComplaintResponse>(`/api/admin/complaints/${complaintId}/resolve`, {});
  }

  /** Скарга безпідставна — санкцій немає. */
  reject(complaintId: number): Observable<ComplaintResponse> {
    return this.http.put<ComplaintResponse>(`/api/admin/complaints/${complaintId}/reject`, {});
  }

  /**
   * Бан НАЗАВЖДИ: ендпоінта для зняття свідомо не існує, рішення остаточне.
   * Бекенд одразу рве відкриті WebSocket-сесії забаненого.
   */
  blockUser(userId: number, reason: string | null): Observable<BlockedUser> {
    return this.http.put<BlockedUser>(`/api/admin/users/${userId}/block`, { reason });
  }

  /** Забанені, найсвіжіші зверху. Сторінкою — список із часом росте й не має межі. */
  getBlockedUsers(page = 0, size = AdminService.PAGE_SIZE): Observable<BlockedUser[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<BlockedUser[]>('/api/admin/users/blocked', { params });
  }

  /** Повне видалення акаунта з БД — на відміну від бану, історія скарг теж зникає. */
  deleteUser(userId: number): Observable<unknown> {
    return this.http.delete(`/api/admin/users/${userId}`);
  }
}
