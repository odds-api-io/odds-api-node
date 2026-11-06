/**
 * TypeScript types for the Odds-API.io v3 REST API.
 *
 * They follow the responses the API serves today. Fields the API leaves out
 * when empty are optional.
 */

/** A comma-separated string, or an array the SDK joins with commas. */
export type CommaList<T extends string | number = string> = string | readonly T[];

/** Market names the API serves. Any other served name is accepted too; see `getMarkets()`. */
export type MarketName =
  | 'ML'
  | 'Spread'
  | 'Totals'
  | 'ML HT'
  | 'Spread HT'
  | 'Totals HT'
  | 'Totals 2H'
  | 'Both Teams To Score'
  | 'Correct Score'
  | 'Double Chance'
  | 'Draw No Bet'
  | 'European Handicap'
  | 'Half Time / Full Time'
  | 'Team Total Home'
  | 'Team Total Away'
  | 'Corners Spread'
  | 'Corners Totals'
  | 'Spread (Games)'
  | 'Totals (Games)'
  | 'Player Props'
  | (string & {});

// ============================================================================
// CATALOGUE
// ============================================================================

export interface Sport {
  name: string;
  slug: string;
}

export interface League {
  name: string;
  slug: string;
  /** Number of events currently listed for the league. */
  eventsCount?: number;
}

/** A `{ name, slug }` pair, used for sports and leagues inside other objects. */
export interface NamedSlug {
  name: string;
  slug: string;
}

export interface Bookmaker {
  name: string;
  active: boolean;
  /** UTC time the bookmaker was added to the API (RFC 3339). */
  createdAt: string;
  /** `ok`, `degraded` (no update for 60+ minutes, still served) or `down` (left out of odds until it recovers). */
  status: 'ok' | 'degraded' | 'down';
  /** Null when ok. */
  reason: 'maintenance' | 'unavailable' | null;
}

export interface SelectedBookmakers {
  bookmakers: string[];
  count: number;
  message?: string;
  /** Number of bookmakers added by a select call. */
  added?: number;
}

export interface MarketInfo {
  name: string;
  shape: 'moneyline' | 'line' | 'outcomes' | 'yesno' | 'labelled';
  period: 'match' | 'first-half' | 'second-half' | 'quarter' | 'set' | 'game' | 'inning';
  /** Served on pending events. */
  prematch: boolean;
  /** Served on live events. */
  live: boolean;
}

export interface MarketsResponse {
  sport: NamedSlug;
  markets: MarketInfo[];
}

/** `/markets` without a sport: market lists keyed by sport slug. */
export type MarketsBySport = Record<string, MarketInfo[]>;

// ============================================================================
// EVENTS
// ============================================================================

export type EventStatus = 'pending' | 'live' | 'settled' | 'cancelled';

/**
 * Period score keys: `p1`..`pN` (that period only), `ft` (end of regulation),
 * `ot` (after overtime), `ap` (after a penalty shootout), `currentgame` (live tennis),
 * `map1`.. and `map1_score`.. (esports), `inning1`.. (cricket).
 * The older `period1`/`overtime`/`penalties`/`fulltime` keys stop being served on 12 November 2026.
 */
export type PeriodKey =
  | `p${number}`
  | 'ft'
  | 'ot'
  | 'ap'
  | 'currentgame'
  | `map${number}`
  | `inning${number}`;

export interface PeriodScore {
  home: number;
  away: number;
  /** Cricket only, when the source publishes it. */
  wickets?: { home: number; away: number };
  /** Cricket only; 19.3 means 19 overs and 3 balls. */
  overs?: { home: number; away: number };
}

export interface Score {
  /** Headline result: includes overtime, never a penalty shootout. */
  home: number;
  away: number;
  /** Treat every key as optional; which ones appear depends on sport and source. */
  periods?: Partial<Record<PeriodKey, PeriodScore>>;
}

export interface Clock {
  minute?: number;
  playedSeconds?: number;
  period?: number;
  running: boolean;
  /** Display text from the feed, not an enum. */
  statusDetail?: string;
  serve?: 'home' | 'away';
  injuryTime?: number;
  /** Unix seconds the current period started (wall time), only for feeds without a played clock. */
  periodStartedAt?: number;
}

