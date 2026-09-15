import { Component, ElementRef, OnDestroy, computed, inject, signal, viewChildren } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { messageOf, retryAfterOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { AuthLayout } from '../../layout/auth-layout/auth-layout';

/** Скільки секунд не можна просити новий код — щоб не бити в ліміт бекенду. */
const RESEND_COOLDOWN = 30;

@Component({
  selector: 'app-verify-code',
  imports: [ReactiveFormsModule, AuthLayout],
  templateUrl: './verify-code.html',
  styleUrl: './verify-code.css',
})
export class VerifyCode implements OnDestroy {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  private readonly boxes = viewChildren<ElementRef<HTMLInputElement>>('box');

  readonly email = this.auth.pendingEmail();
  /** Шість окремих клітинок; у формі лежить їхня склейка. */
  readonly digits = signal<string[]>(['', '', '', '', '', '']);

  readonly form = this.fb.nonNullable.group({
    verificationCode: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly resent = signal(false);
  readonly cooldown = signal(0);
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  /** Секунди читаються добре лише до хвилини; далі показуємо хвилини. */
  readonly cooldownLabel = computed(() => {
    const left = this.cooldown();
    if (left <= 0) return '';
    return left < 60 ? `${left} с` : `${Math.ceil(left / 60)} хв`;
  });

  constructor() {
    // Пароль живе лише в памʼяті сервісу, тож після перезавантаження сторінки
    // завершити реєстрацію нічим — повертаємо людину на початок.
    if (!this.email) this.router.navigate(['/register']);
  }

  ngOnDestroy(): void {
    this.stopCooldown();
  }

  onDigit(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '');

    // Вставка всього коду одразу: розкладаємо по клітинках
    if (value.length > 1) {
      this.fill(value.slice(0, 6));
      return;
    }

    this.setDigit(index, value);
    if (value) this.focus(index + 1);
  }

  onKey(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits()[index]) {
      this.focus(index - 1);
    }
  }

  submit(): void {
    if (this.form.invalid || this.loading()) return;

    this.loading.set(true);
    this.error.set(null);

    this.auth.verifyAndLogin(this.form.getRawValue().verificationCode).subscribe({
      next: () => this.router.navigate(['/profile/edit']),
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося підтвердити код.'));
        this.loading.set(false);
      },
    });
  }

  resend(): void {
    if (this.cooldown() > 0) return;

    this.auth.resendCode().subscribe({
      next: () => {
        this.resent.set(true);
        this.startCooldown();
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося надіслати код ще раз.'));

        // Уперлись у ліміт бекенду — тримаємо кнопку вимкненою рівно стільки,
        // скільки сказав сервер. Інакше вона оживала б щопівхвилини й давала
        // натискати лише для того, щоб знову отримати ту саму відмову.
        const wait = retryAfterOf(err);
        if (wait !== null) this.startCooldown(wait);
      },
    });
  }

  private startCooldown(seconds = RESEND_COOLDOWN): void {
    this.stopCooldown();
    this.cooldown.set(seconds);

    this.cooldownTimer = setInterval(() => {
      this.cooldown.update((value) => value - 1);
      if (this.cooldown() <= 0) this.stopCooldown();
    }, 1000);
  }

  private stopCooldown(): void {
    if (this.cooldownTimer !== null) {
      clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  private fill(code: string): void {
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < code.length; i++) next[i] = code[i];

    this.digits.set(next);
    this.sync();
    this.focus(Math.min(code.length, 5));
  }

  private setDigit(index: number, value: string): void {
    this.digits.update((list) => {
      const copy = [...list];
      copy[index] = value;
      return copy;
    });
    this.sync();
  }

  private sync(): void {
    this.form.controls.verificationCode.setValue(this.digits().join(''));
  }

  private focus(index: number): void {
    this.boxes()[index]?.nativeElement.focus();
  }
}
