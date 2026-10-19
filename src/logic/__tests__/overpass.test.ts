import assert from 'node:assert/strict';
import test from 'node:test';

import * as O from '../overpass.ts';

test('the gate keeps eight seconds between questions', () => {
  const g = new O.Gate();
  const t0 = 1_700_000_000_000;
  assert.ok(g.may(t0));
  assert.ok(g.take(t0), 'the first question goes out');
  assert.ok(!g.may(t0 + 1000));
  assert.ok(!g.take(t0 + 1000), 'the next one waits');
  assert.ok(g.take(t0 + O.GAP_MS), 'and goes out after the gap');
});

test('a failure makes the gate wait longer each time, up to five minutes', () => {
  const g = new O.Gate();
  const t0 = 1_700_000_000_000;
  g.take(t0);
  g.failed(t0, 0);
  assert.equal(g.waiting(), O.FIRST_WAIT_MS);
  assert.ok(!g.may(t0 + O.GAP_MS), 'the usual gap is not enough after a failure');
  assert.ok(g.may(t0 + O.FIRST_WAIT_MS));
  g.failed(t0, 0);
  assert.equal(g.waiting(), O.FIRST_WAIT_MS * 2, 'the wait doubles');
  for (let i = 0; i < 10; i++) g.failed(t0, 0);
  assert.equal(g.waiting(), O.MAX_WAIT_MS, 'and stops at five minutes');
  g.worked();
  assert.equal(g.waiting(), 0, 'an answer clears it');
});

test('a busy server is given at least a minute', () => {
  const g = new O.Gate();
  const t0 = 1_700_000_000_000;
  g.failed(t0, 429);
  assert.equal(g.waiting(), O.BUSY_WAIT_MS);
  assert.ok(!g.may(t0 + O.BUSY_WAIT_MS - 1));
  assert.ok(g.may(t0 + O.BUSY_WAIT_MS));
});

test('the HTTP status is read back out of the error', () => {
  assert.equal(O.code(new Error('overpass 429')), 429);
  assert.equal(O.code(new Error('Network request failed')), 0);
  assert.ok(O.BUSY_CODES.includes(O.code(new Error('overpass 503'))));
});

test('a place belongs to one square of about five kilometres', () => {
  const id = O.cell(28.6139, 77.209);
  assert.equal(id, O.cell(28.62, 77.21), 'a few hundred metres on is the same square');
  assert.notEqual(id, O.cell(28.68, 77.209), 'the next square along is not');
  const [s, w, n, e] = O.box(id);
  assert.ok(s < 28.6139 && n > 28.6139 && w < 77.209 && e > 77.209, 'the square holds the place');
  assert.ok(Math.abs(n - s - (O.CELL + 2 * O.MARGIN)) < 1e-9, 'with the margin on both sides');
  assert.equal(O.bbox(id), `(${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)})`);
  assert.equal(O.cell(-12.34, -56.78), O.cell(-12.33, -56.77), 'and it works south of the equator');
});

test("a square's cameras are written, read back, and dropped after a week", () => {
  const now = 1_700_000_000_000;
  const cams = [
    { lat: 28.6139, lon: 77.209, limit: 50 },
    { lat: 28.62, lon: 77.21, limit: 0 },
  ];
  const text = O.write(cams, now);
  assert.deepEqual(O.read(text, now + 60000), cams);
  assert.equal(O.read(text, now + O.KEEP_MS + 1), null, 'over a week old: ask again');
  assert.deepEqual(O.read(O.write([], now), now), [], 'a square with no cameras is still an answer');
  assert.equal(O.read('', now), null);
  assert.equal(O.read('not a time\n', now), null);
  assert.equal(O.read(now + '\n28.6,oops,50\n', now), null, 'a line that is not numbers is no answer');
  assert.equal(O.read(now + 7200000 + '\n', now), null, 'nor is one written in the future');
});

test('the squares kept in memory are the ones driven through lately', () => {
  const now = 1_700_000_000_000;
  const c = new O.Cameras();
  c.keep('a', [{ lat: 1, lon: 2, limit: 50 }], now);
  assert.equal(c.remembered('a', now)?.length, 1);
  assert.equal(c.remembered('b', now), null);
  assert.equal(c.remembered('a', now + O.KEEP_MS + 1), null, 'a week on it is asked for again');
  c.keep('keep-me', [], now);
  for (let i = 0; i < O.SQUARES; i++) {
    c.remembered('keep-me', now);
    c.keep('sq' + i, [], now);
  }
  assert.equal(c.size(), O.SQUARES);
  assert.notEqual(c.remembered('keep-me', now), null, 'the square in use is not the one let go of');
  c.forget();
  assert.equal(c.size(), 0);
});

test('squares last fetched over a week ago are dropped from the unit', () => {
  const now = 1_700_000_000_000;
  const kept: Record<string, string> = {
    [O.key('fresh')]: O.write([], now),
    [O.key('old')]: O.write([], now - O.KEEP_MS - 1000),
    'wxSaved': 'not a square',
  };
  assert.deepEqual(
    O.stale(Object.keys(kept), (k) => kept[k] ?? '', now),
    [O.key('old')],
  );
});
