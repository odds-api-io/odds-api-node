# Changelog

## 1.5.2

### Fixed
- `ValueBet.expectedValue` docs: the value is bookmaker odds / fair odds x 100, not a fraction. 103.42 is a 3.42% edge (edge % = `expectedValue - 100`). The README value-bets example now computes the edge that way, and the arbitrage example prints `profitMargin` as the percentage it already is.

## 1.5.1

Republish of 1.5.0 (same code). 1.5.0 was staged on npm and not published.

## 1.5.0 (2026-11-06)

Covers every public Odds-API.io v3 endpoint and adds a WebSocket helper. Includes the unpublished 1.4.0 changes below.

### Added
- `getMarkets(sport?)` for the market catalogue.
- `getOddsSummary` and `getOddsSummaryMulti` (`/odds/summary`, `/odds/summary/multi`).
- `getOddsSnapshot`: `/odds/multi` with `includeSeq=true`, returning the `X-OddsAPI-Seq` value for WebSocket resume.
- `getUpdatedOddsSinceWithMeta` (X-Next-Since, X-Server-Time, X-Unknown-Markets) and `pollUpdatedOdds`, an async iterator that follows X-Next-Since.
- Historical: `searchHistoricalEvents`, `getClosingLines`, `iterateClosingLines`, `iterateHistoricalEvents` (splits long ranges into the 31-day windows the API allows).
- Settlement: `getSettlements` and `gradeBets` (alias `gradeSelections`), batching over 50 ids or selections.
- Outrights (golf, paid add-on): `getOutrights`, `getOutrightOdds`, `getOutrightResults`, with runner types for back/lay prices and Make Cut yes/no, plus `isPriceRunner` / `isYesNoRunner`.
- Mappings: `getMappings` and `iterateMappings` (cursor pagination).
- `getParticipantLogo` (PNG bytes) and `getParticipantLogoUrl`.
- `iterateEvents` (limit/skip), `getDroppingOddsPage` (pagination headers) and `iterateDroppingOdds`.
- New parameters: `markets` and `includeSeq` on odds calls, `markets` on historical odds, `limit` on `/odds/updated`, `limit`/`skip` and status lists on events, `status` on event search, `all` on leagues, sport/league/markets/minProfit/allCombinations on arbitrage, sport/league on value bets, `leagues` on dropping odds.
- Comma-list parameters accept arrays.
- `OddsWebSocket`: async iterator and typed events for the odds, scores and status channels, reconnect with `lastSeq` resume, `replay_complete`, `resync_required` handling and close-code policy (1012 reconnects at once, 1013 waits, 1008 from a newer connection stops). Uses the `ws` package (optional peer dependency) or the global WebSocket.
- Errors: `BadRequestError` (400), `ForbiddenError` (403, with `isAddOnRequired`), `RateLimitError` (429, with `retryAfter`), `ServerError` (5xx), `OddsWebSocketError`. Every error has `status`, `body` and `rateLimit`.
- Optional retries with backoff on 5xx, network errors and short 429 waits (`maxRetries`, default 2; `maxRetryDelay`, default 10 s). PUT calls are never retried.
- `client.lastRateLimit` from the `x-ratelimit-*` headers; `fetch` option for a custom implementation; `VERSION` export.

### Changed
- Types now match the API responses: `Event`, `EventOdds`, `Market`, `OddsLine`, `OddsMovement`, `ArbitrageBet`, `ValueBet`, `Bookmaker`, `League`, `Sport`, `Participant`, `SelectedBookmakers` and more. Period score keys are typed as `p1`..`pN`, `ft`, `ot`, `ap` (the legacy `period1`/`overtime`/`penalties`/`fulltime` keys stop being served on 12 November 2026).
- `getUpdatedOddsSince` requires `markets` (max 40), as the API does.
- `getDroppingOdds` sends `markets`; the old `market` option was ignored by the API and is now sent as `markets`.
- Error messages are the server's own text instead of fixed strings.
- Default base URL is `https://api.odds-api.io/v3`.
- `getLiveEvents(sport?)`: the sport is optional.
- User-Agent carries the SDK version.
- `RateLimitExceededError` is now an alias of `RateLimitError`.

## 1.4.0 (unpublished, released as part of 1.5.0)

- Description and keywords use plain "odds api" wording so npm search matches.
- README opens with a quickstart, an API key section, a sports and bookmakers table and doc links.
- `dist/esm` is marked as ESM and `dist/cjs` as CommonJS so Node 18 can import the ESM build.
- Per-format type declarations; `package.json` is exported.
- `node:test` tests for both entry points with mocked fetch.

## 1.3.1

- Bookmaker count updated to 450+; README points to paid plans.
