import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { OddsWebSocket, OddsWebSocketError } from 'odds-api-io';

/** A scripted stand-in for a WebSocket: tests drive open, messages and closes. */
class FakeSocket {
  static instances = [];
  constructor(url) {
    this.url = new URL(url);
    this.readyState = 0;
    this.onopen = this.onmessage = this.onerror = this.onclose = null;
    FakeSocket.instances.push(this);
  }
  static reset() {
    FakeSocket.instances = [];
  }
  static last() {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  send(obj) {
    this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) });
  }
  serverClose(code, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  fail(message) {
    this.onerror?.({ message });
    this.serverClose(1006);
  }
  close(code = 1000, reason = '') {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.({ code, reason }));
  }
}

/** Mimics `ws`: a refused handshake is reported through 'unexpected-response' with the response headers. */
class FakeWsSocket extends FakeSocket {
  constructor(url) {
    super(url);
    this.handlers = {};
  }
  on(event, listener) {
    this.handlers[event] = listener;
  }
  refuse(statusCode, headers = {}) {
    let resumed = false;
    this.handlers['unexpected-response']?.({}, { statusCode, headers, resume: () => (resumed = true) });
    this.resumed = resumed;
  }
  close(code = 1006, reason = '') {
    if (this.readyState === 0) {
      this.readyState = 3;
      this.onerror?.({ message: 'WebSocket was closed before the connection was established' });
      queueMicrotask(() => this.onclose?.({ code: 1006, reason: '' }));
      return;
    }
    super.close(code, reason);
  }
}

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function feed(options = {}) {
  FakeSocket.reset();
  return new OddsWebSocket({
    apiKey: 'secret',
    markets: ['ML', 'Totals'],
    WebSocket: FakeSocket,
    initialReconnectDelay: 5,
    maxReconnectDelay: 20,
    ...options,
  });
}

const welcome = { type: 'welcome', message: 'Connected to OddsAPI WebSocket', user_id: 'u', bookmakers: ['Bet365'], connected_at: '2026-11-06T00:00:00Z' };
const update = (seq, extra = {}) => ({ type: 'updated', seq, timestamp: 1, id: '63017989', bookie: 'SingBet', markets: [{ name: 'ML', updatedAt: 'x', odds: [{ home: '1.85' }] }], ...extra });

