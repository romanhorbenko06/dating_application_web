import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';

import { messageOf } from '../../core/api-error';
import { canInvite, isMyMove, stepOf, tileBackground } from '../../core/island-format';
import { IslandService } from '../../core/island.service';
import { IslandGame, IslandItemCode } from '../../core/models/island.models';
import { WsService } from '../../core/ws.service';

/** «Острів на двох» у чаті. Гра не заступає чат: поле введення доступне завжди. */
@Component({
  selector: 'app-island-card',
  imports: [RouterLink],
  templateUrl: './island-card.html',
  styleUrl: './island-card.css',
})
export class IslandCard implements OnInit, OnDestroy {
  private island = inject(IslandService);
  private ws = inject(WsService);
  private router = inject(Router);

  readonly chatId = input.required<number>();
  readonly myId = input.required<number | null>();
  readonly companionName = input('');
  readonly emptyChat = input(false);

  readonly game = signal<IslandGame | null>(null);
  readonly loaded = signal(false);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  private readonly items = toSignal(this.island.itemMap());

  readonly myMove = computed(() => isMyMove(this.game(), this.myId()));
  readonly mayInvite = computed(() => canInvite(this.game(), this.myId()));
  readonly invitedMe = computed(() => {
    const game = this.game();
    return game?.status === 'INVITED' && game.invitedById !== this.myId();
  });
  readonly inProgress = computed(() =>
    ['PICKING', 'NIGHT', 'SHORTLIST'].includes(this.game()?.status ?? ''),
  );

  readonly visible = computed(() => {
    const status = this.game()?.status;
    return (
      !!this.error() ||
      status === 'COMPLETED' ||
      status === 'INVITED' ||
      this.inProgress() ||
      this.mayInvite()
    );
  });

  readonly progressText = computed(() => {
    const game = this.game();
    if (!game) return '';
    const who = this.companionName();
    const mine = this.myMove();
    switch (game.status) {
      case 'PICKING':
        return mine ? `Крок ${stepOf(game)} з 5 · ваш хід` : `${who} ще обирає`;
      case 'NIGHT':
        return mine ? 'Набори розкрито · настала ніч' : `Набори розкрито · ${who} думає, що робити вночі`;
      case 'SHORTLIST':
        return mine ? 'Лишилось домовитись про спільний список' : `${who} розглядає вашу пропозицію`;
      default:
        return '';
    }
  });

  private sub?: Subscription;
  private reconnectSub?: Subscription;

  ngOnInit(): void {
    this.reload();
    this.sub = this.ws.events.subscribe((event) => {
      if (event.type === 'ISLAND_UPDATED' && event.payload.chatId === this.chatId()) {
        this.game.set(event.payload);
      }
    });
    this.reconnectSub = this.ws.reconnected.subscribe(() => this.reload());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.reconnectSub?.unsubscribe();
  }

  title(code: IslandItemCode): string {
    return this.items()?.get(code)?.title ?? code;
  }

  tile(code: IslandItemCode): string {
    return tileBackground(code);
  }

  invite(): void {
    this.act(this.island.invite(this.chatId()), false);
  }

  accept(): void {
    this.act(this.island.accept(this.chatId()), true);
  }

  decline(): void {
    this.act(this.island.decline(this.chatId()), false);
  }

  private act(request: ReturnType<IslandService['invite']>, openGame: boolean): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    request.subscribe({
      next: (game) => {
        this.game.set(game);
        this.busy.set(false);
        if (openGame) this.router.navigate(['/chats', this.chatId(), 'island']);
      },
      error: (err) => {
        this.error.set(messageOf(err, 'Не вдалося. Спробуйте ще раз.'));
        this.busy.set(false);
        this.reload();
      },
    });
  }

  private reload(): void {
    this.island.current(this.chatId()).subscribe({
      next: (game) => {
        this.game.set(game);
        this.loaded.set(true);
      },
      // Якщо гра не завантажилась, чат працює як завжди
      error: () => this.loaded.set(true),
    });
  }
}
