import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  OddsAPIClient,
  OddsAPIError,
  BadRequestError,
  InvalidAPIKeyError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  RateLimitExceededError,
  ServerError,
  TimeoutError,
  NetworkError,
  isYesNoRunner,
  isPriceRunner,
  VERSION,
} from 'odds-api-io';

const BASE = 'https://example.test/v3';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

/** A client whose fetch answers from `responses` (a value, a function or a list used in order). */
function setup(responses, config = {}) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : null;
  const fetchMock = async (url, init = {}) => {
    calls.push({ url: new URL(url), init });
    const next = queue ? queue.shift() : responses;
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(new URL(url), init);
    if (next instanceof Response) return next;
    return json(next ?? []);
  };
  const client = new OddsAPIClient({ apiKey: 'secret', baseUrl: BASE, fetch: fetchMock, maxRetryDelay: 50, ...config });
  return { client, calls, q: (i = 0) => Object.fromEntries(calls[i].url.searchParams) };
}

describe('catalogue', () => {
  test('default base URL is api.odds-api.io and sports need no key', async () => {
    const calls = [];
    const client = new OddsAPIClient({
      apiKey: 'k',
      fetch: async (url) => (calls.push(new URL(url)), json([{ name: 'Football', slug: 'football' }])),
    });
    const sports = await client.getSports();
    assert.equal(sports[0].slug, 'football');
    assert.equal(calls[0].origin, 'https://api.odds-api.io');
    assert.equal(calls[0].pathname, '/v3/sports');
    assert.equal(calls[0].searchParams.get('apiKey'), null);
  });

  test('sends a versioned User-Agent', async () => {
    const { client, calls } = setup([[]]);
    await client.getSports();
    assert.equal(calls[0].init.headers['User-Agent'], `odds-api-io-node/${VERSION}`);
  });

  test('getMarkets with and without a sport', async () => {
    const { client, calls, q } = setup([
      { sport: { name: 'Football', slug: 'football' }, markets: [{ name: 'ML', shape: 'moneyline', period: 'match', prematch: true, live: true }] },
      { football: [] },
    ]);
    const one = await client.getMarkets('football');
    assert.equal(one.markets[0].name, 'ML');
    assert.equal(q(0).sport, 'football');
    assert.equal(q(0).apiKey, undefined);
    const all = await client.getMarkets();
    assert.deepEqual(all, { football: [] });
    assert.equal(calls[1].url.searchParams.has('sport'), false);
  });

  test('getLeagues passes all', async () => {
    const { client, q } = setup([[]]);
    await client.getLeagues('football', { all: true });
    assert.deepEqual(q(), { sport: 'football', all: 'true', apiKey: 'secret' });
  });

  test('bookmakers and selection', async () => {
    const { client, calls } = setup([
      [{ name: 'Bet365', active: true, createdAt: '2023-09-03T09:51:52Z', status: 'ok', reason: null }],
      { bookmakers: ['Bet365'], count: 1 },
      { bookmakers: ['Bet365', 'SingBet'], count: 2, added: 1 },
      { bookmakers: [], count: 0 },
    ]);
    const books = await client.getBookmakers();
    assert.equal(books[0].status, 'ok');
    assert.equal(calls[0].url.searchParams.get('apiKey'), null);
    assert.equal((await client.getSelectedBookmakers()).count, 1);
    await client.selectBookmakers(['Bet365', 'SingBet']);
    assert.equal(calls[2].init.method, 'PUT');
    assert.equal(calls[2].url.pathname, '/v3/bookmakers/selected/select');
    assert.equal(calls[2].url.searchParams.get('bookmakers'), 'Bet365,SingBet');
    await client.clearSelectedBookmakers();
    assert.equal(calls[3].init.method, 'PUT');
    assert.equal(calls[3].url.pathname, '/v3/bookmakers/selected/clear');
  });
});

