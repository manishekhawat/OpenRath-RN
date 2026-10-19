/// <reference types="node" />
/**
 * The driving parts added in 1.36–1.40: replayed fixes, the smooth speed number, the speed filter
 * and correction, the drive summary when stopped, saved places, badges for good driving and
 * recovering after deep sleep (the matching checks from Tests.java).
 * Run with `node --test src/logic/__tests__/driving.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as achievements from '../achievements.ts';
import * as features from '../features.ts';
import * as places from '../places.ts';
import { memoryPrefs } from '../prefs.ts';
import * as speed from '../speed.ts';
import * as trip from '../trip.ts';
import * as wake from '../wake.ts';

const near = (want: number, got: number, tol: number) => assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}`);

test('fixes: replayed and impossible ones are skipped', () => {
  assert.equal(speed.usable(28.6, 77.2, 2000, 1000), true);
  assert.equal(speed.usable(28.6, 77.2, 900, 1000), false, 'replayed');
  assert.equal(speed.usable(28.6, 77.2, 5, 0), true, 'the first fix');
  assert.equal(speed.usable(0, 0, 2000, 1000), false, 'null island');
  assert.equal(speed.usable(95, 77.2, 2000, 1000), false, 'out of range');
  assert.equal(speed.usable(NaN, 77.2, 2000, 1000), false);
});

test('speed: the smooth number and the speed filter', () => {
  assert.equal(speed.smooth(30, 1.5, 1000), 0, 'standing still');
  assert.equal(speed.smooth(0, 40, 1000), 40, 'the first reading');
  const sm = speed.smooth(40, 60, 350);
  assert.ok(sm > 40 && sm < 60, 'eases towards the reading');
  assert.equal(speed.smooth(40, 60, 9000), 60, 'after a gap');
  // the owner's filter: 0 below 5 km/h
  assert.equal(speed.smooth(0, 4, 1000, 5), 0);
  assert.equal(speed.smooth(0, 6, 1000, 5), 6);
  const p = memoryPrefs();
  assert.equal(speed.filter(p), 2);
  assert.equal(speed.filterText(speed.filter(p)), '0 below 2 km/h');
  p.put('speedFilter', '0');
  assert.equal(speed.filterText(speed.filter(p)), 'off');
  assert.equal(speed.filterChoice(8), '8 km/h');
});

test('speed: the correction that matches the car speedometer', () => {
  assert.equal(speed.corrected(100, 0), 100);
  assert.equal(speed.corrected(100, 5), 105);
  near(97, speed.corrected(100, -3), 0.001);
  assert.equal(speed.corrected(100, 40), 110, 'capped at +10 %');
  const p = memoryPrefs();
  assert.equal(speed.fix(p), 0);
  assert.equal(speed.fixText(0), 'off');
  p.put('speedFix', '3');
  assert.equal(speed.fix(p), 3);
  assert.equal(speed.fixText(3), 'GPS speed +3%');
  assert.equal(speed.fixChoice(-2), '-2%');
  // the trip computer adds it to the GPS speed
  const s = trip.feed(trip.initial(0), { lat: 28.6, lon: 77.2, speed: 10, heading: 90, accuracy: 5, t: 1000 }, {
    over: false,
    scoring: true,
    parking: false,
    speedFix: 10,
  });
  near(39.6, s.state.kmh, 0.1);
});

test('drive summary when stopped', () => {
  assert.equal(trip.stopText(12, 1800, 68, false), '12.0 km · 30 min · avg 24 · top 68 km/h');
  assert.equal(trip.stopText(12, 3900, 100, true), '12.0 km · 1 h 05 min · avg 7 · top 62 mph');
  const s = { ...trip.initial(0), driveKm: 10, driveSec: 1200, driveTop: 80 };
  assert.deepEqual(trip.stopped(s), { km: 10, sec: 1200, avgKmh: 30, topKmh: 80 });
  assert.equal(trip.STOP_SUMMARY_MS, 5000);
  // the top speed only counts movement the trip computer believes
  let st = trip.initial(0);
  st = trip.feed(st, { lat: 28.6, lon: 77.2, speed: 20, heading: 0, accuracy: 5, t: 1000 }, { over: false, scoring: false, parking: false }).state;
  st = trip.feed(st, { lat: 28.6002, lon: 77.2, speed: 25, heading: 0, accuracy: 5, t: 2000 }, { over: false, scoring: false, parking: false }).state;
  near(90, st.driveTop, 0.5);
});

test('places: saved places for any navigation app', () => {
  assert.ok(places.point('28.61,77.20'));
  assert.equal(places.point('abc'), null);
  assert.equal(places.point('0,0'), null);
  assert.equal(places.point(''), null);
  let pl = places.add('', 'Gym', 28.5, 77.1);
  pl = places.add(pl, 'Temple', 28.6, 77.2);
  pl = places.add(pl, 'gym', 28.7, 77.3);
  assert.equal(places.own(pl).length, 2, 'newest first, no repeats');
  assert.equal(places.own(pl)[0][0], 'gym');
  assert.equal(places.own(places.drop(pl, 'Temple')).length, 1);
  assert.ok(!places.add('', 'a;b|c', 1, 1).includes(';'), 'the name is cleaned');
  let many = '';
  for (let i = 0; i < 20; i++) many = places.add(many, 'P' + i, 10, 10);
  assert.equal(places.own(many).length, places.MAX);
  assert.equal(places.geo(28.6, 77.2, 'Parked car'), 'geo:28.600000,77.200000?q=28.600000,77.200000(Parked%20car)');
  assert.equal(places.geo(28.6, 77.2, ''), 'geo:28.600000,77.200000?q=28.600000,77.200000');
  assert.equal(places.search(' India Gate '), 'geo:0,0?q=India%20Gate');
});

test('badges for good driving', () => {
  const days: number[][] = [];
  for (let i = 0; i < 7; i++) days.push([40, 3600, 0, 0, 0, 95]);
  let got = achievements.earned(days);
  assert.ok(got.includes('smooth3') && got.includes('smooth7') && got.includes('limit7'), 'a smooth week');
  assert.ok(!got.includes('km1000'), 'no 1,000 km yet');
  days.splice(3, 0, [1, 60, 0, 0, 0, 40]);
  assert.ok(achievements.earned(days).includes('smooth7'), "a short day doesn't break a streak");
  days.splice(3, 0, [30, 1800, 5, 2, 120, 60]);
  assert.ok(!achievements.earned(days).includes('smooth7'), 'a bad day breaks it');
  assert.deepEqual(achievements.fresh('smooth3', ['smooth3', 'smooth7']), ['smooth7']);
  assert.equal(achievements.name('limit7'), 'A week within the limit');
  assert.deepEqual(achievements.days({ '2026-10-02': [40, 3600, 0, 0, 0, 95], '2026-10-01': [1], bad: 'x' }), [[40, 3600, 0, 0, 0, 95]]);

  // the dashboard's check: each badge once, at most once an hour
  const p = memoryPrefs();
  const hist = { '2026-10-01': [20, 1200, 0, 0, 0, 100] };
  got = achievements.check(p, hist, 10 * 3600000);
  assert.deepEqual(got, ['perfect']);
  assert.equal(p.str('badges', ''), 'perfect');
  assert.deepEqual(achievements.check(p, hist, 10 * 3600000 + 60000), [], 'too soon');
  assert.deepEqual(achievements.check(p, hist, 12 * 3600000), [], 'nothing new');
  assert.equal(achievements.newText('perfect'), 'New badge: Perfect day');
  assert.equal(achievements.countText(2), '2 of 8 earned');
  features.set(p, 'achievements', false);
  assert.deepEqual(achievements.check(p, hist, 20 * 3600000), []);
});

test('recover after deep sleep', () => {
  // the boot clock moves on, the awake clock doesn't
  assert.equal(wake.slept(1000, 1000, 1000 + 315000, 1000 + 15000), 300000);
  assert.equal(wake.slept(1000, 1000, 16000, 16000), 0, 'awake');
  assert.equal(wake.slept(0, 0, 50000, 1000), 0, 'the first reading');
  const w = new wake.Watch();
  assert.equal(w.feed(1000, 1000), false, 'the first reading never counts');
  assert.equal(w.feed(16000, 16000), false, 'awake');
  assert.equal(w.feed(16000 + 300000, 16000 + 15000), true, 'slept for five minutes');
  assert.equal(w.feed(16000 + 315000, 16000 + 30000), false);
  let woke = 0;
  const off = wake.onWoke(() => woke++);
  wake.woke();
  off();
  wake.woke();
  assert.equal(woke, 1);
});

test('the switches these need', () => {
  for (const id of ['smoothSpeed', 'places', 'achievements', 'stopSummary', 'wake']) {
    const feat = features.get(id);
    assert.ok(feat, id);
    assert.ok(feat.ported, id + ' is ported');
  }
});
