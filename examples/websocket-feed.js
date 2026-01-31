/**
 * WebSocket Real-Time Odds Feed with Optional Initial Snapshot (JavaScript)
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

let ws = null;
let shouldReconnect = true;

function buildUrl() {
  let url = `${WS_URL}?apiKey=${API_KEY}&markets=${MARKETS}`;
  if (SPORT) url += `&sport=${SPORT}`;
  if (LEAGUES) url += `&leagues=${LEAGUES}`;
  if (STATUS) url += `&status=${STATUS}`;
  return url;
}

function connectWs() {
  ws = new WebSocket(buildUrl());

  ws.on('open', () => console.log('WebSocket connection opened'));

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
}

function handleMessage(data) {
    if (data.type === 'welcome') {
      console.log('Connected to Odds-API WebSocket');
      console.log(`  Bookmakers: ${data.bookmakers?.join(', ') || 'N/A'}`);
      if (data.warning) console.log(`  Warning: ${data.warning}`);
      console.log('\nListening for real-time updates...\n');
    } else if (data.type === 'updated' || data.type === 'created') {
      const label = data.type === 'created' ? 'NEW' : 'UPDATE';
      console.log(`[${label}] Event ${data.id} | ${data.bookie}`);

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
      console.log(`[DELETED] Event ${data.id} | ${data.bookie}\n`);
    }
}

  ws.on('error', (err) => console.error('WebSocket error:', err.message));

  ws.on('close', (code) => {
    console.log(`Disconnected (code: ${code})`);
    if (shouldReconnect) {
      console.log('Reconnecting in 5 seconds...');
      setTimeout(connectWs, 5000);
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
  process.exit(0);
});
