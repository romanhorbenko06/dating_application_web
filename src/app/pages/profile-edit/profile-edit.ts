import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { fieldErrorsOf, messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import {
  CHILDREN_STATUS_OPTIONS,
  ChildrenStatus,
  DATING_GOAL_OPTIONS,
  DatingGoal,
  EDUCATION_LEVEL_OPTIONS,
  EducationLevel,
  GENDER_OPTIONS,
  Gender,
  TEMPERAMENT_OPTIONS,
  Temperament,
} from '../../core/models/enums';
import { PhotoContent } from '../../core/models/photo.models';
import { TagResponse } from '../../core/models/tag.models';
import { PhotoService } from '../../core/photo.service';
import { TagService } from '../../core/tag.service';
import { UserService } from '../../core/user.service';
import { AppShell } from '../../layout/app-shell/app-shell';
import { ageFrom, childrenLabel, educationLabel, genderLabel, goalLabel, temperamentLabel } from '../../core/profile-format';
import { adultValidator } from '../../core/validators';

/** Ліміт multipart-запиту на бекенді (spring.servlet.multipart.max-file-size). */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** UC-05: редагування анкети, фотографій та інтересів. */
@Component({
  selector: 'app-profile-edit',
  imports: [ReactiveFormsModule, RouterLink, AppShell],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.css',
})
export class ProfileEdit implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private userService = inject(UserService);
  private photoService = inject(PhotoService);
  private tagService = inject(TagService);

  readonly genders = GENDER_OPTIONS;
  readonly goals = DATING_GOAL_OPTIONS;
  readonly educationLevels = EDUCATION_LEVEL_OPTIONS;
  readonly temperaments = TEMPERAMENT_OPTIONS;
  readonly childrenStatuses = CHILDREN_STATUS_OPTIONS;

  readonly maxPhotos = PhotoService.MAX_PHOTOS;
  readonly acceptedTypes = PhotoService.ACCEPTED_TYPES;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    gender: ['' as Gender | '', [Validators.required]],
    dateOfBirth: ['', [Validators.required, adultValidator]],
    characterisation: ['', [Validators.maxLength(1000)]],
    city: ['', [Validators.maxLength(100)]],
    datingGoal: ['' as DatingGoal | '', [Validators.required]],
    // Необов'язкові: порожній рядок означає «не вказано» і піде на бекенд як null
    educationLevel: ['' as EducationLevel | ''],
    temperament: ['' as Temperament | ''],
    childrenStatus: ['' as ChildrenStatus | ''],
  });

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly serverFieldErrors = signal<Record<string, string>>({});

  readonly photos = signal<PhotoContent[]>([]);
  readonly photoBusy = signal(false);
  readonly photoError = signal<string | null>(null);
  readonly canAddPhoto = computed(() => this.photos().length < this.maxPhotos);

  /** Головне фото — його ж, розмите, показує блок «так вас бачать у стрічці». */
  readonly mainPhoto = computed(
    () => this.photos().find((photo) => photo.isMain) ?? this.photos()[0] ?? null,
  );

  readonly allTags = signal<TagResponse[]>([]);
  readonly myTags = signal<TagResponse[]>([]);
  readonly tagSearch = signal('');
  readonly tagError = signal<string | null>(null);

  /** Довідник мінус уже обрані, звужений пошуком; показуємо не більше 40 за раз. */
  readonly availableTags = computed(() => {
    const chosen = new Set(this.myTags().map((tag) => tag.tagId));
    const query = this.tagSearch().trim().toLowerCase();

    return this.allTags()
      .filter((tag) => !chosen.has(tag.tagId))
      .filter((tag) => !query || tag.tagName.toLowerCase().includes(query))
      .slice(0, 40);
  });

  /**
   * Значення форми як сигнал — на ньому тримається блок «Попередній вигляд»,
   * що оновлюється з кожним натисканням клавіші.
   */
  readonly preview = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  readonly previewAge = computed(() => {
    const years = ageFrom(this.preview().dateOfBirth ?? null);
    return years === null ? null : years;
  });

  readonly previewInitial = computed(() => (this.preview().name || '?').charAt(0).toUpperCase());

  /** Скільки тегів узагалі є в довіднику — підпис до пошуку рахуємо, а не вписуємо. */
  readonly tagTotal = computed(() => this.allTags().length);

  readonly genderLabel = genderLabel;
  readonly goalLabel = goalLabel;
  readonly educationLabel = educationLabel;
  readonly temperamentLabel = temperamentLabel;
  readonly childrenLabel = childrenLabel;

  constructor() {
    this.form.valueChanges.subscribe(() => this.saved.set(false));
  }

  ngOnInit(): void {
    forkJoin({
      user: this.auth.loadCurrentUser(),
      allTags: this.tagService.getAll(),
      myTags: this.tagService.getMy(),
    }).subscribe({
      next: ({ user, allTags, myTags }) => {
        this.form.patchValue({
          name: user.name,
          gender: user.gender ?? '',
          dateOfBirth: user.dateOfBirth ?? '',
          characterisation: user.characterisation ?? '',
          city: user.city ?? '',
          datingGoal: user.datingGoal ?? '',
          educationLevel: user.educationLevel ?? '',
          temperament: user.temperament ?? '',
          childrenStatus: user.childrenStatus ?? '',
        });

        this.allTags.set(allTags);
        this.myTags.set(myTags);
        this.loading.set(false);

        // Фото окремим запитом: для нього потрібен id, який щойно приїхав
        this.reloadPhotos();
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося завантажити анкету.'));
        this.loading.set(false);
      },
    });
  }

  save(): void {
    const userId = this.auth.currentUser()?.userId;
    if (this.form.invalid || this.saving() || !userId) return;

    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    this.serverFieldErrors.set({});

    const value = this.form.getRawValue();

    this.userService
      .updateProfile(userId, {
        name: value.name,
        gender: value.gender as Gender,
        dateOfBirth: value.dateOfBirth,
        // PUT замінює анкету цілком, тож порожні поля свідомо надсилаємо як null
        characterisation: value.characterisation || null,
        city: value.city || null,
        datingGoal: value.datingGoal as DatingGoal,
        educationLevel: (value.educationLevel || null) as EducationLevel | null,
        temperament: (value.temperament || null) as Temperament | null,
        childrenStatus: (value.childrenStatus || null) as ChildrenStatus | null,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.saved.set(true);
        },
        error: (err) => {
          this.error.set(messageOf(err, 'Не вдалося зберегти анкету.'));
          this.serverFieldErrors.set(fieldErrorsOf(err));
          this.saving.set(false);
        },
      });
  }

  // --- Фотографії ---

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Скидаємо одразу: інакше повторний вибір того самого файлу не викличе подію
    input.value = '';
    this.photoError.set(null);

    if (file.size > MAX_FILE_BYTES) {
      this.photoError.set('Файл завеликий: максимум 5 МБ.');
      return;
    }
    if (!file.type || !PhotoService.ACCEPTED_TYPES.includes(file.type)) {
      this.photoError.set('Підтримуються лише JPEG, PNG, GIF і BMP.');
      return;
    }

    this.photoBusy.set(true);
    // Перше фото робимо головним автоматично — інакше в стрічці нічого показати
    const isMain = this.photos().length === 0;

    this.photoService.upload(file, isMain).subscribe({
      next: () => this.reloadPhotos(),
      error: (err) => {
        this.photoError.set(messageOf(err, 'Не вдалося завантажити фото.'));
        this.photoBusy.set(false);
      },
    });
  }

  deletePhoto(photoId: number): void {
    this.photoBusy.set(true);
    this.photoError.set(null);

    this.photoService.delete(photoId).subscribe({
      next: () => this.reloadPhotos(),
      error: (err) => {
        this.photoError.set(messageOf(err, 'Не вдалося видалити фото.'));
        this.photoBusy.set(false);
      },
    });
  }

  setMainPhoto(photoId: number): void {
    this.photoBusy.set(true);
    this.photoError.set(null);

    this.photoService.setMain(photoId).subscribe({
      next: () => this.reloadPhotos(),
      error: (err) => {
        this.photoError.set(messageOf(err, 'Не вдалося змінити головне фото.'));
        this.photoBusy.set(false);
      },
    });
  }

  private reloadPhotos(): void {
    const userId = this.auth.currentUser()?.userId;
    if (!userId) return;

    this.photoService.getPhotoContents(userId).subscribe({
      next: (photos) => {
        this.photos.set(photos);
        this.photoBusy.set(false);
      },
      error: (err) => {
        this.photoError.set(messageOf(err, 'Не вдалося завантажити фотографії.'));
        this.photoBusy.set(false);
      },
    });
  }

  // --- Теги ---

  onTagSearch(event: Event): void {
    this.tagSearch.set((event.target as HTMLInputElement).value);
  }

  addTag(tag: TagResponse): void {
    this.tagError.set(null);
    // Оптимістично: список перемальовується одразу, при помилці відкочуємо
    this.myTags.update((tags) => [...tags, tag]);

    this.tagService.add(tag.tagId).subscribe({
      error: (err) => {
        this.myTags.update((tags) => tags.filter((t) => t.tagId !== tag.tagId));
        this.tagError.set(messageOf(err, 'Не вдалося додати тег.'));
      },
    });
  }

  removeTag(tag: TagResponse): void {
    this.tagError.set(null);
    this.myTags.update((tags) => tags.filter((t) => t.tagId !== tag.tagId));

    this.tagService.remove(tag.tagId).subscribe({
      error: (err) => {
        this.myTags.update((tags) => [...tags, tag]);
        this.tagError.set(messageOf(err, 'Не вдалося прибрати тег.'));
      },
    });
  }
}
