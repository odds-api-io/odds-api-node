/**
 * WebSocket Real-Time Odds Feed with Optional Initial Snapshot
 *
 * Connects to the Odds-API WebSocket for real-time odds updates.
 * Optionally pre-fetches all current odds via REST API first, so you
 * have a complete snapshot before the live feed starts.
 *
 * Usage:
 *   # WebSocket only
 *   npx tsx examples/websocket-feed.ts
 *
 *   # With initial snapshot (recommended)
 *   npx tsx examples/websocket-feed.ts --prefetch
 *
 * Requirements:
 *   npm install ws odds-api-io
 */

import WebSocket from 'ws';
import { OddsAPIClient } from 'odds-api-io';

// ─── Configuration ────────────────────────────────────────────────────
const API_KEY = process.env.ODDS_API_KEY || 'your-api-key-here';

// WebSocket filters
const MARKETS = 'ML,Spread,Totals';       // Required (max 20)
const SPORT = 'football';                  // Optional (max 10)
const LEAGUES = 'england-premier-league';  // Optional (max 20)
const STATUS = 'prematch';                 // "live" or "prematch"
const BOOKMAKERS = 'Bet365,SingBet';       // Bookmakers for initial fetch

const WS_URL = 'wss://api.odds-api.io/v3/ws';
// ─────────────────────────────────────────────────────────────────────

interface MarketOdds {
  name: string;
  updatedAt: string;
  odds: Array<Record<string, any>>;
}

interface WsMessage {
  type: 'welcome' | 'created' | 'updated' | 'deleted' | 'no_markets';
  id?: string;
  bookie?: string;
  timestamp?: string;
  markets?: MarketOdds[];
  message?: string;
  bookmakers?: string[];
  sport_filter?: string[];
  leagues_filter?: string[];
  status_filter?: string;
  warning?: string;
}

/**
 * Real-time odds client with optional REST API pre-fetch.
 *
 * When prefetch=true, fetches all current odds via REST before
 * connecting to WebSocket. This gives you a complete snapshot
 * so you don't miss any data while connecting.
 */
class OddsWebSocketClient {
  private ws: WebSocket | null = null;
  private shouldReconnect = true;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private pingInterval: NodeJS.Timeout | null = null;

  // In-memory odds store: eventId -> bookmaker -> markets
  public oddsStore: Map<string, Record<string, MarketOdds[]>> = new Map();

  constructor(
    private apiKey: string,
    private markets: string,
    private sport?: string,
    private leagues?: string,
    private status?: string,
    private bookmakers?: string,
    private prefetch: boolean = false
  ) {}

  /**
   * Pre-fetch all current odds via REST API.
   * Populates oddsStore with a complete snapshot.
   */
  async initialFetch(): Promise<void> {
    console.log('='.repeat(60));
    console.log('INITIAL FETCH: Loading current odds via REST API...');
    console.log('='.repeat(60));

    const client = new OddsAPIClient({ apiKey: this.apiKey });

    try {
      // Get events
      let events = await client.getEvents({
        sport: this.sport || 'football',
        league: this.leagues || undefined,
      });

      // Filter by status if set
      if (this.status) {
        events = events.filter((e: any) => e.status === this.status);
      }

      console.log(`Found ${events.length} events. Fetching odds...\n`);

      for (const event of events) {
        const eventId = String(event.id);
        try {
          const oddsData: any = await client.getEventOdds({
            eventId: event.id,
            bookmakers: this.bookmakers || 'Bet365',
          });

          const bookmakers = oddsData.bookmakers || {};
          if (Object.keys(bookmakers).length > 0) {
            this.oddsStore.set(eventId, bookmakers);

            // Print summary
            for (const [bookie, markets] of Object.entries(bookmakers)) {
              const ml = (markets as any[]).find((m: any) => m.name === 'ML');
              if (ml?.odds?.[0]) {
                const o = ml.odds[0];
                console.log(
                  `  ${event.home} vs ${event.away} [${bookie}]: ` +
                  `H ${o.home || '-'} | D ${o.draw || '-'} | A ${o.away || '-'}`
                );
              }
            }
          }
        } catch (e: any) {
          console.log(`  ${event.home} vs ${event.away}: Could not fetch (${e.message})`);
        }
      }

      console.log(`\nInitial fetch complete: ${this.oddsStore.size} events loaded`);
      console.log('='.repeat(60));
      console.log();
    } catch (e: any) {
      console.error('Initial fetch failed:', e.message);
    }
  }

  private buildUrl(): string {
    let url = `${WS_URL}?apiKey=${this.apiKey}&markets=${this.markets}`;
    if (this.sport) url += `&sport=${this.sport}`;
    if (this.leagues) url += `&leagues=${this.leagues}`;
    if (this.status) url += `&status=${this.status}`;
    return url;
  }

