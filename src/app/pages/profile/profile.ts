import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription, forkJoin, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { PhotoGallery } from '../../components/photo-gallery/photo-gallery';
import { AppShell } from '../../layout/app-shell/app-shell';
import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { BlockResponse } from '../../core/models/block.models';
import { PhotoContent } from '../../core/models/photo.models';
import { TagResponse } from '../../core/models/tag.models';
import { ModerationService } from '../../core/moderation.service';
import { PhotoService } from '../../core/photo.service';
import { RequestService } from '../../core/request.service';
import {
  EMPTY,
  ageFrom,
  formatDate,
  childrenLabel,
  educationLabel,
  genderLabel,
  goalLabel,
  plural,
  profileCompleteness,
  temperamentLabel,
} from '../../core/profile-format';
import { TagService } from '../../core/tag.service';
import { UserService } from '../../core/user.service';
import { WsService } from '../../core/ws.service';

interface Todo {
  text: string;
  done: boolean;
}

const ENOUGH_TAGS = 5;

@Component({
  selector: 'app-profile',
  imports: [RouterLink, PhotoGallery, AppShell],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private photoService = inject(PhotoService);
  private tagService = inject(TagService);
  private requests = inject(RequestService);
  private chatService = inject(ChatService);
  private moderation = inject(ModerationService);
  private userService = inject(UserService);
  private router = inject(Router);
  private ws = inject(WsService);

  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  readonly user = this.auth.currentUser;
  readonly photos = signal<PhotoContent[]>([]);
  readonly tags = signal<TagResponse[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly maxPhotos = PhotoService.MAX_PHOTOS;

  /** Єдине місце, звідки блокування можна зняти. */
  readonly blocks = signal<BlockResponse[]>([]);
  readonly unblocking = signal<number | null>(null);
  readonly blockError = signal<string | null>(null);

  readonly confirmingDelete = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);

  /** Накопичувально, інакше плитка обнулялась би після розбору симпатій. */
  readonly incomingLikes = signal(0);
  /** Чат створюється саме в момент метчу. */
  readonly matches = signal(0);

  readonly empty = EMPTY;
  readonly genderLabel = genderLabel;
  readonly goalLabel = goalLabel;
  readonly educationLabel = educationLabel;
  readonly temperamentLabel = temperamentLabel;
  readonly childrenLabel = childrenLabel;
  readonly formatDate = formatDate;

  readonly completeness = computed(() =>
    profileCompleteness(this.user(), this.photos().length, this.tags().length),
  );

  readonly todos = computed<Todo[]>(() => {
    const photosLeft = this.maxPhotos - this.photos().length;
    const tagsLeft = ENOUGH_TAGS - this.tags().length;
    const hasBio = !!this.user()?.characterisation;

    return [
      {
        text:
          photosLeft > 0
            ? `Додати ще ${photosLeft} ${plural(photosLeft, 'світлину', 'світлини', 'світлин')}`
            : `Усі ${this.maxPhotos} світлин на місці`,
        done: photosLeft <= 0,
      },
      {
        text:
          tagsLeft > 0
            ? `Обрати ще ${tagsLeft} ${plural(tagsLeft, 'інтерес', 'інтереси', 'інтересів')}`
            : 'Інтересів достатньо для ранжування',
        done: tagsLeft <= 0,
      },
      {
        text: hasBio ? 'Заповнити «Про себе»' : 'Заповнити «Про себе» — головний текст анкети',
        done: hasBio,
      },
    ];
  });

  ngOnInit(): void {
    this.ws.connect();

    // Лічильники живі: поки анкета відкрита, симпатія може прийти або стати взаємною.
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type !== 'NOTIFICATION') return;
      if (event.payload.type === 'NEW_LIKE' || event.payload.type === 'NEW_MATCH') {
        this.refreshCounters();
      }
    });
    // Під час обриву події губляться — після повернення перечитуємо
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.refreshCounters());

    // Лічильники другорядні — їхня помилка не має ламати анкету
    this.auth
      .loadCurrentUser()
      .pipe(
        switchMap((user) =>
          forkJoin({
            photos: this.photoService.getPhotoContents(user.userId),
            tags: this.tagService.getMy(),
            likeCount: this.requests.incomingCount().pipe(catchError(() => of(0))),
            chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
            blocks: this.moderation.myBlocks().pipe(catchError(() => of([]))),
          }),
        ),
      )
      .subscribe({
        next: ({ photos, tags, likeCount, chats, blocks }) => {
          this.photos.set(photos);
          this.tags.set(tags);
          this.incomingLikes.set(likeCount);
          this.matches.set(chats.length);
          this.blocks.set(blocks);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(messageOf(err, 'Не вдалося завантажити анкету.'));
          this.loading.set(false);
        },
      });
  }

  age(): string {
    const years = ageFrom(this.user()?.dateOfBirth ?? null);
    return years === null ? EMPTY : `${years}`;
  }

  initial(): string {
    return this.user()?.name.charAt(0).toUpperCase() ?? '?';
  }

  ngOnDestroy(): void {
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  private refreshCounters(): void {
    forkJoin({
      likeCount: this.requests.incomingCount().pipe(catchError(() => of(0))),
      chats: this.chatService.getChats(0, ChatService.ALL_CHATS).pipe(catchError(() => of([]))),
    }).subscribe(({ likeCount, chats }) => {
      this.incomingLikes.set(likeCount);
      this.matches.set(chats.length);
    });
  }

  mainPhoto() {
    return this.photos().find((photo) => photo.isMain) ?? this.photos()[0] ?? null;
  }

  blockedOn(iso: string): string {
    return formatDate(iso);
  }

  unblock(block: BlockResponse): void {
    if (this.unblocking() !== null) return;

    this.unblocking.set(block.blockedUserId);
    this.blockError.set(null);

    this.moderation.unblockUser(block.blockedUserId).subscribe({
      next: () => {
        this.blocks.update((list) => list.filter((b) => b.blockId !== block.blockId));
        this.unblocking.set(null);
      },
      error: (err) => {
        this.blockError.set(messageOf(err, 'Не вдалося зняти блокування.'));
        this.unblocking.set(null);
      },
    });
  }

  /** Токен гасимо локально: користувача вже немає, і /logout дав би помилку. */
  deleteAccount(): void {
    const userId = this.user()?.userId;
    if (!userId || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);

    this.userService.deleteAccount(userId).subscribe({
      next: () => {
        this.auth.clearSession();
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.deleteError.set(messageOf(err, 'Не вдалося видалити акаунт.'));
        this.deleting.set(false);
        this.confirmingDelete.set(false);
      },
    });
  }
}
