/**
 * TypeScript type definitions for Odds-API.io
 */

export interface Sport {
  id: string;
  name: string;
  description?: string;
}

export interface League {
  id: string;
  name: string;
  sport: string;
  country?: string;
}

export interface Participant {
  id: number;
  name: string;
  sport: string;
  country?: string;
  logo?: string;
}

export interface Event {
  id: string;
  sport: string;
  league: string;
  leagueId: string;
  startTime: string;
  status?: 'upcoming' | 'live' | 'finished';
  homeParticipant: {
    id: number;
    name: string;
  };
  awayParticipant: {
    id: number;
    name: string;
  };
  score?: {
    home: number;
    away: number;
  };
}

interface HistoricalNamedSlug {
  name: string;
  slug: string;
}

export interface HistoricalSport extends HistoricalNamedSlug {}
export interface HistoricalLeague extends HistoricalNamedSlug {}

export interface HistoricalScore {
  home: number;
  away: number;
}

export interface HistoricalEvent {
  id: number;
  home: string;
  away: string;
  homeId: number;
  awayId: number;
  date: string;
  status: string;
  sport: HistoricalSport;
  league: HistoricalLeague;
  scores?: HistoricalScore;
}

export interface Bookmaker {
  id: string;
  name: string;
  url?: string;
}

export interface MarketOdds {
  market: string;
  marketLine?: string | number;
  outcomes: Array<{
    name: string;
    odds: number;
    bookmaker: string;
    timestamp: number;
  }>;
}

export interface EventOdds {
  eventId: string;
  bookmakers: string[];
  markets: MarketOdds[];
}

export interface OddsMovement {
  eventId: string;
  bookmaker: string;
  market: string;
  marketLine?: string | number;
  movements: Array<{
    odds: number;
    timestamp: number;
  }>;
}

export interface HistoricalOddsSelection {
  [key: string]: string | number | undefined;
}

export interface HistoricalOddsMarket {
  name: string;
  odds: HistoricalOddsSelection[];
  updatedAt?: string;
}

export interface HistoricalEventOdds {
  id: number;
  home: string;
  away: string;
  date: string;
  status: string;
  sport: HistoricalSport;
  league: HistoricalLeague;
  scores?: HistoricalScore;
  bookmakers: Record<string, HistoricalOddsMarket[]>;
  urls?: Record<string, string>;
}

export interface ArbitrageBet {
  eventId: string;
  market: string;
  marketLine?: string | number;
  profitPercentage: number;
  legs: Array<{
    outcome: string;
    bookmaker: string;
    odds: number;
    stake?: number;
  }>;
  event?: Event;
}

export interface ValueBet {
  eventId: string;
  bookmaker: string;
  market: string;
  marketLine?: string | number;
  outcome: string;
  odds: number;
  fairOdds: number;
  valuePercentage: number;
  event?: Event;
}

export interface DroppingOddsEntry {
  eventId: number;
  event?: {
    home: string;
    away: string;
    date: string;
    sport: { name: string; slug: string };
    league: { name: string; slug: string };
  };
  market: {
    name: string;
    hdp?: number;
  };
  betSide: string;
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

/**
 * Parameters for getting dropping odds
 */
export interface GetDroppingOddsParams {
  sport?: string;
  league?: string;
  market?: string;
  timeWindow?: 'opening' | '12h' | '24h' | '48h';
  sort?: 'drop' | 'recent' | 'kickoff';
  minDrop?: number;
  limit?: number;
  page?: number;
  includeEventDetails?: boolean;
}

/**
 * Client configuration options
 */
export interface OddsAPIClientConfig {
  /**
   * Your Odds-API.io API key
   */
  apiKey: string;

  /**
   * Base API URL (default: https://api2.odds-api.io/v3)
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds (default: 10000)
   */
  timeout?: number;
}

/**
 * Parameters for getting events
 */
export interface GetEventsParams {
  sport: string;
  league?: string;
  participantId?: number;
  status?: 'upcoming' | 'live' | 'finished';
  /** Start time filter (ISO 8601 timestamp) */
  from?: string;
  /** End time filter (ISO 8601 timestamp) */
  to?: string;
  bookmaker?: string;
}

/**
 * Parameters for getting historical events
 */
export interface GetHistoricalEventsParams {
  sport: string;
  league: string;
  /** Start date filter (RFC3339 timestamp) */
  from: string;
  /** End date filter (RFC3339 timestamp) */
  to: string;
}

/**
 * Parameters for getting odds
 */
export interface GetOddsParams {
  eventId: string;
  bookmakers: string;
}

/**
 * Parameters for getting historical event odds
 */
export interface GetHistoricalOddsParams {
  eventId: string;
  bookmakers: string;
}

/**
 * Parameters for getting odds movement
 */
export interface GetOddsMovementParams {
  eventId: string;
  bookmaker: string;
  market: string;
  marketLine?: string | number;
}

/**
 * Parameters for getting multi-event odds
 */
export interface GetMultiEventOddsParams {
  eventIds: string;
  bookmakers: string;
}

/**
 * Parameters for getting updated odds since timestamp
 */
export interface GetUpdatedOddsSinceParams {
  since: number;
  bookmaker: string;
  sport: string;
}

/**
 * Parameters for getting participants
 */
export interface GetParticipantsParams {
  sport: string;
  search?: string;
}

/**
 * Parameters for getting arbitrage bets
 */
export interface GetArbitrageBetsParams {
  bookmakers: string;
  limit?: number;
  includeEventDetails?: boolean;
}

/**
 * Parameters for getting value bets
 */
export interface GetValueBetsParams {
  bookmaker: string;
  includeEventDetails?: boolean;
}
