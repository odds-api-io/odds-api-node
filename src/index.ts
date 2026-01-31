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
  Participant,
  Bookmaker,
  MarketOdds,
  EventOdds,
  OddsMovement,
  ArbitrageBet,
  ValueBet,
  GetEventsParams,
  GetOddsParams,
  GetOddsMovementParams,
  GetMultiEventOddsParams,
  GetUpdatedOddsSinceParams,
  GetParticipantsParams,
  GetArbitrageBetsParams,
  GetValueBetsParams,
} from './types.js';
