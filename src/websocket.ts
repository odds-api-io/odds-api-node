import type { Clock, CommaList, EventStatus, Market, MarketName, Score } from './types.js';
import { OddsAPIError } from './errors.js';

const DEFAULT_WS_URL = 'wss://api.odds-api.io/v3/ws';

export type WsChannel = 'odds' | 'scores' | 'status';

/** The subset of the WebSocket API the helper uses; `ws` and the browser/Node global both fit. */
export interface WebSocketLike {
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: any) => void) | null;
  onclose: ((event: { code: number; reason: string | { toString(): string } }) => void) | null;
  close(code?: number, reason?: string): void;
}

export type WebSocketConstructor = new (url: string) => WebSocketLike;

export interface OddsWebSocketOptions {
  apiKey: string;
  /** Required for the odds channel. Max 40. */
  markets?: CommaList<MarketName>;
  /** Allowlist of channels (default: odds only). Include `odds` to keep odds updates. */
  channels?: CommaList<WsChannel>;
  /** Up to 10 sport names or slugs. */
  sport?: CommaList;
  /** Up to 20 league slugs. Not with `eventIds`. */
  leagues?: CommaList;
  /** Up to 50 event ids. Not with `leagues`. */
  eventIds?: CommaList<string | number>;
  status?: 'live' | 'prematch';
  /** Resume from this sequence (for example the `seq` of a REST snapshot). */
  lastSeq?: number;
  /** Ask for a `replay_complete` message after the catch-up phase (default: true). */
  replayComplete?: boolean;
  /** Reconnect after drops, resuming from the last seq (default: true). */
  reconnect?: boolean;
  /** Give up after this many failed reconnects in a row (default: unlimited). */
  maxReconnectAttempts?: number;
  /** First reconnect delay in ms (default: 1000), doubled per attempt. */
  initialReconnectDelay?: number;
  /** Longest reconnect delay in ms (default: 30000). */
  maxReconnectDelay?: number;
  /** Endpoint (default: wss://api.odds-api.io/v3/ws). */
  url?: string;
  /**
   * WebSocket implementation. Default: the `ws` package when installed,
   * otherwise the global WebSocket. It must negotiate permessage-deflate.
   */
  WebSocket?: WebSocketConstructor;
}

export interface WsWelcomeMessage {
  type: 'welcome';
  message: string;
  user_id: string;
  bookmakers: string[];
  sport_filter?: string[];
  leagues_filter?: string[];
  event_id_filter?: string[];
  status_filter?: string;
  market_filter?: string[];
  channels?: WsChannel[];
  connected_at: string;
  warning?: string;
}

/**
 * Odds channel message. `updated` and `created` carry the complete current
 * market set for the event and bookmaker: replace what you hold, do not merge.
 * `deleted` and `no_markets` carry an empty markets array: clear that event and bookmaker.
 */
export interface WsOddsMessage {
  type: 'created' | 'updated' | 'deleted' | 'no_markets';
  /** Absent on rare updates sent during a brief server-side interruption. */
  seq?: number;
  timestamp: number;
  id: string;
  bookie: string;
  url?: string;
  date?: string;
  sport?: string;
  league?: string;
  markets: Market[];
}

export interface WsScoreMessage {
  type: 'score';
  timestamp: number;
  id: string;
  scores: Score;
  clock?: Clock;
}

export interface WsStatusMessage {
  type: 'status';
  timestamp: number;
  id: string;
  status: EventStatus;
  scores?: Score;
  clock?: Clock;
}

/** Replay could not be served: rebuild from a REST snapshot (`getOddsSnapshot`). The connection stays open. */
export interface WsResyncRequiredMessage {
  type: 'resync_required';
  reason: string;
  last_seq: number;
  current_seq: number;
}

export interface WsReplayCompleteMessage {
  type: 'replay_complete';
  outcome: 'replayed' | 'snapshot' | 'resync_required' | 'live';
  last_seq: number;
  through_seq: number;
}

export type WsMessage =
  | WsWelcomeMessage
  | WsOddsMessage
  | WsScoreMessage
  | WsStatusMessage
  | WsResyncRequiredMessage
  | WsReplayCompleteMessage;

export interface WsCloseInfo {
  code: number;
  reason: string;
  willReconnect: boolean;
}

export interface WsReconnectInfo {
  attempt: number;
  delay: number;
  lastSeq: number | undefined;
}