describe('events', () => {
  test('getEvents joins status lists and passes limit/skip', async () => {
    const { client, q } = setup([[]]);
    await client.getEvents({ sport: 'football', status: ['pending', 'live'], limit: 10, skip: 20 });
    assert.deepEqual(q(), { sport: 'football', status: 'pending,live', limit: '10', skip: '20', apiKey: 'secret' });
  });

  test('iterateEvents pages until a short page', async () => {
    const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: start + i }));
    const { client, q } = setup([page(2, 0), page(2, 2), page(1, 4)]);
    const ids = [];
    for await (const e of client.iterateEvents({ sport: 'football' }, { pageSize: 2 })) ids.push(e.id);
    assert.deepEqual(ids, [0, 1, 2, 3, 4]);
    assert.equal(q(2).skip, '4');
    assert.equal(q(2).limit, '2');
  });

  test('getLiveEvents sport is optional, searchEvents takes status', async () => {
    const { client, calls, q } = setup([[], []]);
    await client.getLiveEvents();
    assert.equal(calls[0].url.pathname, '/v3/events/live');
    assert.equal(calls[0].url.searchParams.has('sport'), false);
    await client.searchEvents('Liverpool', { status: 'live' });
    assert.deepEqual(q(1), { query: 'Liverpool', status: 'live', apiKey: 'secret' });
  });

  test('getEventById', async () => {
    const { client, calls } = setup([{ id: 1, status: 'pending' }]);
    await client.getEventById(123);
    assert.equal(calls[0].url.pathname, '/v3/events/123');
  });
});