describe('OddsWebSocket', () => {
  test('validates options', () => {
    assert.throws(() => new OddsWebSocket({ apiKey: 'k', WebSocket: FakeSocket }), /markets is required/);
    assert.doesNotThrow(() => new OddsWebSocket({ apiKey: 'k', channels: ['scores', 'status'], WebSocket: FakeSocket }));
    assert.throws(() => new OddsWebSocket({ apiKey: 'k', markets: 'ML', leagues: 'a', eventIds: [1], WebSocket: FakeSocket }), OddsWebSocketError);
  });

  test('builds the URL from the filters and hides the key in .url', async () => {
    const ws = feed({ channels: ['odds', 'scores'], sport: ['football', 'basketball'], leagues: 'england-premier-league', status: 'live', lastSeq: 42 });
    const p = ws.connect();
    await tick();
    const { searchParams } = FakeSocket.last().url;
    assert.equal(FakeSocket.last().url.origin + FakeSocket.last().url.pathname, 'wss://api.odds-api.io/v3/ws');
    assert.equal(searchParams.get('apiKey'), 'secret');
    assert.equal(searchParams.get('markets'), 'ML,Totals');
    assert.equal(searchParams.get('channels'), 'odds,scores');
    assert.equal(searchParams.get('sport'), 'football,basketball');
    assert.equal(searchParams.get('leagues'), 'england-premier-league');
    assert.equal(searchParams.get('status'), 'live');
    assert.equal(searchParams.get('lastSeq'), '42');
    assert.equal(searchParams.get('replayComplete'), 'true');
    assert.match(ws.url, /apiKey=\*\*\*/);
    FakeSocket.last().open();
    await p;
    ws.close();
  });

  test('emits typed events, tracks the highest seq and splits multi-line frames', async () => {
    const ws = feed();
    const got = { welcome: 0, updated: [], score: 0, message: 0 };
    ws.on('welcome', () => got.welcome++);
    ws.on('updated', (m) => got.updated.push(m.seq));
    ws.on('score', () => got.score++);
    ws.on('message', () => got.message++);
    const p = ws.connect();
    await tick();
    const s = FakeSocket.last();
    s.open();
    await p;
    s.send(welcome);
    s.send(JSON.stringify(update(10)) + '\n' + JSON.stringify(update(12)));
    s.send(update(11));
    s.send({ type: 'score', timestamp: 1, id: '1', scores: { home: 1, away: 0, periods: { p1: { home: 1, away: 0 } } } });
    assert.equal(got.welcome, 1);
    assert.deepEqual(got.updated, [10, 12, 11]);
    assert.equal(got.score, 1);
    assert.equal(got.message, 5);
    assert.equal(ws.lastSeq, 12);
    ws.close();
  });

  test('reconnects after a drop and resumes with lastSeq', async () => {
    const ws = feed();
    const reconnecting = [];
    ws.on('reconnecting', (info) => reconnecting.push(info));
    const p = ws.connect();
    await tick();
    FakeSocket.last().open();
    await p;
    FakeSocket.last().send(update(500));
    FakeSocket.last().serverClose(1012, 'server restart');
    assert.equal(reconnecting.length, 1);
    assert.equal(reconnecting[0].lastSeq, 500);
    await tick(40);
    assert.equal(FakeSocket.instances.length, 2);
    assert.equal(FakeSocket.last().url.searchParams.get('lastSeq'), '500');
    ws.close();
  });

  test('resync_required drops the stored seq', async () => {
    const ws = feed({ lastSeq: 100 });
    let resync;
    ws.on('resync_required', (m) => (resync = m));
    const p = ws.connect();
    await tick();
    FakeSocket.last().open();
    await p;
    FakeSocket.last().send({ type: 'resync_required', reason: 'replay_window_dirty', last_seq: 100, current_seq: 900 });
    assert.equal(resync.reason, 'replay_window_dirty');
    assert.equal(ws.lastSeq, undefined);
    ws.lastSeq = 950;
    FakeSocket.last().serverClose(1006);
    await tick(40);
    assert.equal(FakeSocket.last().url.searchParams.get('lastSeq'), '950');
    ws.close();
  });

  test('does not fight a newer connection (1008)', async () => {
    const ws = feed();
    const closes = [];
    ws.on('close', (c) => closes.push(c));
    ws.on('error', () => {});
    const p = ws.connect();
    await tick();
    FakeSocket.last().open();
    await p;
    FakeSocket.last().serverClose(1008, 'connection limit reached, newer connection opened');
    await tick(40);
    assert.equal(FakeSocket.instances.length, 1);
    assert.equal(closes[0].willReconnect, false);
  });

  test('a 426 handshake is fatal and explains the compression requirement', async () => {
    const ws = feed();
    const errors = [];
    ws.on('error', (e) => errors.push(e));
    const p = ws.connect();
    await tick();
    FakeSocket.last().fail('Unexpected server response: 426');
    await assert.rejects(p, (err) => err instanceof OddsWebSocketError && err.code === 426 && /permessage-deflate/.test(err.message));
    await tick(40);
    assert.equal(FakeSocket.instances.length, 1);
    assert.equal(errors.length, 1);
  });

  test('a 401 handshake is fatal', async () => {
    const ws = feed();
    ws.on('error', () => {});
    const p = ws.connect();
    await tick();
    FakeSocket.last().fail('Unexpected server response: 401');
    await assert.rejects(p, (err) => err.code === 401);
  });

  for (const status of [500, 502, 503, 504]) {
    test(`a ${status} handshake is retried with backoff`, async () => {
      const ws = feed();
      const errors = [];
      const reconnecting = [];
      ws.on('error', (e) => errors.push(e));
      ws.on('reconnecting', (i) => reconnecting.push(i));
      const p = ws.connect();
      await tick();
      FakeSocket.last().fail(`Unexpected server response: ${status}`);
      await tick(40);
      assert.equal(FakeSocket.instances.length, 2);
      assert.equal(reconnecting.length, 1);
      assert.equal(errors.length, 0);
      FakeSocket.last().open();
      await p;
      ws.close();
    });
  }

  test('a 503 with Retry-After waits at least that long', async () => {
    FakeSocket.reset();
    const ws = new OddsWebSocket({ apiKey: 'secret', markets: 'ML', WebSocket: FakeWsSocket, initialReconnectDelay: 5 });
    const errors = [];
    const reconnecting = [];
    ws.on('error', (e) => errors.push(e));
    ws.on('reconnecting', (i) => reconnecting.push(i));
    ws.connect().catch(() => {});
    await tick();
    const first = FakeSocket.last();
    first.refuse(503, { 'retry-after': '2' });
    await tick();
    assert.equal(first.resumed, true);
    assert.equal(reconnecting.length, 1);
    assert.ok(reconnecting[0].delay >= 2000 && reconnecting[0].delay <= 2400, `delay ${reconnecting[0].delay}`);
    assert.equal(errors.length, 0);
    ws.close();
  });

  test('a 403 reported through unexpected-response stays fatal', async () => {
    FakeSocket.reset();
    const ws = new OddsWebSocket({ apiKey: 'secret', markets: 'ML', WebSocket: FakeWsSocket, initialReconnectDelay: 5 });
    const errors = [];
    ws.on('error', (e) => errors.push(e));
    const p = ws.connect();
    await tick();
    FakeSocket.last().refuse(403);
    await assert.rejects(p, (err) => err instanceof OddsWebSocketError && err.code === 403 && /no WebSocket access/.test(err.message));
    await tick(40);
    assert.equal(FakeSocket.instances.length, 1);
    assert.equal(errors.length, 1);
  });

  test('gives up on a refused handshake after maxReconnectAttempts and names the status', async () => {
    const ws = feed({ maxReconnectAttempts: 1 });
    ws.on('error', () => {});
    const p = ws.connect();
    await tick();
    FakeSocket.last().fail('Unexpected server response: 503');
    await tick(40);
    FakeSocket.last().fail('Unexpected server response: 503');
    await assert.rejects(p, (err) => err.code === 503 && /Gave up after 1 reconnect attempts \(last handshake refused with HTTP 503\)/.test(err.message));
  });

  test('network errors are retried', async () => {
    const ws = feed();
    const reconnecting = [];
    ws.on('error', () => {});
    ws.on('reconnecting', (i) => reconnecting.push(i));
    const p = ws.connect();
    await tick();
    FakeSocket.last().fail('connect ECONNREFUSED 127.0.0.1:443');
    await tick(40);
    assert.equal(reconnecting.length, 1);
    FakeSocket.last().open();
    await p;
    ws.close();
  });

  test('gives up after maxReconnectAttempts', async () => {
    const ws = feed({ maxReconnectAttempts: 2 });
    ws.on('error', () => {});
    const p = ws.connect();
    await tick();
    FakeSocket.last().serverClose(1006);
    await tick(40);
    FakeSocket.last().serverClose(1006);
    await tick(40);
    FakeSocket.last().serverClose(1006);
    await assert.rejects(p, /Gave up after 2 reconnect attempts/);
    assert.equal(FakeSocket.instances.length, 3);
  });

  test('1013 waits at least 3 seconds', async () => {
    const ws = feed();
    const delays = [];
    ws.on('reconnecting', (i) => delays.push(i.delay));
    const p = ws.connect();
    await tick();
    FakeSocket.last().open();
    await p;
    FakeSocket.last().serverClose(1013, 'reconnect cooldown, retry in a few seconds');
    assert.ok(delays[0] >= 3000);
    ws.close();
  });

  test('async iterator yields messages and ends on close()', async () => {
    const ws = feed();
    const seen = [];
    const loop = (async () => {
      for await (const msg of ws) {
        seen.push(msg.type);
        if (msg.type === 'replay_complete') ws.close();
      }
    })();
    await tick();
    const s = FakeSocket.last();
    s.open();
    s.send(welcome);
    s.send(update(1));
    s.send({ type: 'deleted', seq: 2, timestamp: 1, id: '1', bookie: 'SingBet', markets: [] });
    s.send({ type: 'replay_complete', outcome: 'replayed', last_seq: 0, through_seq: 2 });
    await loop;
    assert.deepEqual(seen, ['welcome', 'updated', 'deleted', 'replay_complete']);
  });

  test('async iterator throws when the helper gives up', async () => {
    const ws = feed({ reconnect: false });
    ws.on('error', () => {});
    const loop = (async () => {
      for await (const _ of ws) {
        // drain
      }
    })();
    await tick();
    FakeSocket.last().open();
    FakeSocket.last().serverClose(1011, 'internal error');
    await assert.rejects(loop, (err) => err instanceof OddsWebSocketError && err.code === 1011);
  });
});

