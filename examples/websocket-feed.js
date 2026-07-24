/**
 * WebSocket Real-Time Odds Feed with Reconnection & Replay (JavaScript)
 *
 * Tracks sequence numbers and reconnects with replay on disconnection,
 * ensuring zero data loss across network interruptions.
 *
 * Usage:
 *   node examples/websocket-feed.js                # WebSocket only
 *   node examples/websocket-feed.js --prefetch     # With initial snapshot
 *
 * Requirements:
 *   npm install ws odds-api-io
 */

import WebSocket from 'ws';
import { OddsAPIClient } from 'odds-api-io';

const API_KEY = process.env.ODDS_API_KEY || 'your-api-key-here';
const MARKETS = 'ML,Spread,Totals';
const SPORT = 'football';
const LEAGUES = 'england-premier-league';
const STATUS = 'prematch';
const BOOKMAKERS = 'Bet365,SingBet';
const WS_URL = 'wss://api.odds-api.io/v3/ws';

const prefetch = process.argv.includes('--prefetch');
const oddsStore = new Map();

// Sequence tracking for reconnection replay
let lastSeq = 0;
let ws = null;
let shouldReconnect = true;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;

// ─── Initial REST Fetch ──────────────────────────────────────────────

async function initialFetch() {
  console.log('='.repeat(60));
  console.log('INITIAL FETCH: Loading current odds via REST API...');
  console.log('='.repeat(60));

  const client = new OddsAPIClient({ apiKey: API_KEY });
  let events = await client.getEvents({ sport: SPORT, league: LEAGUES });

  if (STATUS) {
    events = events.filter(e => e.status === STATUS);
  }

  console.log(`Found ${events.length} events. Fetching odds...\n`);

  for (const event of events) {
    try {
      const oddsData = await client.getEventOdds({
        eventId: event.id,
        bookmakers: BOOKMAKERS,
      });

      const bookmakers = oddsData.bookmakers || {};
      if (Object.keys(bookmakers).length > 0) {
        oddsStore.set(String(event.id), bookmakers);

        for (const [bookie, markets] of Object.entries(bookmakers)) {
          const ml = markets.find(m => m.name === 'ML');
          if (ml?.odds?.[0]) {
            const o = ml.odds[0];
            console.log(`  ${event.home} vs ${event.away} [${bookie}]: H ${o.home || '-'} | D ${o.draw || '-'} | A ${o.away || '-'}`);
          }
        }
      }
    } catch (e) {
      console.log(`  ${event.home} vs ${event.away}: Could not fetch (${e.message})`);
    }
  }

  console.log(`\nInitial fetch complete: ${oddsStore.size} events loaded`);
  console.log('='.repeat(60) + '\n');
}

// ─── WebSocket Connection ────────────────────────────────────────────

function buildUrl() {
  let url = `${WS_URL}?apiKey=${API_KEY}&markets=${MARKETS}`;
  if (SPORT) url += `&sport=${SPORT}`;
  if (LEAGUES) url += `&leagues=${LEAGUES}`;
  if (STATUS) url += `&status=${STATUS}`;
  if (lastSeq > 0) url += `&lastSeq=${lastSeq}`;
  return url;
}

function handleMessage(data) {
  // Track sequence number for replay on reconnection
  if (data.seq && data.seq > lastSeq) {
    lastSeq = data.seq;
  }

  if (data.type === 'welcome') {
    console.log('Connected to Odds-API WebSocket');
    console.log(`  Bookmakers: ${data.bookmakers?.join(', ') || 'N/A'}`);
    if (data.warning) console.log(`  Warning: ${data.warning}`);
    if (lastSeq > 0) {
      console.log(`  Reconnected with lastSeq=${lastSeq}, replaying missed updates...`);
    }
    console.log('\nListening for real-time updates...\n');

  } else if (data.type === 'resync_required') {
    // Server cannot replay (gap too large or data expired).
    // Rebuild state from REST API snapshot.
    console.log(`⚠️  RESYNC REQUIRED: ${data.reason}`);
    console.log(`  The server cannot replay missed updates.`);
    console.log(`  Rebuilding state from REST API snapshot...`);
    lastSeq = 0;
    if (prefetch) {
      initialFetch();
    }

  } else if (data.type === 'updated' || data.type === 'created') {
    const label = data.type === 'created' ? 'NEW' : 'UPDATE';
    console.log(`[${label}] Event ${data.id} | ${data.bookie} (seq ${data.seq})`);

    // Update store
    if (!oddsStore.has(data.id)) oddsStore.set(data.id, {});
    oddsStore.get(data.id)[data.bookie] = data.markets || [];

    for (const m of data.markets || []) {
      const o = m.odds?.[0] || {};
      if (m.name === 'ML') console.log(`  ML: H ${o.home} | D ${o.draw} | A ${o.away}`);
      else if (m.name === 'Totals') console.log(`  Totals (${o.hdp}): O ${o.over} | U ${o.under}`);
      else if (m.name === 'Spread') console.log(`  Spread (${o.hdp}): H ${o.home} | A ${o.away}`);
    }
    console.log();

  } else if (data.type === 'deleted') {
    console.log(`[DELETED] Event ${data.id} | ${data.bookie} (seq ${data.seq})\n`);
    const stored = oddsStore.get(data.id);
    if (stored) delete stored[data.bookie];

  } else if (data.type === 'no_markets') {
    console.log(`[NO MARKETS] Event ${data.id} (seq ${data.seq})\n`);
  }
}

function connectWs() {
  const url = buildUrl();
  if (lastSeq > 0) {
    console.log(`Connecting with lastSeq=${lastSeq} for replay...`);
  }
  ws = new WebSocket(url);

  ws.on('open', () => {
    console.log('WebSocket connection opened');
    reconnectAttempts = 0;
  });

  ws.on('message', (raw) => {
    // Server may send multiple JSON objects in a single frame (one per line)
    const lines = raw.toString().trim().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      let data;
      try {
        data = JSON.parse(line.trim());
      } catch (e) {
        console.error('JSON parse error:', e.message);
        continue;
      }
      handleMessage(data);
    }
  });

  ws.on('error', (err) => console.error('WebSocket error:', err.message));

  ws.on('close', (code) => {
    console.log(`Disconnected (code: ${code})`);
    if (shouldReconnect) {
      reconnectAttempts++;
      if (reconnectAttempts > maxReconnectAttempts) {
        console.log(`Max reconnect attempts (${maxReconnectAttempts}) reached. Giving up.`);
        return;
      }
      // Exponential backoff: 1s, 2s, 4s, 8s... capped at 30s
      const delay = Math.min(2 ** (reconnectAttempts - 1) * 1000, 30000);
      console.log(
        `Reconnecting in ${delay / 1000}s ` +
        `(attempt ${reconnectAttempts}/${maxReconnectAttempts}, ` +
        `lastSeq=${lastSeq})...`
      );
      setTimeout(connectWs, delay);
    }
  });
}

// ─── Main ────────────────────────────────────────────────────────────

console.log('Odds-API.io Real-Time Feed');
console.log('-'.repeat(60));
console.log(prefetch
  ? 'Mode: Initial REST fetch + WebSocket (recommended)\n'
  : 'Mode: WebSocket only (use --prefetch for initial snapshot)\n'
);

if (prefetch) await initialFetch();

console.log('Connecting to WebSocket for real-time updates...');
connectWs();

process.on('SIGINT', () => {
  console.log('\nStopping...');
  shouldReconnect = false;
  if (ws) ws.close();
  console.log(`Final store: ${oddsStore.size} events cached`);
  console.log(`Last seq: ${lastSeq}`);
  process.exit(0);
});