export interface OddsWebSocketEvents {
  open: () => void;
  message: (message: WsMessage) => void;
  welcome: (message: WsWelcomeMessage) => void;
  created: (message: WsOddsMessage) => void;
  updated: (message: WsOddsMessage) => void;
  deleted: (message: WsOddsMessage) => void;
  no_markets: (message: WsOddsMessage) => void;
  score: (message: WsScoreMessage) => void;
  status: (message: WsStatusMessage) => void;
  resync_required: (message: WsResyncRequiredMessage) => void;
  replay_complete: (message: WsReplayCompleteMessage) => void;
  close: (info: WsCloseInfo) => void;
  reconnecting: (info: WsReconnectInfo) => void;
  error: (error: Error) => void;
}

/** A connection problem the helper will not retry (bad key, refused filters, replaced connection, ...). */
export class OddsWebSocketError extends OddsAPIError {
  /** WebSocket close code, or the HTTP status of a refused handshake. */
  readonly code?: number;

  constructor(message: string, code?: number) {
    super(message, { status: code !== undefined && code < 1000 ? code : undefined });
    this.name = 'OddsWebSocketError';
    this.code = code;
  }
}

type Listener = (...args: any[]) => void;

function joinList(value: CommaList<string | number> | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : value.join(',');
}

function decode(data: unknown): string {
  if (typeof data === 'string') return data;
  if (Array.isArray(data)) return data.map(decode).join('');
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (ArrayBuffer.isView(data)) return new TextDecoder().decode(data as Uint8Array);
  return String(data);
}

async function loadDefaultWebSocket(): Promise<WebSocketConstructor> {
  const moduleName = 'ws';
  try {
    const mod: any = await import(moduleName);
    const ctor = mod?.default?.WebSocket ?? mod?.default ?? mod?.WebSocket;
    if (typeof ctor === 'function') return ctor;
  } catch {
    // `ws` is an optional peer dependency
  }
  const globalCtor = (globalThis as any).WebSocket;
  if (typeof globalCtor === 'function') return globalCtor;
  throw new OddsWebSocketError('No WebSocket implementation found. Run `npm install ws` or pass the WebSocket option.');
}

/**
 * Real-time odds, scores and status over the Odds-API.io WebSocket, with
 * reconnects that resume from the last `seq`.
 *
 * @example
 * ```typescript
 * const feed = new OddsWebSocket({ apiKey, markets: ['ML', 'Totals'], sport: 'football', status: 'live' });
 * feed.on('resync_required', () => rebuildFromRest());
 * for await (const msg of feed) {
 *   if (msg.type === 'updated') store.set(`${msg.id}:${msg.bookie}`, msg.markets);
 * }
 * ```
 */
export class OddsWebSocket {
  private readonly options: OddsWebSocketOptions;
  private readonly listeners = new Map<string, Set<Listener>>();
  private socket?: WebSocketLike;
  private ctor?: WebSocketConstructor;
  private seq?: number;
  private attempts = 0;
  private stopped = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private openPromise?: Promise<void>;
  private resolveOpen?: () => void;
  private rejectOpen?: (error: Error) => void;
  private handshakeError?: OddsWebSocketError;
  private socketOpened = false;

  private iterating = false;
  private queue: WsMessage[] = [];
  private waiters: Array<{ resolve: (r: IteratorResult<WsMessage>) => void; reject: (e: Error) => void }> = [];
  private ended = false;
  private endError?: Error;

  constructor(options: OddsWebSocketOptions) {
    if (!options.apiKey) throw new OddsWebSocketError('apiKey is required');
    const channels = joinList(options.channels);
    const wantsOdds = !channels || channels.split(',').map((c) => c.trim()).includes('odds');
    if (wantsOdds && !joinList(options.markets)) {
      throw new OddsWebSocketError('markets is required for the odds channel, for example markets: ["ML", "Spread", "Totals"]');
    }
    if (options.leagues && options.eventIds) {
      throw new OddsWebSocketError('leagues and eventIds cannot be used together');
    }
    this.options = options;
    this.seq = options.lastSeq && options.lastSeq > 0 ? options.lastSeq : undefined;
  }

  /** Highest `seq` received. Persist it to resume after a restart. */
  get lastSeq(): number | undefined {
    return this.seq;
  }

  /** Set the resume point, for example after rebuilding from `getOddsSnapshot`. Used on the next (re)connect. */
  set lastSeq(value: number | undefined) {
    this.seq = value && value > 0 ? value : undefined;
  }

