import type {
  OddsAPIClientConfig,
  RateLimitInfo,
  Sport,
  League,
  Event,
  HistoricalEvent,
  Participant,
  Bookmaker,
  SelectedBookmakers,
  MarketsResponse,
  MarketsBySport,
  EventOdds,
  HistoricalEventOdds,
  OddsMovement,
  UpdatedOddsResult,
  OddsSnapshot,
  EventSummary,
  ArbitrageBet,
  ValueBet,
  DroppingOddsEntry,
  DroppingOddsPage,
  SettlementsResponse,
  GradeSelection,
  GradesResponse,
  Outright,
  OutrightOdds,
  OutrightResults,
  Mapping,
  MappingsPage,
  GetLeaguesOptions,
  GetEventsParams,
  SearchEventsOptions,
  GetHistoricalEventsParams,
  SearchHistoricalEventsParams,
  GetOddsParams,
  GetMultiEventOddsParams,
  GetHistoricalOddsParams,
  GetClosingLinesParams,
  GetOddsMovementParams,
  GetUpdatedOddsSinceParams,
  PollUpdatedOddsParams,
  GetOddsSummaryParams,
  GetOddsSummaryMultiParams,
  GetParticipantsParams,
  GetArbitrageBetsParams,
  GetValueBetsParams,
  GetDroppingOddsParams,
  GetOutrightsParams,
  GetOutrightOddsParams,
  GetMappingsParams,
  PageOptions,
  CommaList,
} from './types.js';
import {
  OddsAPIError,
  BadRequestError,
  InvalidAPIKeyError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ServerError,
  TimeoutError,
  NetworkError,
} from './errors.js';
import { VERSION } from './version.js';

const DEFAULT_BASE_URL = 'https://api.odds-api.io/v3';
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_MAX_RETRY_DELAY = 10000;
const HISTORICAL_SPAN_MS = 31 * 24 * 60 * 60 * 1000;
const SETTLEMENT_BATCH = 50;

type QueryValue = string | number | boolean | readonly (string | number)[] | undefined | null;
type Query = Record<string, QueryValue>;

interface RequestOptions {
  method?: 'GET' | 'PUT' | 'POST';
  query?: Query;
  body?: unknown;
  auth?: boolean;
  raw?: boolean;
}

interface ApiResponse<T> {
  data: T;
  headers: Headers;
}

function joinList(value: CommaList<string | number> | undefined): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' ? value : value.join(',');
}

