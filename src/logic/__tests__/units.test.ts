/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Motion from '../motion.ts';
import { memoryPrefs } from '../prefs.ts';
import * as Units from '../units.ts';

test('units convert speed and temperature', () => {
  assert.equal(Units.speed(100, true), 62);
  assert.equal(Units.speed(100, false), 100);
  const p = memoryPrefs();
  assert.equal(Units.temp(p, 31), '31°');
  assert.equal(Units.speedLabel(p), 'km/h');
  p.put('tempUnit', 'f');
  p.put('speedUnit', 'mph');
  assert.equal(Units.temp(p, 31), '88°');
  assert.equal(Units.speedLabel(p), 'mph');
});

test('motion levels', () => {
  assert.equal(Motion.pick('nonsense'), 'standard');
  assert.equal(Motion.ms('reduced', 400), 200);
  assert.equal(Motion.ms('off', 400), 0);
  assert.equal(Motion.frame('off'), -1);
  assert.equal(Motion.frame('standard'), 33);
});
