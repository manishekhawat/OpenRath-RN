/// <reference types="node" />
/**
 * The owner's country and currency, and the hidden-shortcut tips, both new in 1.44. Run with
 * `node --test src/logic/__tests__/country.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as features from '../features.ts';
import * as hints from '../hints.ts';
import * as money from '../money.ts';
import { memoryPrefs } from '../prefs.ts';

test('country: the sign written before an amount', () => {
  assert.equal(money.symbol('IN'), '₹');
  assert.equal(money.symbol(''), '₹', 'nothing known means India');
  assert.equal(money.symbol('GB'), '£');
  assert.equal(money.symbol('US'), '$');
  assert.equal(money.symbol('SG'), '$');
  assert.equal(money.symbol('DE'), '€');
  assert.equal(money.symbol('NL'), '€');
  assert.equal(money.symbol('PK'), 'Rs ');
  assert.equal(money.symbol('BD'), '৳');
  assert.equal(money.symbol('MY'), 'RM ');
  assert.equal(money.symbol('ZA'), 'R ');
  assert.equal(money.symbol('AE'), 'AED ');
  assert.equal(money.symbol('ZZ'), '₹', 'a country with no sign of its own keeps ₹');
});

test('country: the currency spoken', () => {
  assert.equal(money.spokenFor('IN'), 'rupees');
  assert.equal(money.spokenFor('NP'), 'rupees');
  assert.equal(money.spokenFor('GB'), 'pounds');
  assert.equal(money.spokenFor('AU'), 'dollars');
  assert.equal(money.spokenFor('FR'), 'euros');
  assert.equal(money.spokenFor('AE'), 'dirhams');
  assert.equal(money.spokenFor('ZA'), 'rand');
});

test('country: prices on screen and read out', () => {
  assert.equal(money.shownIn('Spent ₹1,200', 'IN'), 'Spent ₹1,200', 'India is left alone');
  assert.equal(money.shownIn('Spent ₹1,200', 'GB'), 'Spent £1,200');
  assert.equal(money.shownIn('₹10 + ₹20', 'US'), '$10 + $20', 'every one of them');
  assert.equal(money.shownIn('No price here', 'US'), 'No price here');
  assert.equal(money.shownIn('', 'US'), '');

  money.setCurrent('IN');
  assert.equal(money.say('Target reached: ₹2,000'), 'Target reached: rupees 2,000');
  money.setCurrent('GB');
  assert.equal(money.say('Target reached: ₹2,000'), 'Target reached: pounds 2,000', 'before it is swapped');
  assert.equal(money.say('Target reached: £2,000'), 'Target reached: pounds 2,000', 'and after');
  money.setCurrent('IN');
});

test('country: chosen in Settings, else the unit\'s own', () => {
  const p = memoryPrefs();
  money.set(p, 'gb');
  assert.equal(p.str('country', ''), 'GB', 'written in capitals');
  assert.equal(money.country(p), 'GB');
  assert.equal(money.current(), 'GB');
  assert.ok(!money.india());

  money.set(p, 'IN');
  assert.ok(money.india());

  // a country of the wrong shape, from a backup or a stereo that says something odd
  assert.equal(money.country(memoryPrefs({ country: 'INDIA' })), 'IN');
  assert.equal(money.name('IN'), 'India');
  assert.equal(money.name('NZ'), 'New Zealand');
  assert.equal(money.COUNTRIES[0], 'IN', 'India is offered first');
  assert.equal(new Set(money.COUNTRIES).size, money.COUNTRIES.length, 'no country twice');
});

test('tips: one a day, each once, and only for features that are on', () => {
  const p = memoryPrefs();
  const all = hints.ALL.map(() => true);
  assert.equal(hints.pick(0, all), 0);
  assert.equal(hints.pick(3, all), 3);
  assert.equal(hints.pick(hints.ALL.length, all), -1, 'all shown');
  assert.equal(hints.pick(-5, all), 0, 'a count from an older build');

  const off = all.map((_x, i) => i !== 0);
  assert.equal(hints.pick(0, off), 1, 'a tip for a switched-off feature is skipped');
  assert.equal(
    hints.pick(0, all.map(() => false)),
    -1,
  );

  // the day is the unit's own, not UTC
  const noon = new Date(2026, 9, 25, 12).getTime();
  assert.equal(hints.today(noon), '2026-10-25');

  const first = hints.due(p, noon, false);
  assert.equal(first, hints.ALL[0].tip);
  assert.equal(p.str('hintDay', ''), '2026-10-25');
  assert.equal(hints.due(p, noon, false), null, 'one a day');
  const next = hints.due(p, new Date(2026, 9, 26, 12).getTime(), false);
  assert.equal(next, hints.ALL[1].tip, 'the next one tomorrow');
  assert.equal(hints.due(p, new Date(2026, 9, 27, 12).getTime(), true), null, 'never while moving');

  // every tip, then nothing more
  for (let i = 0; i < hints.ALL.length + 2; i++) hints.due(p, new Date(2026, 10, i + 1, 12).getTime(), false);
  assert.equal(hints.due(p, new Date(2027, 0, 1, 12).getTime(), false), null, 'each is shown once');
});

test('tips: the list in Settings > Help follows the features', () => {
  const p = memoryPrefs();
  const full = hints.list(p);
  assert.ok(full.length >= 5);
  assert.ok(full.includes('Hold the Apps button to open Settings'));
  assert.ok(full.includes('Hold the Navigation button for your saved places'));

  features.set(p, 'places', false);
  const fewer = hints.list(p);
  assert.ok(!fewer.includes('Hold the Navigation button for your saved places'));
  assert.equal(fewer.length, full.length - 1, 'only that one goes');

  // every tip names a feature the port actually has, or none at all
  for (const h of hints.ALL) {
    if (h.needs === '') continue;
    assert.ok(
      features.ALL.some((x) => x.id === h.needs),
      `${h.needs} is a feature`,
    );
  }
});
