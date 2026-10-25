/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as I18n from '../i18n.ts';
import * as Money from '../money.ts';
import { memoryPrefs } from '../prefs.ts';

test('English passes through, Hindi is looked up, and untranslated text stays English', () => {
  I18n.setOn(false);
  assert.equal(I18n.t('Language'), 'Language');
  I18n.load(memoryPrefs({ lang: 'hi' }));
  assert.ok(I18n.hindi());
  assert.notEqual(I18n.t('Language'), 'Language');
  assert.equal(I18n.t('No such English text 123'), 'No such English text 123');
  I18n.load(memoryPrefs({ lang: 'en' }));
  assert.equal(I18n.t('Language'), 'Language');
});

test('f fills numbered and plain places', () => {
  I18n.setOn(false);
  Money.setCurrent('IN');
  assert.equal(I18n.f('Toll in %1$s km, %2$s', '3.2', '₹100'), 'Toll in 3.2 km, ₹100');
  assert.equal(I18n.f('%s of %d on', 'a', 4.2), 'a of 4 on');
  assert.equal(I18n.f('100%% sure'), '100% sure');
});

test('prices are written in the country\'s own currency (1.44)', () => {
  I18n.setOn(false);
  Money.setCurrent('IN');
  assert.equal(I18n.t('Target reached: ₹2,000'), 'Target reached: ₹2,000');
  Money.setCurrent('GB');
  assert.equal(I18n.t('Target reached: ₹2,000'), 'Target reached: £2,000', 'every ₹ on screen goes through t()');
  assert.equal(I18n.f('Toll in %1$s km, ₹%2$s', '3.2', '100'), 'Toll in 3.2 km, £100', 'and through f()');
  Money.setCurrent('IN');
});
