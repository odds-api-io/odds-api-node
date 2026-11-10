import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
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

  test('emits clock messages without moving lastSeq', async () => {
    const ws = feed();
    const clocks = [];
    ws.on('clock', (m) => clocks.push(m.clock.playedSeconds));
    const p = ws.connect();
    await tick();
    const s = FakeSocket.last();
    s.open();
    await p;
    s.send(welcome);
    s.send(update(7));
    s.send({ type: 'clock', timestamp: 2, id: '1', clock: { minute: 67, playedSeconds: 4023, period: 2, running: true } });
    assert.deepEqual(clocks, [4023]);
    assert.equal(ws.lastSeq, 7);
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
