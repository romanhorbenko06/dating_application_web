import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';

/**
 * UC-03: інформаційна сторінка. Єдиний екран, доступний БЕЗ токена,
 * тому гвардії на маршруті немає, а вміст підлаштовується під те,
 * увійшов відвідувач чи ні.
 */
@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  private auth = inject(AuthService);

  readonly isLoggedIn = this.auth.isLoggedIn;
  readonly isAdmin = this.auth.isAdmin;

  /**
   * Прокрутка до секції за якорем. Робимо це вручну, а не голим href:
   * Angular Router перехоплює зміну адреси з фрагментом, і рідний перехід
   * по якорю в застосунку спрацьовує ненадійно. Заразом отримуємо плавність.
   */
  scrollTo(event: Event, sectionId: string): void {
    event.preventDefault();

    const target = document.getElementById(sectionId);
    if (!target) return;

    // Повага до системного налаштування «менше руху» — там прокрутка миттєва
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
}
