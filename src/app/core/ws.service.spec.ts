import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthService } from './auth.service';
import { WsService } from './ws.service';

/**
 * Heartbeat і перепідключення.
 *
 * Перевіряти це живим сокетом неможливо: половина сценаріїв — саме ті, де сокет
 * МОВЧИТЬ (обірваний TCP без FIN). Тому WebSocket підроблений, а час керований —
 * 25 секунд між ping'ами тест «проживає» миттєво.
 */
describe('WsService', () => {
  const PING_INTERVAL = 25_000;

  /** Підробка браузерного WebSocket: запам'ятовує надіслане, дає смикати події. */
  class FakeSocket {
    static instances: FakeSocket[] = [];

    // Ті самі константи, що й у справжнього WebSocket: сервіс звіряє з ними
    // readyState, і без них перевірка «сокет відкритий» ніколи не спрацює.
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly sent: string[] = [];
    readyState = 0;
    closeCalls = 0;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(readonly url: string) {
      FakeSocket.instances.push(this);
    }

    send(data: string): void {
      this.sent.push(data);
    }

    close(): void {
      this.closeCalls++;
      this.readyState = 3;
      this.onclose?.();
    }

    /** Сервер прийняв з'єднання. */
    accept(): void {
      this.readyState = 1;
      this.onopen?.();
    }

    /** Сервер щось прислав. */
    deliver(payload: unknown): void {
      this.onmessage?.({ data: JSON.stringify(payload) });
    }

    /** Обрив, який браузер помітив (на відміну від «зомбі»). */
    drop(): void {
      this.readyState = 3;
      this.onclose?.();
    }
  }

  let service: WsService;
  const token = signal<string | null>('test-token');

  const latest = () => FakeSocket.instances[FakeSocket.instances.length - 1];

  beforeEach(() => {
    FakeSocket.instances = [];
    token.set('test-token');
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', FakeSocket as unknown as typeof WebSocket);

    TestBed.configureTestingModule({
      providers: [WsService, { provide: AuthService, useValue: { token } }],
    });
    service = TestBed.inject(WsService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('відкриває з’єднання з токеном у query — заголовки рукостискання не носить', () => {
    service.connect();

    expect(FakeSocket.instances).toHaveLength(1);
    expect(latest().url).toContain('/ws/chat?token=test-token');
    expect(service.status()).toBe('connecting');
  });

  it('другий виклик connect() не відкриває другого сокета', () => {
    service.connect();
    service.connect();

    expect(FakeSocket.instances).toHaveLength(1);
  });

  it('після відкриття шле власний ping — серверні ping-фрейми в JS не видно', () => {
    service.connect();
    latest().accept();
    expect(latest().sent).toHaveLength(0);

    vi.advanceTimersByTime(PING_INTERVAL);

    expect(latest().sent).toEqual(['{"type":"PING"}']);
  });

  it('PONG не потрапляє в потік подій застосунку', () => {
    const events: unknown[] = [];
    service.events.subscribe((event) => events.push(event));
    service.connect();
    latest().accept();

    latest().deliver({ type: 'PONG' });
    latest().deliver({ type: 'NEW_MESSAGE', payload: { chatId: 1 } });

    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('NEW_MESSAGE');
  });

  it('поки приходять відповіді, з’єднання живе скільки завгодно тактів', () => {
    service.connect();
    latest().accept();
    const socket = latest();

    for (let tick = 0; tick < 10; tick++) {
      vi.advanceTimersByTime(PING_INTERVAL);
      socket.deliver({ type: 'PONG' });
    }

    expect(socket.closeCalls).toBe(0);
    expect(socket.sent).toHaveLength(10);
    expect(service.status()).toBe('open');
  });

  it('ping без відповіді до наступного такту рве «зомбі» й перепідключається', () => {
    service.connect();
    latest().accept();
    const zombie = latest();

    vi.advanceTimersByTime(PING_INTERVAL); // ping пішов
    vi.advanceTimersByTime(PING_INTERVAL); // відповіді так і не було

    expect(zombie.closeCalls).toBe(1);
    expect(service.status()).toBe('closed');

    vi.advanceTimersByTime(2_000); // пауза перед повторною спробою
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  it('обрив, який браузер помітив, теж веде до перепідключення', () => {
    service.connect();
    latest().accept();

    latest().drop();
    expect(service.status()).toBe('closed');

    vi.advanceTimersByTime(2_000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it('пауза між спробами зростає, але не нескінченно', () => {
    service.connect();
    latest().accept();

    // кожна невдала спроба подовжує паузу; за 60 секунд їх має бути кілька,
    // але точно не шістдесят — інакше вкладка в фоні довбала б сервер щосекунди
    for (let i = 0; i < 5; i++) {
      latest().drop();
      vi.advanceTimersByTime(20_000);
    }

    expect(FakeSocket.instances.length).toBeLessThan(10);
    expect(FakeSocket.instances.length).toBeGreaterThan(2);
  });

  it('«reconnected» мовчить на першому підключенні й спрацьовує після обриву', () => {
    let reconnects = 0;
    service.reconnected.subscribe(() => reconnects++);

    service.connect();
    latest().accept();
    expect(reconnects).toBe(0);

    latest().drop();
    vi.advanceTimersByTime(2_000);
    latest().accept();

    expect(reconnects).toBe(1);
  });

  it('свідомий вихід не перепідключається', () => {
    service.connect();
    latest().accept();

    service.disconnect();
    vi.advanceTimersByTime(60_000);

    expect(FakeSocket.instances).toHaveLength(1);
    expect(service.status()).toBe('closed');
  });

  it('зниклий токен рве з’єднання — інакше воно жило б після виходу', () => {
    service.connect();
    latest().accept();
    const socket = latest();

    token.set(null);
    TestBed.tick();

    expect(socket.closeCalls).toBe(1);
    expect(service.status()).toBe('closed');
  });

  it('побитий кадр не валить з’єднання', () => {
    service.connect();
    latest().accept();

    expect(() => latest().onmessage?.({ data: 'не json' })).not.toThrow();
    expect(service.status()).toBe('open');
  });
});
