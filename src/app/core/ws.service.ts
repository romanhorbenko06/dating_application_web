import { Injectable, effect, inject, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { AuthService } from './auth.service';
import { WsEvent } from './models/chat.models';

export type WsStatus = 'closed' | 'connecting' | 'open';

/**
 * Живе з'єднання з бекендом (raw WebSocket, не STOMP).
 *
 * Токен передається ТІЛЬКИ query-параметром: WebSocket-рукостискання не носить
 * заголовок Authorization, тому інтерсептор тут не допомагає. Бекенд читає
 * його в JwtHandshakeInterceptor і при невдачі віддає 401 ще до відкриття сокета.
 */
@Injectable({ providedIn: 'root' })
export class WsService {
  private auth = inject(AuthService);

  /** Наш ping. Той самий інтервал, що й у сервера, — 25 с. */
  private static readonly PING_INTERVAL_MS = 25_000;

  /** Скільки чекати на PONG після пробудження вкладки, перш ніж рвати сокет. */
  private static readonly PROBE_TIMEOUT_MS = 5_000;

  private static readonly PING_FRAME = '{"type":"PING"}';

  private socket: WebSocket | null = null;
  private events$ = new Subject<WsEvent>();
  private reconnected$ = new Subject<void>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  /** Розрізняє «сокет закрився сам» і «ми закрили навмисно» (logout). */
  private wanted = false;
  /** Попередній ping лишився без відповіді. */
  private awaitingPong = false;
  /** З'єднання вже падало — наступне відкриття буде ПЕРЕпідключенням. */
  private dropped = false;

  readonly status = signal<WsStatus>('closed');

  constructor() {
    // Токен зник (вихід або 401 в інтерсепторі) — рвемо сокет самі.
    // Інакше вже відкрите з'єднання жило б далі, хоча користувач уже розлогінений.
    effect(() => {
      if (!this.auth.token()) this.disconnect();
    });

    // Ноутбук прокинувся або повернувся Wi-Fi — сокет може бути «зомбі»:
    // TCP обірвано, а onclose браузер так і не покликав. Перевіряємо одразу,
    // не чекаючи ні чергового такту heartbeat, ні паузи backoff.
    window.addEventListener('online', () => this.wake());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.wake();
    });
  }

  /** Потік подій. Компоненти фільтрують його за своїм chatId. */
  get events(): Observable<WsEvent> {
    return this.events$.asObservable();
  }

  /**
   * Емітить після ПЕРЕпідключення (не після першого відкриття).
   * Поки сокета не було, пуші губилися безслідно — бекенд їх не накопичує,
   * тож сторінки мають перезапитати те, що могли пропустити.
   */
  get reconnected(): Observable<void> {
    return this.reconnected$.asObservable();
  }

  /** Безпечно викликати скільки завгодно разів — друге з'єднання не відкриється. */
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
      // Будь-який кадр — доказ, що канал живий
      this.awaitingPong = false;

      try {
        const parsed = JSON.parse(event.data as string) as { type?: string };
        // Службова відповідь на наш ping: до подій застосунку не має стосунку
        if (parsed.type === 'PONG') return;

        this.events$.next(parsed as WsEvent);
      } catch {
        // Побитий кадр не має валити з'єднання — просто ігноруємо
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

    // onerror завжди супроводжується onclose — перепідключення робимо там
    socket.onerror = () => socket.close();
  }

  /** Викликається при виході: інакше сокет жив би до кінця дії токена. */
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

  /**
   * Власний ping потрібен саме на клієнті: ping-фрейми сервера браузер
   * обробляє сам і в JS їх не видно. Без цього запиту вкладка не відрізнить
   * тишу «новин немає» від обірваного каналу — а мовчазний обрив (сон
   * ноутбука, зміна мережі) може не дійти до onclose ніколи.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.awaitingPong = false;
    this.pingTimer = setInterval(() => this.beat(), WsService.PING_INTERVAL_MS);
  }

  private beat(): void {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    // Рахуємо саме такти, а не час за годинником: у фоновій вкладці таймери
    // приспані, і «давно нічого не приходило» там нічого не означає. А от
    // ping без відповіді до НАСТУПНОГО такту — це вже мертвий канал.
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

  /** Повернення вкладки або мережі: перевіряємо канал негайно. */
  private wake(): void {
    if (!this.wanted) return;

    if (!this.socket) {
      // Не чекаємо на решту паузи backoff — користувач уже дивиться на екран
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

  /**
   * Сокет вважається відкритим, а насправді мертвий. Знімаємо обробники й
   * плануємо перепідключення САМІ: onclose від такого сокета може не прийти
   * взагалі, і тоді покладатися на нього означало б зависнути назавжди.
   */
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
      // сокет уже й так непридатний
    }

    // Це обрив, а не відмова сервера — пробуємо швидко, з першої сходинки
    this.attempt = 0;
    this.scheduleReconnect();
  }

  /**
   * Перепідключення з наростанням паузи: 1, 2, 4, 8 с і далі не частіше ніж раз на 15 с.
   * Без обмеження зверху вкладка в фоні довбала б сервер щосекунди.
   */
  private scheduleReconnect(): void {
    if (!this.auth.token()) return;

    this.clearTimer();
    const base = Math.min(1000 * 2 ** this.attempt, 15000);
    // Розкид ±20%: після перезапуску сервера всі вкладки інакше стукають в одну мить
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