describe('odds', () => {
  test('getEventOdds sends markets', async () => {
    const { client, q } = setup([{ id: 1, bookmakers: { Bet365: [{ name: 'ML', updatedAt: 'x', odds: [{ home: '2.10' }] }] }, urls: {} }]);
    const odds = await client.getEventOdds({ eventId: 123, bookmakers: ['Bet365', 'Unibet'], markets: ['ML', 'Totals'] });
    assert.equal(odds.bookmakers.Bet365[0].odds[0].home, '2.10');
    assert.deepEqual(q(), { eventId: '123', bookmakers: 'Bet365,Unibet', markets: 'ML,Totals', apiKey: 'secret' });
  });

  test('getOddsForMultipleEvents sends markets', async () => {
    const { client, calls, q } = setup([[]]);
    await client.getOddsForMultipleEvents({ eventIds: [1, 2], bookmakers: 'Bet365', markets: 'ML' });
    assert.equal(calls[0].url.pathname, '/v3/odds/multi');
    assert.deepEqual(q(), { eventIds: '1,2', bookmakers: 'Bet365', markets: 'ML', apiKey: 'secret' });
  });

  test('getOddsSnapshot asks for includeSeq and reads X-OddsAPI-Seq', async () => {
    const { client, q } = setup([json([{ id: 1 }], 200, { 'X-OddsAPI-Seq': '482917' })]);
    const snap = await client.getOddsSnapshot({ eventIds: [1], bookmakers: 'Bet365', markets: 'ML' });
    assert.equal(snap.seq, 482917);
    assert.equal(snap.data.length, 1);
    assert.equal(q().includeSeq, 'true');
  });

  test('getUpdatedOddsSinceWithMeta reads the delta headers', async () => {
    const { client, q } = setup([
      json([{ id: 1 }], 200, { 'X-Next-Since': '1700000050', 'X-Server-Time': '1700000060', 'X-Unknown-Markets': 'Foo,Bar' }),
    ]);
    const res = await client.getUpdatedOddsSinceWithMeta({ since: 1700000000, bookmaker: 'Bet365', sport: 'football', markets: ['ML', 'Spread'], limit: 500 });
    assert.equal(res.nextSince, 1700000050);
    assert.equal(res.serverTime, 1700000060);
    assert.deepEqual(res.unknownMarkets, ['Foo', 'Bar']);
    assert.deepEqual(q(), { since: '1700000000', bookmaker: 'Bet365', sport: 'football', markets: 'ML,Spread', limit: '500', apiKey: 'secret' });
  });

  test('pollUpdatedOdds follows X-Next-Since', async () => {
    const { client, q } = setup([
      json([], 200, { 'X-Next-Since': '1000' }),
      json([], 200, { 'X-Next-Since': '1010' }),
    ]);
    const controller = new AbortController();
    const seen = [];
    for await (const batch of client.pollUpdatedOdds({ since: 990, bookmaker: 'Bet365', sport: 'football', markets: 'ML', intervalMs: 1, signal: controller.signal })) {
      seen.push(batch.nextSince);
      if (seen.length === 2) controller.abort();
    }
    assert.deepEqual(seen, [1000, 1010]);
    assert.equal(q(0).since, '990');
    assert.equal(q(1).since, '1000');
  });

  test('getOddsMovement', async () => {
    const body = { eventid: '1', bookmaker: 'Bet365', opening: { home: 2, away: 3, timestamp: 1 }, latest: { home: 2.1, away: 2.9, timestamp: 2 }, movements: [] };
    const { client, calls, q } = setup([body]);
    const res = await client.getOddsMovement({ eventId: 1, bookmaker: 'Bet365', market: 'Totals', marketLine: 2.5 });
    assert.equal(res.latest.home, 2.1);
    assert.equal(calls[0].url.pathname, '/v3/odds/movements');
    assert.equal(q().marketLine, '2.5');
  });

  test('getOddsSummary and getOddsSummaryMulti', async () => {
    const summary = { eventId: '1', home: 'A', away: 'B', date: 'x', status: 'pending', computedAt: 'y', markets: [{ name: 'ML', lines: [{ hdp: null, main: true, books: 5, outcomes: { home: { best: 2, bestBookmakers: ['Bet365'], average: 1.9, median: 1.9, worst: 1.8 } } }] }] };
    const { client, calls, q } = setup([summary, [summary]]);
    const one = await client.getOddsSummary({ eventId: 1, markets: ['ML'], lines: 'all', includeExchanges: true, bookmakers: ['Bet365'] });
    assert.equal(one.markets[0].lines[0].outcomes.home.best, 2);
    assert.deepEqual(q(0), { eventId: '1', markets: 'ML', lines: 'all', includeExchanges: 'true', bookmakers: 'Bet365', apiKey: 'secret' });
    await client.getOddsSummaryMulti({ eventIds: [1, 2] });
    assert.equal(calls[1].url.pathname, '/v3/odds/summary/multi');
    assert.equal(q(1).eventIds, '1,2');
  });
});

describe('historical', () => {
  test('getHistoricalEvents, searchHistoricalEvents, getHistoricalOdds', async () => {
    const { client, calls, q } = setup([[], [], { id: 1, bookmakers: {} }]);
    await client.getHistoricalEvents({ sport: 'football', league: 'england-premier-league', from: '2026-01-01T00:00:00Z', to: '2026-01-31T00:00:00Z' });
    assert.equal(q(0).league, 'england-premier-league');
    await client.searchHistoricalEvents({ query: 'Arsenal', sport: 'football' });
    assert.equal(calls[1].url.pathname, '/v3/historical/events/search');
    assert.equal(q(1).query, 'Arsenal');
    await client.getHistoricalOdds({ eventId: 9, bookmakers: ['Bet365'], markets: ['ML', 'Totals'] });
    assert.deepEqual(q(2), { eventId: '9', bookmakers: 'Bet365', markets: 'ML,Totals', apiKey: 'secret' });
  });

  test('iterateHistoricalEvents splits ranges into 31-day windows and dedupes', async () => {
    const { client, calls } = setup([[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], [{ id: 4 }]]);
    const ids = [];
    for await (const e of client.iterateHistoricalEvents({ sport: 'football', league: 'x', from: '2026-01-01T00:00:00Z', to: '2026-03-15T00:00:00Z' })) ids.push(e.id);
    assert.deepEqual(ids, [1, 2, 3, 4]);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url.searchParams.get('to'), '2026-02-01T00:00:00Z');
    assert.equal(calls[1].url.searchParams.get('from'), '2026-02-01T00:00:00Z');
    assert.equal(calls[2].url.searchParams.get('to'), '2026-03-15T00:00:00Z');
  });

  test('getClosingLines and iterateClosingLines', async () => {
    const page = (n, start) => Array.from({ length: n }, (_, i) => ({ id: start + i, bookmakers: {} }));
    const { client, calls, q } = setup([[], page(100, 0), page(3, 100)]);
    const params = { sport: 'football', leagues: ['england-premier-league', 'spain-laliga'], from: '2026-01-01T00:00:00Z', to: '2026-06-01T00:00:00Z', markets: ['ML'], bookmakers: ['Bet365', 'Unibet'] };
    await client.getClosingLines(params);
    assert.equal(calls[0].url.pathname, '/v3/historical/closing-lines');
    assert.equal(q(0).leagues, 'england-premier-league,spain-laliga');
    assert.equal(q(0).bookmakers, 'Bet365,Unibet');
    let n = 0;
    for await (const _ of client.iterateClosingLines(params)) n++;
    assert.equal(n, 103);
    assert.equal(q(2).skip, '100');
    assert.equal(q(2).limit, '100');
  });
});

