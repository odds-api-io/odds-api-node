/**
 * Odds-API.io Node.js SDK
 * 
 * Official Node.js client for Odds-API.io - Real-time sports betting odds from 250+ bookmakers
 * 
 * @packageDocumentation
 */

export { OddsAPIClient } from './client.js';

export {
  OddsAPIError,
  InvalidAPIKeyError,
  RateLimitExceededError,
  NotFoundError,
  TimeoutError,
  NetworkError,
} from './errors.js';

export type {
  OddsAPIClientConfig,
  Sport,
  League,
  Event,
  HistoricalSport,
  HistoricalLeague,
  HistoricalScore,
  HistoricalEvent,
  Participant,
  Bookmaker,
  MarketOdds,
  EventOdds,
  HistoricalEventOdds,
  HistoricalOddsMarket,
  HistoricalOddsSelection,
  OddsMovement,
  ArbitrageBet,
  ValueBet,
  GetEventsParams,
  GetHistoricalEventsParams,
  GetOddsParams,
  GetHistoricalOddsParams,
  GetOddsMovementParams,
  GetMultiEventOddsParams,
  GetUpdatedOddsSinceParams,
  GetParticipantsParams,
  GetArbitrageBetsParams,
  GetValueBetsParams,
  DroppingOddsEntry,
  GetDroppingOddsParams,
} from './types.js';
