/// <reference types="node" />
/**
 * The sums behind the picture layouts: text widths and the "…" shortening, the points and paths
 * of a dial, and the two colour helpers. Run with
 * `node --test src/logic/__tests__/paint.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as paint from '../paint.ts';

const near = (want: number, got: number, tol: number, why = '') =>
  assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}${why ? ': ' + why : ''}`);

test('paint: how wide a letter and a word come out', () => {
  near(2.6, paint.charW(' ', 10, 'reg'), 1e-9, 'a space');
  near(2.6, paint.charW('i', 10, 'bold'), 1e-9, 'a thin letter, whatever the weight');
  near(17.2, paint.charW('M', 20, 'reg'), 1e-9, 'the widest letters');
  near(6.2, paint.charW('A', 10, 'reg'), 1e-9, 'capitals are wider');
  near(5.6, paint.charW('7', 10, 'light'), 1e-9, 'digits are all one width');
  near(5.4, paint.charW('a', 10, 'med'), 1e-9);
  near(12.4, paint.width('II', 10), 1e-9, 'capital I is not a thin letter');
  assert.ok(paint.width('abc', 10, 'bold') > paint.width('abc', 10, 'reg'), 'bold is wider');
  assert.equal(paint.width('', 24), 0);
});

test('paint: text shortened with an ellipsis', () => {
  assert.equal(paint.fit('Radio', 20, 200), 'Radio', 'it fits');
  assert.equal(paint.fit('Nothing playing right now', 20, 100), 'Nothing p…');
  assert.ok(paint.width(paint.fit('Nothing playing right now', 20, 100), 20) <= 100, 'and it fits');
  assert.equal(paint.fit(null, 20, 100), '', 'nothing to show');
  assert.equal(paint.fit('', 20, 100), '');
  assert.equal(paint.fit('Mileage coach', 20, 0), '…', 'no room at all');
});

test('paint: points and paths on a dial', () => {
  const [x0, y0] = paint.at(100, 100, 50, 0);
  near(150, x0, 1e-9);
  near(100, y0, 1e-9, '0° is 3 o\'clock');
  const [x1, y1] = paint.at(100, 100, 50, 90);
  near(100, x1, 1e-9);
  near(150, y1, 1e-9, '90° is straight down, as the Android canvas had it');
  assert.ok(paint.arc(0, 0, 10, 0, 90).startsWith('M10 0 A10 10 0 0 1 '), 'a quarter turn is the small arc');
  assert.ok(paint.arc(0, 0, 10, 0, 270).startsWith('M10 0 A10 10 0 1 1 '), 'over half a turn is the large arc');
  assert.equal(
    paint.roundRect(0, 0, 100, 50, 10),
    'M10 0H90A10 10 0 0 1 100 10V40A10 10 0 0 1 90 50H10A10 10 0 0 1 0 40V10A10 10 0 0 1 10 0Z',
  );
  assert.ok(paint.roundRect(0, 0, 20, 10, 99).startsWith('M5 0'), 'the corner never passes the middle');
});

test('paint: colours faded and mixed', () => {
  assert.equal(paint.faded('#1A2B3C', 0.5), '#1A2B3C80');
  assert.equal(paint.faded('#1A2B3C', 1), '#1A2B3CFF');
  assert.equal(paint.faded('#1A2B3CFF', 0), '#1A2B3C00', 'an alpha already there is replaced');
  assert.equal(paint.mix('#000000', '#FFFFFF', 0.5), '#808080');
  assert.equal(paint.mix('#000000', '#FFFFFF', 0), '#FFFFFF', 'none of the first');
  assert.equal(paint.mix('#000000', '#FFFFFF', 1), '#000000', 'all of the first');
  assert.equal(paint.mix('#0A141E', '#141E28', 0.25), '#121C26');
  // the settings screens cut the alpha off before mixing; with it the answer is the same
  assert.equal(paint.mix('#1A1A1AFF', '#FFFFFF00', 0.5), paint.mix('#1A1A1A', '#FFFFFF', 0.5));
});