describe('analysis', () => {
  test('getDroppingOdds sends markets and leagues (legacy market is mapped)', async () => {
    const { client, q } = setup([[], []]);
    await client.getDroppingOdds({ sport: 'football', leagues: ['a', 'b'], markets: ['ML', 'Spread'], sort: 'recent' });
    assert.deepEqual(q(0), { sport: 'football', leagues: 'a,b', markets: 'ML,Spread', sort: 'recent', apiKey: 'secret' });
    await client.getDroppingOdds({ market: 'Totals' });
    assert.equal(q(1).markets, 'Totals');
    assert.equal(q(1).market, undefined);
  });

  test('getDroppingOddsPage headers and iterateDroppingOdds', async () => {
    const entry = (i) => ({ eventId: i });
    const { client, q } = setup([
      json([entry(1), entry(2)], 200, { 'X-Total-Count': '3', 'X-Page': '1', 'X-Per-Page': '2', 'X-Updated-At': '1775854172851' }),
      json([entry(3)], 200, { 'X-Total-Count': '3', 'X-Page': '2', 'X-Per-Page': '2' }),
    ]);
    const ids = [];
    for await (const d of client.iterateDroppingOdds({ sport: 'football' }, { pageSize: 2 })) ids.push(d.eventId);
    assert.deepEqual(ids, [1, 2, 3]);
    assert.equal(q(1).page, '2');
    const { client: c2 } = setup([json([], 200, { 'X-Total-Count': '0', 'X-Page': '1', 'X-Per-Page': '50', 'X-Updated-At': '5' })]);
    const page = await c2.getDroppingOddsPage();
    assert.deepEqual({ total: page.total, page: page.page, perPage: page.perPage, updatedAt: page.updatedAt }, { total: 0, page: 1, perPage: 50, updatedAt: 5 });
  });

  test('getArbitrageBets sends every filter', async () => {
    const { client, q } = setup([[]]);
    await client.getArbitrageBets({ bookmakers: ['Bet365', 'SingBet'], sport: 'football', league: 'england-premier-league', markets: ['Totals'], minProfit: 1.5, allCombinations: true, limit: 100, includeEventDetails: true });
    assert.deepEqual(q(), {
      bookmakers: 'Bet365,SingBet', sport: 'football', league: 'england-premier-league', markets: 'Totals',
      minProfit: '1.5', allCombinations: 'true', limit: '100', includeEventDetails: 'true', apiKey: 'secret',
    });
  });

  test('getValueBets sends sport and league', async () => {
    const { client, q } = setup([[]]);
    await client.getValueBets({ bookmaker: 'Bet365', sport: 'baseball', league: 'usa-mlb' });
    assert.deepEqual(q(), { bookmaker: 'Bet365', sport: 'baseball', league: 'usa-mlb', apiKey: 'secret' });
  });
});