export interface EsportsDetails {
  game: NamedSlug;
  league: NamedSlug;
  region?: string;
  format?: { type: 'bestOf' | 'firstTo' | (string & {}); games: number };
}

export interface Event {
  id: number;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
  /** Kickoff, RFC 3339. */
  date: string;
  status: EventStatus;
  sport: NamedSlug;
  league: NamedSlug;
  scores?: Score;
  bookmakerCount?: number;
  /** Live events only, when clock data exists. */
  clock?: Clock;
  /** Esports events only. */
  esports?: EsportsDetails;
}

/** Historical events have the same shape as `/events` (no clock or esports block). */
export type HistoricalEvent = Event;

export interface Participant {
  id: number;
  name: string;
  sport: string;
  /** Esports only: slug of the game the team plays. */
  game?: string;
  /** Esports only, when known. */
  shortCode?: string;
}

// ============================================================================
// ODDS
// ============================================================================

/**
 * One line of a market. Prices are decimal strings. Which fields are present
 * depends on the market shape (home/draw/away, over/under, yes/no, label + odds, ...).
 */
export interface OddsLine {
  hdp?: number;
  label?: string;
  home?: string;
  draw?: string;
  away?: string;
  over?: string;
  under?: string;
  /** Three-way corner lines: over and under both lose on hdp. */
  exactly?: string;
  yes?: string;
  no?: string;
  /** Price of a labelled outcome (Correct Score, Half Time / Full Time, ...). */
  odds?: string;
  '1X'?: string;
  '12'?: string;
  X2?: string;
  odd?: string;
  even?: string;
  none?: string;
  neither?: string;
  /** Stake limit, when the bookmaker publishes one. */
  max?: number;
  homeLink?: string;
  drawLink?: string;
  awayLink?: string;
  layHome?: string;
  layDraw?: string;
  layAway?: string;
  layOver?: string;
  layUnder?: string;
  layYes?: string;
  layNo?: string;
  [field: string]: string | number | undefined;
}

export interface Market {
  name: MarketName;
  updatedAt: string;
  odds: OddsLine[];
}

/** Response of `/odds`, `/odds/multi`, `/odds/updated` and `/historical/odds`. */
export interface EventOdds {
  id: number;
  home: string;
  away: string;
  homeId?: number;
  awayId?: number;
  date: string;
  status: EventStatus;
  sport: NamedSlug;
  league: NamedSlug;
  scores?: Score;
  /** Bookmaker links for the event. */
  urls: Record<string, string>;
  /** Bookmakers' own event ids, where known. */
  bookmakerIds?: Record<string, string>;
  /** Markets per bookmaker name. */
  bookmakers: Record<string, Market[]>;
}

/** Historical odds and closing lines have the `/odds` shape. */
export type HistoricalEventOdds = EventOdds;

/** @deprecated Use `Market`. */
export type MarketOdds = Market;
/** @deprecated Use `Market`. */
export type HistoricalOddsMarket = Market;
/** @deprecated Use `OddsLine`. */
export type HistoricalOddsSelection = OddsLine;
/** @deprecated Use `NamedSlug`. */
export type HistoricalSport = NamedSlug;
/** @deprecated Use `NamedSlug`. */
export type HistoricalLeague = NamedSlug;
/** @deprecated Use `Score`. */
export type HistoricalScore = Score;

export interface OddsMovementPoint {
  home: number;
  draw?: number;
  away: number;
  /** The line at that time, on Spread/Totals. */
  hdp?: string;
  /** Stake limit, when the bookmaker publishes one. */
  max?: number;
  /** Unix milliseconds. */
  timestamp: number;
}

/** On Totals the over price is in `home` and the under price in `away`. */
export interface OddsMovement {
  eventid: string;
  bookmaker: string;
  opening: OddsMovementPoint;
  latest: OddsMovementPoint;
  /** Oldest first; the last entry is the latest price. */
  movements: OddsMovementPoint[];
}

export interface UpdatedOddsResult {
  data: EventOdds[];
  /** Pass as `since` on the next call (from the X-Next-Since header). */
  nextSince: number | null;
  /** Server unix time (X-Server-Time). */
  serverTime: number | null;
  /** Requested market names that do not exist (X-Unknown-Markets). */
  unknownMarkets: string[];
}

