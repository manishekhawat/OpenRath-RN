/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as ChildLock from '../childlock.ts';
import { memoryPrefs } from '../prefs.ts';
import * as Valet from '../valet.ts';

test('valet mode lowers the warning speed and checks the PIN', () => {
  const p = memoryPrefs();
  assert.equal(Valet.warnAt(p), 0);
  p.put('valet', 'on');
  assert.equal(Valet.warnAt(p), 80);
  p.put('warnSpeed', '100');
  assert.equal(Valet.warnAt(p), 80);
  p.put('valetSpeed', '120');
  assert.equal(Valet.warnAt(p), 100);
  assert.ok(Valet.validPin('1234'));
  assert.ok(!Valet.validPin('12a4'));
  assert.ok(!Valet.validPin('123'));
});

test('child lock only blocks chosen apps while moving', () => {
  const p = memoryPrefs({ 'feat:childLock': 'on' });
  ChildLock.forgetMoving();
  assert.equal(ChildLock.toggle(p, 'com.google.android.youtube'), true);
  const now = 100000;
  assert.ok(ChildLock.blocked(p, 'com.google.android.youtube', 30, now - 2000, now));
  assert.ok(!ChildLock.blocked(p, 'com.google.android.youtube', 5, now - 2000, now));
  assert.ok(!ChildLock.blocked(p, 'com.spotify.music', 30, now - 2000, now));
  assert.equal(ChildLock.toggle(p, 'com.google.android.youtube'), false);
  assert.equal(p.str('lockedApps', 'x'), '');
});

test('child lock: a tunnel does not unlock the locks (1.44)', () => {
  ChildLock.forgetMoving();
  const now = 100000;
  // nothing seen yet and no fresh fix: not moving, so the locks are open
  assert.ok(!ChildLock.moving(30, now - 20000, now));
  // the engine's own speed wins over the GPS, where an adapter reports it
  assert.ok(ChildLock.moving(0, now - 20000, now, 40), 'the adapter says 40');
  assert.ok(!ChildLock.moving(60, now - 2000, now, 0), 'and says the car has stopped');

  // seen moving, then the GPS goes quiet: still moving for ten minutes, then not
  assert.ok(ChildLock.movingNow(30, now - 2000, now), 'a fresh fix, moving');
  assert.ok(ChildLock.movingNow(30, now - 20000, now + 60000), 'a minute into the tunnel');
  assert.ok(ChildLock.movingNow(30, now - 20000, now + 9 * 60000), 'nine minutes in');
  assert.ok(!ChildLock.movingNow(30, now - 20000, now + 11 * 60000), 'eleven minutes is parked');

  // a fresh fix saying the car has stopped unlocks at once, tunnel or no tunnel
  ChildLock.forgetMoving();
  assert.ok(ChildLock.movingNow(30, now - 1000, now));
  assert.ok(!ChildLock.movingNow(2, now - 1000, now + 5000), 'stopped, with the GPS still there');
});