describe('settlement', () => {
  test('getSettlements batches by 50 and merges', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => 1000 + i);
    const { client, calls } = setup([
      { settlements: [{ eventId: 1000, status: 'settled', final: true }], notFound: ['1001'] },
      { settlements: [{ eventId: 1050, status: 'live', final: false }], notFound: [] },
    ]);
    const res = await client.getSettlements(ids);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url.searchParams.get('eventIds').split(',').length, 50);
    assert.equal(calls[1].url.searchParams.get('eventIds').split(',').length, 10);
    assert.deepEqual(res.settlements.map((s) => s.eventId), [1000, 1050]);
    assert.deepEqual(res.notFound, ['1001']);
  });

  test('gradeBets POSTs a JSON body with the key in the query', async () => {
    const { client, calls } = setup([{ grades: [{ ref: 'bet-1', eventId: 1, result: 'won', reason: null, final: true }] }]);
    const res = await client.gradeBets([{ ref: 'bet-1', eventId: 1, market: 'Spread', hdp: -0.75, side: 'home' }]);
    assert.equal(res.grades[0].result, 'won');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].url.pathname, '/v3/settlements/grade');
    assert.equal(calls[0].url.searchParams.get('apiKey'), 'secret');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { selections: [{ ref: 'bet-1', eventId: 1, market: 'Spread', hdp: -0.75, side: 'home' }] });
  });

  test('gradeBets splits more than 50 selections and keeps order', async () => {
    const sels = Array.from({ length: 51 }, (_, i) => ({ ref: `r${i}`, eventId: i, market: 'ML', side: 'home' }));
    const { client, calls } = setup((url, init) => json({ grades: JSON.parse(init.body).selections.map((s) => ({ ref: s.ref, eventId: s.eventId, result: 'pending', reason: 'event_not_started', final: false })) }));
    const res = await client.gradeSelections(sels);
    assert.equal(calls.length, 2);
    assert.equal(res.grades.length, 51);
    assert.equal(res.grades[50].ref, 'r50');
  });
});

describe('outrights', () => {
  test('getOutrights, getOutrightOdds, getOutrightResults', async () => {
    const odds = {
      id: 1001, name: 'The Open', date: 'x', status: 'pending', sport: { name: 'Golf', slug: 'golf' }, league: { name: 'Majors', slug: 'majors' },
      bookmakers: {
        'Betfair Exchange': [
          { name: 'Winner', updatedAt: 'x', odds: [{ label: 'Ben Griffin', participantId: 991291386379, odds: '18.50', layOdds: '19.00' }] },
          { name: 'Make Cut', updatedAt: 'x', odds: [{ label: 'Ben Griffin', participantId: 991291386379, yes: '1.149', no: '6.667' }] },
        ],
      },
    };
    const results = { id: 1001, name: 'The Open', status: 'settled', results: [{ label: 'A', participantId: 1, position: 1, tied: false, madeCut: true, status: 'finished' }], winners: { Winner: [1], 'Top 5 (Incl. Ties)': [1] } };
    const { client, calls, q } = setup([[], odds, results]);
    await client.getOutrights({ sport: 'golf', league: 'pga-tour', status: ['pending', 'live'] });
    assert.deepEqual(q(0), { sport: 'golf', league: 'pga-tour', status: 'pending,live', apiKey: 'secret' });
    const o = await client.getOutrightOdds({ id: 1001, bookmakers: ['DraftKings', 'Betfair Exchange'] });
    assert.equal(calls[1].url.pathname, '/v3/outrights/odds');
    assert.equal(q(1).bookmakers, 'DraftKings,Betfair Exchange');
    const [winner, makeCut] = o.bookmakers['Betfair Exchange'];
    assert.ok(isPriceRunner(winner.odds[0]));
    assert.equal(winner.odds[0].layOdds, '19.00');
    assert.ok(isYesNoRunner(makeCut.odds[0]));
    assert.ok(!isYesNoRunner(winner.odds[0]));
    const r = await client.getOutrightResults(1001);
    assert.equal(calls[2].url.pathname, '/v3/outrights/results');
    assert.equal(q(2).id, '1001');
    assert.deepEqual(r.winners.Winner, [1]);
  });

  test('403 without the add-on keeps the server message', async () => {
    const msg = 'Outrights are a paid add-on. Add it in your dashboard: https://odds-api.io/dashboard/billing#outrights';
    const { client } = setup([json({ error: msg }, 403)]);
    await assert.rejects(client.getOutrights({ sport: 'golf' }), (err) => {
      assert.ok(err instanceof ForbiddenError);
      assert.ok(err instanceof OddsAPIError);
      assert.equal(err.status, 403);
      assert.equal(err.message, msg);
      assert.equal(err.isAddOnRequired, true);
      return true;
    });
  });
});

