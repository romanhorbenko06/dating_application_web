import { Component, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, Subscription, forkJoin } from 'rxjs';

import { messageOf } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ChatService } from '../../core/chat.service';
import { ISLAND_STEPS, canInvite, clock, stepOf, tileBackground } from '../../core/island-format';
import { IslandService } from '../../core/island.service';
import { ChatResponse } from '../../core/models/chat.models';
import { IslandGame, IslandItem, IslandItemCode } from '../../core/models/island.models';
import { WsService } from '../../core/ws.service';
import { AppShell } from '../../layout/app-shell/app-shell';

/** Таймер лише підказка: сервер його не рахує. */
const PICK_SECONDS = 60;

type Screen =
  | 'lobby'
  | 'pick'
  | 'guess'
  | 'waitRound'
  | 'night'
  | 'shortlist'
  | 'done';

/** Сторінка партії «Острова на двох». Правила живуть на бекенді, зміни партнера приходять сокетом. */
@Component({
  selector: 'app-island',
  imports: [NgTemplateOutlet, RouterLink, AppShell],
  templateUrl: './island.html',
  styleUrl: './island.css',
})
export class Island implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private island = inject(IslandService);
  private chatService = inject(ChatService);
  private auth = inject(AuthService);
  private ws = inject(WsService);

  readonly chatId = Number(this.route.snapshot.paramMap.get('id'));
  readonly steps = Array.from({ length: ISLAND_STEPS }, (_, i) => i + 1);

  readonly game = signal<IslandGame | null>(null);
  readonly chat = signal<ChatResponse | null>(null);
  readonly myId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly catalog = toSignal(this.island.items(), { initialValue: [] as IslandItem[] });
  private readonly byCode = computed(() => new Map(this.catalog().map((item) => [item.code, item])));

  readonly selected = signal<IslandItemCode[]>([]);
  readonly note = signal('');
  readonly islandName = signal('');
  readonly nightChoice = signal<number | null>(null);
  readonly secondsLeft = signal(PICK_SECONDS);

  readonly companionName = computed(() => {
    const chat = this.chat();
    if (!chat) return '';
    return chat.user1Id === this.myId() ? chat.user2Name : chat.user1Name;
  });

  readonly screen = computed<Screen>(() => {
    const game = this.game();
    switch (game?.status) {
      case 'PICKING':
        if (!game.myPick) return 'pick';
        if (!game.myGuess) return 'guess';
        return 'waitRound';
      case 'NIGHT':
        return 'night';
      case 'SHORTLIST':
        return 'shortlist';
      case 'COMPLETED':
        return 'done';
      default:
        return 'lobby';
    }
  });

  readonly step = computed(() => stepOf(this.game()));

  readonly headTitle = computed(() => {
    switch (this.screen()) {
      case 'pick':
        return 'Оберіть 3 предмети';
      case 'guess':
        return `Що обрав(-ла) ${this.companionName()}?`;
      case 'waitRound':
        return 'Ваш хід зараховано';
      case 'night':
        return 'Розкриття й ніч на острові';
      case 'shortlist':
        // «із», бо в Playfair «з» між цифрами схоже на трійку
        return `Спільний список: лишаємо ${this.game()?.keepCount ?? ''} із ${this.game()?.shortlistPool?.length ?? ''}`;
      case 'done':
        return 'Ваш острів';
      default:
        return 'Острів на двох';
    }
  });

  readonly timerOn = computed(() => this.screen() === 'pick' || this.screen() === 'guess');
  readonly timerText = computed(() => clock(this.secondsLeft()));

  readonly need = computed(() =>
    this.screen() === 'shortlist' ? (this.game()?.keepCount ?? 0) : 3,
  );

  readonly slots = computed(() => {
    const chosen = this.selected();
    return Array.from({ length: this.need() }, (_, i) => chosen[i] ?? null);
  });

  readonly ready = computed(() => this.selected().length === this.need());

  readonly gridItems = computed<IslandItemCode[]>(() => {
    if (this.screen() === 'shortlist') return this.game()?.shortlistPool ?? [];
    return this.catalog().map((item) => item.code);
  });

  readonly mayInvite = computed(() => canInvite(this.game(), this.myId()));
  readonly invitedMe = computed(() => {
    const game = this.game();
    return game?.status === 'INVITED' && game.invitedById !== this.myId();
  });

  readonly myHits = computed(() => this.game()?.myGuessHits ?? []);
  readonly theirHits = computed(() => this.game()?.partnerGuessHits ?? []);

  /** Предмет партнера, якого ви не брали; якщо все збіглось — його перший. */
  readonly talkingPoint = computed<IslandItemCode | null>(() => {
    const game = this.game();
    const theirs = game?.partnerPick ?? [];
    const mine = game?.myPick ?? [];
    return theirs.find((code) => !mine.includes(code)) ?? theirs[0] ?? null;
  });

  readonly matchesPartner = computed(() => {
    const partner = this.game()?.partnerProposal;
    if (!partner) return false;
    const mine = new Set(this.selected());
    return (
      partner.items.length === mine.size &&
      partner.items.every((code) => mine.has(code)) &&
      this.normalize(partner.name) === this.normalize(this.islandName())
    );
  });

  readonly proposed = computed(() => !!this.game()?.myProposal);

  private timer: ReturnType<typeof setInterval> | null = null;
  private wsSub?: Subscription;
  private reconnectSub?: Subscription;

  constructor() {
    // Спільний список стартує з уже зданої власної пропозиції.
    effect(() => {
      const screen = this.screen();
      const game = this.game();
      this.resetFor(screen, game);
    });
  }

  ngOnInit(): void {
    forkJoin({
      me: this.auth.loadCurrentUser(),
      chat: this.chatService.getChat(this.chatId),
      game: this.island.current(this.chatId),
    }).subscribe({
      next: ({ me, chat, game }) => {
        this.myId.set(me.userId);
        this.chat.set(chat);
        this.game.set(game);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося відкрити гру.'));
        this.loading.set(false);
      },
    });

    this.ws.connect();
    this.wsSub = this.ws.events.subscribe((event) => {
      if (event.type === 'ISLAND_UPDATED' && event.payload.chatId === this.chatId) {
        this.game.set(event.payload);
      }
    });
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.reload());
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.wsSub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  title(code: IslandItemCode): string {
    return this.byCode().get(code)?.title ?? code;
  }

  trait(code: IslandItemCode): string {
    return this.byCode().get(code)?.trait ?? '';
  }

  tile(code: IslandItemCode): string {
    return tileBackground(code);
  }

  titles(codes: IslandItemCode[] | null | undefined): string {
    return (codes ?? []).map((code) => this.title(code)).join(', ');
  }

  isSelected(code: IslandItemCode): boolean {
    return this.selected().includes(code);
  }

  isShared(code: IslandItemCode): boolean {
    return (this.game()?.sharedItems ?? []).includes(code);
  }

  option(index: number | null | undefined): string {
    if (index == null) return '';
    return this.game()?.nightEvent?.options[index] ?? '';
  }

  letter(index: number): string {
    return String.fromCharCode(65 + index);
  }

  toggle(code: IslandItemCode): void {
    this.selected.update((list) => {
      if (list.includes(code)) return list.filter((c) => c !== code);
      if (list.length >= this.need()) return list;
      return [...list, code];
    });
  }

  onNote(event: Event): void {
    this.note.set((event.target as HTMLInputElement).value);
  }

  onName(event: Event): void {
    this.islandName.set((event.target as HTMLInputElement).value);
  }

  takePartnerProposal(): void {
    const partner = this.game()?.partnerProposal;
    if (!partner) return;
    this.selected.set([...partner.items]);
    this.islandName.set(partner.name);
  }

  invite(): void {
    this.run(this.island.invite(this.chatId));
  }

  accept(): void {
    this.run(this.island.accept(this.chatId));
  }

  decline(): void {
    this.run(this.island.decline(this.chatId));
  }

  submitPick(): void {
    if (!this.ready()) return;
    const note = this.note().trim();
    this.run(this.island.pick(this.chatId, this.selected(), note || null));
  }

  submitGuess(): void {
    if (!this.ready()) return;
    this.run(this.island.guess(this.chatId, this.selected()));
  }

  submitNight(): void {
    const choice = this.nightChoice();
    if (choice === null) return;
    this.run(this.island.night(this.chatId, choice));
  }

  submitProposal(): void {
    const name = this.islandName().trim();
    if (!this.ready() || !name) return;
    this.run(this.island.propose(this.chatId, this.selected(), name));
  }

  private run(request: Observable<IslandGame>): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (game) => {
        this.game.set(game);
        this.busy.set(false);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося. Спробуйте ще раз.'));
        this.busy.set(false);
        // Відмова часто означає, що партнер уже змінив стан
        this.reload();
      },
    });
  }

  private reload(): void {
    this.island.current(this.chatId).subscribe({
      next: (game) => this.game.set(game),
      error: () => {},
    });
  }

  private lastScreen: Screen | null = null;

  private resetFor(screen: Screen, game: IslandGame | null): void {
    if (screen === this.lastScreen) return;
    this.lastScreen = screen;

    this.selected.set(screen === 'shortlist' ? [...(game?.myProposal?.items ?? [])] : []);
    this.islandName.set(screen === 'shortlist' ? (game?.myProposal?.name ?? '') : '');
    this.note.set('');
    this.nightChoice.set(null);

    this.stopTimer();
    if (screen === 'pick' || screen === 'guess') {
      this.secondsLeft.set(PICK_SECONDS);
      this.timer = setInterval(() => {
        this.secondsLeft.update((s) => Math.max(0, s - 1));
        if (this.secondsLeft() === 0) this.stopTimer();
      }, 1000);
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private normalize(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}