function splitList(value: CommaList<string | number>): string[] {
  const parts = typeof value === 'string' ? value.split(',') : value.map(String);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function numberHeader(headers: Headers, name: string): number | null {
  const raw = headers.get(name);
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = numberHeader(headers, 'x-ratelimit-limit');
  const remaining = numberHeader(headers, 'x-ratelimit-remaining');
  const resetRaw = headers.get('x-ratelimit-reset');
  if (limit === null && remaining === null && !resetRaw) return undefined;
  const reset = resetRaw ? new Date(resetRaw) : null;
  return { limit, remaining, reset: reset && !isNaN(reset.getTime()) ? reset : null };
}

function retryAfterSeconds(headers: Headers, rateLimit?: RateLimitInfo): number | undefined {
  const header = headers.get('retry-after');
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.max(0, secs);
    const date = Date.parse(header);
    if (!isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }
  if (rateLimit?.remaining === 0 && rateLimit.reset) {
    return Math.max(0, Math.ceil((rateLimit.reset.getTime() - Date.now()) / 1000));
  }
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Official Node.js client for Odds-API.io.
 *
 * @example
 * ```typescript
 * import { OddsAPIClient } from 'odds-api-io';
 *
 * const client = new OddsAPIClient({ apiKey: process.env.ODDS_API_KEY! });
 * const sports = await client.getSports();
 * ```
 */
export class OddsAPIClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly maxRetryDelay: number;
  private readonly fetchImpl?: typeof fetch;

  /** Rate-limit headers from the most recent response, when the server sent them. */
  lastRateLimit?: RateLimitInfo;

  constructor(config: OddsAPIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = Math.max(0, config.maxRetries ?? DEFAULT_MAX_RETRIES);
    this.maxRetryDelay = config.maxRetryDelay ?? DEFAULT_MAX_RETRY_DELAY;
    this.fetchImpl = config.fetch;
  }

  private buildUrl(path: string, query: Query = {}, auth = true): URL {
    const url = new URL(`${this.baseUrl}/${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      const str = Array.isArray(value) ? value.join(',') : String(value);
      url.searchParams.set(key, str);
    }
    if (auth) url.searchParams.set('apiKey', this.apiKey);
    return url;
  }

  private async send<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(path, options.query, options.auth ?? true);
    const retries = method === 'PUT' ? 0 : this.maxRetries;
    const doFetch = this.fetchImpl ?? globalThis.fetch;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      let response: Response;
      try {
        const headers: Record<string, string> = { 'User-Agent': `odds-api-io-node/${VERSION}` };
        let body: string | undefined;
        if (options.body !== undefined) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(options.body);
        }
        response = await doFetch(url.toString(), { method, headers, body, signal: controller.signal });
      } catch (error: any) {
        clearTimeout(timeoutId);
        const err =
          error?.name === 'AbortError'
            ? new TimeoutError(`Request timeout after ${this.timeout}ms`)
            : new NetworkError(`Network request failed: ${error?.message ?? error}`);
        if (attempt < retries) {
          await sleep(this.backoff(attempt));
          continue;
        }
        throw err;
      }

      try {
        const rateLimit = parseRateLimit(response.headers);
        if (rateLimit) this.lastRateLimit = rateLimit;

        if (response.ok) {
          const data = options.raw ? await response.arrayBuffer() : await response.json();
          return { data: data as T, headers: response.headers };
        }

        const error = await this.toError(response, rateLimit);
        const wait = this.retryDelay(error, attempt);
        if (attempt < retries && wait !== null) {
          await sleep(wait);
          continue;
        }
        throw error;
      } catch (error: any) {
        if (error instanceof OddsAPIError) throw error;
        if (error?.name === 'AbortError') throw new TimeoutError(`Request timeout after ${this.timeout}ms`);
        throw new NetworkError(`Failed to read response: ${error?.message ?? error}`);
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  private backoff(attempt: number): number {
    const base = Math.min(this.maxRetryDelay, 500 * 2 ** attempt);
    return Math.round(base * (0.75 + Math.random() * 0.25));
  }

  private retryDelay(error: OddsAPIError, attempt: number): number | null {
    if (error instanceof RateLimitError) {
      if (error.retryAfter === undefined) return null;
      const ms = error.retryAfter * 1000;
      return ms <= this.maxRetryDelay ? ms : null;
    }
    if (error instanceof ServerError && [500, 502, 503, 504].includes(error.status ?? 0)) {
      return error.retryAfter !== undefined
        ? Math.min(error.retryAfter * 1000, this.maxRetryDelay)
        : this.backoff(attempt);
    }
    return null;
  }

  private async toError(response: Response, rateLimit?: RateLimitInfo): Promise<OddsAPIError> {
    const status = response.status;
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }
    let message = body.trim() || response.statusText || `HTTP ${status}`;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed.error === 'string') message = parsed.error;
      else if (parsed && typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // not JSON: keep the raw text
    }
    const details = { status, body, rateLimit };

    switch (status) {
      case 400:
        return new BadRequestError(message, details);
      case 401:
        return new InvalidAPIKeyError(message, details);
      case 403:
        return new ForbiddenError(message, details);
      case 404:
        return new NotFoundError(message, details);
      case 429:
        return new RateLimitError(message, {
          ...details,
          retryAfter: retryAfterSeconds(response.headers, rateLimit),
        });
      default:
        if (status >= 500) {
          return new ServerError(message, { ...details, retryAfter: retryAfterSeconds(response.headers) });
        }
        return new OddsAPIError(message, details);
    }
  }

  private async get<T>(path: string, query?: Query, auth = true): Promise<T> {
    return (await this.send<T>(path, { query, auth })).data;
  }

  // ============================================================================
  // SPORTS, LEAGUES, MARKETS
  // ============================================================================

  /** All sports. No API key needed. */
  async getSports(): Promise<Sport[]> {
    return this.get<Sport[]>('sports', undefined, false);
  }

  /**
   * Leagues for a sport.
   *
   * @example
   * ```typescript
   * const leagues = await client.getLeagues('football');
   * ```
   */
  async getLeagues(sport: string, options: GetLeaguesOptions = {}): Promise<League[]> {
    return this.get<League[]>('leagues', { sport, all: options.all });
  }

  /**
   * The market catalogue: exact market names per sport, with shape, period and
   * whether each is served prematch and live. Use it before passing `markets`
   * to other calls. No API key needed.
   *
   * @example
   * ```typescript
   * const { markets } = await client.getMarkets('football');
   * ```
   */
  async getMarkets(sport: string): Promise<MarketsResponse>;
  async getMarkets(): Promise<MarketsBySport>;
  async getMarkets(sport?: string): Promise<MarketsResponse | MarketsBySport> {
    return this.get('markets', { sport }, false);
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  /**
   * Events for a sport. Without `to` the window is the next 14 days; each
   * response is capped at 5000 events (see `iterateEvents`).
   *
   * @example
   * ```typescript
   * const events = await client.getEvents({ sport: 'football', league: 'england-premier-league', status: 'pending,live' });
   * ```
   */
  async getEvents(params: GetEventsParams): Promise<Event[]> {
    return this.get<Event[]>('events', { ...params, status: joinList(params.status) });
  }

  /**
   * Every event matching the filters, paging with limit and skip.
   *
   * @example
   * ```typescript
   * for await (const event of client.iterateEvents({ sport: 'football', to: '2027-01-01T00:00:00Z' })) {
   *   console.log(event.home, event.away);
   * }
   * ```
   */
  async *iterateEvents(params: GetEventsParams, options: PageOptions = {}): AsyncGenerator<Event> {
    const pageSize = options.pageSize ?? params.limit ?? 1000;
    let skip = params.skip ?? 0;
    for (let page = 0; options.maxPages === undefined || page < options.maxPages; page++) {
      const events = await this.getEvents({ ...params, limit: pageSize, skip });
      yield* events;
      if (events.length < pageSize) return;
      skip += events.length;
    }
  }

  /** One event by id. */
  async getEventById(eventId: string | number): Promise<Event> {
    return this.get<Event>(`events/${encodeURIComponent(String(eventId))}`);
  }

  /** Live events, optionally for one sport. Live events carry `clock`. */
  async getLiveEvents(sport?: string): Promise<Event[]> {
    return this.get<Event[]>('events/live', { sport });
  }

  /**
   * Search events by team or league name (min 3 characters, up to 10 results).
   *
   * @example
   * ```typescript
   * const live = await client.searchEvents('Liverpool', { status: 'live' });
   * ```
   */
  async searchEvents(query: string, options: SearchEventsOptions = {}): Promise<Event[]> {
    return this.get<Event[]>('events/search', { query, status: options.status });
  }

  // ============================================================================
  // HISTORICAL
  // ============================================================================

  /**
   * Finished events for one league. The span from `from` to `to` is at most 31
   * days; use `iterateHistoricalEvents` for longer ranges.
   */
  async getHistoricalEvents(params: GetHistoricalEventsParams): Promise<HistoricalEvent[]> {
    return this.get<HistoricalEvent[]>('historical/events', { ...params });
  }

  /** Finished events for one league over any range, fetched in 31-day windows. */
  async *iterateHistoricalEvents(params: GetHistoricalEventsParams): AsyncGenerator<HistoricalEvent> {
    const start = Date.parse(params.from);
    const end = Date.parse(params.to);
    if (isNaN(start) || isNaN(end)) throw new BadRequestError('from and to must be RFC 3339 dates');
    const seen = new Set<number>();
    for (let windowStart = start; windowStart < end; windowStart += HISTORICAL_SPAN_MS) {
      const windowEnd = Math.min(windowStart + HISTORICAL_SPAN_MS, end);
      const events = await this.getHistoricalEvents({
        ...params,
        from: new Date(windowStart).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        to: new Date(windowEnd).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      });
      for (const event of events) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        yield event;
      }
    }
  }

  /** Search finished events by team name, across leagues (31-day span, default the last 31 days). */
  async searchHistoricalEvents(params: SearchHistoricalEventsParams): Promise<HistoricalEvent[]> {
    return this.get<HistoricalEvent[]>('historical/events/search', { ...params });
  }

  /**
   * Odds for a finished event, in the `/odds` shape.
   *
   * @example
   * ```typescript
   * const odds = await client.getHistoricalOdds({ eventId: 67697888, bookmakers: ['Bet365', 'SingBet'], markets: ['ML'] });
   * ```
   */
  async getHistoricalOdds(params: GetHistoricalOddsParams): Promise<HistoricalEventOdds> {
    return this.get<HistoricalEventOdds>('historical/odds', {
      ...params,
      bookmakers: joinList(params.bookmakers),
      markets: joinList(params.markets),
    });
  }

  /**
   * Closing odds for every settled event across up to 10 leagues (paid plans).
   * Up to 366 days per call, 100 events per page (see `iterateClosingLines`).
   *
   * @example
   * ```typescript
   * const lines = await client.getClosingLines({
   *   sport: 'football',
   *   leagues: ['england-premier-league'],
   *   from: '2026-08-01T00:00:00Z',
   *   to: '2026-10-31T23:59:59Z',
   *   markets: ['ML', 'Totals'],
   *   bookmakers: ['Bet365'],
   * });
   * ```
   */
  async getClosingLines(params: GetClosingLinesParams): Promise<HistoricalEventOdds[]> {
    return this.get<HistoricalEventOdds[]>('historical/closing-lines', {
      ...params,
      leagues: joinList(params.leagues),
      markets: joinList(params.markets),
      bookmakers: joinList(params.bookmakers),
    });
  }

  /** Every closing line matching the filters, paging with limit and skip. */
  async *iterateClosingLines(
    params: GetClosingLinesParams,
    options: PageOptions = {}
  ): AsyncGenerator<HistoricalEventOdds> {
    const pageSize = Math.min(options.pageSize ?? params.limit ?? 100, 100);
    let skip = params.skip ?? 0;
    for (let page = 0; options.maxPages === undefined || page < options.maxPages; page++) {
      const events = await this.getClosingLines({ ...params, limit: pageSize, skip });
      yield* events;
      if (events.length < pageSize) return;
      skip += events.length;
    }
  }

  // ============================================================================
  // ODDS
  // ============================================================================

  /**
   * Odds for one event. Pass `markets` to keep the response small.
   *
   * @example
   * ```typescript
   * const odds = await client.getEventOdds({ eventId: 62924717, bookmakers: ['Bet365', 'SingBet'], markets: ['ML', 'Totals'] });
   * const ml = odds.bookmakers['Bet365']?.find((m) => m.name === 'ML');
   * ```
   */
  async getEventOdds(params: GetOddsParams): Promise<EventOdds> {
    return this.get<EventOdds>('odds', {
      ...params,
      bookmakers: joinList(params.bookmakers),
      markets: joinList(params.markets),
    });
  }

  /** Odds for up to 10 events in one request. */
  async getOddsForMultipleEvents(params: GetMultiEventOddsParams): Promise<EventOdds[]> {
    return this.get<EventOdds[]>('odds/multi', this.multiOddsQuery(params));
  }

  /**
   * Odds for up to 10 events plus the WebSocket sequence at that moment.
   * Rebuild state from `data`, then connect or reconnect with `lastSeq: seq`.
   */
  async getOddsSnapshot(params: GetMultiEventOddsParams): Promise<OddsSnapshot> {
    const { data, headers } = await this.send<EventOdds[]>('odds/multi', {
      query: this.multiOddsQuery({ ...params, includeSeq: true }),
    });
    return { data, seq: numberHeader(headers, 'x-oddsapi-seq') };
  }

  private multiOddsQuery(params: GetMultiEventOddsParams): Query {
    return {
      ...params,
      eventIds: joinList(params.eventIds),
      bookmakers: joinList(params.bookmakers),
      markets: joinList(params.markets),
    };
  }

  /**
   * Price history for one market at one bookmaker (prematch only).
   *
   * @example
   * ```typescript
   * const history = await client.getOddsMovement({ eventId: 62924717, bookmaker: 'Bet365', market: 'ML' });
   * ```
   */
  async getOddsMovement(params: GetOddsMovementParams): Promise<OddsMovement> {
    return this.get<OddsMovement>('odds/movements', { ...params });
  }

  /**
   * Market groups changed since `since` for one bookmaker and sport. The result
   * is a delta: merge it into what you hold, keyed by event and market.
   * See `pollUpdatedOdds` for a loop that follows X-Next-Since.
   */
  async getUpdatedOddsSince(params: GetUpdatedOddsSinceParams): Promise<EventOdds[]> {
    return (await this.getUpdatedOddsSinceWithMeta(params)).data;
  }

  /** Like `getUpdatedOddsSince`, plus the X-Next-Since, X-Server-Time and X-Unknown-Markets headers. */
  async getUpdatedOddsSinceWithMeta(params: GetUpdatedOddsSinceParams): Promise<UpdatedOddsResult> {
    const { data, headers } = await this.send<EventOdds[]>('odds/updated', {
      query: { ...params, markets: joinList(params.markets) },
    });
    const unknown = headers.get('x-unknown-markets');
    return {
      data,
      nextSince: numberHeader(headers, 'x-next-since'),
      serverTime: numberHeader(headers, 'x-server-time'),
      unknownMarkets: unknown ? splitList(unknown) : [],
    };
  }

  /**
   * Polls `/odds/updated`, passing each X-Next-Since as the next `since`.
   * A page cut short by `limit` is followed up at once.
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   * for await (const batch of client.pollUpdatedOdds({ bookmaker: 'Bet365', sport: 'football', markets: ['ML'], signal: controller.signal })) {
   *   for (const event of batch.data) merge(event);
   * }
   * ```
   */
  async *pollUpdatedOdds(params: PollUpdatedOddsParams): AsyncGenerator<UpdatedOddsResult> {
    const { intervalMs = 10000, signal, since: firstSince, ...query } = params;
    let since = firstSince ?? Math.floor(Date.now() / 1000) - 20;
    while (!signal?.aborted) {
      const result = await this.getUpdatedOddsSinceWithMeta({ ...query, since });
      yield result;
      since = result.nextSince ?? (result.serverTime ?? Math.floor(Date.now() / 1000)) - 10;
      const truncated = query.limit !== undefined && result.data.length >= query.limit;
      if (!truncated) await sleep(intervalMs, signal);
    }
  }

  /**
   * Best, average, median, worst and fair price per market line across
   * bookmakers (Growth plans and above; lower plans get `demo: true`).
   */
  async getOddsSummary(params: GetOddsSummaryParams): Promise<EventSummary> {
    return this.get<EventSummary>('odds/summary', this.summaryQuery(params));
  }

  /** `getOddsSummary` for up to 10 events in one request. */
  async getOddsSummaryMulti(params: GetOddsSummaryMultiParams): Promise<EventSummary[]> {
    return this.get<EventSummary[]>('odds/summary/multi', {
      ...this.summaryQuery(params),
      eventIds: joinList(params.eventIds),
    });
  }

  private summaryQuery(params: GetOddsSummaryParams | GetOddsSummaryMultiParams): Query {
    return {
      ...(params as unknown as Query),
      markets: joinList(params.markets),
      bookmakers: joinList(params.bookmakers),
    };
  }

  // ============================================================================
  // PARTICIPANTS
  // ============================================================================

  /** Teams and players for a sport. */
  async getParticipants(params: GetParticipantsParams): Promise<Participant[]> {
    return this.get<Participant[]>('participants', { ...params });
  }

  /** One participant by id. */
  async getParticipantById(participantId: number | string): Promise<Participant> {
    return this.get<Participant>(`participants/${encodeURIComponent(String(participantId))}`);
  }

  /**
   * URL of a participant's PNG logo (use `homeId`/`awayId` from events).
   * The URL carries your API key, so only hand it to a browser you trust;
   * otherwise proxy it with `getParticipantLogo`.
   */
  getParticipantLogoUrl(participantId: number | string): string {
    return this.buildUrl(`participants/${encodeURIComponent(String(participantId))}/logo`).toString();
  }

  /** A participant's logo as PNG bytes. Throws NotFoundError when there is none. */
  async getParticipantLogo(participantId: number | string): Promise<ArrayBuffer> {
    const { data } = await this.send<ArrayBuffer>(
      `participants/${encodeURIComponent(String(participantId))}/logo`,
      { raw: true }
    );
    return data;
  }

  // ============================================================================
  // BOOKMAKERS
  // ============================================================================

  /** All bookmakers with their current status. No API key needed. */
  async getBookmakers(): Promise<Bookmaker[]> {
    return this.get<Bookmaker[]>('bookmakers', undefined, false);
  }

  /** The bookmakers selected on your key. */
  async getSelectedBookmakers(): Promise<SelectedBookmakers> {
    return this.get<SelectedBookmakers>('bookmakers/selected');
  }

  /** Add bookmakers to your selection. */
  async selectBookmakers(bookmakers: CommaList): Promise<SelectedBookmakers> {
    const { data } = await this.send<SelectedBookmakers>('bookmakers/selected/select', {
      method: 'PUT',
      query: { bookmakers: joinList(bookmakers) },
    });
    return data;
  }

  /** Clear your selection. Allowed once every 12 hours. */
  async clearSelectedBookmakers(): Promise<SelectedBookmakers> {
    const { data } = await this.send<SelectedBookmakers>('bookmakers/selected/clear', { method: 'PUT' });
    return data;
  }

  // ============================================================================
  // BETTING ANALYSIS
  // ============================================================================

  /**
   * Price gaps across your bookmakers where the best prices imply under 100%
   * (prematch only, refreshed every few seconds). Prices move and limits
   * apply, so check every leg before acting.
   *
   * @example
   * ```typescript
   * const arbs = await client.getArbitrageBets({ bookmakers: ['Bet365', 'SingBet'], sport: 'football', minProfit: 1 });
   * ```
   */
  async getArbitrageBets(params: GetArbitrageBetsParams): Promise<ArbitrageBet[]> {
    return this.get<ArbitrageBet[]>('arbitrage-bets', {
      ...params,
      bookmakers: joinList(params.bookmakers),
      markets: joinList(params.markets),
    });
  }

  /** Prices above a fair-odds estimate at one bookmaker. */
  async getValueBets(params: GetValueBetsParams): Promise<ValueBet[]> {
    return this.get<ValueBet[]>('value-bets', { ...params });
  }

  /**
   * Dropping odds from sharp bookmakers (paid plans).
   *
   * @example
   * ```typescript
   * const drops = await client.getDroppingOdds({ sport: 'football', markets: ['ML'], minDrop: 10 });
   * ```
   */
  async getDroppingOdds(params: GetDroppingOddsParams = {}): Promise<DroppingOddsEntry[]> {
    return (await this.getDroppingOddsPage(params)).data;
  }

  /** Like `getDroppingOdds`, plus the pagination headers. */
  async getDroppingOddsPage(params: GetDroppingOddsParams = {}): Promise<DroppingOddsPage> {
    const { market, ...rest } = params;
    const { data, headers } = await this.send<DroppingOddsEntry[]>('dropping-odds', {
      query: {
        ...rest,
        leagues: joinList(rest.leagues),
        markets: joinList(rest.markets) ?? market,
      },
    });
    return {
      data,
      total: numberHeader(headers, 'x-total-count'),
      page: numberHeader(headers, 'x-page'),
      perPage: numberHeader(headers, 'x-per-page'),
      updatedAt: numberHeader(headers, 'x-updated-at'),
    };
  }

  /** Every dropping-odds entry matching the filters, page by page. */
  async *iterateDroppingOdds(
    params: GetDroppingOddsParams = {},
    options: PageOptions = {}
  ): AsyncGenerator<DroppingOddsEntry> {
    const limit = options.pageSize ?? params.limit ?? 200;
    let page = params.page ?? 1;
    let seen = 0;
    for (let n = 0; options.maxPages === undefined || n < options.maxPages; n++, page++) {
      const result = await this.getDroppingOddsPage({ ...params, limit, page });
      yield* result.data;
      seen += result.data.length;
      if (result.data.length < limit) return;
      if (result.total !== null && seen >= result.total) return;
    }
  }

  // ============================================================================
  // SETTLEMENT
  // ============================================================================

  /**
   * Settlement records (status, final flag, final scores) for events (paid plans).
   * More than 50 ids are split into several requests.
   *
   * @example
   * ```typescript
   * const { settlements, notFound } = await client.getSettlements([74919888, 73101436]);
   * ```
   */
  async getSettlements(eventIds: CommaList<string | number>): Promise<SettlementsResponse> {
    const ids = splitList(eventIds);
    const result: SettlementsResponse = { settlements: [], notFound: [] };
    for (let i = 0; i < ids.length || i === 0; i += SETTLEMENT_BATCH) {
      const page = await this.get<SettlementsResponse>('settlements', {
        eventIds: ids.slice(i, i + SETTLEMENT_BATCH).join(','),
      });
      result.settlements.push(...(page.settlements ?? []));
      result.notFound.push(...(page.notFound ?? []));
    }
    return result;
  }

  /**
   * Grade bet selections against final results (paid plans). Returns one grade
   * per selection, in order. More than 50 selections are sent in batches.
   * Re-send selections that are not `final`, at most once a minute.
   *
   * @example
   * ```typescript
   * const { grades } = await client.gradeBets([
   *   { ref: 'bet-1', eventId: 74919888, market: 'Spread', hdp: -0.75, side: 'home' },
   * ]);
   * ```
   */
  async gradeBets(selections: GradeSelection[]): Promise<GradesResponse> {
    const grades: GradesResponse['grades'] = [];
    for (let i = 0; i < selections.length || i === 0; i += SETTLEMENT_BATCH) {
      const { data } = await this.send<GradesResponse>('settlements/grade', {
        method: 'POST',
        body: { selections: selections.slice(i, i + SETTLEMENT_BATCH) },
      });
      grades.push(...(data.grades ?? []));
    }
    return { grades };
  }

  /** Same as `gradeBets` (the API operation is called GradeSelections). */
  async gradeSelections(selections: GradeSelection[]): Promise<GradesResponse> {
    return this.gradeBets(selections);
  }

  // ============================================================================
  // OUTRIGHTS (paid add-on; a key without it gets ForbiddenError)
  // ============================================================================

  /**
   * Tournaments for a sport (golf today), sorted by date.
   *
   * @example
   * ```typescript
   * const tournaments = await client.getOutrights({ sport: 'golf', league: 'pga-tour' });
   * ```
   */
  async getOutrights(params: GetOutrightsParams): Promise<Outright[]> {
    return this.get<Outright[]>('outrights', { ...params, status: joinList(params.status) });
  }

  /**
   * Prices for one tournament: Winner, Top 5/10/20, the "(Incl. Ties)"
   * variants and Make Cut, per bookmaker.
   *
   * @example
   * ```typescript
   * const odds = await client.getOutrightOdds({ id: 1001, bookmakers: ['DraftKings', 'Betfair Exchange'] });
   * ```
   */
  async getOutrightOdds(params: GetOutrightOddsParams): Promise<OutrightOdds> {
    return this.get<OutrightOdds>('outrights/odds', { ...params, bookmakers: joinList(params.bookmakers) });
  }

  /** Final positions and winners per market for one tournament. */
  async getOutrightResults(id: string | number): Promise<OutrightResults> {
    return this.get<OutrightResults>('outrights/results', { id });
  }

  // ============================================================================
  // MAPPINGS
  // ============================================================================

  /**
   * A bookmaker's own event, market and outcome ids for our events (paid plans).
   * Without eventId(s), marketId(s) or outcomeId it is a bulk sync with a cursor.
   */
  async getMappings(params: GetMappingsParams): Promise<MappingsPage> {
    return this.get<MappingsPage>('mappings', {
      ...params,
      eventIds: joinList(params.eventIds),
      marketIds: joinList(params.marketIds),
    });
  }

  /** Every mapping row, following `nextCursor` until it is null. */
  async *iterateMappings(params: GetMappingsParams, options: PageOptions = {}): AsyncGenerator<Mapping> {
    let cursor = params.cursor;
    const limit = options.pageSize ?? params.limit;
    for (let n = 0; options.maxPages === undefined || n < options.maxPages; n++) {
      const page = await this.getMappings({ ...params, limit, cursor });
      yield* page.data;
      if (!page.nextCursor) return;
      cursor = page.nextCursor;
    }
  }
}
