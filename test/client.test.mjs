import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OddsAPIClient, InvalidAPIKeyError, NotFoundError } from 'odds-api-io';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(body, status = 200) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

test('getSports calls /sports', async () => {
  const calls = mockFetch([{ name: 'Football', slug: 'football' }]);
  const client = new OddsAPIClient({ apiKey: 'k', baseUrl: 'https://example.test/v3' });
  const sports = await client.getSports();
  assert.equal(sports[0].slug, 'football');
  assert.equal(calls[0].url.pathname, '/v3/sports');
});

test('getEventOdds sends the key and filters', async () => {
  const calls = mockFetch({ id: 1, bookmakers: {} });
  const client = new OddsAPIClient({ apiKey: 'secret', baseUrl: 'https://example.test/v3' });
  await client.getEventOdds({ eventId: '123', bookmakers: 'Bet365,Unibet' });
  const { url } = calls[0];
  assert.equal(url.pathname, '/v3/odds');
  assert.equal(url.searchParams.get('apiKey'), 'secret');
  assert.equal(url.searchParams.get('eventId'), '123');
  assert.equal(url.searchParams.get('bookmakers'), 'Bet365,Unibet');
});

test('maps 401 to InvalidAPIKeyError', async () => {
  mockFetch({ error: 'bad key' }, 401);
  const client = new OddsAPIClient({ apiKey: 'bad', baseUrl: 'https://example.test/v3' });
  await assert.rejects(client.getEventOdds({ eventId: '1', bookmakers: 'Bet365' }), InvalidAPIKeyError);
});

test('maps 404 to NotFoundError', async () => {
  mockFetch({ error: 'missing' }, 404);
  const client = new OddsAPIClient({ apiKey: 'k', baseUrl: 'https://example.test/v3' });
  await assert.rejects(client.getEventById('nope'), NotFoundError);
});
