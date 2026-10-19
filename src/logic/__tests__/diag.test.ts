import assert from 'node:assert/strict';
import test from 'node:test';

import * as Diag from '../diag.ts';

test('the errors carried on from are kept, newest first, the last thirty', () => {
  Diag.clear();
  const at = new Date(2026, 0, 2, 9, 5, 3).getTime();
  Diag.note('weather', new TypeError('Network request failed'), at);
  assert.deepEqual(Diag.lines(), ['09:05:03 weather TypeError: Network request failed']);
  Diag.note('OBD read', new Error(''), at + 1000);
  assert.equal(Diag.lines()[0], '09:05:04 OBD read Error', 'the newest is first, and no message is no colon');
  assert.equal(Diag.text(), Diag.lines().join('\n') + '\n');
  for (let i = 0; i < Diag.KEEP + 5; i++) Diag.note('note ' + i, new Error('x'), at);
  assert.equal(Diag.lines().length, Diag.KEEP);
  assert.ok(Diag.lines()[0].includes('note ' + (Diag.KEEP + 4)), 'the newest note is kept');
  assert.ok(!Diag.text().includes('weather'), 'and the oldest ones are pushed out');
  Diag.note('long', new Error('x'.repeat(400)), at);
  assert.equal(Diag.lines()[0].length, Diag.LINE, 'a long message is cut off');
  Diag.clear();
  assert.equal(Diag.text(), '');
});

test('a note says nothing about where the car was taken out', () => {
  Diag.clear();
  const at = new Date(2026, 0, 2, 9, 5, 3).getTime();
  Diag.note('weather', new Error('failed: https://api.open-meteo.com/v1/forecast?lat=28.6139&lon=77.2090'), at);
  const line = Diag.lines()[0];
  assert.ok(!line.includes('open-meteo'), 'the address is gone');
  assert.ok(!line.includes('28.6139'), 'and so is the place');
  assert.equal(Diag.scrub('at 28.6139,77.2090 on line 42'), 'at <number>,<number> on line 42', 'line numbers stay');
  assert.equal(Diag.scrub('file:///storage/trips.csv read'), '<address> read');
  assert.equal(Diag.scrub('speed 28.61 km/h'), 'speed 28.61 km/h', 'a plain number is not a place');
});
