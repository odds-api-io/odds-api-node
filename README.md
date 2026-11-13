# Odds-API.io Node.js SDK

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22836645.svg)](https://doi.org/10.5281/zenodo.22836645)

[![npm version](https://img.shields.io/npm/v/odds-api-io.svg)](https://www.npmjs.com/package/odds-api-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/node/v/odds-api-io.svg)](https://nodejs.org)

Official Node.js and TypeScript SDK for the [**Odds-API.io**](https://odds-api.io) sports betting odds API: real-time and pre-match odds from 450+ bookmakers across 34 sports, over REST and WebSocket.

Building with AI? See the [AI and vibe coding guide](https://docs.odds-api.io/ai-vibe-coding). Prefer Python? Check out the [Python SDK](https://github.com/odds-api-io/odds-api-python). Prefer the terminal? Try the [CLI](https://github.com/odds-api-io/odds-api-cli).

## Quickstart

1. Install:

   ```bash
   npm install odds-api-io
   ```

2. Set your API key ([get one here](https://odds-api.io/pricing?ref=npm)):

   ```bash
   export ODDS_API_KEY="your-api-key"
   ```

3. Make your first request:

   ```typescript
   import { OddsAPIClient } from 'odds-api-io';

   const client = new OddsAPIClient({ apiKey: process.env.ODDS_API_KEY! });

   const events = await client.getEvents({ sport: 'football', league: 'england-premier-league' });
   const odds = await client.getEventOdds({ eventId: String(events[0].id), bookmakers: 'Bet365,Unibet' });
   console.log(odds);
   ```

## Get an API key

The odds API needs a key from a paid plan. Pick a plan at [**odds-api.io/pricing**](https://odds-api.io/pricing?ref=npm). Rate limits, the number of bookmakers you can select and WebSocket access depend on the plan.

## Sports and bookmakers

| Sport | Example leagues |
|-------|-----------------|
| Football (soccer) | Premier League, La Liga, Champions League |
| Basketball | NBA, EuroLeague |
| American football | NFL, NCAAF |
| Baseball | MLB |
| Ice hockey | NHL |
| Tennis | ATP, WTA |
| Esports | CS2, League of Legends, Dota 2 |
| ...and 27 more | 34 sports in total |

Odds come from **450+ bookmakers**, including Bet365, DraftKings, FanDuel, Betfair, Unibet and SingBet. See the [full coverage list](https://odds-api.io/sportsbooks#coverage).

## Documentation

- [Quickstart: make your first request](https://docs.odds-api.io/quickstart)
- [Node.js, Python and R SDK guide](https://docs.odds-api.io/guides/sdks)
- [Fetching pre-match and live odds](https://docs.odds-api.io/guides/fetching-odds)
- [Stream live odds over WebSocket](https://docs.odds-api.io/guides/websockets)
- [Find value bets](https://docs.odds-api.io/guides/value-bets) and [arbitrage opportunities](https://docs.odds-api.io/guides/arbitrage-bets)
- [Full API reference](https://docs.odds-api.io/api-reference/introduction)
- [AI and vibe coding guide](https://docs.odds-api.io/ai-vibe-coding)

## Features

- REST client for every public v3 endpoint: events, odds, odds summary, movements, value bets, arbitrage, dropping odds, historical odds and closing lines, settlement and grading, golf outrights, participants, bookmaker mappings
- `OddsWebSocket`: real-time odds, scores and status with reconnects that resume from the last `seq`
- Async iterators for paginated endpoints (`iterateEvents`, `iterateClosingLines`, `iterateMappings`, `iterateDroppingOdds`, `iterateHistoricalEvents`) and `pollUpdatedOdds` for the `/odds/updated` delta
- Types that match the responses, including the period score keys (`p1`..`pN`, `ft`, `ot`, `ap`)
- Error classes that keep the server's message, with `retryAfter` on rate limits and optional retries with backoff
- ESM and CommonJS, Node.js 18+

## Usage

```typescript
import { OddsAPIClient } from 'odds-api-io';

const client = new OddsAPIClient({ apiKey: process.env.ODDS_API_KEY! });

// Exact market names for a sport (no key needed)
const { markets } = await client.getMarkets('football');

// Upcoming and live Premier League matches
const events = await client.getEvents({
  sport: 'football',
  league: 'england-premier-league',
  status: ['pending', 'live'],
});

// Odds for one match. Pass `markets` to keep responses small.
const odds = await client.getEventOdds({
  eventId: events[0].id,
  bookmakers: ['Bet365', 'SingBet'],
  markets: ['ML', 'Spread', 'Totals'],
});
for (const [bookmaker, bookMarkets] of Object.entries(odds.bookmakers)) {
  const ml = bookMarkets.find((m) => m.name === 'ML');
  console.log(bookmaker, ml?.odds[0]); // { home: '2.10', draw: '3.40', away: '3.20' }
}

// Search, including in-play matches
const live = await client.searchEvents('Liverpool', { status: 'live' });
```

CommonJS works the same way:

```javascript
const { OddsAPIClient } = require('odds-api-io');
```

Comma-separated parameters (`bookmakers`, `markets`, `eventIds`, `leagues`, `status`) accept either a string (`'Bet365,SingBet'`) or an array.

Market names must match in full: there is no `Match Winner` (use `ML`) and no bare `Over/Under`. Call `getMarkets(sport)` to see the names a sport serves, or browse the [market reference](https://odds-api.io/markets) per sport (for example [football](https://odds-api.io/markets/football)). Bookmaker coverage by sport is at [odds-api.io/sportsbooks](https://odds-api.io/sportsbooks#coverage).

## Odds comparison and summary

```typescript
// Best, average, median, worst and fair price per line across bookmakers (Growth plans and above)
const summary = await client.getOddsSummary({ eventId: 123456, markets: ['ML', 'Totals'], includeExchanges: true });
const home = summary.markets[0].lines[0].outcomes.home;
console.log(home.best, home.bestBookmakers, home.fair);

// Price history for one market (prematch)
const history = await client.getOddsMovement({ eventId: 123456, bookmaker: 'Bet365', market: 'Totals', marketLine: 2.5 });
console.log(history.opening, history.latest);
```

## Polling for changes

`/odds/updated` returns only the market groups that changed. `pollUpdatedOdds` passes each `X-Next-Since` header back as the next `since`:

```typescript
const controller = new AbortController();
for await (const batch of client.pollUpdatedOdds({
  bookmaker: 'Bet365',
  sport: 'football',
  markets: ['ML', 'Spread', 'Totals'], // required, max 40
  intervalMs: 10_000,
  signal: controller.signal,
})) {
  for (const event of batch.data) {
    // merge by event, bookmaker and market name; an absent market has not changed
  }
}
```

For live odds the WebSocket is cheaper than any poll interval.

## WebSocket

`OddsWebSocket` connects to `wss://api.odds-api.io/v3/ws`, tracks the highest `seq` and reconnects with `lastSeq`, so missed updates are replayed. In Node.js install the `ws` package (`npm install ws`); the server requires permessage-deflate compression, which `ws` and browsers negotiate by default. WebSocket access is a plan add-on.

```typescript
import { OddsAPIClient, OddsWebSocket } from 'odds-api-io';

const client = new OddsAPIClient({ apiKey });
const eventIds = [123456, 123457];
const store = new Map();

// 1. Snapshot with its sequence number
const { data, seq } = await client.getOddsSnapshot({ eventIds, bookmakers: ['Bet365'], markets: ['ML', 'Totals'] });
for (const event of data) for (const [book, markets] of Object.entries(event.bookmakers)) store.set(`${event.id}:${book}`, markets);

// 2. Stream from that point
const feed = new OddsWebSocket({
  apiKey,
  markets: ['ML', 'Totals'],          // required for the odds channel, max 40
  channels: ['odds', 'scores', 'status'], // optional, default odds only
  eventIds,                            // or sport / leagues, status: 'live' | 'prematch'
  lastSeq: seq ?? undefined,
});

feed.on('resync_required', async () => {
  // replay could not be served: rebuild from REST, then continue
  const snap = await client.getOddsSnapshot({ eventIds, bookmakers: ['Bet365'], markets: ['ML', 'Totals'] });
  feed.lastSeq = snap.seq ?? undefined;
});
feed.on('reconnecting', ({ attempt, delay, lastSeq }) => console.log(`reconnect #${attempt} in ${delay}ms from ${lastSeq}`));

for await (const msg of feed) {
  if (msg.type === 'created' || msg.type === 'updated') store.set(`${msg.id}:${msg.bookie}`, msg.markets); // replace, do not merge
  if (msg.type === 'deleted' || msg.type === 'no_markets') store.delete(`${msg.id}:${msg.bookie}`);
  if (msg.type === 'score') console.log(msg.id, msg.scores, msg.clock);
}
```

Events: `open`, `message`, one per message type (`welcome`, `created`, `updated`, `deleted`, `no_markets`, `score`, `status`, `resync_required`, `replay_complete`), `reconnecting`, `close` and `error`. `feed.close()` stops it; `feed.lastSeq` is the resume point to persist.

Close codes: 1012 (server restart) reconnects at once, 1013 (cooldown) waits at least 3 seconds, 1008 because a newer connection replaced this one stops instead of fighting it (two connections per key). A refused handshake (401, 403, 426) is not retried and rejects `connect()` / the iterator with `OddsWebSocketError`. Options: `reconnect` (default true), `maxReconnectAttempts`, `initialReconnectDelay`, `maxReconnectDelay`, `replayComplete` (default true) and `WebSocket` to pass your own implementation.

## Historical odds and closing lines

```typescript
// Finished events for one league (31 days per call)
const past = await client.getHistoricalEvents({
  sport: 'football',
  league: 'england-premier-league',
  from: '2026-09-01T00:00:00Z',
  to: '2026-09-30T23:59:59Z',
});

// Any range: fetched in 31-day windows
for await (const event of client.iterateHistoricalEvents({ sport: 'football', league: 'england-premier-league', from: '2026-01-01T00:00:00Z', to: '2026-10-31T00:00:00Z' })) {
  console.log(event.home, event.away, event.scores?.periods?.ft);
}

// Odds for one finished event
const closing = await client.getHistoricalOdds({ eventId: past[0].id, bookmakers: ['Bet365'], markets: ['ML'] });

// Closing lines for every settled event across up to 10 leagues (paid plans; 366 days per call, 100 per page)
for await (const event of client.iterateClosingLines({
  sport: 'football',
  leagues: ['england-premier-league', 'spain-laliga'],
  from: '2026-08-01T00:00:00Z',
  to: '2026-10-31T23:59:59Z',
  markets: ['ML', 'Totals'],
  bookmakers: ['Bet365', 'SingBet'],
})) {
  console.log(event.id, event.bookmakers['Bet365']?.[0]?.odds[0]);
}

// Search finished events by team name
const arsenal = await client.searchHistoricalEvents({ query: 'Arsenal', sport: 'football' });
```

## Settlement and grading

Paid plans. `getSettlements` returns status, a `final` flag and final scores; `gradeBets` grades selections against the result. Batches over 50 are split for you.

```typescript
const { settlements, notFound } = await client.getSettlements([74919888, 73101436]);

const { grades } = await client.gradeBets([
  { ref: 'bet-1', eventId: 74919888, market: 'ML', side: 'home' },
  { ref: 'bet-2', eventId: 74919888, market: 'Spread', hdp: -0.75, side: 'home' },
  { ref: 'bet-3', eventId: 74919888, market: 'Correct Score', label: '2-1' },
]);
for (const g of grades) {
  console.log(g.ref, g.result, g.reason, g.final); // 'won' | 'lost' | 'void' | 'half_won' | 'half_lost' | 'pending' | 'ungradeable'
}
```

Re-send selections that are not `final`, at most once a minute.

## Outrights (golf)

Outrights are a paid add-on: PGA Tour, DP World Tour, LIV Golf and the majors. A key without the add-on gets a `ForbiddenError` whose message links to the billing page.

```typescript
import { ForbiddenError, isPriceRunner } from 'odds-api-io';

try {
  const tournaments = await client.getOutrights({ sport: 'golf', league: 'pga-tour' });
  const odds = await client.getOutrightOdds({ id: tournaments[0].id, bookmakers: ['DraftKings', 'Betfair Exchange'] });

  for (const market of odds.bookmakers['Betfair Exchange'] ?? []) {
    // Winner, Top 5, Top 5 (Incl. Ties), Top 10, Top 10 (Incl. Ties), Top 20, Top 20 (Incl. Ties), Make Cut
    for (const runner of market.odds.slice(0, 3)) {
      if (isPriceRunner(runner)) console.log(market.name, runner.label, runner.odds, runner.layOdds);
      else console.log(market.name, runner.label, runner.yes, runner.no); // Make Cut
    }
  }

  const results = await client.getOutrightResults(tournaments[0].id);
  console.log(results.winners['Top 10 (Incl. Ties)']);
} catch (err) {
  if (err instanceof ForbiddenError && err.isAddOnRequired) console.log(err.message);
}
```

"Top N" settles a boundary tie under the bookmaker's dead-heat rules; "Top N (Incl. Ties)" pays it in full. They are separate markets.

## Value bets, arbitrage and dropping odds

```typescript
const valueBets = await client.getValueBets({ bookmaker: 'Bet365', sport: 'football', includeEventDetails: true });
// expectedValue is bookmaker odds / fair odds x 100, so the edge in percent is expectedValue - 100 (103.42 = 3.42% edge)
valueBets
  .filter((bet) => bet.expectedValue - 100 >= 3)
  .forEach((bet) => console.log(bet.market.name, bet.betSide, `${(bet.expectedValue - 100).toFixed(2)}% edge`));

// Price gaps across your bookmakers. Prices move and bookmakers limit stakes, so check every leg before acting.
const arbs = await client.getArbitrageBets({ bookmakers: ['Bet365', 'SingBet'], sport: 'football', markets: ['Totals'], minProfit: 1 });
// profitMargin is already a percentage (2.48 = 2.48%)
arbs.forEach((arb) => console.log(`${arb.profitMargin.toFixed(2)}%`, arb.legs.map((l) => `${l.bookmaker} ${l.side} @ ${l.odds}`)));

// Dropping odds from sharp bookmakers (paid plans)
const drops = await client.getDroppingOdds({ sport: 'football', markets: ['ML'], minDrop: 10, sort: 'recent', includeEventDetails: true });
drops.forEach((d) => console.log(`${d.market.name} ${d.betSide}: ${d.odds.opening} -> ${d.odds.current} (-${d.odds.drop.sinceOpening}%)`));
```

## Participants, logos and mappings

```typescript
const teams = await client.getParticipants({ sport: 'football', search: 'Chelsea' });

// PNG crest; the URL carries your key, so proxy it with getParticipantLogo() for public pages
const url = client.getParticipantLogoUrl(events[0].homeId!);
const png = await client.getParticipantLogo(events[0].homeId!); // ArrayBuffer

// A bookmaker's own market and outcome ids for our events (paid plans)
const { data } = await client.getMappings({ bookmaker: 'Polymarket', eventId: 71515842 });
for await (const row of client.iterateMappings({ bookmaker: 'Kalshi', sport: 'american-football' })) {
  console.log(row.eventId, row.market, row.side, row.marketId, row.outcomeId);
}
```

## Bookmakers

```typescript
const bookmakers = await client.getBookmakers(); // name, active, createdAt, status ('ok' | 'degraded' | 'down'), reason
await client.selectBookmakers(['Bet365', 'SingBet']);
const { bookmakers: selected } = await client.getSelectedBookmakers();
await client.clearSelectedBookmakers(); // once every 12 hours
```

## Methods

| Area | Method | Endpoint |
|------|--------|----------|
| Catalogue | `getSports()` | `GET /sports` |
| | `getMarkets(sport?)` | `GET /markets` |
| | `getLeagues(sport, { all? })` | `GET /leagues` |
| | `getBookmakers()` | `GET /bookmakers` |
| | `getSelectedBookmakers()` | `GET /bookmakers/selected` |
| | `selectBookmakers(bookmakers)` | `PUT /bookmakers/selected/select` |
| | `clearSelectedBookmakers()` | `PUT /bookmakers/selected/clear` |
| Events | `getEvents(params)`, `iterateEvents(params, { pageSize?, maxPages? })` | `GET /events` |
| | `getEventById(id)` | `GET /events/{id}` |
| | `getLiveEvents(sport?)` | `GET /events/live` |
| | `searchEvents(query, { status? })` | `GET /events/search` |
| Odds | `getEventOdds(params)` | `GET /odds` |
| | `getOddsForMultipleEvents(params)`, `getOddsSnapshot(params)` | `GET /odds/multi` |
| | `getUpdatedOddsSince(params)`, `getUpdatedOddsSinceWithMeta(params)`, `pollUpdatedOdds(params)` | `GET /odds/updated` |
| | `getOddsMovement(params)` | `GET /odds/movements` |
| | `getOddsSummary(params)` | `GET /odds/summary` |
| | `getOddsSummaryMulti(params)` | `GET /odds/summary/multi` |
| Analysis | `getValueBets(params)` | `GET /value-bets` |
| | `getArbitrageBets(params)` | `GET /arbitrage-bets` |
| | `getDroppingOdds(params)`, `getDroppingOddsPage(params)`, `iterateDroppingOdds(params)` | `GET /dropping-odds` |
| Historical | `getHistoricalEvents(params)`, `iterateHistoricalEvents(params)` | `GET /historical/events` |
| | `searchHistoricalEvents(params)` | `GET /historical/events/search` |
| | `getHistoricalOdds(params)` | `GET /historical/odds` |
| | `getClosingLines(params)`, `iterateClosingLines(params)` | `GET /historical/closing-lines` |
| Settlement | `getSettlements(eventIds)` | `GET /settlements` |
| | `gradeBets(selections)` (alias `gradeSelections`) | `POST /settlements/grade` |
| Outrights | `getOutrights(params)` | `GET /outrights` |
| | `getOutrightOdds(params)` | `GET /outrights/odds` |
| | `getOutrightResults(id)` | `GET /outrights/results` |
| Participants | `getParticipants(params)` | `GET /participants` |
| | `getParticipantById(id)` | `GET /participants/{id}` |
| | `getParticipantLogo(id)`, `getParticipantLogoUrl(id)` | `GET /participants/{id}/logo` |
| Mappings | `getMappings(params)`, `iterateMappings(params)` | `GET /mappings` |
| WebSocket | `new OddsWebSocket(options)` | `wss://api.odds-api.io/v3/ws` |

Full parameter and response reference: [docs.odds-api.io/api-reference](https://docs.odds-api.io/api-reference/introduction).

## Errors

Every error extends `OddsAPIError` and carries the server's own message, plus `status`, `body` and `rateLimit` when there was a response.

| Class | When |
|-------|------|
| `BadRequestError` | 400: a parameter is missing or invalid (the message says which) |
| `InvalidAPIKeyError` | 401 |
| `ForbiddenError` | 403: the plan does not include the endpoint or bookmaker, or an add-on is missing (`isAddOnRequired`) |
| `NotFoundError` | 404: the message often lists what does exist |
| `RateLimitError` | 429, with `retryAfter` in seconds (`RateLimitExceededError` is the same class) |
| `ServerError` | 5xx |
| `TimeoutError`, `NetworkError` | no response |
| `OddsWebSocketError` | WebSocket handshake refused or the helper gave up (`code` = HTTP status or close code) |

```typescript
import { OddsAPIError, RateLimitError, ForbiddenError } from 'odds-api-io';

try {
  await client.getClosingLines({ /* ... */ });
} catch (err) {
  if (err instanceof RateLimitError) console.log(`retry in ${err.retryAfter}s`);
  else if (err instanceof ForbiddenError) console.log(err.message);
  else if (err instanceof OddsAPIError) console.log(err.status, err.message);
}

console.log(client.lastRateLimit); // { limit, remaining, reset } from the last response
```

## Configuration

```typescript
const client = new OddsAPIClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.odds-api.io/v3', // default
  timeout: 10000,      // ms per attempt
  maxRetries: 2,       // retries on 5xx, network errors and short 429 waits; 0 turns them off
  maxRetryDelay: 10000, // a 429 asking for a longer wait is thrown, not waited out
});
```

Bookmaker selection changes (PUT) are never retried.

## Migrating from 1.3

1.5.0 aligns the types with what the API returns. Code that used the old, inaccurate field names needs updating:

- `Event`: `date`, `home`, `away`, `homeId`, `awayId`, `status` (`pending | live | settled | cancelled`), `sport`/`league` as `{ name, slug }`, `scores.periods`.
- Period keys are `p1`..`pN`, `ft`, `ot`, `ap`. The old `period1`, `overtime`, `penalties` and `fulltime` keys stop being served on 12 November 2026.
- `EventOdds.bookmakers` is a map of bookmaker name to markets; `OddsMovement` has `opening`, `latest` and `movements`.
- `ArbitrageBet` uses `profitMargin` and `legs[].side`; `ValueBet` uses `expectedValue` and `betSide`.
- `Bookmaker` is `{ name, active, createdAt, status, reason }`; `getSelectedBookmakers()` returns `{ bookmakers, count }`.
- `getDroppingOdds` now sends `markets` (the old `market` option was ignored by the API; it is still accepted and sent as `markets`).
- Errors keep the server message instead of a fixed text.
- The default base URL is `https://api.odds-api.io/v3`.

## Examples

See [`examples/`](./examples):

- `basic-usage.ts` / `basic-usage.js`: getting started
- `premier-league-odds.ts`: odds for a league
- `odds-tracking.ts`: price history and the updated-odds delta
- `arbitrage-betting.ts`: price gaps across bookmakers
- `websocket-feed.ts`: REST snapshot plus `OddsWebSocket`
- `golf-outrights-and-settlement.ts`: outrights and bet grading

## Plans and Limits

An API key from a paid plan is required. Rate limits, bookmaker selection and WebSocket access depend on your plan; see [**odds-api.io/pricing**](https://odds-api.io/pricing?ref=npm).

## Resources

- [API documentation](https://docs.odds-api.io/)
- [Odds-API.io website](https://odds-api.io)
- [Get your API key](https://odds-api.io/pricing?ref=npm)
- [Report issues](https://github.com/odds-api-io/odds-api-node/issues)

## License

[MIT](LICENSE) © Odds-API.io

## Disclaimer

This is the official SDK for Odds-API.io. This tool is for informational purposes only and should not be used as the sole basis for betting decisions.


## Citation

If you use this package in research or a publication, please cite it. Citation metadata is in [CITATION.cff](CITATION.cff) (GitHub renders a "Cite this repository" button from it) and Zenodo metadata is in `.zenodo.json`.

```
Outlier AS. odds-api-io: Official Node.js SDK for Odds-API.io (version 1.5.3). https://github.com/odds-api-io/odds-api-node
```
