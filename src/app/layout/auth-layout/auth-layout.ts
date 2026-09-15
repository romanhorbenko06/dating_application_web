import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Обгортка гостьових екранів: шапка з логотипом і картка по центру. */
@Component({
  selector: 'app-auth-layout',
  imports: [RouterLink],
  templateUrl: './auth-layout.html',
  styleUrl: './auth-layout.css',
})
export class AuthLayout {
  readonly heading = input.required<string>();
  readonly subheading = input('');
  /** Ширша картка потрібна формі з полями у два стовпці. */
  readonly wide = input(false);
  /** Емодзі-значок над заголовком: екран підтвердження пошти показує конверт. */
  readonly icon = input('');
}
