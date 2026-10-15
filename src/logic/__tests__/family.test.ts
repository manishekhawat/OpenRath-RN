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
  assert.equal(ChildLock.toggle(p, 'com.google.android.youtube'), true);
  const now = 100000;
  assert.ok(ChildLock.blocked(p, 'com.google.android.youtube', 30, now - 2000, now));
  assert.ok(!ChildLock.blocked(p, 'com.google.android.youtube', 5, now - 2000, now));
  assert.ok(!ChildLock.blocked(p, 'com.google.android.youtube', 30, now - 20000, now));
  assert.ok(!ChildLock.blocked(p, 'com.spotify.music', 30, now - 2000, now));
  assert.equal(ChildLock.toggle(p, 'com.google.android.youtube'), false);
  assert.equal(p.str('lockedApps', 'x'), '');
});
