/**
 * Real-time odds over WebSocket with OddsWebSocket.
 *
 * Takes a REST snapshot with its WebSocket sequence, then streams changes.
 * Reconnects resume from the last seq; on resync_required it rebuilds from REST.
 *
 * Usage:
 *   npm install odds-api-io ws
 *   ODDS_API_KEY=... npx tsx examples/websocket-feed.ts
 */

import { OddsAPIClient, OddsWebSocket } from 'odds-api-io';
import type { Market } from 'odds-api-io';

const apiKey = process.env.ODDS_API_KEY || 'your-api-key-here';
const MARKETS = ['ML', 'Spread', 'Totals'];
const BOOKMAKERS = ['Bet365', 'SingBet'];

const client = new OddsAPIClient({ apiKey });
const store = new Map<string, Market[]>(); // key: `${eventId}:${bookmaker}`

async function snapshot(eventIds: number[]): Promise<number | null> {
  let seq: number | null = null;
  for (let i = 0; i < eventIds.length; i += 10) {
    const page = await client.getOddsSnapshot({ eventIds: eventIds.slice(i, i + 10), bookmakers: BOOKMAKERS, markets: MARKETS });
    seq ??= page.seq;
    for (const event of page.data) {
      for (const [bookmaker, markets] of Object.entries(event.bookmakers)) store.set(`${event.id}:${bookmaker}`, markets);
    }
  }
  return seq;
}

async function main() {
  const events = await client.getEvents({ sport: 'football', league: 'england-premier-league', status: 'pending' });
  const eventIds = events.slice(0, 50).map((e) => e.id);
  const seq = await snapshot(eventIds);
  console.log(`Snapshot: ${store.size} event/bookmaker pairs, seq ${seq}`);

  const feed = new OddsWebSocket({ apiKey, markets: MARKETS, eventIds, status: 'prematch', lastSeq: seq ?? undefined });

  feed.on('reconnecting', ({ attempt, delay, lastSeq }) => console.log(`Reconnecting #${attempt} in ${delay}ms from seq ${lastSeq}`));
  feed.on('resync_required', async ({ reason }) => {
    console.log(`Resync required (${reason}), rebuilding from REST`);
    store.clear();
    feed.lastSeq = (await snapshot(eventIds)) ?? undefined;
  });
  process.on('SIGINT', () => feed.close());

  for await (const msg of feed) {
    switch (msg.type) {
      case 'welcome':
        console.log(`Connected. Bookmakers: ${msg.bookmakers.join(', ')}`);
        if (msg.warning) console.log(`Warning: ${msg.warning}`);
        break;
      case 'created':
      case 'updated':
        // Each update carries the full market set: replace, do not merge.
        store.set(`${msg.id}:${msg.bookie}`, msg.markets);
        console.log(`[${msg.type}] ${msg.id} ${msg.bookie} seq ${msg.seq}: ${msg.markets.map((m) => m.name).join(', ')}`);
        break;
      case 'deleted':
      case 'no_markets':
        store.delete(`${msg.id}:${msg.bookie}`);
        break;
      case 'replay_complete':
        console.log(`Catch-up done (${msg.outcome}), now live`);
        break;
    }
  }
  console.log(`Stopped at seq ${feed.lastSeq}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