describe('mappings and participants', () => {
  test('getMappings and iterateMappings follow the cursor', async () => {
    const row = (id) => ({ eventId: id, marketId: `m${id}`, outcomeId: `o${id}` });
    const { client, q } = setup([
      { data: [row(1)], nextCursor: null },
      { data: [row(1), row(2)], nextCursor: 'abc' },
      { data: [row(3)], nextCursor: null },
    ]);
    const page = await client.getMappings({ bookmaker: 'Polymarket', eventIds: [71515842, 71515900], market: 'Spread', active: true });
    assert.equal(page.nextCursor, null);
    assert.deepEqual(q(0), { bookmaker: 'Polymarket', eventIds: '71515842,71515900', market: 'Spread', active: 'true', apiKey: 'secret' });
    const ids = [];
    for await (const m of client.iterateMappings({ bookmaker: 'Kalshi', sport: 'american-football' }, { pageSize: 5000 })) ids.push(m.eventId);
    assert.deepEqual(ids, [1, 2, 3]);
    assert.equal(q(1).limit, '5000');
    assert.equal(q(2).cursor, 'abc');
  });

  test('participants and logo', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const { client, calls, q } = setup([[], { id: 45, name: 'Chelsea', sport: 'football' }, new Response(png, { headers: { 'content-type': 'image/png' } })]);
    await client.getParticipants({ sport: 'football', search: 'Chelsea' });
    assert.deepEqual(q(0), { sport: 'football', search: 'Chelsea', apiKey: 'secret' });
    await client.getParticipantById(45);
    assert.equal(calls[1].url.pathname, '/v3/participants/45');
    const bytes = await client.getParticipantLogo(45);
    assert.deepEqual(new Uint8Array(bytes), png);
    assert.equal(client.getParticipantLogoUrl(45), `${BASE}/participants/45/logo?apiKey=secret`);
  });
});

