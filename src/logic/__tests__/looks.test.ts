/// <reference types="node" />
/**
 * The checks from Tests.java for the theme that changes by itself, and checks of the three looks
 * new in 1.42 (Mission control, Electric and Roadster) and their themes. Run with
 * `node --test src/logic/__tests__/looks.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import * as features from '../features.ts';
import { memoryPrefs } from '../prefs.ts';
import * as theme from '../theme.ts';
import * as themeauto from '../themeauto.ts';

const read = (id: string) => theme.parseJson(readFileSync(new URL(`../../data/theme-${id}.json`, import.meta.url), 'utf8'));

test('theme by itself: which theme (Tests.java)', () => {
  assert.equal(themeauto.pick('@night', "Riya's phone", '@phone', true, "riya's phone"), '@phone', 'phone wins');
  assert.equal(themeauto.pick('@night', "Riya's phone", '@phone', true, ''), '@night', 'night');
  assert.equal(themeauto.pick('@night', '', '', false, ''), null, 'day keeps mine');
});

test('theme by itself: night, and the switch', () => {
  // Gurugram, 1 January 2026: 3 am is night, noon is not
  assert.ok(themeauto.night(28.46, 77.03, Date.UTC(2026, 0, 1, 21, 30)), 'after sunset');
  assert.ok(!themeauto.night(28.46, 77.03, Date.UTC(2026, 0, 1, 6, 30)), 'midday');
  const noFix = new Date(2026, 0, 1, 22).getTime();
  assert.ok(themeauto.night(0, 0, noFix), 'without a position, 7 pm to 6 am');

  const p = memoryPrefs();
  assert.equal(themeauto.want(p, 28.46, 77.03, Date.UTC(2026, 0, 1, 21, 30)), null, 'off until a theme is chosen');
  themeauto.setNight(p, '@minimal');
  assert.ok(features.on(p, 'autoTheme'), 'choosing a night theme switches it on');
  assert.equal(themeauto.want(p, 28.46, 77.03, Date.UTC(2026, 0, 1, 21, 30)), '@minimal');
  assert.equal(themeauto.want(p, 28.46, 77.03, Date.UTC(2026, 0, 1, 6, 30)), null, 'the owner\'s own by day');
  features.set(p, 'autoTheme', false);
  assert.equal(themeauto.want(p, 28.46, 77.03, Date.UTC(2026, 0, 1, 21, 30)), null, 'switched off');
});

test("theme by itself: its pick shows instead of the owner's", () => {
  const p = memoryPrefs({ themePack: '@light' });
  assert.equal(theme.chosen(p), '@light');
  theme.setOverride('@mission');
  assert.equal(theme.chosen(p), '@mission');
  assert.equal(theme.own(p), '@light', 'the owner keeps their own');
  theme.setOverride(null);
  assert.equal(theme.chosen(p), '@light');
});

test('the themes built in', () => {
  assert.deepEqual(theme.BUILT_IN, ['magma-grey', 'light', 'minimal', 'auto', 'genz', 'mission', 'electric', 'roadster']);
  for (const id of theme.BUILT_IN) {
    const look = theme.lookOf(read(id));
    assert.equal(look.problem, '', id + ' reads without a mistake');
    assert.match(look.accent, /^#[0-9A-F]{6}$/, id + "'s accent");
  }
  const mission = theme.lookOf(read('mission'));
  assert.equal(mission.welcomeTitle, 'READY');
  assert.equal(mission.radius, 4, 'square corners');
  assert.deepEqual(mission.gradient, ['#000000', '#03070F', '#0A1A33']);
  const electric = theme.lookOf(read('electric'));
  assert.equal(electric.text, '#171A20', 'dark type on white cards');
  assert.equal(electric.edge, '#00000000', 'no borders');
  assert.equal(theme.lookOf(read('roadster')).accent, '#E82127', 'racing red');
  assert.equal(theme.packOf('@roadster', read('roadster'), null).name, 'Roadster');
});

test('a theme with a mistake says so', () => {
  const look = theme.lookOf({ colours: { accent: 'blue' }, backgroundGradient: ['#000000', 'nope'] });
  assert.match(look.problem, /backgroundGradient/, 'the last mistake is shown');
  const one = theme.lookOf({ colours: { accent: 'blue' } });
  assert.equal(one.problem, "Colour accent isn't a colour like #D8DCE2");
  assert.equal(one.accent, theme.PAINT_ACCENT, 'and the built-in colour is kept');
});