  private handleMessage(raw: WebSocket.Data): void {
    try {
      const data: WsMessage = JSON.parse(raw.toString());

      switch (data.type) {
        case 'welcome':
          console.log('Connected to Odds-API WebSocket');
          console.log(`  Bookmakers: ${data.bookmakers?.join(', ') || 'N/A'}`);
          console.log(`  Sports: ${data.sport_filter?.join(', ') || 'all'}`);
          console.log(`  Leagues: ${data.leagues_filter?.join(', ') || 'all'}`);
          console.log(`  Status: ${data.status_filter || 'all'}`);
          if (data.warning) console.log(`  Warning: ${data.warning}`);
          console.log('\nListening for real-time updates...\n');
          break;

        case 'created':
        case 'updated': {
          const eventId = data.id || '?';
          const bookie = data.bookie || '?';
          const label = data.type === 'created' ? 'NEW' : 'UPDATE';

          // Update local store
          if (!this.oddsStore.has(eventId)) {
            this.oddsStore.set(eventId, {});
          }
          this.oddsStore.get(eventId)![bookie] = data.markets || [];

          // Print update
          console.log(`[${label}] Event ${eventId} | ${bookie}`);
          for (const market of data.markets || []) {
            const odds = market.odds?.[0] || {};
            if (market.name === 'ML') {
              console.log(`  ML: H ${odds.home || '-'} | D ${odds.draw || '-'} | A ${odds.away || '-'}`);
            } else if (market.name === 'Totals') {
              console.log(`  Totals (${odds.hdp || '?'}): O ${odds.over || '-'} | U ${odds.under || '-'}`);
            } else if (market.name === 'Spread') {
              console.log(`  Spread (${odds.hdp || '?'}): H ${odds.home || '-'} | A ${odds.away || '-'}`);
            }
          }
          console.log();
          break;
        }

        case 'deleted': {
          const eventId = data.id || '?';
          const bookie = data.bookie || '?';
          console.log(`[DELETED] Event ${eventId} | ${bookie}\n`);
          const stored = this.oddsStore.get(eventId);
          if (stored) delete stored[bookie];
          break;
        }

        case 'no_markets':
          console.log(`[NO MARKETS] Event ${data.id || '?'}\n`);
          break;
      }
    } catch (e: any) {
      console.error('Error handling message:', e.message);
    }
  }

  private startWs(): void {
    this.ws = new WebSocket(this.buildUrl());

    this.ws.on('open', () => {
      console.log('WebSocket connection opened');
      this.reconnectAttempts = 0; // Reset on successful connection

      // Ping every 30s to keep connection alive and detect dead sockets
      this.pingInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      }, 30000);
    });

    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('error', (err) => console.error('WebSocket error:', err.message));

    this.ws.on('close', (code, reason) => {
      console.log(`Disconnected (code: ${code})`);
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }

      if (this.shouldReconnect) {
        this.reconnectAttempts++;
        if (this.reconnectAttempts > this.maxReconnectAttempts) {
          console.log(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
          return;
        }
        // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
        const delay = Math.min(2 ** (this.reconnectAttempts - 1) * 1000, 30000);
        console.log(`Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
        this.reconnectTimeout = setTimeout(() => this.startWs(), delay);
      }
    });
  }

  /**
   * Start the client. If prefetch is enabled, loads all current
   * odds via REST API first, then connects to WebSocket.
   */
  async start(): Promise<void> {
    if (this.prefetch) {
      await this.initialFetch();
    }
    console.log('Connecting to WebSocket for real-time updates...');
    this.startWs();
  }

  /** Stop the client. */
  stop(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) this.ws.close();
  }

  /** Get current odds for an event from the local store. */
  getOdds(eventId: string): Record<string, MarketOdds[]> {
    return this.oddsStore.get(eventId) || {};
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const prefetch = process.argv.includes('--prefetch');

  console.log('Odds-API.io Real-Time Feed');
  console.log('-'.repeat(60));

  if (prefetch) {
    console.log('Mode: Initial REST fetch + WebSocket (recommended)\n');
  } else {
    console.log('Mode: WebSocket only (use --prefetch for initial snapshot)\n');
  }

  const client = new OddsWebSocketClient(
    API_KEY, MARKETS, SPORT, LEAGUES, STATUS, BOOKMAKERS, prefetch
  );

  await client.start();

  // Keep alive until Ctrl+C
  process.on('SIGINT', () => {
    console.log('\nStopping...');
    client.stop();
    console.log(`Final store: ${client.oddsStore.size} events cached`);
    console.log('Goodbye!');
    process.exit(0);
  });
}

main().catch(console.error);