  get connected(): boolean {
    return this.socket?.readyState === 1;
  }

  on<K extends keyof OddsWebSocketEvents>(event: K, listener: OddsWebSocketEvents[K]): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener as Listener);
    return this;
  }

  off<K extends keyof OddsWebSocketEvents>(event: K, listener: OddsWebSocketEvents[K]): this {
    this.listeners.get(event)?.delete(listener as Listener);
    return this;
  }

  once<K extends keyof OddsWebSocketEvents>(event: K, listener: OddsWebSocketEvents[K]): this {
    const wrapped = ((...args: any[]) => {
      this.off(event, wrapped as OddsWebSocketEvents[K]);
      (listener as Listener)(...args);
    }) as OddsWebSocketEvents[K];
    return this.on(event, wrapped);
  }

  private emit(event: keyof OddsWebSocketEvents, ...args: any[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        listener(...args);
      } catch (error) {
        if (event !== 'error') this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /** The connection URL, without the API key. */
  get url(): string {
    return this.buildUrl().replace(/apiKey=[^&]*/, 'apiKey=***');
  }

  private buildUrl(): string {
    const o = this.options;
    const params = new URLSearchParams();
    params.set('apiKey', o.apiKey);
    const add = (key: string, value: string | undefined) => {
      if (value) params.set(key, value);
    };
    add('markets', joinList(o.markets));
    add('channels', joinList(o.channels));
    add('sport', joinList(o.sport));
    add('leagues', joinList(o.leagues));
    add('eventIds', joinList(o.eventIds));
    add('status', o.status);
    if (this.seq !== undefined) params.set('lastSeq', String(this.seq));
    if (o.replayComplete !== false) params.set('replayComplete', 'true');
    return `${o.url ?? DEFAULT_WS_URL}?${params.toString()}`;
  }

  /** Opens the connection. Resolves once it is open; rejects on a refused handshake. */
  connect(): Promise<void> {
    if (this.openPromise) return this.openPromise;
    this.stopped = false;
    this.ended = false;
    this.endError = undefined;
    this.openPromise = new Promise<void>((resolve, reject) => {
      this.resolveOpen = resolve;
      this.rejectOpen = reject;
    });
    this.openPromise.catch(() => undefined);
    this.open().catch((error) => this.fail(error));
    return this.openPromise;
  }

  private async open(): Promise<void> {
    this.ctor ??= this.options.WebSocket ?? (await loadDefaultWebSocket());
    if (this.stopped) return;
    this.handshakeError = undefined;
    const socket = new this.ctor(this.buildUrl());
    this.socket = socket;

    this.socketOpened = false;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.socketOpened = true;
      this.resolveOpen?.();
      this.resolveOpen = undefined;
      this.rejectOpen = undefined;
      this.emit('open');
    };

    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      this.handleFrame(decode(event.data));
    };

    socket.onerror = (event: any) => {
      if (socket !== this.socket || this.stopped) return;
      const text: string = event?.message ?? event?.error?.message ?? '';
      const status = /Unexpected server response: (\d{3})/.exec(text);
      if (status) this.handshakeError = this.handshakeFailure(Number(status[1]));
      else this.emit('error', new OddsWebSocketError(text || 'WebSocket error'));
    };

    socket.onclose = (event) => {
      if (socket !== this.socket) return;
      this.socket = undefined;
      this.handleClose(event.code, String(event.reason ?? ''));
    };
  }

  private handshakeFailure(status: number): OddsWebSocketError {
    const messages: Record<number, string> = {
      400: 'The server refused the subscription filters (HTTP 400). Check markets (max 40), sport (max 10), leagues (max 20), eventIds (max 50) and status.',
      401: 'Invalid or missing API key (HTTP 401).',
      403: 'This key has no WebSocket access (HTTP 403). WebSocket is an add-on: https://odds-api.io/pricing?ref=npm',
      426: 'The server requires permessage-deflate compression (HTTP 426). Install the `ws` package or pass a WebSocket implementation that negotiates it.',
    };
    return new OddsWebSocketError(messages[status] ?? `WebSocket handshake refused (HTTP ${status})`, status);
  }

  private handleFrame(text: string): void {
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let message: WsMessage;
      try {
        message = JSON.parse(trimmed);
      } catch {
        this.emit('error', new OddsWebSocketError(`Could not parse message: ${trimmed.slice(0, 200)}`));
        continue;
      }
      this.dispatch(message);
    }
  }

  private dispatch(message: WsMessage): void {
    const seq = (message as WsOddsMessage).seq;
    if (typeof seq === 'number' && seq > (this.seq ?? 0)) this.seq = seq;
    if (message.type === 'welcome') this.attempts = 0;
    if (message.type === 'resync_required') this.seq = undefined;

    if (this.iterating) {
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve({ value: message, done: false });
      else this.queue.push(message);
    }
    this.emit('message', message);
    this.emit(message.type as keyof OddsWebSocketEvents, message);
  }

  private handleClose(code: number, reason: string): void {
    if (this.stopped) {
      this.emit('close', { code, reason, willReconnect: false });
      this.finish();
      return;
    }

    let fatal: OddsWebSocketError | undefined = this.handshakeError;
    if (!fatal && code === 1008 && /newer connection/i.test(reason)) {
      fatal = new OddsWebSocketError(`Connection replaced by a newer one on this key (${reason})`, code);
    }
    if (fatal && fatal.code === 429) fatal = undefined;

    const reconnect = this.options.reconnect !== false;
    const max = this.options.maxReconnectAttempts ?? Infinity;
    if (fatal || !reconnect || this.attempts >= max) {
      this.emit('close', { code, reason, willReconnect: false });
      const error =
        fatal ??
        (reconnect
          ? new OddsWebSocketError(
              `Gave up after ${this.attempts} reconnect attempts (last close ${code}${reason ? ` ${reason}` : ''})`,
              code
            )
          : code === 1000
            ? undefined
            : new OddsWebSocketError(
                `Connection closed (${code}${reason ? ` ${reason}` : ''})` +
                  (this.socketOpened ? '' : '. The handshake failed; install the `ws` package to see the reason.'),
                code
              ));
      this.stopped = true;
      if (error) this.fail(error);
      else this.finish();
      return;
    }

    this.attempts++;
    const delay = this.reconnectDelay(code);
    this.emit('close', { code, reason, willReconnect: true });
    this.emit('reconnecting', { attempt: this.attempts, delay, lastSeq: this.seq });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (!this.stopped) this.open().catch((error) => this.fail(error));
    }, delay);
  }

  private reconnectDelay(code: number): number {
    const initial = this.options.initialReconnectDelay ?? 1000;
    const max = this.options.maxReconnectDelay ?? 30000;
    const jitter = (ms: number) => Math.round(ms * (1 + Math.random() * 0.2));
    if (code === 1012) return jitter(Math.min(initial, 1000));
    const backoff = Math.min(max, initial * 2 ** (this.attempts - 1));
    if (code === 1013) return jitter(Math.max(backoff, 3000));
    return jitter(backoff);
  }

  private fail(error: Error): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.rejectOpen?.(error);
    this.resolveOpen = undefined;
    this.rejectOpen = undefined;
    this.emit('error', error);
    this.finish(error);
  }

  private finish(error?: Error): void {
    this.openPromise = undefined;
    this.ended = true;
    this.endError = error;
    if (this.rejectOpen) {
      this.rejectOpen(error ?? new OddsWebSocketError('Connection closed before it opened'));
      this.resolveOpen = undefined;
      this.rejectOpen = undefined;
    }
    for (const waiter of this.waiters.splice(0)) {
      if (error) waiter.reject(error);
      else waiter.resolve({ value: undefined, done: true });
    }
  }

  /** Closes the connection and stops reconnecting. */
  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const socket = this.socket;
    if (socket && socket.readyState <= 1) {
      socket.close(1000, 'client closed');
    } else {
      this.socket = undefined;
      this.finish();
    }
  }

  /**
   * Messages as an async iterator. Connects if needed; ends when `close()` is
   * called and throws when the helper gives up.
   */
  messages(): AsyncIterableIterator<WsMessage> {
    this.iterating = true;
    if (!this.openPromise && !this.socket) this.connect().catch(() => undefined);
    const iterator: AsyncIterableIterator<WsMessage> = {
      next: () => {
        if (this.queue.length) return Promise.resolve({ value: this.queue.shift()!, done: false });
        if (this.ended) {
          const error = this.endError;
          this.endError = undefined;
          return error ? Promise.reject(error) : Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
      },
      return: () => {
        this.iterating = false;
        this.queue = [];
        this.close();
        return Promise.resolve({ value: undefined, done: true });
      },
      [Symbol.asyncIterator]() {
        return iterator;
      },
    };
    return iterator;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<WsMessage> {
    return this.messages();
  }
}
