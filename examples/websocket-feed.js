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

const WebSocket = require('ws');

// WebSocket endpoint
const WS_URL = 'wss://api.odds-api.io/v3/ws';

// Configuration
const API_KEY = 'YOUR_API_KEY';
const MARKETS = 'ML,Spread,Totals'; // Markets to subscribe to (required, max 20)
const SPORT = 'football'; // Sport filter (optional, max 10 sports comma-separated)
const STATUS = 'live'; // Only live events (or 'prematch' for upcoming events)

class OddsWebSocketClient {
  constructor(apiKey, markets, sport, status) {
    this.apiKey = apiKey;
    this.markets = markets;
    this.sport = sport;
    this.status = status;
    this.ws = null;
    this.shouldReconnect = true;
    this.reconnectTimeout = null;
  }

  buildUrl() {
    let url = `${WS_URL}?apiKey=${this.apiKey}&markets=${this.markets}`;
    if (this.sport) url += `&sport=${this.sport}`;
    if (this.status) url += `&status=${this.status}`;
    return url;
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
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

  printOddsUpdate(data) {
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

  handleError(error) {
    console.error('WebSocket error:', error.message);
  }

  handleClose(code, reason) {
    console.log(`WebSocket connection closed (code: ${code}, reason: ${reason || 'N/A'})`);

    // Attempt to reconnect after a delay
    if (this.shouldReconnect) {
      console.log('Reconnecting in 5 seconds...');
      this.reconnectTimeout = setTimeout(() => this.connect(), 5000);
    }
  }

  connect() {
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

  disconnect() {
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
