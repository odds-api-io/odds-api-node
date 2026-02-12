import {
  OddsAPIClientConfig,
  Sport,
  League,
  Event,
  Participant,
  Bookmaker,
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
import {
  OddsAPIError,
  InvalidAPIKeyError,
  RateLimitExceededError,
  NotFoundError,
  TimeoutError,
  NetworkError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://api2.odds-api.io/v3';
const DEFAULT_TIMEOUT = 10000;

/**
 * Official Node.js client for Odds-API.io
 * 
 * @example
 * ```typescript
 * import { OddsAPIClient } from 'odds-api-io';
 * 
 * const client = new OddsAPIClient({ apiKey: 'your-api-key' });
 * const sports = await client.getSports();
 * ```
 */
export class OddsAPIClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: OddsAPIClientConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
  }

  /**
   * Make a GET request to the API
   */
  private async request<T>(
    path: string,
    params: Record<string, any> = {},
    requiresAuth: boolean = false
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);

    // Add query parameters
    if (requiresAuth) {
      params.apiKey = this.apiKey;
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'odds-api-io-node-sdk/1.0.0',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${this.timeout}ms`);
      }

      if (error instanceof OddsAPIError) {
        throw error;
      }

      throw new NetworkError(`Network request failed: ${error.message}`);
    }
  }

  /**
   * Make a PUT request to the API
   */
  private async requestPut<T>(
    path: string,
    params: Record<string, any> = {},
    requiresAuth: boolean = false
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${path}`);

    // Add query parameters
    if (requiresAuth) {
      params.apiKey = this.apiKey;
    }

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: 'PUT',
        signal: controller.signal,
        headers: {
          'User-Agent': 'odds-api-io-node-sdk/1.0.0',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      return (await response.json()) as T;
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new TimeoutError(`Request timeout after ${this.timeout}ms`);
      }

      if (error instanceof OddsAPIError) {
        throw error;
      }

      throw new NetworkError(`Network request failed: ${error.message}`);
    }
  }

  /**
   * Handle error responses from the API
   */
  private async handleErrorResponse(response: Response): Promise<never> {
    const status = response.status;
    let errorMessage: string;

    try {
      const errorBody = await response.text();
      errorMessage = errorBody || response.statusText;
    } catch {
      errorMessage = response.statusText;
    }

    switch (status) {
      case 401:
        throw new InvalidAPIKeyError('Invalid API key');
      case 429:
        throw new RateLimitExceededError('Rate limit exceeded - please wait before retrying');
      case 404:
        throw new NotFoundError('Resource not found');
      default:
        throw new OddsAPIError(`API error ${status}: ${errorMessage}`);
    }
  }

  // ============================================================================
  // SPORTS & LEAGUES
  // ============================================================================

  /**
   * Get all available sports
   * 
   * @returns List of available sports
   * 
   * @example
   * ```typescript
   * const sports = await client.getSports();
   * console.log(`Found ${sports.length} sports`);
   * ```
   */
  async getSports(): Promise<Sport[]> {
    return this.request<Sport[]>('sports');
  }

  /**
   * Get leagues for a specific sport
   * 
   * @param sport - Sport identifier (e.g., 'basketball', 'football')
   * @returns List of leagues
   * 
   * @example
   * ```typescript
   * const leagues = await client.getLeagues('basketball');
   * ```
   */
  async getLeagues(sport: string): Promise<League[]> {
    return this.request<League[]>('leagues', { sport }, true);
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  /**
   * Get events with optional filters
   * 
   * @param params - Event filter parameters
   * @returns List of events
   * 
   * @example
   * ```typescript
   * const events = await client.getEvents({
   *   sport: 'basketball',
   *   league: 'usa-nba'
   * });
   * ```
   */
  async getEvents(params: GetEventsParams): Promise<Event[]> {
    return this.request<Event[]>('events', params, true);
  }

  /**
   * Get a specific event by ID
   * 
   * @param eventId - Event ID
   * @returns Event details
   * 
   * @example
   * ```typescript
   * const event = await client.getEventById('62924717');
   * ```
   */
  async getEventById(eventId: string): Promise<Event> {
    return this.request<Event>(`events/${eventId}`, {}, true);
  }

  /**
   * Get currently live events for a sport
   * 
   * @param sport - Sport identifier
   * @returns List of live events
   * 
   * @example
   * ```typescript
   * const liveEvents = await client.getLiveEvents('basketball');
   * ```
   */
  async getLiveEvents(sport: string): Promise<Event[]> {
    return this.request<Event[]>('events/live', { sport }, true);
  }

  /**
   * Search for events by keyword
   * 
   * @param query - Search query
   * @returns List of matching events
   * 
   * @example
   * ```typescript
   * const events = await client.searchEvents('Lakers');
   * ```
   */
  async searchEvents(query: string): Promise<Event[]> {
    return this.request<Event[]>('events/search', { query }, true);
  }

  // ============================================================================
  // ODDS
  // ============================================================================

  /**
   * Get odds for a specific event
   * 
   * @param params - Odds query parameters
   * @returns Event odds data
   * 
   * @example
   * ```typescript
   * const odds = await client.getEventOdds({
   *   eventId: '62924717',
   *   bookmakers: 'singbet,bet365'
   * });
   * ```
   */
  async getEventOdds(params: GetOddsParams): Promise<EventOdds> {
    return this.request<EventOdds>('odds', params, true);
  }

  /**
   * Track odds movements for an event
   * 
   * @param params - Odds movement parameters
   * @returns Historical odds movements
   * 
   * @example
   * ```typescript
   * const movements = await client.getOddsMovement({
   *   eventId: '62924717',
   *   bookmaker: 'singbet',
   *   market: 'moneyline'
   * });
   * ```
   */
  async getOddsMovement(params: GetOddsMovementParams): Promise<OddsMovement> {
    return this.request<OddsMovement>('odds/movements', params, true);
  }

  /**
   * Get odds for multiple events at once
   * 
   * @param params - Multi-event odds parameters
   * @returns Array of event odds
   * 
   * @example
   * ```typescript
   * const odds = await client.getOddsForMultipleEvents({
   *   eventIds: '12345,67890',
   *   bookmakers: 'singbet,bet365'
   * });
   * ```
   */
  async getOddsForMultipleEvents(params: GetMultiEventOddsParams): Promise<EventOdds[]> {
    return this.request<EventOdds[]>('odds/multi', params, true);
  }

  /**
   * Get odds updated since a given timestamp
   * 
   * @param params - Updated odds parameters
   * @returns Array of updated event odds
   * 
   * @example
   * ```typescript
   * const updatedOdds = await client.getUpdatedOddsSince({
   *   since: Date.now() - 3600000, // Last hour
   *   bookmaker: 'singbet',
   *   sport: 'basketball'
   * });
   * ```
   */
  async getUpdatedOddsSince(params: GetUpdatedOddsSinceParams): Promise<EventOdds[]> {
    return this.request<EventOdds[]>('odds/updated', params, true);
  }

  // ============================================================================
  // PARTICIPANTS
  // ============================================================================

  /**
   * Get participants (teams/players) for a sport
   * 
   * @param params - Participant query parameters
   * @returns List of participants
   * 
   * @example
   * ```typescript
   * const participants = await client.getParticipants({
   *   sport: 'basketball',
   *   search: 'Warriors'
   * });
   * ```
   */
  async getParticipants(params: GetParticipantsParams): Promise<Participant[]> {
    return this.request<Participant[]>('participants', params, true);
  }

  /**
   * Get a specific participant by ID
   * 
   * @param participantId - Participant ID
   * @returns Participant details
   * 
   * @example
   * ```typescript
   * const participant = await client.getParticipantById(3428);
   * ```
   */
  async getParticipantById(participantId: number): Promise<Participant> {
    return this.request<Participant>(`participants/${participantId}`, {}, true);
  }

  // ============================================================================
  // BOOKMAKERS
  // ============================================================================

  /**
   * Get all available bookmakers
   * 
   * @returns List of bookmakers
   * 
   * @example
   * ```typescript
   * const bookmakers = await client.getBookmakers();
   * ```
   */
  async getBookmakers(): Promise<Bookmaker[]> {
    return this.request<Bookmaker[]>('bookmakers');
  }

  /**
   * Get your selected bookmakers
   * 
   * @returns List of selected bookmakers
   * 
   * @example
   * ```typescript
   * const selected = await client.getSelectedBookmakers();
   * ```
   */
  async getSelectedBookmakers(): Promise<Bookmaker[]> {
    return this.request<Bookmaker[]>('bookmakers/selected', {}, true);
  }

  /**
   * Select specific bookmakers for your account
   * 
   * @param bookmakers - Comma-separated bookmaker IDs
   * @returns Success response
   * 
   * @example
   * ```typescript
   * await client.selectBookmakers('singbet,bet365');
   * ```
   */
  async selectBookmakers(bookmakers: string): Promise<{ success: boolean }> {
    return this.requestPut<{ success: boolean }>(
      'bookmakers/selected/select',
      { bookmakers },
      true
    );
  }

  /**
   * Clear your selected bookmakers
   * 
   * @returns Success response
   * 
   * @example
   * ```typescript
   * await client.clearSelectedBookmakers();
   * ```
   */
  async clearSelectedBookmakers(): Promise<{ success: boolean }> {
    return this.requestPut<{ success: boolean }>('bookmakers/selected/clear', {}, true);
  }

  // ============================================================================
  // BETTING ANALYSIS
  // ============================================================================

  /**
   * Find arbitrage betting opportunities
   * 
   * @param params - Arbitrage bet parameters
   * @returns List of arbitrage opportunities
   * 
   * @example
   * ```typescript
   * const arbs = await client.getArbitrageBets({
   *   bookmakers: 'singbet,bet365',
   *   limit: 10,
   *   includeEventDetails: true
   * });
   * ```
   */
  async getArbitrageBets(params: GetArbitrageBetsParams): Promise<ArbitrageBet[]> {
    return this.request<ArbitrageBet[]>('arbitrage-bets', params, true);
  }

  /**
   * Find value betting opportunities
   * 
   * @param params - Value bet parameters
   * @returns List of value bets
   * 
   * @example
   * ```typescript
   * const valueBets = await client.getValueBets({
   *   bookmaker: 'singbet',
   *   includeEventDetails: true
   * });
   * ```
   */
  async getValueBets(params: GetValueBetsParams): Promise<ValueBet[]> {
    return this.request<ValueBet[]>('value-bets', params, true);
  }
}
