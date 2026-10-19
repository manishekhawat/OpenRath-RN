/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Features from '../features.ts';
import * as Intro from '../intro.ts';
import { memoryPrefs } from '../prefs.ts';
import * as Reports from '../reports.ts';
import * as S from '../settings.ts';
import * as Setup from '../setup.ts';

test('a row’s value splits into a state and a hint', () => {
  assert.deepEqual(S.split('₹100'), ['₹100', ''], 'split short');
  assert.deepEqual(S.split('not OpenRath; tap to make the unit start in it'), ['not OpenRath', 'tap to make the unit start in it']);
  assert.deepEqual(S.split("send a photo if something doesn't work"), ['', "send a photo if something doesn't work"], 'split long is a hint');
  assert.deepEqual(S.split(null), ['', '']);
});

test('recently used: newest first, no repeats, four kept', () => {
  let r = S.remember('', 'Home app');
  r = S.remember(r, 'Speed correction');
  r = S.remember(r, 'Home app');
  assert.equal(r, 'Home app\nSpeed correction', 'recent newest first, no repeats');
  for (const x of ['a', 'b', 'c', 'd', 'e']) r = S.remember(r, x);
  assert.equal(r.split('\n').length, 4, 'recent keeps four');
});

test('the sections gather the groups, switches first', () => {
  const rows: S.Row[] = [
    { group: 'Features', title: 'Weather', value: 'Open-Meteo, every 15 minutes', on: true, feature: 'weather', action: () => {} },
    { group: 'Features', title: 'Driving score', value: 'Harsh braking', on: true, feature: 'score', action: () => {} },
    { group: 'Dashboard', title: 'Units', value: 'km/h, °C', action: () => {} },
    { group: 'Driving', title: 'Road helpers', value: 'highway, fog', route: '/settings/road' },
    { group: 'Help', title: 'Version', value: 'OpenRath 1.42', action: () => {} },
    { group: 'Help', title: 'Diagnostics', value: "send a photo if something doesn't work", action: () => {} },
    { group: 'Dashboard', title: 'Nothing happens', value: 'no action, so not shown' },
  ];
  const all = S.arrange(rows);
  const home = all.get('Home screen') as S.Item[];
  assert.deepEqual(home.slice(0, 2), ['Turn on or off', rows[0]], 'the section’s switches come first');
  assert.ok(home.includes('Boxes and layout') && home.includes(rows[2]));
  assert.ok(!home.includes(rows[6]), 'a row with nothing to do is left out');
  const driving = all.get('Driving') as S.Item[];
  assert.deepEqual(driving.slice(0, 2), ['Turn on or off', rows[1]], 'the score’s switch sits in Driving');
  assert.ok(driving.includes(rows[3]), 'a row that opens a screen counts');
  assert.ok((all.get('Backup and about') as S.Item[]).includes(rows[4]));
  assert.ok((all.get('Troubleshooting') as S.Item[]).includes(rows[5]), 'fault-finding rows move to Troubleshooting');
  assert.equal(S.sectionOf(Features.get('ticker') as Features.Feature), 'Phone and messages');
  assert.equal(S.sectionOf(Features.get('resume') as Features.Feature), 'Radio and music');
  assert.equal(S.sectionOf(Features.get('backup') as Features.Feature), 'Backup and about');
  assert.equal(S.section('Nothing like this').name, S.SECTIONS[0].name, 'an unknown section is the first');
  // every section has a name and a line under it, as the Hindi table expects
  for (const sec of S.SECTIONS) assert.ok(sec.name !== '' && sec.about !== '' && sec.groups.length === sec.headings.length);

  // recently used finds the rows again by title, and skips one that is gone
  const used = S.recent('Units\nGone now\nVersion', all);
  assert.deepEqual(used, [rows[2], rows[4]]);
  // the search box looks at the title, the value and the section
  assert.ok(S.matches(rows[2], 'Home screen', 'km/h', (x) => x));
  assert.ok(S.matches(rows[3], 'Driving', 'DRIV', (x) => x));
  assert.ok(!S.matches(rows[3], 'Driving', 'tyres', (x) => x));
});

