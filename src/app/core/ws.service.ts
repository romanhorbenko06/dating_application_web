import { Injectable, effect, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { AuthService } from './auth.service';
import { WsEvent } from './models/chat.models';

export type WsStatus = 'closed' | 'connecting' | 'open';

/** Raw WebSocket до бекенду. Токен лише в query: рукостискання не носить Authorization. */
@Injectable({ providedIn: 'root' })
export class WsService {
  private auth = inject(AuthService);

  private static readonly PING_INTERVAL_MS = 25_000;

  private static readonly PROBE_TIMEOUT_MS = 5_000;

  private static readonly PING_FRAME = '{"type":"PING"}';

  private socket: WebSocket | null = null;
  private events$ = new Subject<WsEvent>();
  private reconnected$ = new Subject<void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private wanted = false;
  private awaitingPong = false;
  private dropped = false;

  readonly status = signal<WsStatus>('closed');

  constructor() {
    // Токен зник — рвемо сокет, щоб розлогінений не отримував пуші.
    effect(() => {
      if (!this.auth.token()) this.disconnect();
    });

    // Після сну чи зміни мережі сокет може бути «зомбі», тож перевіряємо одразу.
    window.addEventListener('online', () => this.wake());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wake();
    });
  }

  get events(): Observable<WsEvent> {
    return this.events$.asObservable();
  }

  /** Емітить після перепідключення: пропущені пуші бекенд не накопичує, сторінки мають перечитати дані. */
  get reconnected(): Observable<void> {
    return this.reconnected$.asObservable();
  }

  connect(): void {
    const token = this.auth.token();
    if (!token || this.socket) return;

    this.wanted = true;
    this.status.set('connecting');

    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${scheme}://${location.host}/ws/chat?token=${token}`);
    this.socket = socket;

    socket.onopen = () => {
      this.attempt = 0;
      this.status.set('open');
      this.startHeartbeat();

      if (this.dropped) {
        this.dropped = false;
        this.reconnected$.next();
      }
    };

    socket.onmessage = (event) => {
      this.awaitingPong = false;

      try {
        const parsed = JSON.parse(event.data as string) as { type?: string };
        if (parsed.type === 'PONG') return;

        this.events$.next(parsed as WsEvent);
      } catch {
      }
    };

    socket.onclose = () => {
      this.socket = null;
      this.stopHeartbeat();
      this.status.set('closed');

      if (this.wanted) {
        this.dropped = true;
        this.scheduleReconnect();
      }
    };

    // onerror завжди супроводжується onclose — перепідключення там
    socket.onerror = () => socket.close();
  }

  disconnect(): void {
    this.wanted = false;
    this.dropped = false;
    this.clearTimer();
    this.stopHeartbeat();
    this.attempt = 0;

    this.socket?.close();
    this.socket = null;
    this.status.set('closed');
  }

  /** Свій ping, бо ping-фрейми сервера в JS не видно, а мовчазний обрив може не дійти до onclose. */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.awaitingPong = false;
    this.pingTimer = setInterval(() => this.beat(), WsService.PING_INTERVAL_MS);
  }

  private beat(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    // Рахуємо такти, а не час: у фоновій вкладці таймери приспані.
    if (this.awaitingPong) {
      this.dropZombie();
      return;
    }

    this.awaitingPong = true;
    try {
      socket.send(WsService.PING_FRAME);
    } catch {
      this.dropZombie();
    }
  }

  private stopHeartbeat(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearProbe();
    this.awaitingPong = false;
  }

  private wake(): void {
    if (!this.wanted) return;

    if (!this.socket) {
      this.clearTimer();
      this.attempt = 0;
      this.connect();
      return;
    }

    if (this.socket.readyState !== WebSocket.OPEN) return;

    this.awaitingPong = true;
    try {
      this.socket.send(WsService.PING_FRAME);
    } catch {
      this.dropZombie();
      return;
    }

    this.clearProbe();
    this.probeTimer = setTimeout(() => {
      if (this.awaitingPong) this.dropZombie();
    }, WsService.PROBE_TIMEOUT_MS);
  }

  /** Мертвий сокет: перепідключаємось самі, бо onclose може не прийти. */
  private dropZombie(): void {
    const socket = this.socket;
    if (!socket) return;

    this.stopHeartbeat();
    this.socket = null;
    this.status.set('closed');
    this.dropped = true;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try {
      socket.close();
    } catch {
    }

    this.attempt = 0;
    this.scheduleReconnect();
  }

  /** Backoff 1, 2, 4, 8 с, далі не частіше ніж раз на 15 с. */
  private scheduleReconnect(): void {
    if (!this.auth.token()) return;

    this.clearTimer();
    const base = Math.min(1000 * 2 ** this.attempt, 15000);
    // Розкид ±20%, щоб після рестарту сервера вкладки не стукали одночасно
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    this.attempt++;

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private clearTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearProbe(): void {
    if (this.probeTimer !== null) {
      clearTimeout(this.probeTimer);
      this.probeTimer = null;
    }
  }
}
