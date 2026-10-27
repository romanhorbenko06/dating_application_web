import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { WsService } from '../../core/ws.service';

/** Каркас закритої частини; тут же єдине WebSocket-з'єднання й лічильник непрочитаних. */
@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell implements OnInit {
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);
  private ws = inject(WsService);
  private router = inject(Router);

  readonly wide = input(false);

  readonly unreadCount = this.notifications.unreadCount;
  readonly isAdmin = this.auth.isAdmin;
  readonly user = this.auth.currentUser;

  readonly initial = computed(() => this.user()?.name.charAt(0).toUpperCase() ?? '');

  readonly menuOpen = signal(false);

  ngOnInit(): void {
    if (!this.isAdmin()) {
      this.ws.connect();
      this.notifications.refreshUnread();
    }

    if (!this.user()) this.auth.loadCurrentUser().subscribe({ error: () => {} });
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