export interface OddsSnapshot {
  data: EventOdds[];
  /** WebSocket sequence at the time of the snapshot (X-OddsAPI-Seq); use as `lastSeq`. */
  seq: number | null;
}

// ---------- Odds summary ----------

export interface SummaryOutcome {
  best: number;
  bestBookmakers: string[];
  average: number;
  median: number;
  worst: number;
  /** Margin-free price; needs 3 complete books. */
  fair?: number;
  sharpFair?: number;
  excluded?: number;
}

export interface SummaryExchangeQuote {
  best: number;
  venue: string;
  liquidity?: number;
  currency?: string;
}

export interface SummaryLine {
  hdp: number | null;
  main: boolean;
  books: number;
  fairBooks?: number;
  /** Keyed home/draw/away, over/under or yes/no. */
  outcomes: Record<string, SummaryOutcome>;
  payout?: { best: number; average: number };
  /** With `includeExchanges: true`. */
  exchanges?: Record<string, SummaryExchangeQuote>;
}

export interface SummaryMarket {
  name: MarketName;
  lines: SummaryLine[];
}

export interface EventSummary {
  /** True on plans below Growth, which get a fixed sample response. */
  demo?: boolean;
  message?: string;
  eventId: string;
  home: string;
  away: string;
  date: string;
  status: EventStatus;
  computedAt: string;
  markets: SummaryMarket[];
}

// ============================================================================
// ANALYSIS
// ============================================================================

/** Short event info attached with `includeEventDetails: true`. */
export interface EventInfo {
  home: string;
  away: string;
  date: string;
  sport: string;
  league: string;
}

export type BetSide = 'home' | 'away' | 'draw' | 'over' | 'under';

export interface ArbitrageLeg {
  side: BetSide;
  bookmaker: string;
  /** Decimal price as a string. */
  odds: string;
  /** Price after exchange fees, only when fees apply. */
  netOdds?: string;
  maxStake?: number;
  oddsUpdatedAt?: string;
  /** Bookmaker link, or "N/A". */
  href?: string;
  directLink?: string;
  label?: string;
  bookmakerFixtureId?: string;
}

export interface OptimalStake {
  side: string;
  bookmaker: string;
  stake: number;
  potentialReturn: number;
}

export interface ArbitrageBet {
  id: string;
  eventId: number;
  market: { name: MarketName; hdp?: number; label?: string };
  /** Percent of totalStake at the quoted prices after fees (2.48 = 2.48%). */
  profitMargin: number;
  impliedProbability: number;
  totalStake: number;
  legs: ArbitrageLeg[];
  optimalStakes: OptimalStake[];
  updatedAt: string;
  firstSeenAt?: string;
  event?: EventInfo;
}

export interface ValueBet {
  id: string;
  eventId: number;
  bookmaker: string;
  market: {
    name: MarketName;
    hdp?: number;
    home: string;
    draw?: string;
    away: string;
    max: number | null;
  };
  betSide?: string;
  /** 0.0523 means +5.23% EV. */
  expectedValue: number;
  expectedValueUpdatedAt: string;
  firstSeenAt?: string;
  bookmakerOddsUpdatedAt?: string;
  bookmakerOdds: {
    home: string;
    away: string;
    draw?: string;
    hdp?: string;
    href?: string;
    homeDirectLink?: string;
    drawDirectLink?: string;
    awayDirectLink?: string;
  };
  event?: EventInfo;
}

export interface DroppingOddsEntry {
  eventId: number;
  event?: {
    home: string;
    away: string;
    date: string;
    sport: NamedSlug;
    league: NamedSlug;
  };
  market: {
    name: MarketName;
    hdp?: number;
    /** Player name on player prop markets. */
    label?: string;
  };
  betSide: BetSide;
  odds: {
    opening: number;
    current: number;
    drop: {
      sinceOpening: number;
      '12h': number | null;
      '24h': number | null;
      '48h': number | null;
    };
  };
  lastMovedAt: number | null;
  updatedAt: number;
}

