import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';

import { AdminService } from '../../core/admin.service';
import { messageOf } from '../../core/api-error';
import { BlockedUser, ComplaintResponse, ComplaintStatus } from '../../core/models/admin.models';
import { AppShell } from '../../layout/app-shell/app-shell';

type Tab = 'complaints' | 'blocked';

/** Кого саме модеруємо у відкритій модалці. */
interface Target {
  userId: number;
  name: string;
}

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  PENDING: 'Нова',
  REVIEWED: 'На розгляді',
  RESOLVED: 'Підтверджена',
  REJECTED: 'Безпідставна',
};

const STATUS_CLASS: Record<ComplaintStatus, string> = {
  PENDING: 'status-new',
  REVIEWED: 'status-review',
  RESOLVED: 'status-done',
  REJECTED: 'status-rejected',
};

/** UC-13 і UC-14: розгляд скарг, бан і видалення акаунтів. */
@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, RouterLink, AppShell],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit {
  private service = inject(AdminService);
  private fb = inject(FormBuilder);

  readonly statuses: (ComplaintStatus | '')[] = ['', 'PENDING', 'REVIEWED', 'RESOLVED', 'REJECTED'];

  readonly tab = signal<Tab>('complaints');
  readonly filter = signal<ComplaintStatus | ''>('PENDING');

  readonly complaints = signal<ComplaintResponse[]>([]);
  readonly blocked = signal<BlockedUser[]>([]);
  /** Повний перелік — потрібен для лічильників, які не залежать від фільтра. */
  private allComplaints = signal<ComplaintResponse[]>([]);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly busyId = signal<number | null>(null);

  readonly banTarget = signal<Target | null>(null);
  readonly deleteTarget = signal<Target | null>(null);

  readonly stats = computed(() => {
    const all = this.allComplaints();
    return {
      total: all.length,
      pending: all.filter((c) => c.status === 'PENDING').length,
      reviewed: all.filter((c) => c.status === 'REVIEWED').length,
      resolved: all.filter((c) => c.status === 'RESOLVED').length,
    };
  });

  readonly banForm = this.fb.nonNullable.group({
    reason: ['', [Validators.maxLength(500)]],
  });

  ngOnInit(): void {
    this.loadComplaints();
    this.refreshStats();
  }

  switchTab(tab: Tab): void {
    this.tab.set(tab);
    this.error.set(null);
    this.notice.set(null);

    if (tab === 'complaints') this.loadComplaints();
    else this.loadBlocked();
  }

  setFilter(status: ComplaintStatus | ''): void {
    this.filter.set(status);
    this.loadComplaints();
  }

  statusLabel(status: ComplaintStatus): string {
    return STATUS_LABELS[status] ?? status;
  }

  statusClass(status: ComplaintStatus): string {
    return STATUS_CLASS[status] ?? 'status-new';
  }

  when(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('uk-UA');
  }

  // --- Скарги ---

  review(complaint: ComplaintResponse): void {
    this.runOnComplaint(complaint, this.service.review(complaint.complaintId), 'взято на розгляд');
  }

  resolve(complaint: ComplaintResponse): void {
    this.runOnComplaint(complaint, this.service.resolve(complaint.complaintId), 'підтверджено');
  }

  reject(complaint: ComplaintResponse): void {
    this.runOnComplaint(
      complaint,
      this.service.reject(complaint.complaintId),
      'визнано безпідставною',
    );
  }

  // --- Санкції ---

  startBan(complaint: ComplaintResponse): void {
    this.banTarget.set({ userId: complaint.reportedUserId, name: complaint.reportedUserName });
    this.deleteTarget.set(null);
    this.banForm.reset();
  }

  startDelete(complaint: ComplaintResponse): void {
    this.deleteTarget.set({ userId: complaint.reportedUserId, name: complaint.reportedUserName });
    this.banTarget.set(null);
  }

  closeModal(): void {
    this.banTarget.set(null);
    this.deleteTarget.set(null);
  }

  confirmBan(): void {
    const target = this.banTarget();
    if (!target || this.busyId() !== null) return;

    this.busyId.set(target.userId);
    const reason = this.banForm.getRawValue().reason.trim() || null;

    this.service.blockUser(target.userId, reason).subscribe({
      next: (user) => {
        this.notice.set(`Заблоковано назавжди: ${user.name}. Активні сесії розірвано.`);
        this.closeModal();
        this.busyId.set(null);
        this.loadComplaints();
      },
      error: (err) => this.fail(err, 'Не вдалося заблокувати акаунт.'),
    });
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target || this.busyId() !== null) return;

    this.busyId.set(target.userId);

    this.service.deleteUser(target.userId).subscribe({
      next: () => {
        this.notice.set(`Акаунт видалено разом з усіма даними: ${target.name}.`);
        this.closeModal();
        this.busyId.set(null);
        this.loadComplaints();
        this.refreshStats();
      },
      error: (err) => this.fail(err, 'Не вдалося видалити акаунт.'),
    });
  }

  private loadComplaints(): void {
    this.loading.set(true);
    const status = this.filter();

    this.service.getComplaints(status || undefined).subscribe({
      next: (complaints) => {
        this.complaints.set(complaints);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити скарги.'));
        this.loading.set(false);
      },
    });
  }

  private refreshStats(): void {
    this.service.getComplaints().subscribe({ next: (all) => this.allComplaints.set(all) });
  }

  private loadBlocked(): void {
    this.loading.set(true);

    this.service.getBlockedUsers().subscribe({
      next: (blocked) => {
        this.blocked.set(blocked);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити список заблокованих.'));
        this.loading.set(false);
      },
    });
  }

  private runOnComplaint(
    complaint: ComplaintResponse,
    action: Observable<ComplaintResponse>,
    what: string,
  ): void {
    if (this.busyId() !== null) return;

    this.busyId.set(complaint.complaintId);
    this.error.set(null);

    action.subscribe({
      next: (updated) => {
        this.complaints.update((list) =>
          list.map((c) => (c.complaintId === updated.complaintId ? updated : c)),
        );
        this.notice.set(`Скаргу №${updated.complaintId} ${what}.`);
        this.busyId.set(null);
        this.refreshStats();
        // Під активним фільтром оновлена скарга могла з нього випасти
        if (this.filter()) this.loadComplaints();
      },
      error: (err) => this.fail(err, 'Не вдалося оновити скаргу.'),
    });
  }

  private fail(err: unknown, fallback: string): void {
    this.error.set(messageOf(err, fallback));
    this.busyId.set(null);
  }
}
