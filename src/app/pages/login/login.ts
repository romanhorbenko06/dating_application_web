import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthLayout } from '../../layout/auth-layout/auth-layout';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /** Інтерсептор кидає сюди з ?expired=1, коли токен перестав діяти. */
  readonly sessionExpired = this.route.snapshot.queryParamMap.get('expired') === '1';

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/feed';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося увійти.'));
        this.loading.set(false);
      },
    });
  }
}