export interface DroppingOddsPage {
  data: DroppingOddsEntry[];
  /** X-Total-Count */
  total: number | null;
  /** X-Page */
  page: number | null;
  /** X-Per-Page */
  perPage: number | null;
  /** X-Updated-At, unix milliseconds. */
  updatedAt: number | null;
}

// ============================================================================
// SETTLEMENT
// ============================================================================

export interface Settlement {
  eventId: number;
  sport: string;
  status: 'pending' | 'live' | 'awaiting_result' | 'settled' | 'cancelled';
  /** True when you can stop polling. */
  final: boolean;
  settledAt?: string;
  /** Settled events only. */
  scores?: Score;
}

export interface SettlementsResponse {
  settlements: Settlement[];
  /** Ids that were never seen. */
  notFound: string[];
}

export interface GradeSelection {
  /** Echoed back, up to 64 characters. */
  ref?: string;
  eventId: number | string;
  /** Market name exactly as served on /odds (case-insensitive). */
  market: MarketName;
  /** home, away, draw, over, under, yes, no, odd, even, 1x, 12, x2, none, neither, or an HT/FT pair such as draw/home. */
  side?: string;
  /** The line as served on /odds, stated for the home side; a multiple of 0.25. */
  hdp?: number;
  /** Required for Player Props and labelled markets. */
  label?: string;
  tieRule?: 'lose' | 'void';
}

export type GradeResult = 'won' | 'lost' | 'void' | 'half_won' | 'half_lost' | 'pending' | 'ungradeable';

export type GradeReason =
  | 'push'
  | 'event_cancelled'
  | 'event_not_started'
  | 'event_live'
  | 'awaiting_result'
  | 'awaiting_stats'
  | 'event_not_found'
  | 'unsupported_market'
  | 'invalid_side'
  | 'invalid_line'
  | 'invalid_label'
  | 'incomplete_score'
  | 'ambiguous_tie'
  | 'player_not_matched'
  | 'stats_unavailable'
  | 'result_unavailable';

export interface Grade {
  ref?: string;
  eventId: number;
  result: GradeResult;
  reason: GradeReason | null;
  /** True when you can stop polling this selection. */
  final: boolean;
  /** The score the verdict was computed from, on graded score markets. */
  basis?: { scope: string; home: number; away: number };
}

export interface GradesResponse {
  grades: Grade[];
}

// ============================================================================
// OUTRIGHTS
// ============================================================================

export type OutrightMarketName =
  | 'Winner'
  | 'Top 5'
  | 'Top 5 (Incl. Ties)'
  | 'Top 10'
  | 'Top 10 (Incl. Ties)'
  | 'Top 20'
  | 'Top 20 (Incl. Ties)'
  | 'Make Cut'
  | (string & {});

export interface Outright {
  id: number;
  name: string;
  date: string;
  status: EventStatus;
  sport: NamedSlug;
  league: NamedSlug;
  /** Bookmakers you can request that currently price the tournament. */
  bookmakerCount: number;
}

/** Winner and Top N runners: a back price, plus a lay price on exchanges and prediction markets. */
export interface OutrightPriceRunner {
  label: string;
  participantId: number;
  odds: string;
  layOdds?: string;
}

/** Make Cut runners: yes/no prices, plus lay prices on exchanges. */
export interface OutrightYesNoRunner {
  label: string;
  participantId: number;
  yes?: string;
  no?: string;
  layYes?: string;
  layNo?: string;
}

export type OutrightRunner = OutrightPriceRunner | OutrightYesNoRunner;

export interface OutrightMarket {
  name: OutrightMarketName;
  updatedAt: string;
  odds: OutrightRunner[];
}

export interface OutrightOdds {
  id: number;
  name: string;
  date: string;
  status: EventStatus;
  sport: NamedSlug;
  league: NamedSlug;
  /** Empty for settled and cancelled tournaments. */
  bookmakers: Record<string, OutrightMarket[]>;
}

export interface OutrightResultRow {
  label: string;
  participantId: number;
  /** Shared by tied golfers; null for cut, withdrawn and disqualified. */
  position: number | null;
  tied: boolean;
  /** Null for events without a cut. */
  madeCut: boolean | null;
  status: 'finished' | 'cut' | 'withdrawn' | 'disqualified';
}

