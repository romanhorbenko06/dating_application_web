import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, of, switchMap } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { messageOf } from '../../core/api-error';
import { FeedService } from '../../core/feed.service';
import { DATING_GOAL_OPTIONS, DatingGoal, GENDER_OPTIONS, Gender } from '../../core/models/enums';
import { FeedFilters, PublicProfile } from '../../core/models/profile.models';
import { TagResponse } from '../../core/models/tag.models';
import { ModerationService } from '../../core/moderation.service';
import {
  EMPTY,
  ageFrom,
  childrenLabel,
  educationLabel,
  genderLabel,
  goalLabel,
  temperamentLabel,
} from '../../core/profile-format';
import { ProfileService } from '../../core/profile.service';
import { RequestService } from '../../core/request.service';
import { TagService } from '../../core/tag.service';
import { AppShell } from '../../layout/app-shell/app-shell';

/** UC-06 / UC-07 / UC-08: стрічка анкет, лайк і пропуск. */
@Component({
  selector: 'app-feed',
  imports: [ReactiveFormsModule, RouterLink, AppShell],
  templateUrl: './feed.html',
  styleUrl: './feed.css',
})
export class Feed implements OnInit {
  private fb = inject(FormBuilder);
  private feedService = inject(FeedService);
  private tagService = inject(TagService);
  private moderation = inject(ModerationService);
  private requests = inject(RequestService);
  private profileService = inject(ProfileService);

  readonly genders = GENDER_OPTIONS;
  readonly goals = DATING_GOAL_OPTIONS;

  readonly profile = signal<PublicProfile | null>(null);
  /** Хто йде за поточною анкетою — смуга «далі у стрічці», разом із часткою збігу. */
  readonly upcoming = signal<{ profile: PublicProfile; percent: number | null }[]>([]);
  readonly tags = signal<TagResponse[]>([]);
  /** Власні теги — щоб показати, скільки інтересів збігається (саме за цим ранжує бекенд). */
  private myTagIds = signal<Set<number>>(new Set());

  readonly loading = signal(true);
  readonly exhausted = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  /** Значок біля повідомлення: серце для симпатії, пісочний годинник для черги. */
  readonly noticeIcon = signal('♡');
  readonly busy = signal(false);

  /** Скільки людей чекають на вашу відповідь — показуємо, коли стрічка порожня. */
  readonly incomingCount = signal(0);
  /** Пропущені анкети з деталями — їх можна переглянути ще раз. */
  readonly skipped = signal<{ profile: PublicProfile; percent: number | null }[]>([]);
  readonly skippedTotal = signal(0);
  readonly filtersOpen = signal(false);
  readonly confirmingBlock = signal(false);
  readonly reporting = signal(false);
  /** Коротка анімація серця після натискання «Вподобати». */
  readonly burst = signal(false);

  /**
   * Обгортка з одного елемента: @for із track за userId змушує Angular
   * пересоздати картку на кожній новій анкеті — інакше анімація появи не повторюється.
   */
  readonly cardList = computed(() => {
    const current = this.profile();
    return current ? [current] : [];
  });

  readonly sharedTags = computed(() => {
    const mine = this.myTagIds();
    return this.tags().filter((tag) => mine.has(tag.tagId));
  });

  readonly myTagCount = computed(() => this.myTagIds().size);

  /**
   * Показник сумісності. У макеті стояв абстрактний відсоток — тут це
   * реальна частка ваших інтересів, які збіглися: бекенд ранжує стрічку
   * саме за кількістю спільних тегів, тож число не вигадане.
   */
  readonly matchPercent = computed(() => {
    const mine = this.myTagCount();
    if (!mine) return null;
    return Math.round((this.sharedTags().length / mine) * 100);
  });

  readonly filterForm = this.fb.nonNullable.group({
    gender: ['' as Gender | ''],
    minAge: [18, [Validators.min(18), Validators.max(120)]],
    maxAge: [120, [Validators.min(18), Validators.max(120)]],
    city: [''],
    datingGoal: ['' as DatingGoal | ''],
  });

  /** Значення повзунка як сигнал — від нього залежать підпис і заповнений відрізок. */
  private readonly filterValue = toSignal(this.filterForm.valueChanges, {
    initialValue: this.filterForm.getRawValue(),
  });

  readonly minAgeValue = computed(() => Number(this.filterValue().minAge ?? 18));
  readonly maxAgeValue = computed(() => Number(this.filterValue().maxAge ?? 120));

