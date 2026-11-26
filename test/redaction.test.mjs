import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { inspect } from 'node:util';
import {
  OddsAPIClient,
  OddsAPIError,
  InvalidAPIKeyError,
  ServerError,
  TimeoutError,
  NetworkError,
  OddsWebSocket,
} from 'odds-api-io';

const KEY = 'sk-live-7f3a9c1e5b2d4f60a8e1';

function assertNoKey(error) {
  const texts = [String(error), error.message, error.stack, inspect(error, { depth: 20 }), error.body ?? ''];
  for (let link = error.cause, depth = 0; link && depth < 10; link = link.cause, depth++) {
    texts.push(String(link), link.message ?? '', link.stack ?? '', inspect(link, { depth: 20 }));
  }
  for (const text of texts) assert.ok(!String(text).includes(KEY), `key leaked in: ${text}`);
}

async function closedPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function client(fetch, config = {}) {
  return new OddsAPIClient({ apiKey: KEY, baseUrl: 'https://example.test/v3', fetch, maxRetries: 0, ...config });
}

describe('API key redaction', () => {
  test('a refused connection with the built-in fetch hides the key', async () => {
    const port = await closedPort();
    const c = new OddsAPIClient({ apiKey: KEY, baseUrl: `http://127.0.0.1:${port}/v3`, maxRetries: 0 });
    const error = await c.getEvents({ sport: 'football' }).then(
      () => assert.fail('expected a NetworkError'),
      (e) => e
    );
    assert.ok(error instanceof NetworkError);
    assert.ok(error.cause, 'the underlying error is kept as cause');
    assertNoKey(error);
  });

  test('a fetch error that quotes the URL is masked in the message and the cause chain', async () => {
    const fetch = async (url) => {
      const inner = new Error(`connect ECONNREFUSED for ${url}`);
      inner.code = 'ECONNREFUSED';
      const outer = new TypeError(`request to ${url} failed, reason: connect ECONNREFUSED`);
      outer.cause = inner;
      outer.url = url;
      throw outer;
    };
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof NetworkError);
    assert.match(error.message, /apiKey=\*\*\*/);
    assert.equal(error.cause.name, 'TypeError');
    assert.equal(error.cause.cause.code, 'ECONNREFUSED');
    assertNoKey(error);
  });

  test('a timeout hides the key', async () => {
    const fetch = (url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const abort = new Error(`The operation was aborted: ${url}`);
          abort.name = 'AbortError';
          reject(abort);
        });
      });
    const error = await client(fetch, { timeout: 20 }).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof TimeoutError);
    assertNoKey(error);
  });

  test('an HTTP error whose body echoes the URL hides the key', async () => {
    const fetch = async (url) =>
      new Response(JSON.stringify({ error: `Invalid API key in ${url}` }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof InvalidAPIKeyError);
    assertNoKey(error);
  });

  test('an HTML proxy error hides the key', async () => {
    const fetch = async (url) => new Response(`<html>502 Bad Gateway ${url}</html>`, { status: 502 });
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof ServerError);
    assertNoKey(error);
  });

  test('a JSON parse error on a success response hides the key', async () => {
    const fetch = async (url) => new Response(`<html>${url}</html>`, { status: 200 });
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof NetworkError);
    assert.match(error.message, /Failed to read response/);
    assertNoKey(error);
  });

  test('a WebSocket that cannot be created hides the key', async () => {
    const feed = new OddsWebSocket({ apiKey: KEY, markets: ['ML'], url: 'not a websocket url', reconnect: false });
    feed.on('error', () => undefined);
    const error = await feed.connect().catch((e) => e);
    assert.ok(error instanceof OddsAPIError);
    assertNoKey(error);
    feed.close();
  });

  test('the WebSocket error event hides the key', async () => {
    class Socket {
      constructor(url) {
        setTimeout(() => {
          this.onerror?.({ message: `getaddrinfo ENOTFOUND for ${url}` });
          this.onclose?.({ code: 1006, reason: '' });
        }, 0);
      }
      close() {}
    }
    const errors = [];
    const feed = new OddsWebSocket({ apiKey: KEY, markets: ['ML'], WebSocket: Socket, reconnect: false });
    feed.on('error', (e) => errors.push(e));
    await feed.connect().catch(() => undefined);
    assert.ok(errors.length > 0);
    for (const error of errors) assertNoKey(error);
    feed.close();
  });
});

describe('API key redaction in causes', () => {
  test('plain-object and URL causes are masked', async () => {
    const fetch = async (url) => {
      const error = new TypeError('fetch failed');
      error.cause = { url, request: { href: new URL(url) }, nested: [{ deep: url }] };
      error.request = { url };
      throw error;
    };
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof NetworkError);
    assert.match(error.cause.cause.url, /apiKey=\*\*\*/);
    assertNoKey(error);
  });

  test('a very deep cause chain is cut with a placeholder, never left unmasked', async () => {
    const fetch = async (url) => {
      let error = new Error(`root ${url}`);
      for (let i = 0; i < 30; i++) {
        const outer = new Error(`level ${i}`);
        outer.cause = error;
        error = outer;
      }
      throw error;
    };
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assertNoKey(error);
    let link = error;
    for (let i = 0; i < 60 && link && typeof link === 'object'; i++) link = link.cause;
    assert.ok(link === undefined || typeof link === 'string');
  });

  test('cyclic causes do not hang', async () => {
    const fetch = async (url) => {
      const a = new Error(`a ${url}`);
      const b = new Error('b');
      a.cause = b;
      b.cause = a;
      throw a;
    };
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assertNoKey(error);
  });

  test('a native AbortError cause stays readable', async () => {
    const fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason));
      });
    const error = await client(fetch, { timeout: 10 }).getEvents({ sport: 'football' }).catch((e) => e);
    assert.ok(error instanceof TimeoutError);
    assert.equal(typeof String(error.cause), 'string');
    assert.equal(error.cause.name, 'AbortError');
    assert.equal(typeof error.cause.message, 'string');
    assertNoKey(error);
  });
});

describe('API key redaction in structured causes', () => {
  test('property names and credential fields are masked', async () => {
    const fetch = async (url) => {
      const error = new TypeError('fetch failed');
      error.requests = { [url]: 'failed' };
      error.request = { headers: { Authorization: 'Bearer proxy-private-token', Accept: 'application/json' } };
      throw error;
    };
    const error = await client(fetch).getEvents({ sport: 'football' }).catch((e) => e);
    assertNoKey(error);
    assert.equal(error.cause.request.headers.Authorization, '***');
    assert.equal(error.cause.request.headers.Accept, 'application/json');
    assert.ok(!inspect(error, { depth: 20 }).includes('proxy-private-token'));
  });
});