export interface OutrightResults {
  id: number;
  name: string;
  status: EventStatus;
  /** Empty until the tournament is settled. */
  results: OutrightResultRow[];
  /** Participant ids per market name. */
  winners: Partial<Record<OutrightMarketName, number[]>>;
}

// ============================================================================
// MAPPINGS
// ============================================================================

export interface Mapping {
  eventId: number;
  home: string;
  away: string;
  date: string;
  sport: NamedSlug;
  league: NamedSlug;
  bookmaker: string;
  market: MarketName;
  label?: string;
  hdp?: number;
  side: 'home' | 'away' | 'draw' | 'over' | 'under' | 'yes' | 'no';
  nativeEventId?: string;
  marketId: string;
  outcomeId: string;
  outcomeLabel?: string;
  extra?: Record<string, unknown>;
  active: boolean;
  firstSeenAt: string;
  lastCheckedAt: string;
}

export interface MappingsPage {
  data: Mapping[];
  /** Set in bulk sync while more pages remain. */
  nextCursor: string | null;
}

// ============================================================================
// CLIENT CONFIG
// ============================================================================

export interface RateLimitInfo {
  limit: number | null;
  remaining: number | null;
  /** When the hourly window resets. */
  reset: Date | null;
}

export interface OddsAPIClientConfig {
  /** Your Odds-API.io API key. */
  apiKey: string;
  /** Base API URL (default: https://api.odds-api.io/v3). */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 10000). */
  timeout?: number;
  /**
   * Retries on 5xx, network errors and timeouts, and on 429 when the server
   * asks for a wait no longer than `maxRetryDelay` (default: 2). Set 0 to disable.
   * Bookmaker selection changes (PUT) are never retried.
   */
  maxRetries?: number;
  /** Longest wait between retries in milliseconds (default: 10000). */
  maxRetryDelay?: number;
  /** A custom fetch implementation (default: the global fetch). */
  fetch?: typeof fetch;
}

// ============================================================================
// REQUEST PARAMETERS
// ============================================================================

export interface GetLeaguesOptions {
  /** Include leagues without current events. */
  all?: boolean;
}

export interface GetEventsParams {
  sport: string;
  league?: string;
  participantId?: number;
  /** One status or a list: pending, live, settled, cancelled. */
  status?: EventStatus | CommaList<EventStatus>;
  /** RFC 3339. */
  from?: string;
  /** RFC 3339. Defaults to 14 days from now. */
  to?: string;
  /** Only events with odds from this bookmaker. */
  bookmaker?: string;
  /** Max events per response (capped at 5000). */
  limit?: number;
  /** Offset for pagination. */
  skip?: number;
}

export interface SearchEventsOptions {
  /** `upcoming` (default) or `live`. */
  status?: 'upcoming' | 'live';
}

export interface GetHistoricalEventsParams {
  sport: string;
  league: string;
  /** RFC 3339. The span from `from` to `to` is at most 31 days. */
  from: string;
  /** RFC 3339. */
  to: string;
}

export interface SearchHistoricalEventsParams {
  /** At least 3 characters. */
  query: string;
  sport?: string;
  /** RFC 3339. Defaults to 31 days before `to`. Span at most 31 days. */
  from?: string;
  /** RFC 3339. Defaults to now. */
  to?: string;
}

export interface GetOddsParams {
  eventId: string | number;
  /** Bookmaker names, max 30. */
  bookmakers: CommaList;
  /** Market names, max 40. Strongly recommended: a full response can be very large. */
  markets?: CommaList<MarketName>;
  /** Adds the WebSocket sequence as the X-OddsAPI-Seq header (see `getOddsSnapshot`). */
  includeSeq?: boolean;
}

export interface GetMultiEventOddsParams {
  /** Up to 10 event ids. */
  eventIds: CommaList<string | number>;
  bookmakers: CommaList;
  markets?: CommaList<MarketName>;
  includeSeq?: boolean;
}

export interface GetHistoricalOddsParams {
  eventId: string | number;
  bookmakers: CommaList;
  markets?: CommaList<MarketName>;
}

