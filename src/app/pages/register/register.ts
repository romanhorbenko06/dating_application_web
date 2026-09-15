import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';


import { fieldErrorsOf, messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { DATING_GOAL_OPTIONS, DatingGoal, GENDER_OPTIONS, Gender } from '../../core/models/enums';
import { adultValidator, passwordsMatch } from '../../core/validators';

/** Умови використання та політика конфіденційності (Google Drive). */
const TERMS_URL =
  'https://drive.google.com/file/d/1oOsd3jnI8IZkpNruF8oAumBxWVccThRn/view?usp=sharing';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  /**
   * Документ з умовами та політикою конфіденційності. Лежить окремо від застосунку,
   * тож редакцію можна оновити, не перезбираючи фронт.
   */
  readonly termsUrl = TERMS_URL;

  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly genders = GENDER_OPTIONS;
  readonly goals = DATING_GOAL_OPTIONS;

  // Обмеження дзеркалять анотації RegisterRequest на бекенді:
  // помилку однаково зловить сервер, але показати її одразу — швидше й дешевше.
  readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
      gender: ['' as Gender | '', [Validators.required]],
      dateOfBirth: ['', [Validators.required, adultValidator]],
      city: ['', [Validators.maxLength(100)]],
      datingGoal: ['' as DatingGoal | '', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
      confirmPassword: ['', [Validators.required]],
      // FR-3.2: згоду бекенд не зберігає, галочка лише блокує кнопку
      acceptTerms: [false, [Validators.requiredTrue]],
    },
    { validators: passwordsMatch('password', 'confirmPassword') },
  );

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly serverFieldErrors = signal<Record<string, string>>({});

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);
    this.serverFieldErrors.set({});

    const value = this.form.getRawValue();

    const request = {
      email: value.email,
      name: value.name,
      gender: value.gender as Gender,
      dateOfBirth: value.dateOfBirth,
      city: value.city || undefined,
      datingGoal: value.datingGoal as DatingGoal,
    };

    this.auth.register(request, value.password).subscribe({
      next: () => this.router.navigate(['/verify']),
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося зареєструватися.'));
        this.serverFieldErrors.set(fieldErrorsOf(err));
        this.loading.set(false);
      },
    });
  }
}
