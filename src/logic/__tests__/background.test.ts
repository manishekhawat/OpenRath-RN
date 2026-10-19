/// <reference types="node" />
/**
 * Counting trips behind other apps: the switch, which location source runs, the fixes of a batch,
 * and what waits for the screen.
 * Run with `node --test src/logic/__tests__/background.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as bg from '../background.ts';
import { memoryPrefs } from '../prefs.ts';

test('switch: on unless turned off', () => {
  const p = memoryPrefs();
  assert.equal(bg.wanted(p), true);
  bg.set(p, false);
  assert.equal(p.str(bg.PREF, ''), 'off');
  assert.equal(bg.wanted(p), false);
  bg.set(p, true);
  assert.equal(bg.wanted(p), true);
});

test('source: one at a time, the task only with the switch on and "all the time" allowed', () => {
  assert.equal(bg.source(false, true, true), 'none');
  assert.equal(bg.source(true, true, true), 'task');
  assert.equal(bg.source(true, true, false), 'watch');
  assert.equal(bg.source(true, false, true), 'watch');
  assert.equal(bg.source(true, false, false), 'watch');
});

test('asking: once, on screen, with the switch on; a tap in Settings asks again', () => {
  const p = memoryPrefs();
  assert.equal(bg.shouldAsk(p, false, true, false), true);
  assert.equal(bg.shouldAsk(p, true, true, false), false, 'already allowed');
  assert.equal(bg.shouldAsk(p, false, false, false), false, 'not on screen');
  p.put(bg.ASKED, '1');
  assert.equal(bg.shouldAsk(p, false, true, false), false, 'asked before');
  assert.equal(bg.shouldAsk(p, false, true, true), true, 'tapped');
  bg.set(p, false);
  assert.equal(bg.shouldAsk(p, false, true, true), false, 'switched off');
});

test('fresh: newer fixes only, oldest first, each once', () => {
  const fix = (timestamp: number) => ({ timestamp });
  const ts = (xs: { timestamp: number }[]) => xs.map((x) => x.timestamp);
  assert.deepEqual(ts(bg.fresh([fix(3000), fix(1000), fix(2000)], 0, 9000)), [1000, 2000, 3000]);
  assert.deepEqual(ts(bg.fresh([fix(1000), fix(2000), fix(3000)], 2000, 9000)), [3000], 'fed already');
  assert.deepEqual(ts(bg.fresh([fix(2000), fix(2000)], 0, 9000)), [2000], 'handed over twice');
  assert.deepEqual(bg.fresh([], 5, 9000), []);
  // no time from the GPS: it counts as now, once
  assert.equal(bg.fresh([fix(0), fix(0)], 1000, 9000).length, 1);
  assert.equal(bg.fresh([fix(0)], 9000, 9000).length, 0);
});

test('due: notes once each, the newest kept', () => {
  const now = 1_000_000;
  const note = (text: string, at: number): bg.Queued => ({ kind: 'note', text, at });
  assert.deepEqual(bg.due([], now), []);
  const d = bg.due([note('a', now - 5000), note('b', now - 2000), note('a', now - 1000)], now);
  assert.deepEqual(
    d.map((q) => q.text),
    ['b', 'a'],
  );
  const many = Array.from({ length: 8 }, (_, i) => note('n' + i, now - 100 + i));
  assert.deepEqual(
    bg.due(many, now).map((q) => q.text),
    ['n3', 'n4', 'n5', 'n6', 'n7'],
  );
});

test('status line', () => {
  assert.match(bg.statusText(false, true, 'watch'), /^off/);
  assert.match(bg.statusText(true, true, 'task'), /counting while/);
  assert.match(bg.statusText(true, false, 'watch'), /tap to allow/);
  assert.equal(bg.statusText(true, null, 'watch'), 'on');
});