export interface GetClosingLinesParams {
  sport: string;
  /** Up to 10 league slugs. */
  leagues: CommaList;
  /** RFC 3339. */
  from: string;
  /** RFC 3339, at most 366 days after `from`. */
  to: string;
  markets: CommaList<MarketName>;
  /** Max 30. */
  bookmakers: CommaList;
  /** Capped at 100. */
  limit?: number;
  skip?: number;
}

export interface GetOddsMovementParams {
  eventId: string | number;
  bookmaker: string;
  market: MarketName;
  /** Leave out for the main line or markets without a line. */
  marketLine?: string | number;
}

export interface GetUpdatedOddsSinceParams {
  /** Unix seconds, no more than 90 seconds old (or the previous X-Next-Since). */
  since: number;
  bookmaker: string;
  sport: string;
  /** Required. Market names, max 40. */
  markets: CommaList<MarketName>;
  /** 1 to 10000. */
  limit?: number;
}

export interface PollUpdatedOddsParams extends Omit<GetUpdatedOddsSinceParams, 'since'> {
  /** First `since`; defaults to now minus 20 seconds. */
  since?: number;
  /** Delay between polls in milliseconds (default: 10000). */
  intervalMs?: number;
  /** Stops the loop. */
  signal?: AbortSignal;
}

export interface GetOddsSummaryParams {
  eventId: string | number;
  /** Max 20. Default ML,Spread,Totals. */
  markets?: CommaList<MarketName>;
  /** `main` (default) or `all`. */
  lines?: 'main' | 'all';
  bookmakers?: CommaList;
  includeExchanges?: boolean;
}

export interface GetOddsSummaryMultiParams extends Omit<GetOddsSummaryParams, 'eventId'> {
  /** Up to 10 event ids. */
  eventIds: CommaList<string | number>;
}

export interface GetParticipantsParams {
  sport: string;
  search?: string;
}

export interface GetArbitrageBetsParams {
  bookmakers: CommaList;
  sport?: string;
  /** Requires sport. */
  league?: string;
  markets?: CommaList<MarketName>;
  /** Minimum profitMargin in percent, 0 to 100. */
  minProfit?: number;
  /** Every bookmaker combination per event, market and line, best first. */
  allCombinations?: boolean;
  /** Default 50, max 500. */
  limit?: number;
  includeEventDetails?: boolean;
}

export interface GetValueBetsParams {
  bookmaker: string;
  sport?: string;
  /** Requires sport. */
  league?: string;
  includeEventDetails?: boolean;
}

export interface GetDroppingOddsParams {
  sport?: string;
  /** Requires sport. Not with `leagues`. */
  league?: string;
  leagues?: CommaList;
  markets?: CommaList<MarketName>;
  /** @deprecated Use `markets`. Sent as `markets`. */
  market?: string;
  timeWindow?: 'opening' | '12h' | '24h' | '48h';
  sort?: 'drop' | 'recent' | 'kickoff';
  minDrop?: number;
  /** Max 200. */
  limit?: number;
  /** 1-indexed. */
  page?: number;
  includeEventDetails?: boolean;
}

export interface GetOutrightsParams {
  /** Golf today. */
  sport: string;
  /** pga-tour, dp-world-tour, liv-golf or majors. */
  league?: string;
  /** Default pending,live. */
  status?: EventStatus | CommaList<EventStatus>;
}

export interface GetOutrightOddsParams {
  id: string | number;
  /** Max 30. */
  bookmakers: CommaList;
}

export interface GetMappingsParams {
  bookmaker: string;
  eventId?: string | number;
  /** Up to 10. */
  eventIds?: CommaList<string | number>;
  marketId?: string;
  /** Up to 10. */
  marketIds?: CommaList;
  outcomeId?: string;
  /** Exact market name as in /odds, case-sensitive. */
  market?: string;
  active?: boolean;
  /** Bulk sync only. */
  sport?: string;
  /** Bulk sync only, requires sport. */
  league?: string;
  /** Bulk sync only, 1 to 5000. */
  limit?: number;
  /** Bulk sync only: nextCursor of the previous page. */
  cursor?: string;
}

export interface PageOptions {
  /** Page size per request. */
  pageSize?: number;
  /** Stop after this many pages. */
  maxPages?: number;
}