describe('errors', () => {
  test('400 is BadRequestError with the server message and body', async () => {
    const { client } = setup([json({ error: 'Too many markets. Maximum 40 allowed.' }, 400)]);
    await assert.rejects(client.getEventOdds({ eventId: 1, bookmakers: 'Bet365' }), (err) => {
      assert.ok(err instanceof BadRequestError);
      assert.equal(err.message, 'Too many markets. Maximum 40 allowed.');
      assert.equal(err.status, 400);
      assert.match(err.body, /Maximum 40/);
      return true;
    });
  });

  test('401 is InvalidAPIKeyError with the server message', async () => {
    const { client } = setup([json({ error: 'Invalid API key' }, 401)]);
    await assert.rejects(client.getEvents({ sport: 'football' }), (err) => err instanceof InvalidAPIKeyError && err.message === 'Invalid API key');
  });

  test('404 is NotFoundError and keeps the detail', async () => {
    const msg = 'Bet365 has no history for market Corners Totals on this event. Markets with history: ML, Totals';
    const { client } = setup([json({ error: msg }, 404)]);
    await assert.rejects(client.getOddsMovement({ eventId: 1, bookmaker: 'Bet365', market: 'Corners Totals' }), (err) => err instanceof NotFoundError && err.message === msg);
  });

  test('non-JSON error bodies are kept as text', async () => {
    const { client } = setup([new Response('teapot', { status: 418 })]);
    await assert.rejects(client.getSports(), (err) => err instanceof OddsAPIError && err.message === 'teapot' && err.status === 418);
  });

  test('429 is RateLimitError with retryAfter and rate-limit info; not retried when the wait is long', async () => {
    const reset = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { client, calls } = setup([
      json({ error: 'You have exceeded your rate limit of 5000 requests per hour.' }, 429, { 'X-RateLimit-Limit': '5000', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': reset }),
    ]);
    await assert.rejects(client.getSports(), (err) => {
      assert.ok(err instanceof RateLimitError);
      assert.ok(err instanceof RateLimitExceededError);
      assert.match(err.message, /5000 requests per hour/);
      assert.ok(err.retryAfter > 1700 && err.retryAfter <= 1800);
      assert.equal(err.rateLimit.limit, 5000);
      assert.equal(err.rateLimit.remaining, 0);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(RateLimitExceededError, RateLimitError);
  });

  test('429 with a short Retry-After is retried', async () => {
    const { client, calls } = setup([json({ error: 'slow down' }, 429, { 'Retry-After': '0' }), json([{ name: 'Football', slug: 'football' }])]);
    const sports = await client.getSports();
    assert.equal(sports.length, 1);
    assert.equal(calls.length, 2);
  });

  test('5xx is retried with backoff, then ServerError', async () => {
    const { client, calls } = setup([json({ error: 'busy' }, 503, { 'Retry-After': '0' }), json({ error: 'busy' }, 503), json({ error: 'busy' }, 503)]);
    await assert.rejects(client.getSports(), (err) => err instanceof ServerError && err.status === 503 && err.message === 'busy');
    assert.equal(calls.length, 3);
  });

  test('5xx then success', async () => {
    const { client, calls } = setup([json({ error: 'oops' }, 502), json([])]);
    assert.deepEqual(await client.getSports(), []);
    assert.equal(calls.length, 2);
  });

  test('maxRetries 0 disables retries; PUT is never retried', async () => {
    const { client, calls } = setup([json({ error: 'busy' }, 503)], { maxRetries: 0 });
    await assert.rejects(client.getSports(), ServerError);
    assert.equal(calls.length, 1);
    const second = setup([json({ error: 'busy' }, 503), json({})]);
    await assert.rejects(second.client.clearSelectedBookmakers(), ServerError);
    assert.equal(second.calls.length, 1);
  });

  test('network failures become NetworkError after retries', async () => {
    const { client, calls } = setup([new TypeError('fetch failed'), new TypeError('fetch failed'), new TypeError('fetch failed')]);
    await assert.rejects(client.getSports(), (err) => err instanceof NetworkError && /fetch failed/.test(err.message));
    assert.equal(calls.length, 3);
  });

  test('timeouts become TimeoutError', async () => {
    const client = new OddsAPIClient({
      apiKey: 'k',
      baseUrl: BASE,
      timeout: 20,
      maxRetries: 0,
      fetch: (url, init) =>
        new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
    });
    await assert.rejects(client.getSports(), TimeoutError);
  });

  test('lastRateLimit is updated from successful responses', async () => {
    const { client } = setup([json([], 200, { 'X-RateLimit-Limit': '5000', 'X-RateLimit-Remaining': '4999', 'X-RateLimit-Reset': '2026-11-06T13:00:00Z' })]);
    await client.getSports();
    assert.equal(client.lastRateLimit.remaining, 4999);
    assert.equal(client.lastRateLimit.reset.toISOString(), '2026-11-06T13:00:00.000Z');
  });
});