describe('OddsWebSocket with the ws package', () => {
  async function server(refusals) {
    const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });
    const http = createServer();
    let upgrades = 0;
    http.on('upgrade', (req, socket, head) => {
      const refusal = refusals[upgrades++];
      if (refusal) {
        const headers = Object.entries(refusal.headers ?? {}).map(([k, v]) => `${k}: ${v}\r\n`).join('');
        socket.end(`HTTP/1.1 ${refusal.status} Refused\r\n${headers}Content-Length: 0\r\nConnection: close\r\n\r\n`);
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => client.send(JSON.stringify(welcome)));
    });
    await new Promise((r) => http.listen(0, '127.0.0.1', r));
    return {
      url: `ws://127.0.0.1:${http.address().port}/v3/ws`,
      upgrades: () => upgrades,
      stop: () => {
        for (const c of wss.clients) c.terminate();
        wss.close();
        http.close();
      },
    };
  }

  test('a draining 503 with Retry-After reconnects after the advised wait', async (t) => {
    const srv = await server([{ status: 503, headers: { 'Retry-After': '1' } }]);
    t.after(srv.stop);
    const ws = new OddsWebSocket({ apiKey: 'k', markets: 'ML', url: srv.url, initialReconnectDelay: 5 });
    const errors = [];
    const reconnecting = [];
    ws.on('error', (e) => errors.push(e));
    ws.on('reconnecting', (i) => reconnecting.push(i));
    const welcomed = new Promise((r) => ws.once('welcome', r));
    const started = Date.now();
    await ws.connect();
    await welcomed;
    assert.ok(Date.now() - started >= 1000);
    assert.equal(srv.upgrades(), 2);
    assert.equal(reconnecting.length, 1);
    assert.ok(reconnecting[0].delay >= 1000);
    assert.deepEqual(errors, []);
    ws.close();
  });

  test('a 401 is fatal', async (t) => {
    const srv = await server([{ status: 401 }]);
    t.after(srv.stop);
    const ws = new OddsWebSocket({ apiKey: 'k', markets: 'ML', url: srv.url, initialReconnectDelay: 5 });
    const errors = [];
    ws.on('error', (e) => errors.push(e));
    await assert.rejects(ws.connect(), (err) => err instanceof OddsWebSocketError && err.code === 401);
    await tick(50);
    assert.equal(srv.upgrades(), 1);
    assert.equal(errors.length, 1);
  });
});