  // Доріжка охоплює 18…120 — ті самі межі, що приймає бекенд (@Min 18 / @Max 120)
  readonly rangeLeft = computed(() => ((this.minAgeValue() - 18) / 102) * 100);
  readonly rangeRight = computed(() => 100 - ((this.maxAgeValue() - 18) / 102) * 100);

  /** Кільце сумісності: довжина кола 157, зміщення — це незаповнена частина. */
  readonly donutOffset = computed(() => {
    const percent = this.matchPercent() ?? 0;
    return (157.1 * (100 - percent)) / 100;
  });

  readonly activeFilterCount = computed(() => {
    const value = this.filterValue();
    const ageChanged = Number(value.minAge) !== 18 || Number(value.maxAge) !== 120;
    return [value.gender, value.city, value.datingGoal].filter(Boolean).length + (ageChanged ? 1 : 0);
  });

  readonly reportForm = this.fb.nonNullable.group({
    reason: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
  });

  readonly empty = EMPTY;
  readonly genderLabel = genderLabel;
  readonly goalLabel = goalLabel;
  readonly educationLabel = educationLabel;
  readonly temperamentLabel = temperamentLabel;
  readonly childrenLabel = childrenLabel;

  ngOnInit(): void {
    this.tagService.getMy().subscribe({
      next: (tags) => this.myTagIds.set(new Set(tags.map((tag) => tag.tagId))),
    });
    this.loadNext();
  }

  ageOf(profile: PublicProfile): number | null {
    return ageFrom(profile.dateOfBirth);
  }

  age(profile: PublicProfile): string {
    const years = ageFrom(profile.dateOfBirth);
    return years === null ? EMPTY : `${years}`;
  }

  initial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  applyFilters(): void {
    if (this.filterForm.invalid) return;
    this.filtersOpen.set(false);
    this.loadNext();
  }

  resetFilters(): void {
    this.filterForm.reset({ gender: '', minAge: 18, maxAge: 120, city: '', datingGoal: '' });
    this.loadNext();
  }

  like(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.burst.set(true);

    this.requests.send(target.userId).subscribe({
      next: (request) => {
        // Бекенд одразу перетворює зустрічний лайк на метч і повертає ACCEPTED —
        // тоді «чекаємо на відповідь» було б неправдою: чат уже існує.
        const matched = request.status === 'ACCEPTED';

        this.noticeIcon.set(matched ? '★' : '♡');
        this.notice.set(
          matched
            ? `Взаємно: ${target.name}. Чат уже створено`
            : `Симпатію надіслано: ${target.name}. Чекаємо на відповідь`,
        );
        // Даємо серцю доанімуватись, і лише потім міняємо картку
        setTimeout(() => {
          this.burst.set(false);
          this.loadNext();
        }, 420);
      },
      error: (err) => {
        this.burst.set(false);
        this.failAction(err, 'Не вдалося надіслати симпатію.');
      },
    });
  }

  skip(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.requests.skip(target.userId).subscribe({
      next: () => this.loadNext(),
      error: (err) => this.failAction(err, 'Не вдалося пропустити анкету.'),
    });
  }

  submitReport(): void {
    const target = this.profile();
    if (!target || this.reportForm.invalid || this.busy()) return;

    this.busy.set(true);
    this.moderation.fileComplaint(target.userId, this.reportForm.getRawValue().reason).subscribe({
      next: () => {
        this.reporting.set(false);
        this.reportForm.reset();
        this.busy.set(false);
        this.noticeIcon.set('⚑');
        this.notice.set('Скаргу надіслано на розгляд адміністратора');
      },
      error: (err) => this.failAction(err, 'Не вдалося надіслати скаргу.'),
    });
  }

  blockUser(): void {
    const target = this.profile();
    if (!target || this.busy()) return;

    this.busy.set(true);
    this.moderation.blockUser(target.userId).subscribe({
      next: () => {
        this.confirmingBlock.set(false);
        this.noticeIcon.set('⊘');
        this.notice.set(`Заблоковано: ${target.name}. Ця анкета більше не з'явиться у стрічці`);
        this.loadNext();
      },
      error: (err) => this.failAction(err, 'Не вдалося заблокувати користувача.'),
    });
  }

