/**
 * WebSocket Real-Time Odds Feed Example
 * 
 * This example demonstrates how to connect to the Odds-API WebSocket feed
 * to receive real-time odds updates for live football matches.
 * 
 * Requirements:
 *   npm install ws
 *   (or use native WebSocket in Node.js 21+)
 */

import WebSocket from 'ws';

// WebSocket endpoint
const WS_URL = 'wss://api.odds-api.io/v3/ws';

// Configuration
const API_KEY = 'YOUR_API_KEY';
const MARKETS = 'ML,Spread,Totals'; // Markets to subscribe to (required, max 20)
const SPORT = 'football'; // Sport filter (optional, max 10 sports comma-separated)
const STATUS = 'live'; // Only live events (or 'prematch' for upcoming events)

interface OddsUpdate {
  type: 'welcome' | 'created' | 'updated' | 'deleted' | 'no_markets';
  timestamp?: string;
  id?: string;
  bookie?: string;
  markets?: Array<{
    name: string;
    updatedAt: string;
    odds: Array<{
      home?: string;
      draw?: string;
      away?: string;
      max?: number;
    }>;
  }>;
  message?: string;
}

class OddsWebSocketClient {
  private ws: WebSocket | null = null;
  private shouldReconnect: boolean = true;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(
    private apiKey: string,
    private markets: string,
    private sport?: string,
    private status?: string
  ) {}

  private buildUrl(): string {
    let url = `${WS_URL}?apiKey=${this.apiKey}&markets=${this.markets}`;
    if (this.sport) url += `&sport=${this.sport}`;
    if (this.status) url += `&status=${this.status}`;
    return url;
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: OddsUpdate = JSON.parse(data.toString());
      const msgType = message.type;

      switch (msgType) {
        case 'welcome':
          console.log('✓ Connected to Odds-API WebSocket');
          console.log(`  Filters: markets=${this.markets}, sport=${this.sport}, status=${this.status}`);
          console.log(`  Message: ${message.message || 'N/A'}`);
          console.log('\nListening for odds updates...\n');
          break;

        case 'created':
          console.log(`[NEW] Event ${message.id} - ${message.bookie}`);
          this.printOddsUpdate(message);
          break;

        case 'updated':
          console.log(`[UPDATE] Event ${message.id} - ${message.bookie}`);
          this.printOddsUpdate(message);
          break;

        case 'deleted':
          console.log(`[DELETED] Event ${message.id} - ${message.bookie}`);
          break;

        case 'no_markets':
          console.log(`[INFO] No markets available for event ${message.id}`);
          break;

        default:
          console.log(`[UNKNOWN] Message type: ${msgType}`);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  private printOddsUpdate(data: OddsUpdate): void {
    console.log(`  Time: ${data.timestamp || 'N/A'}`);

    if (!data.markets) return;

    for (const market of data.markets) {
      console.log(`  Market: ${market.name} (updated: ${market.updatedAt})`);

      for (const odds of market.odds || []) {
        const home = odds.home ?? 'N/A';
        const draw = odds.draw ?? '-';
        const away = odds.away ?? 'N/A';
        const maxStake = odds.max ?? 'N/A';

        if (draw !== '-') {
          console.log(`    Home: ${home} | Draw: ${draw} | Away: ${away} | Max: ${maxStake}`);
        } else {
          console.log(`    Home: ${home} | Away: ${away} | Max: ${maxStake}`);
        }
      }
    }

    console.log(); // Empty line for readability
  }

  private handleError(error: Error): void {
    console.error('WebSocket error:', error.message);
  }

  private handleClose(code: number, reason: string): void {
    console.log(`WebSocket connection closed (code: ${code}, reason: ${reason || 'N/A'})`);

    // Attempt to reconnect after a delay
    if (this.shouldReconnect) {
      console.log('Reconnecting in 5 seconds...');
      this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    }
  }

  public connect(): void {
    const url = this.buildUrl();

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('WebSocket connection opened');
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data);
    });

    this.ws.on('error', (error) => {
      this.handleError(error);
    });

    this.ws.on('close', (code, reason) => {
      this.handleClose(code, reason.toString());
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      this.ws.close();
    }
  }
}

function main() {
  console.log('Starting Odds-API WebSocket Feed...');
  console.log('-'.repeat(60));

  // Create WebSocket client
  const client = new OddsWebSocketClient(API_KEY, MARKETS, SPORT, STATUS);

  // Connect to WebSocket
  client.connect();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\nStopping WebSocket feed...');
    client.disconnect();
    console.log('Disconnected. Goodbye!');
    process.exit(0);
  });
}

main();
