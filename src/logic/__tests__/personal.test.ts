/// <reference types="node" />
/**
 * The checks from Tests.java for picture layouts and driver profiles, and checks of the ports of
 * Layouts, Profiles, Backup and the theme packs. Run with
 * `node --test src/logic/__tests__/personal.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { strToU8, zipSync } from 'fflate';

import * as backup from '../backup.ts';
import * as car from '../car.ts';
import * as features from '../features.ts';
import * as fuel from '../fuel.ts';
import * as layouts from '../layouts.ts';
import { memoryPrefs } from '../prefs.ts';
import * as profiles from '../profiles.ts';
import * as theme from '../theme.ts';

const LAYOUTS = layouts.parseAll(JSON.parse(readFileSync(new URL('../../data/layouts.json', import.meta.url), 'utf8')));

test('profiles: personal settings only (Tests.java)', () => {
  assert.ok(profiles.personal('theme'), 'theme is personal');
  assert.ok(profiles.personal('p1slot3') && profiles.personal('slot0'), 'boxes are personal');
  assert.ok(!profiles.personal('fuel'), 'fuel log is shared');
  assert.ok(!profiles.personal('valetPin'), 'valet PIN is shared');
  assert.ok(!profiles.personal('xslot1') && !profiles.personal('slot12'), 'the slot pattern matches whole keys');
});

test('layouts (Tests.java)', () => {
  assert.equal(layouts.compass(0), 'N');
  assert.equal(layouts.compass(135), 'SE');
  assert.equal(layouts.compass(355), 'N', 'wraps to north');
  assert.equal(layouts.compass(-90), 'W', 'negative is west');
  assert.equal(layouts.color('#3A8DFF'), '#3A8DFF');
  assert.equal(layouts.color('blue'), '#FFFFFF', 'bad colour is white');
  assert.equal(layouts.statName('pressure'), 'Air pressure');
  assert.ok(profiles.personal('layout') && profiles.personal('lay:scenery:off'), 'layout is per driver');
  assert.equal(layouts.dockKey('radio'), 'media:radio');
  assert.equal(layouts.label('bt'), 'Bluetooth');
});

test('layouts: the definitions read', () => {
  assert.equal(LAYOUTS.length, 13, 'ten, plus the three looks new in 1.42');
  const b = layouts.get(LAYOUTS, 'bubbles');
  assert.ok(b);
  assert.equal(b.parts[0].kind, 'clock');
  assert.equal(b.parts[0].fill2, b.parts[0].fill, 'fill2 defaults to fill');
  assert.equal(b.parts[0].alpha, 0.9);
  assert.equal(b.parts[4].sub, b.parts[4].ink, 'sub defaults to ink');
  assert.equal(b.parts[4].r, 12, 'corner radius defaults to 12');
  assert.equal(b.roadHorizon, -1, 'no road');
  const s = layouts.get(LAYOUTS, 'scenery');
  assert.equal(s?.roadHorizon, 364);
  assert.equal(layouts.parseAll({ nope: 1 }).length, 0, 'a broken file gives none');
});

test('layouts: the three looks new in 1.42', () => {
  const m = layouts.get(LAYOUTS, 'mission');
  assert.ok(m && !m.light, 'Mission control is dark');
  assert.equal(m.lines.length, 2, 'the two rules across the screen');
  const dial = layouts.part(m, 'speed');
  assert.equal(dial?.style, 'dial');
  assert.equal(dial?.shape, 'circle');
  assert.deepEqual(layouts.part(m, 'stats')?.items, ['temp', 'altitude', 'direction'], 'the telemetry list');
  const e = layouts.get(LAYOUTS, 'electric');
  assert.ok(e?.light, 'Electric is light');
  assert.equal(layouts.part(e!, 'car')?.src, 'car_rear_white', 'the car on its own panel');
  assert.equal(layouts.part(e!, 'weather')?.style, 'card');
  const r = layouts.get(LAYOUTS, 'roadster');
  assert.equal(layouts.part(r!, 'car')?.src, 'car_rear_red');
  assert.equal(layouts.part(r!, 'speed')?.accent, '#E82127', 'racing red');
  assert.equal(r?.roadHorizon, 300, 'a moving road');
});

test('layouts: choosing one', () => {
  const p = memoryPrefs();
  assert.equal(layouts.current(p), layouts.BOXES);
  assert.equal(layouts.chosen(p, LAYOUTS), null);
  layouts.choose(p, 'cards');
  assert.equal(p.str('layout', ''), 'cards');
  assert.equal(layouts.chosen(p, LAYOUTS)?.name, layouts.get(LAYOUTS, 'cards')?.name);
  p.put('layout', 'gone');
  assert.equal(layouts.chosen(p, LAYOUTS), null, 'an unknown layout shows the boxes');
});

test('layouts: parts can be hidden', () => {
  const p = memoryPrefs();
  assert.ok(layouts.shown(p, 'room', 'speed'));
  assert.ok(layouts.shown(p, 'room', ''), 'parts without a switch always show');
  layouts.setShown(p, 'room', 'speed', false);
  layouts.setShown(p, 'room', 'time', false);
  assert.equal(p.str('lay:room:off', ''), 'speed,time,');
  assert.ok(!layouts.shown(p, 'room', 'speed'));
  layouts.setShown(p, 'room', 'speed', true);
  assert.ok(layouts.shown(p, 'room', 'speed'));
  assert.equal(p.str('lay:room:off', ''), 'time,');
  const opts = layouts.opts(layouts.get(LAYOUTS, 'bubbles')!);
  assert.deepEqual(opts, ['time', 'trip', 'weather', 'speed', 'media']);
});

test('layouts: stats items, extra ones and order', () => {
  const p = memoryPrefs();
  const part = { ...layouts.part(layouts.get(LAYOUTS, LAYOUTS.find((l) => layouts.part(l, 'stats'))!.id)!, 'stats')! };
  part.items = ['temp', 'altitude'];
  assert.deepEqual(layouts.statItems(p, 'x', part), ['temp', 'altitude']);
  layouts.setStat(p, 'x', part, 'pressure', true);
  layouts.setStat(p, 'x', part, 'temp', false);
  assert.deepEqual(layouts.statItems(p, 'x', part), ['altitude', 'pressure']);
  layouts.toTop(p, 'x', part, 'pressure');
  assert.deepEqual(layouts.statItems(p, 'x', part), ['pressure', 'altitude']);
  assert.equal(layouts.statOrder(p, 'x', part).length, layouts.STAT_ITEMS.length);
});

test('layouts: dock, favourites, places and the driver', () => {
  const p = memoryPrefs();
  const dock = { ...layouts.part(layouts.get(LAYOUTS, 'cards')!, 'dock')! };
  dock.items = ['navi', 'music', 'apps', 'settings'];
  assert.deepEqual(layouts.dockItems(p, dock), ['navi', 'music', 'apps', 'settings']);
  p.put('layMirror', 'on');
  assert.deepEqual(layouts.dockItems(p, dock), ['navi', 'music', 'mirror', 'apps', 'settings'], 'mirroring goes before apps');
  assert.equal(layouts.dockApp(p, 'navi'), 'com.google.android.apps.maps');
  assert.equal(layouts.dockApp(p, 'music'), '');
  p.put('app:media:music', 'com.spotify.music');
  assert.equal(layouts.dockApp(p, 'music'), 'com.spotify.music');
  assert.equal(layouts.favourite(p, 2), null);
  layouts.setFavourite(p, 2, 'com.whatsapp');
  assert.equal(p.str('layApps', ''), ',,com.whatsapp,,,');
  assert.equal(layouts.favourite(p, 2), 'com.whatsapp');
  assert.equal(layouts.place(p, 'Home'), null);
  p.put('place:Home', '28.61,77.2');
  assert.deepEqual(layouts.place(p, 'Home'), [28.61, 77.2]);
  assert.equal(layouts.driver(p), '');
  p.put('profile', 'Asha');
  assert.equal(layouts.driver(p), 'Asha', 'the profile name');
  p.put('welcome', ' Riya ');
  assert.equal(layouts.driver(p), 'Riya', "the home screen's name, shared since 1.35");
  p.put('layUser', ' Tech ');
  assert.equal(layouts.driver(p), 'Tech', 'the layouts\' own name, from before there was one');
  assert.ok(layouts.roadOn(p) && !layouts.animOn(p));
  p.put('feat:road', 'off');
  assert.ok(!layouts.roadOn(p), "the dashboard's moving road switch, since 1.35");
  assert.equal(layouts.wall(p), 'layout');
});

test('profiles: switching keeps each driver their own settings', () => {
  const p = memoryPrefs({ fuel: '[1]', themePack: '@light', 'lay:room:off': 'speed,', warnSpeed: '90' });
  assert.equal(profiles.add(p, 'Asha'), 'added');
  assert.equal(profiles.current(p), 'Asha');
  assert.deepEqual(profiles.names(p), ['Asha']);
  assert.equal(profiles.add(p, 'Asha'), '', 'a name is used once');
  assert.equal(profiles.add(p, '  '), '');
  assert.equal(profiles.add(p, 'Ravi'), 'switched', 'a new driver starts from the current settings');
  assert.equal(p.str('themePack', ''), '@light');
  p.put('themePack', '@genz');
  p.remove!('lay:room:off');
  p.put('fuel', '[1,2]');
  profiles.switchTo(p, 'Asha');
  assert.equal(p.str('themePack', ''), '@light');
  assert.equal(p.str('lay:room:off', ''), 'speed,');
  assert.equal(p.str('fuel', ''), '[1,2]', 'the fuel log is shared');
  assert.equal(profiles.next(p), 'Ravi');
  assert.equal(p.str('themePack', ''), '@genz');
  assert.equal(p.str('lay:room:off', '-'), '-', "Ravi's hidden parts are his");
  assert.ok(!profiles.remove(p, 'Ravi'), 'not the driver now');
  assert.ok(profiles.remove(p, 'Asha'));
  assert.deepEqual(profiles.names(p), ['Ravi']);
  assert.equal(profiles.next(p), null);
});

test('profiles: snapshots from the Android version load as text', () => {
  const p = memoryPrefs({ profile: 'A', profiles: JSON.stringify({ A: {}, B: { swapped: true, warnSpeed: 80, '~vol': 9 } }) });
  profiles.switchTo(p, 'B');
  assert.equal(p.str('swapped', ''), 'true');
  assert.equal(p.str('warnSpeed', ''), '80');
  assert.equal(p.str('~vol', '-'), '-', 'the volume is not a setting');
  assert.equal(profiles.all(p).B['~vol'], 9, 'but stays in the profile');
});

test('backup: the Android format, both ways', () => {
  const p = memoryPrefs({ carModel: 'Dzire', warnSpeed: '80', swapped: 'true', fuelLog: '[]' });
  const b = backup.build(p, 1000, { trip: { day: '2026-10-15', todayKm: 12.5, odoKm: 4000, park: null, lat: 0, lon: 0 }, history: { '2026-10-14': [10, 600, 0, 0, 0, 98] } });
  assert.equal(b.app, 'OpenRath');
  assert.equal(b.format, 1);
  assert.deepEqual(b.prefs.home['x:carModel'], ['s', 'Dzire'], 'Android keeps its generic settings under x:');
  assert.deepEqual(b.prefs.home.warnSpeed, ['i', 80], 'a named setting has no prefix, and Android keeps it as a number');
  assert.deepEqual(b.prefs.home.swapped, ['b', true]);
  assert.deepEqual(b.prefs.home.fuel, ['s', '[]'], 'the fill-up log is "fuel" in a backup, as Android names it');
  assert.deepEqual(b.prefs.drive.dayKm, ['f', 12.5]);
  assert.ok(!('player' in b.prefs), "the Android player's settings are left alone");
  const bytes = backup.zip(b, { 'car.png': new Uint8Array([1, 2]), '../evil.png': new Uint8Array([3]) });
  const o = backup.unzip(bytes);
  assert.deepEqual(o.json, b);
  assert.deepEqual(Object.keys(o.pictures), ['car.png']);

  const q = memoryPrefs({ stale: 'x' });
  const r = backup.restore(q, o.json);
  assert.equal(r.settings, 4);
  assert.equal(q.str('stale', '-'), '-', 'a restore replaces every setting');
  assert.equal(q.str('warnSpeed', ''), '80');
  assert.equal(r.drive?.trip.todayKm, 12.5);
  assert.deepEqual(r.drive?.history['2026-10-14'], [10, 600, 0, 0, 0, 98]);
});

test('backup: one made by the Android app', () => {
  const json = {
    app: 'Dzire Home',
    format: 1,
    made: 5,
    prefs: {
      home: { alerts: ['b', false], 'x:dimLevel': ['f', 0.5], 'x:saverMin': ['l', 5], 'x:fav': ['ss', ['a', 'b']], 'x:feat:eq': ['s', 'on'], 'x:odd': ['x', 1] },
      player: { song: ['i', 3] },
      drive: { odo: ['f', 1234.5], parkLat: ['f', 28.6], parkLon: ['f', 77.2], parkAt: ['l', 99], hist: ['s', '{"2026-01-01":[1,2,3,4,5,6]}'] },
    },
  };
  const bytes = zipSync({ 'backup.json': strToU8(JSON.stringify(json)), 'custom/car_on.png': new Uint8Array([1]), 'custom/x.jpg': new Uint8Array([1]) });
  const o = backup.unzip(bytes);
  assert.deepEqual(Object.keys(o.pictures), ['car_on.png'], 'pictures only');
  const p = memoryPrefs();
  const r = backup.restore(p, o.json);
  assert.equal(p.str('alerts', ''), 'false');
  assert.equal(p.str('dimLevel', ''), '0.5');
  assert.equal(p.str('saverMin', ''), '5');
  assert.equal(p.str('fav', ''), '["a","b"]');
  assert.equal(p.str('odd', '-'), '-', 'unknown types are skipped');
  assert.equal(p.str('carModel', ''), 'Dzire', 'a Dzire Home backup is a Dzire');
  assert.equal(p.str('tankL', ''), '37');
  assert.equal(r.drive?.trip.odoKm, 1234.5);
  assert.deepEqual(r.drive?.trip.park, { lat: 28.6, lon: 77.2, at: 99 });
  // and back: the types come back as Android had them
  const again = backup.build(p, 6);
  assert.deepEqual(again.prefs.home.alerts, ['b', false]);
  assert.deepEqual(again.prefs.home['x:dimLevel'], ['f', 0.5]);
  assert.deepEqual(again.prefs.home['x:saverMin'], ['l', 5]);
  assert.deepEqual(again.prefs.home['x:fav'], ['ss', ['a', 'b']]);
  assert.ok(!(backup.TYPES_KEY in again.prefs.home));
  assert.throws(() => backup.unzip(zipSync({ 'other.txt': strToU8('hi') })), /not an OpenRath backup/);
  assert.throws(() => backup.unzip(strToU8('not a zip')), /not an OpenRath backup/);
});

test('backup: switches merged or removed in 1.35', () => {
  // a backup from an older version: the old names are restored as they are, each old switch is
  // read through the one it became part of, and the names of removed features are ignored
  const json = {
    app: 'OpenRath',
    format: 1,
    made: 5,
    prefs: { home: { 'feat:tolls': ['s', 'off'], 'feat:wash': ['s', 'on'], 'feat:parkPhoto': ['s', 'x'] } },
  };
  const p = memoryPrefs();
  backup.restore(p, json as unknown as backup.BackupJson);
  assert.equal(p.str('feat:wash', ''), 'on', "a removed feature's setting is kept but unused");
  assert.equal(features.get('wash'), undefined, 'and the feature is gone');
  assert.ok(!features.on(p, 'tollAhead'), 'an old name follows the switch it became part of');
  assert.ok(features.on(p, 'parkPhoto') === features.on(p, 'parking'), 'and so does the parking photo');
});

test('backup: names, pruning and the daily copy', () => {
  assert.equal(backup.fileName('auto', new Date(2026, 9, 5, 7, 3)), 'openrath-auto-2026-10-05-0703.zip');
  assert.ok(backup.isBackupName('dzire-home-manual-2024-01-01-0000.zip'));
  assert.ok(!backup.isBackupName('openrath-auto.txt'));
  const names = Array.from({ length: 9 }, (_, i) => `openrath-auto-2026-10-0${i + 1}-0000.zip`).concat(['openrath-manual-2026-01-01-0000.zip']);
  assert.deepEqual(backup.prune(names, 'auto'), ['openrath-auto-2026-10-01-0000.zip', 'openrath-auto-2026-10-02-0000.zip']);
  const p = memoryPrefs();
  const d = new Date(2026, 9, 15, 9);
  assert.ok(backup.dueToday(p, d));
  backup.markDone(p, d);
  assert.ok(!backup.dueToday(p, d));
  assert.equal(p.str('backupDay', ''), '2026-10-15');
});

test('backup: a restore writes only what the settings screens would have accepted', () => {
  // the settings that are acted on without being typed again, as the owner's own screens save them
  const mine: Record<string, string> = {
    upiId: 'tech.b-1@okaxis',
    cabSos1: 'Papa|+919876543210',
    cabSos2: '9123456789|9123456789',
    fav1: 'Mummy|+91 98765 43210',
    'app:dock:navi': 'com.google.android.apps.maps',
    carModel: 'Dzire',
  };
  // 1.43: a backup never carries the valet PIN or the hotspot password, and never writes them back
  const secret: Record<string, string> = { valetPin: '4321', apPass: 'hotspot123' };
  // a genuine backup comes back exactly as it went in
  const b = backup.build(memoryPrefs({ ...mine, ...secret }), 1000);
  for (const k of Object.keys(secret)) assert.ok(!(k in b.prefs.home), k + ' is not in the backup');
  const q = memoryPrefs();
  backup.restore(q, backup.unzip(backup.zip(b)).json);
  for (const [k, v] of Object.entries(mine)) assert.equal(q.str(k, ''), v, k + ' is restored as it was');
  for (const k of Object.keys(secret)) assert.equal(q.str(k, ''), '', k + ' stays on the unit it was set on');
  assert.deepEqual(backup.build(q, 1000).prefs.home, b.prefs.home, 'and a backup of the restore is the same backup');

  // a .zip handed to a driver: each doctored value is left out and the one here now is kept
  const doctored = JSON.parse(JSON.stringify(b)) as backup.BackupJson;
  doctored.prefs.home['x:upiId'] = ['s', 'thief@evil bank'];
  doctored.prefs.home['x:cabSos2'] = ['s', 'Police|+1-900-PREMIUM'];
  doctored.prefs.home['x:fav1'] = ['s', 'Mummy|#31#9000000000'];
  doctored.prefs.home['app:dock:navi'] = ['s', 'com.Evil.app/../Boom'];
  doctored.prefs.home['x:valetPin'] = ['s', 'letmein'];
  doctored.prefs.home['x:apPass'] = ['s', 'letmein too'];
  doctored.prefs.home['x:carModel'] = ['s', 'Alto'];
  const r = memoryPrefs({ ...mine, ...secret });
  const n = backup.restore(r, doctored);
  for (const k of ['upiId', 'cabSos2', 'fav1', 'app:dock:navi', 'valetPin', 'apPass']) {
    assert.equal(r.str(k, ''), { ...mine, ...secret }[k], k + ' is not what the file says');
  }
  assert.equal(r.str('carModel', ''), 'Alto', 'everything else still restores');
  assert.equal(n.settings, Object.keys(mine).length - 4, 'and the dropped ones are not counted');
  assert.ok(!backup.okValue('cabSos1', 'Papa|'), 'a contact with no number is no contact');
  assert.ok(backup.okValue('app:offlineNav', ''), 'nothing chosen is still nothing chosen');
});

test('the fill-up log and the car\'s fuel type keep out of each other\'s way', () => {
  const p = memoryPrefs({ fuel: 'diesel' });
  fuel.setLog(p, [{ t: 1, l: 30, rs: 3000, odo: 1000 }]);
  assert.equal(car.fuel(p), 'diesel', 'a fill-up no longer writes over the fuel type');
  assert.equal(fuel.log(p).length, 1);

  // an install made before the two were named apart: the log sits under the fuel type's name
  const old = memoryPrefs({ fuel: JSON.stringify([{ t: 1, l: 30, rs: 3000, odo: 1000 }]) });
  fuel.moveOldLog(old);
  assert.equal(fuel.log(old).length, 1, 'the log is moved across');
  assert.equal(car.fuel(old), 'petrol', 'and the fuel type falls back to its default');

  // one that never wrote a log is left alone
  const fine = memoryPrefs({ fuel: 'cng' });
  fuel.moveOldLog(fine);
  assert.equal(car.fuel(fine), 'cng');
  assert.equal(fuel.log(fine).length, 0);
});

test('backup: the keys Android uses for the same settings', () => {
  assert.equal(backup.androidKey('carModel'), 'x:carModel', 'generic settings carry the prefix');
  assert.equal(backup.androidKey('welcome'), 'welcome', 'a named one does not');
  assert.equal(backup.androidKey('app:dock:navi'), 'app:dock:navi');
  assert.equal(backup.androidKey('slot3'), 'slot3');
  assert.equal(backup.androidKey('p2slot1'), 'p2slot1');
  assert.equal(backup.androidKey('fuelLog'), 'fuel', "the fill-up log is Android's \"fuel\"");
  assert.equal(backup.androidKey('fuel'), 'x:fuel', "and the car's fuel type is its \"x:fuel\"");

  assert.equal(backup.ourKey('x:carModel'), 'carModel');
  assert.equal(backup.ourKey('welcome'), 'welcome');
  assert.equal(backup.ourKey('fuel', '[{"l":30}]'), 'fuelLog', 'an array under "fuel" is a log');
  assert.equal(backup.ourKey('fuel', 'diesel'), 'fuel', 'anything else is the fuel type');
  assert.equal(backup.ourKey('tankL'), 'tankL', 'a backup this port made before 1.43 has no prefixes');

  // the round trip a driver actually does: back up here, restore here
  const mine = memoryPrefs({ carModel: 'Dzire', welcome: 'Driver', fuel: 'diesel', fuelLog: '[{"l":30}]', 'app:dock:navi': 'com.example' });
  const back = memoryPrefs();
  backup.restore(back, backup.unzip(backup.zip(backup.build(mine, 1000))).json);
  const { [backup.TYPES_KEY]: _types, ...restored } = back.all?.() ?? {};
  assert.deepEqual(restored, mine.all?.());
});

test('theme packs: choosing and importing', () => {
  const p = memoryPrefs();
  assert.equal(theme.chosen(p), theme.DEFAULT);
  p.put('theme', '@light');
  assert.equal(theme.chosen(p), '@light', 'kept by the first React Native builds');
  p.put('themePack', 'Built-in Dzire chrome');
  assert.equal(theme.chosen(p), theme.DEFAULT, 'the 1.10 name');
  theme.choose(p, 'oxford-blue');
  assert.equal(theme.chosen(p), 'oxford-blue');
  assert.equal(theme.folderName('Oxford Blue (1).ZIP'), 'Oxford Blue _1_');
  assert.equal(theme.folderName('../x.json'), '_x');
  const json = strToU8(readFileSync(new URL('../../data/theme-light.json', import.meta.url), 'utf8'));
  const nested = theme.zipFiles(zipSync({ 'my-theme/theme.json': json, 'my-theme/logo.png': new Uint8Array([1]), 'my-theme/sub/x.png': new Uint8Array([1]) }), 'my-theme.zip');
  assert.deepEqual(Object.keys(nested).sort(), ['logo.png', 'theme.json'], 'one level down, flat');
  assert.throws(() => theme.zipFiles(zipSync({ 'a.png': new Uint8Array([1]) }), 'a.zip'), /no theme.json in a.zip/);
  assert.throws(() => theme.parseJson('[1]'));
  const pack = theme.packOf('oxford-blue', theme.parseJson('{"name":"Oxford Blue","author":"OpenRath"}'), 'oxford-blue');
  assert.equal(theme.about(pack), 'by OpenRath  ·  themes/oxford-blue');
  assert.equal(theme.packOf('@x', {}, null).name, 'x');
});
