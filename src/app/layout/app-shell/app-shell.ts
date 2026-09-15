import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { WsService } from '../../core/ws.service';

/**
 * Каркас закритої частини: бічна панель + область вмісту.
 * Тут же живе єдине WebSocket-з'єднання й лічильник непрочитаних —
 * панель присутня на кожному екрані, тож це найприродніше місце.
 */
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

  /**
   * Сторінки-«робочі столи» (переписка) просять більше ширини: на широкому екрані
   * звичайна стеля контенту лишає по краях порожнечу, якої переписці бракує.
   */
  readonly wide = input(false);

  readonly unreadCount = this.notifications.unreadCount;
  readonly isAdmin = this.auth.isAdmin;
  readonly user = this.auth.currentUser;

  readonly initial = computed(() => this.user()?.name.charAt(0).toUpperCase() ?? '');

  /** На вузькому екрані панель ховається й відкривається кнопкою. */
  readonly menuOpen = signal(false);

  ngOnInit(): void {
    // Адміністратор не має ні чатів, ні сповіщень — сокет і лічильник йому ні до чого
    if (!this.isAdmin()) {
      this.ws.connect();
      this.notifications.refreshUnread();
    }

    // Ім'я для картки внизу панелі; на більшості екранів воно вже завантажене
    if (!this.user()) this.auth.loadCurrentUser().subscribe({ error: () => {} });
  }

  logout(): void {
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }
}
