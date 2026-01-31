# Odds-API.io Node.js SDK

[![npm version](https://img.shields.io/npm/v/odds-api-io.svg)](https://www.npmjs.com/package/odds-api-io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js Version](https://img.shields.io/node/v/odds-api-io.svg)](https://nodejs.org)

Official Node.js SDK for [**Odds-API.io**](https://odds-api.io) - Real-time sports betting odds from 250+ bookmakers.

## Features

- 🏀 **20+ Sports** - Basketball, football, tennis, and more
- 📊 **Comprehensive Odds Data** - Real-time odds from 250+ bookmakers
- 💰 **Arbitrage Detection** - Find risk-free betting opportunities
- 📈 **Value Bets** - Identify positive expected value bets
- 🔴 **Live Events** - Track in-play events and odds
- 🔍 **Advanced Search** - Search events, participants, and leagues
- ⚡ **TypeScript First** - Full type safety with TypeScript
- 📦 **Dual Package** - Works with both ESM and CommonJS
- 🛡️ **Error Handling** - Custom error classes for better debugging

## Installation

```bash
npm install odds-api-io
```

## Get Your API Key

Visit [**odds-api.io/#pricing**](https://odds-api.io/#pricing) to get your API key.

## Quick Start

### TypeScript

```typescript
import { OddsAPIClient } from 'odds-api-io';

const client = new OddsAPIClient({
  apiKey: 'your-api-key-here'
});

// Get all available sports
const sports = await client.getSports();
console.log(`Found ${sports.length} sports`);

// Get upcoming NBA events
const events = await client.getEvents({
  sport: 'basketball',
  league: 'usa-nba'
});

// Search for specific games
const lakersGames = await client.searchEvents('Lakers');

// Get live events
const liveEvents = await client.getLiveEvents('basketball');
```

### JavaScript (CommonJS)

```javascript
const { OddsAPIClient } = require('odds-api-io');

const client = new OddsAPIClient({
  apiKey: 'your-api-key-here'
});

async function getOdds() {
  const events = await client.getEvents({
    sport: 'basketball',
    league: 'usa-nba'
  });
  
  const odds = await client.getEventOdds({
    eventId: events[0].id,
    bookmakers: 'pinnacle,bet365'
  });
  
  console.log(odds);
}

getOdds();
```

### JavaScript (ESM)

```javascript
import { OddsAPIClient } from 'odds-api-io';

const client = new OddsAPIClient({
  apiKey: 'your-api-key-here'
});

const sports = await client.getSports();
```

## Examples

### Finding Arbitrage Opportunities

```typescript
import { OddsAPIClient } from 'odds-api-io';

const client = new OddsAPIClient({ apiKey: 'your-api-key' });

const arbs = await client.getArbitrageBets({
  bookmakers: 'pinnacle,bet365',
  limit: 10,
  includeEventDetails: true
});

arbs.forEach(arb => {
  console.log(`Profit: ${arb.profitPercentage}%`);
  console.log('Legs:', arb.legs);
});
```

### Tracking Odds Movements

```typescript
// Get odds for a specific event
const odds = await client.getEventOdds({
  eventId: '62924717',
  bookmakers: 'pinnacle,bet365'
});

// Track how odds change over time
const movements = await client.getOddsMovement({
  eventId: '62924717',
  bookmaker: 'pinnacle',
  market: 'moneyline'
});
```

### Getting Value Bets

```typescript
// Find value betting opportunities
const valueBets = await client.getValueBets({
  bookmaker: 'pinnacle',
  includeEventDetails: true
});

valueBets.forEach(bet => {
  console.log(`Value: ${bet.valuePercentage}%`);
  console.log(`Odds: ${bet.odds} (Fair: ${bet.fairOdds})`);
});
```

### Working with Participants

```typescript
// Search for teams/players
const warriors = await client.getParticipants({
  sport: 'basketball',
  search: 'Warriors'
});

// Get participant details by ID
const participant = await client.getParticipantById(3428);
```

### Managing Bookmakers

```typescript
// Get all available bookmakers
const bookmakers = await client.getBookmakers();

// Select specific bookmakers for your account
await client.selectBookmakers('pinnacle,bet365');

// Check which bookmakers you've selected
const selected = await client.getSelectedBookmakers();

// Clear selected bookmakers
await client.clearSelectedBookmakers();
```

## API Reference

### Sports & Leagues

| Method | Description | Docs |
|--------|-------------|------|
| `getSports()` | Get all available sports | [Docs](https://docs.odds-api.io/api-reference/sports/get-sports) |
| `getLeagues(sport)` | Get leagues for a sport | [Docs](https://docs.odds-api.io/api-reference/leagues/get-leagues) |

### Events

| Method | Description | Docs |
|--------|-------------|------|
| `getEvents(params)` | Get events with filters | [Docs](https://docs.odds-api.io/api-reference/events/get-events) |
| `getEventById(eventId)` | Get specific event details | [Docs](https://docs.odds-api.io/api-reference/events/get-event-by-id) |
| `getLiveEvents(sport)` | Get currently live events | [Docs](https://docs.odds-api.io/api-reference/events/get-live-events) |
| `searchEvents(query)` | Search for events by keyword | [Docs](https://docs.odds-api.io/api-reference/events/search-events) |

### Odds

| Method | Description | Docs |
|--------|-------------|------|
| `getEventOdds(params)` | Get odds for an event | [Docs](https://docs.odds-api.io/api-reference/odds/get-event-odds) |
| `getOddsMovement(params)` | Track odds changes | [Docs](https://docs.odds-api.io/api-reference/odds/get-odds-movements) |
| `getOddsForMultipleEvents(params)` | Get odds for multiple events | [Docs](https://docs.odds-api.io/api-reference/odds/get-odds-for-multiple-events) |
| `getUpdatedOddsSince(params)` | Get odds updated since timestamp | [Docs](https://docs.odds-api.io/api-reference/odds/get-updated-event-odds-since-a-given-timestamp) |

### Participants

| Method | Description | Docs |
|--------|-------------|------|
| `getParticipants(params)` | Get participants/teams | [Docs](https://docs.odds-api.io/api-reference/participants/get-participants) |
| `getParticipantById(id)` | Get participant by ID | [Docs](https://docs.odds-api.io/api-reference/participants/get-participant-by-id) |

### Bookmakers

| Method | Description | Docs |
|--------|-------------|------|
| `getBookmakers()` | Get all available bookmakers | [Docs](https://docs.odds-api.io/api-reference/bookmakers/get-bookmakers) |
| `getSelectedBookmakers()` | Get your selected bookmakers | [Docs](https://docs.odds-api.io/api-reference/bookmakers/get-selected-bookmakers) |
| `selectBookmakers(bookmakers)` | Select bookmakers for your account | [Docs](https://docs.odds-api.io/api-reference/bookmakers/select-bookmakers) |
| `clearSelectedBookmakers()` | Clear bookmaker selection | [Docs](https://docs.odds-api.io/api-reference/bookmakers/clear-selected-bookmakers) |

### Betting Analysis

| Method | Description | Docs |
|--------|-------------|------|
| `getArbitrageBets(params)` | Find arbitrage opportunities | [Docs](https://docs.odds-api.io/api-reference/arbitrage-bets/get-arbitrage-betting-opportunities) |
| `getValueBets(params)` | Find value bets | [Docs](https://docs.odds-api.io/api-reference/value-bets/get-value-bets) |

## Error Handling

The SDK includes custom error classes for better error handling:

```typescript
import {
  OddsAPIClient,
  OddsAPIError,
  InvalidAPIKeyError,
  RateLimitExceededError,
  NotFoundError,
  TimeoutError,
  NetworkError
} from 'odds-api-io';

const client = new OddsAPIClient({ apiKey: 'your-api-key' });

try {
  const events = await client.getEvents({ sport: 'basketball' });
} catch (error) {
  if (error instanceof InvalidAPIKeyError) {
    console.error('Your API key is invalid');
  } else if (error instanceof RateLimitExceededError) {
    console.error('Rate limit exceeded - wait before retrying');
  } else if (error instanceof NotFoundError) {
    console.error('Resource not found');
  } else if (error instanceof TimeoutError) {
    console.error('Request timeout');
  } else if (error instanceof NetworkError) {
    console.error('Network error');
  } else if (error instanceof OddsAPIError) {
    console.error('API error:', error.message);
  }
}
```

## Configuration

```typescript
const client = new OddsAPIClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api2.odds-api.io/v3', // Optional, default shown
  timeout: 10000 // Optional, default 10 seconds
});
```

## TypeScript Support

This SDK is written in TypeScript and includes complete type definitions:

```typescript
import type {
  Sport,
  League,
  Event,
  Participant,
  Bookmaker,
  EventOdds,
  ArbitrageBet,
  ValueBet,
  GetEventsParams
} from 'odds-api-io';
```

## Free Tier Limitations

The free API tier has some restrictions:

- **Limited bookmakers** - Only 2 bookmakers can be selected at once
- **Rate limits** - Check the [API documentation](https://docs.odds-api.io/) for current limits
- **No WebSocket** - Free tier uses HTTP requests only

[**Upgrade your plan**](https://odds-api.io/#pricing) for full access.

## Resources

- 📘 [**API Documentation**](https://docs.odds-api.io/)
- 🌐 [**Odds-API.io Website**](https://odds-api.io)
- 💳 [**Get Your API Key**](https://odds-api.io/#pricing)
- 🐛 [**Report Issues**](https://github.com/odds-api-io/odds-api-node/issues)

## Examples Directory

Check the [`examples/`](./examples) directory for more comprehensive examples:

- `basic-usage.ts` / `basic-usage.js` - Getting started
- `arbitrage-betting.ts` - Finding arbitrage opportunities
- `odds-tracking.ts` - Monitoring odds movements

## License

[MIT](LICENSE) © Odds-API.io

## Disclaimer

This is the official SDK for Odds-API.io. This tool is for informational purposes only and should not be used as the sole basis for betting decisions.

---

Built with ❤️ for the sports betting and analytics community
