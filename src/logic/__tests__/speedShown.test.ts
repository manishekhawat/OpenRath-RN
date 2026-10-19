/// <reference types="node" />
/**
 * The speed the dashboard shows: when it reads "--", when it snaps to zero, and when this drive's
 * summary is due once the car has stopped.
 * Run with `node --test src/logic/__tests__/speedShown.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { FIX_TIMEOUT_MS } from '../speed.ts';
import * as shown from '../speedShown.ts';
import { STOP_SUMMARY_KM, STOP_SUMMARY_MS } from '../trip.ts';

test('"--": no fix yet, or none in the last ten seconds', () => {
  const now = 1_000_000;
  assert.equal(shown.fresh(0, now), false, 'no fix yet');
  assert.equal(shown.fresh(now, now), true);
  assert.equal(shown.fresh(now - FIX_TIMEOUT_MS + 1, now), true);
  assert.equal(shown.fresh(now - FIX_TIMEOUT_MS, now), false, 'ten seconds old');
  assert.equal(shown.fresh(now - 60000, now), false);
});

test('the number snaps to zero below the speed filter, eased or not', () => {
  // without "Smooth speed" the reading shows as it is, or 0 below the filter
  assert.equal(shown.speed(0, 7, 1000, 4, false), 7);
  assert.equal(shown.speed(10, 3.9, 1000, 4, false), 0, 'GPS drift at a red light');
  assert.equal(shown.speed(10, 4, 1000, 4, false), 4, 'the filter speed itself still shows');
  assert.equal(shown.speed(0, 1, 1000, 0, false), 1, 'the filter turned off');
  // eased, it moves part of the way towards the reading, and is still a flat 0 below the filter
  assert.equal(shown.speed(10, 3.9, 1000, 4, true), 0);
  const eased = shown.speed(40, 60, 350, 2, true);
  assert.ok(eased > 40 && eased < 60, 'part of the way: ' + eased);
  assert.equal(shown.speed(0, 60, 350, 2, true), 60, 'from standing still it takes the reading');
});

test('the stop summary fires after five still seconds, and half a kilometre driven', () => {
  const now = 1_000_000;
  // the standing-still clock starts when the car stops and is dropped as soon as it moves
  assert.equal(shown.stillSince(true, 0, now), now);
  assert.equal(shown.stillSince(true, now - 3000, now), now - 3000, 'still standing');
  assert.equal(shown.stillSince(false, now - 3000, now), 0, 'moving again');

  const due = (since: number, km: number, on = true) => shown.summaryDue(true, since, now, km, on);
  assert.equal(due(now - STOP_SUMMARY_MS, 1), true);
  assert.equal(due(now - STOP_SUMMARY_MS + 1, 1), false, 'not standing long enough');
  assert.equal(due(now - 60000, STOP_SUMMARY_KM), true);
  assert.equal(due(now - 60000, STOP_SUMMARY_KM - 0.01), false, 'too short a drive to sum up');
  assert.equal(due(now - 60000, 1, false), false, 'the switch is off');
  assert.equal(shown.summaryDue(false, now - 60000, now, 1, true), false, 'still rolling');
});