  private loadNext(): void {
    this.loading.set(true);
    this.error.set(null);
    this.exhausted.set(false);
    this.confirmingBlock.set(false);
    this.reporting.set(false);
    this.tags.set([]);

    this.loadUpcoming();

    this.feedService
      .getNext(this.currentFilters())
      .pipe(
        switchMap((profile) => {
          this.profile.set(profile);
          return this.tagService.getForUser(profile.userId).pipe(catchError(() => of([])));
        }),
      )
      .subscribe({
        next: (tags) => {
          this.tags.set(tags);
          this.loading.set(false);
          this.busy.set(false);
        },
        error: (err) => {
          this.profile.set(null);
          this.loading.set(false);
          this.busy.set(false);

          if (this.feedService.isFeedEmpty(err)) {
            this.exhausted.set(true);
            this.loadEmptyState();
          } else {
            this.error.set(messageOf(err, 'Не вдалося завантажити стрічку.'));
          }
        },
      });
  }

  /**
   * Черга анкет. Для кожної рахуємо частку спільних тем — теги доводиться
   * питати окремо на людину, але їх одиниці, тож це дешевше за окремий ендпоінт.
   * Смуга другорядна: будь-яка помилка просто ховає її, не ламаючи стрічку.
   */
  private loadUpcoming(): void {
    this.feedService
      .getUpcoming(this.currentFilters(), 5)
      .pipe(
        map((list) => list.slice(1)),
        switchMap((list) =>
          list.length === 0
            ? of([])
            : forkJoin(
                list.map((profile) =>
                  this.tagService.getForUser(profile.userId).pipe(
                    catchError(() => of([])),
                    map((tags) => ({ profile, percent: this.percentOf(tags) })),
                  ),
                ),
              ),
        ),
        catchError(() => of([])),
      )
      .subscribe({ next: (list) => this.upcoming.set(list) });
  }

  /** Частка ваших інтересів, які збіглися. null — коли своїх тегів ще немає. */
  private percentOf(theirTags: TagResponse[]): number | null {
    const mine = this.myTagIds();
    if (mine.size === 0) return null;

    const shared = theirTags.filter((tag) => mine.has(tag.tagId)).length;
    return Math.round((shared / mine.size) * 100);
  }

  /**
   * Черга — лише попередній перегляд. Рішення приймається по поточній анкеті,
   * інакше можна було б «перестрибнути» порядок, за яким бекенд ранжує стрічку.
   */
  notYet(name: string): void {
    this.noticeIcon.set('⏳');
    this.notice.set(`${name} — далі в черзі. Вподобати чи пропустити можна лише поточну анкету.`);
  }

  /** Кнопка «Оновити»: перечитати поточну анкету й чергу. */
  refresh(): void {
    this.loadNext();
  }

  /** Скільки тем обрано з повного довідника — підказка на порожній стрічці. */
  readonly tagsChosen = computed(() => this.myTagIds().size);

  /**
   * Дані для порожнього стану. Вантажимо лише тоді, коли стрічка справді
   * вичерпалась: на звичайному екрані ці запити нікому не потрібні.
   */
  private loadEmptyState(): void {
    this.requests.incoming().subscribe({
      next: (list) => this.incomingCount.set(list.length),
      error: () => {},
    });

    this.requests
      .skipped()
      .pipe(
        switchMap((list) => {
          this.skippedTotal.set(list.length);
          const shown = list.slice(0, 4);

          return shown.length === 0
            ? of([])
            : forkJoin(
                shown.map((item) =>
                  forkJoin({
                    profile: this.profileService.getById(item.userId),
                    tags: this.tagService.getForUser(item.userId).pipe(catchError(() => of([]))),
                  }).pipe(
                    map(({ profile, tags }) => ({ profile, percent: this.percentOf(tags) })),
                    catchError(() => of(null)),
                  ),
                ),
              );
        }),
        map((list) => list.filter((item): item is { profile: PublicProfile; percent: number | null } => item !== null)),
        catchError(() => of([])),
      )
      .subscribe({ next: (list) => this.skipped.set(list) });
  }

  private currentFilters(): FeedFilters {
    const value = this.filterForm.getRawValue();

    return {
      gender: value.gender || undefined,
      // 18 і 120 — краї повзунка, тобто «без обмеження»: не шлемо їх у запит
      minAge: Number(value.minAge) > 18 ? Number(value.minAge) : undefined,
      maxAge: Number(value.maxAge) < 120 ? Number(value.maxAge) : undefined,
      city: value.city.trim() || undefined,
      datingGoal: value.datingGoal || undefined,
    };
  }

  private failAction(err: unknown, fallback: string): void {
    this.error.set(messageOf(err, fallback));
    this.busy.set(false);
  }
}
