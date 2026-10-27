import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { BlockedUser, ComplaintResponse, ComplaintStatus } from './models/admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  static readonly PAGE_SIZE = 50;

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

  resolve(complaintId: number): Observable<ComplaintResponse> {
    return this.http.put<ComplaintResponse>(`/api/admin/complaints/${complaintId}/resolve`, {});
  }

  reject(complaintId: number): Observable<ComplaintResponse> {
    return this.http.put<ComplaintResponse>(`/api/admin/complaints/${complaintId}/reject`, {});
  }

  /** Бан назавжди: ендпоінта для зняття немає. */
  blockUser(userId: number, reason: string | null): Observable<BlockedUser> {
    return this.http.put<BlockedUser>(`/api/admin/users/${userId}/block`, { reason });
  }

  getBlockedUsers(page = 0, size = AdminService.PAGE_SIZE): Observable<BlockedUser[]> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<BlockedUser[]>('/api/admin/users/blocked', { params });
  }

  deleteUser(userId: number): Observable<unknown> {
    return this.http.delete(`/api/admin/users/${userId}`);
  }
}