test('setup: when it shows, and the steps', () => {
  assert.ok(Setup.needed(true, false, false, false, false), 'on a fresh install');
  assert.ok(!Setup.needed(true, false, false, true, true), 'not after an update');
  assert.ok(Setup.needed(true, false, true, true, true), 'carries on where it was');
  assert.ok(!Setup.needed(true, true, true, false, false), 'not once done');
  assert.ok(!Setup.needed(false, false, false, false, false), 'switched off');
  assert.equal(Setup.next(Setup.ACCESS, false), Setup.CAR);
  assert.equal(Setup.next(Setup.LOOK, true), Setup.APPS, 'skips the level when it is set for you');
  assert.equal(Setup.back(Setup.APPS, true), Setup.LOOK, 'back over the level');
  assert.equal(Setup.next(Setup.FINISH, false), Setup.FINISH, 'last');
  assert.equal(Setup.back(Setup.WELCOME, false), Setup.WELCOME, 'first');
  assert.equal(Setup.STEPS.length, Setup.FINISH + 1);
  assert.equal(Setup.kind('android.permission.ACCESS_FINE_LOCATION'), 'location');
  assert.equal(Setup.kind('android.permission.READ_MEDIA_AUDIO'), 'files');
  assert.equal(Setup.kind('android.permission.BLUETOOTH_CONNECT'), 'bluetooth');
  assert.equal(Setup.kind('android.permission.READ_CALL_LOG'), 'phone');
  assert.equal(Setup.kind('android.permission.POST_NOTIFICATIONS'), 'notifications');
  assert.ok(Features.get('setup') != null, 'setup feature');
  assert.equal(Setup.APP_KEYS.length, 4);
});

test('the opening logo’s timing', () => {
  assert.ok(Intro.show(true, 'standard', true), 'on start');
  assert.ok(!Intro.show(true, 'standard', false), 'not on return');
  assert.ok(!Intro.show(true, 'off', true), 'off with no movement');
  assert.ok(!Intro.show(false, 'reduced', true), 'switched off');
  assert.equal(Intro.part(100, 200, 400), 0, 'before');
  assert.equal(Intro.part(700, 200, 400), 1, 'after');
  assert.equal(Intro.part(400, 200, 400), 0.875, 'halfway');
  assert.ok(Features.get('intro') != null, 'intro feature');
});

test('reports: counted only when on, most used first, forgotten when off', () => {
  const store = memoryPrefs();
  const p = memoryPrefs();
  Reports.install(store, p, 1000);
  assert.deepEqual(Reports.counts(store), {}, 'off: nothing is counted');
  Features.set(p, 'reports', true);
  Reports.count('app start', 1000);
  Reports.count('Backup', 1000);
  Reports.count('Weather', 1000);
  Reports.count('Weather', 1000);
  for (let i = 0; i < 3; i++) Reports.count('app start', 1000);
  assert.equal(Reports.format(Reports.counts(store)), 'app start: 4\nWeather: 2\nBackup: 1\n', 'most used first');
  assert.notEqual(store.str('id', ''), '', 'a random id when reports are turned on');
  assert.ok(Reports.text('1.42', 'OpenRath test unit').includes('app start: 4'));

  Reports.crash('java.lang.Error: test', 2000);
  assert.equal(Reports.crashes().length, 1);
  assert.ok(Reports.text('1.42', 'unit').includes('java.lang.Error: test'), 'the crash note goes in the report');
  Reports.clear();
  assert.deepEqual(Reports.counts(store), {}, 'off forgets the counts');
  assert.equal(Reports.crashes().length, 1, 'but keeps the crash notes, as the files are kept');
  Reports.clearCrashes();
  assert.equal(Reports.crashes().length, 0);

  assert.ok(Reports.sendable('https://fleet.example/r') && !Reports.sendable('http://fleet.example/r'), 'https only');
  assert.ok(!Reports.sendable('') && !Reports.sendable('https://') && !Reports.sendable(null), 'empty address');
});

test('reports: only the last five crash notes are kept', () => {
  const store = memoryPrefs();
  const p = memoryPrefs({ 'feat:reports': 'on' });
  Reports.install(store, p, 1000);
  for (let i = 1; i <= 7; i++) Reports.crash('crash ' + i, 1000 + i * 1000);
  const kept = Reports.crashes();
  assert.equal(kept.length, 5);
  assert.equal(kept[0].body, 'crash 7', 'newest first');
});
