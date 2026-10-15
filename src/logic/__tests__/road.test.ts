/// <reference types="node" />
/**
 * The road helpers: highway, hill, fog, monsoon, the road ahead, learnt spots, the 0–100 timer and
 * the break reminder (the matching checks from Tests.java, and a few more).
 * Run with `node --test src/logic/__tests__/road.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as accel from '../accel.ts';
import * as ahead from '../ahead.ts';
import * as errands from '../errands.ts';
import * as fog from '../fog.ts';
import * as highway from '../highway.ts';
import * as hill from '../hill.ts';
import * as monsoon from '../monsoon.ts';
import { memoryPrefs } from '../prefs.ts';
import * as rest from '../rest.ts';
import * as sky from '../sky.ts';
import * as spots from '../spots.ts';

const near = (want: number, got: number, tol: number) => assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}`);
const day = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);

test('highway: on after two minutes fast, off after two minutes slow', () => {
  const hw = new highway.Highway();
  assert.equal(hw.feed(90, 0), 0);
  assert.equal(hw.feed(90, 121000), 1);
  assert.equal(hw.on, true);
  assert.equal(hw.feed(60, 200000), 0);
  hw.feed(30, 300000);
  assert.equal(hw.feed(30, 421000), -1);
  assert.equal(hw.on, false);
  assert.equal(highway.endText(2), 'Highway mode off. 2 messages came in while you were on the highway.');
  assert.equal(highway.endText(1), 'Highway mode off. 1 message came in while you were on the highway.');
  assert.equal(highway.endText(0), 'Highway mode off.');
  assert.equal(highway.stripText(82.4, 65, 2), 'HIGHWAY  ·  avg 82 km/h  ·  driving 1 h 5 min  ·  2 waiting');
});

test('highway: a dip under 75 starts the two minutes again', () => {
  const hw = new highway.Highway();
  hw.feed(90, 0);
  hw.feed(70, 60000);
  assert.equal(hw.feed(90, 121000), 0);
  assert.equal(hw.feed(90, 241000), 1);
});

test('hill: a 10 % climb speaks once, flat road stays quiet, descent tips', () => {
  const h = new hill.Hill();
  let said: string | null = null;
  let times = 0;
  for (let m = 0; m <= 1000; m += 20) {
    const t = h.feed(m, 500 + m * 0.1);
    if (t) {
      said = t;
      times++;
    }
  }
  assert.equal(times, 1);
  assert.ok(said?.startsWith('Steep climb'));
  near(0.1, h.grade(), 0.01);

  const flat = new hill.Hill();
  let any: string | null = null;
  for (let m = 0; m <= 2000; m += 20) any = flat.feed(m, 200 + (m % 40 === 0 ? 4 : -4)) ?? any;
  assert.equal(any, null);

  const down = new hill.Hill();
  let d: string | null = null;
  for (let m = 0; m <= 1000; m += 20) d = down.feed(m, 900 - m * 0.08) ?? d;
  assert.ok(d && d.includes('lower gear') && d.includes('right of way'));
});

test('hill: not enough road yet, and a restarted count', () => {
  const h = new hill.Hill();
  assert.equal(h.feed(0, 100), null);
  assert.ok(Number.isNaN(h.grade()));
  h.feed(300, 130);
  assert.ok(Number.isNaN(h.grade()));
  h.feed(10, 100); // the metres went backwards: a new count
  assert.ok(Number.isNaN(h.grade()));
});

test('fog: bend text, guide speed and switch', () => {
  assert.equal(fog.bendText(152, -1), 'Bend to the left in 150 m');
  assert.equal(fog.bendText(-1, 0), '');
  assert.equal(fog.bendText(20, 1), 'Bend to the right now');
  const p = memoryPrefs();
  assert.equal(fog.guide(p), 40);
  assert.equal(fog.now(p, false), false);
  assert.equal(fog.now(p, true), true);
  p.put('fogNow', 'on');
  assert.equal(fog.now(p, false), true);
  p.put('feat:fog', 'off');
  assert.equal(fog.now(p, true), false);
  assert.equal(fog.guideText(45, 40), 'Fog: slow down to 40');
  assert.equal(fog.guideText(38, 40), 'Fog: keep below 40 km/h');
});

test('monsoon: only in rain, once per spot', () => {
  const list = [{ lat: 28.603, lon: 77.2, at: 0 }];
  const told = new Set<string>();
  assert.equal(monsoon.warning(list, told, false, 28.6, 77.2, 0, 40), null);
  const w = monsoon.warning(list, told, true, 28.6, 77.2, 0, 40);
  assert.ok(w?.includes('350 metres'), String(w));
  assert.equal(monsoon.warning(list, told, true, 28.6, 77.2, 0, 40), null);
  assert.equal(monsoon.warning(list, new Set(), true, 28.6, 77.2, 0, 5), null); // too slow
});

test('monsoon: marking spots, one per 100 m, saved as in the Android version', () => {
  const p = memoryPrefs();
  assert.equal(monsoon.mark(p, 0, 0, 1), 'No GPS position yet');
  assert.equal(monsoon.mark(p, 28.6, 77.2, 1), 'Marked as a waterlogging spot');
  assert.equal(monsoon.mark(p, 28.6003, 77.2, 2), 'This spot is already marked');
  assert.equal(monsoon.mark(p, 28.61, 77.2, 3), 'Marked as a waterlogging spot');
  assert.equal(p.str('floodSpots', ''), '[["28.6","77.2",1],["28.61","77.2",3]]');
  assert.equal(monsoon.spots(p).length, 2);
  assert.equal(monsoon.check(p, new Set(), true, 28.597, 77.2, 0, 40)?.startsWith('Waterlogging reported ahead'), true);
  p.put('feat:monsoon', 'off');
  assert.equal(monsoon.check(p, new Set(), true, 28.597, 77.2, 0, 40), null);
  monsoon.clear(p);
  assert.equal(monsoon.spots(p).length, 0);
  p.put('floodSpots', 'not json');
  assert.equal(monsoon.spots(p).length, 0);
});

test('ahead: one-way roads and bends', () => {
  // a road drawn north along 77.2 for 1 km
  const north: [number, number][] = [
    [28.6, 77.2],
    [28.605, 77.2],
    [28.61, 77.2],
  ];
  const n = ahead.nearest(north, 28.603, 77.2001)!;
  assert.ok(n.d < 15, String(n.d));
  near(0, n.bearing % 360, 1);
  assert.ok(ahead.against(1, n.bearing, 180));
  assert.ok(!ahead.against(1, n.bearing, 2));
  assert.ok(ahead.against(-1, n.bearing, 0));
  assert.ok(!ahead.against(0, n.bearing, 180));
  assert.ok(!ahead.against(1, n.bearing, -1));
  assert.equal(ahead.nearest([[28.6, 77.2]], 28.6, 77.2), null);

  // a road north then turning east: the bend is ahead going north, none going south
  const bend: [number, number][] = [
    [28.6, 77.2],
    [28.602, 77.2],
    [28.602, 77.203],
  ];
  const b = ahead.nextBend(bend, 28.6005, 77.2, 0, 400);
  assert.ok(b);
  near(167, b!.m, 20);
  assert.equal(b!.dir, 1);
  assert.equal(ahead.nextBend(bend, 28.6005, 77.2, 180, 400), null);
  assert.ok(ahead.nextBend(bend, 28.602, 77.2025, 270, 400)!.dir < 0);
  assert.equal(ahead.nextBend(bend, 28.6005, 77.2, -1, 400), null);
});

test('ahead: school hours, toll text, overtaking', () => {
  assert.ok(ahead.schoolHours(day(2026, 10, 12, 8, 0)));
  assert.ok(!ahead.schoolHours(day(2026, 10, 11, 8, 0)));
  assert.ok(!ahead.schoolHours(day(2026, 10, 12, 18, 0)));
  assert.equal(ahead.tollText(2050, 100, ''), 'Toll plaza in 2 kilometres, about 100 rupees. Keep to the FASTag lane.');
  assert.equal(ahead.tollText(640, 0, 'Kherki Daula'), 'Toll plaza, Kherki Daula, in 600 metres. Keep to the FASTag lane.');
  assert.equal(ahead.tollText(1000, 0, ''), 'Toll plaza in 1 kilometre. Keep to the FASTag lane.');
  assert.equal(ahead.noOvertake(0, 2, 60), true);
  assert.equal(ahead.noOvertake(1, 2, 60), false);
  assert.equal(ahead.noOvertake(0, 4, 60), false);
  assert.equal(ahead.noOvertake(0, 0, 30), false);
});

test('ahead: Overpass query and answer', () => {
  const q = ahead.query(28.6, 77.2, true);
  assert.ok(q.startsWith('[out:json][timeout:15];way(around:400,28.600000,77.200000)[highway~'));
  assert.ok(q.includes('[barrier=toll_booth]') && q.includes('amenity~"^(school|kindergarten|hospital)$"'));
  assert.ok(!ahead.query(28.6, 77.2, false).includes('toll_booth'));
  const got = ahead.parse({
    elements: [
      { type: 'node', lat: 28.62, lon: 77.2, tags: { barrier: 'toll_booth', name: 'Kherki Daula' } },
      { type: 'way', center: { lat: 28.601, lon: 77.2 }, tags: { amenity: 'hospital' } },
      { type: 'node', lat: 28.602, lon: 77.2, tags: { amenity: 'kindergarten' } },
      { type: 'way', tags: { highway: 'primary', oneway: 'yes', lanes: '2', name: 'MG Road' }, geometry: [{ lat: 28.6, lon: 77.2 }, { lat: 28.61, lon: 77.2 }] },
      { type: 'way', tags: { highway: 'motorway' }, geometry: [{ lat: 28.6, lon: 77.3 }, { lat: 28.61, lon: 77.3 }] },
      { type: 'way', tags: { highway: 'residential', oneway: '-1' }, geometry: [{ lat: 28.6, lon: 77.4 }, { lat: 28.61, lon: 77.4 }] },
      { type: 'node', lat: 1, lon: 1 },
    ],
  });
  assert.deepEqual(got.spots.map((s) => s.kind), ['toll', 'hospital', 'school']);
  assert.deepEqual(got.roads.map((r) => r.oneway), [1, 1, -1]);
  assert.equal(got.roads[0].lanes, 2);
  assert.equal(got.roads[0].name, 'MG Road');
});

test('ahead: feed warns once about a toll and a wrong-way drive', async () => {
  const a = new ahead.Ahead();
  const answer = JSON.stringify({
    elements: [
      { type: 'node', lat: 28.615, lon: 77.2, tags: { barrier: 'toll_booth' } },
      { type: 'way', tags: { highway: 'primary', oneway: 'yes', name: 'MG Road' }, geometry: [{ lat: 28.6, lon: 77.2 }, { lat: 28.63, lon: 77.2 }] },
    ],
  });
  let asked = 0;
  const net: ahead.Fetch = async () => {
    asked++;
    return answer;
  };
  const want = { toll: true, wrong: true, zones: true, fog: false, overtake: false, tollRate: 100 };
  const t0 = day(2026, 10, 12, 18, 0).getTime();
  assert.deepEqual(a.feed(28.6, 77.2, 0, 40, want, net, new Date(t0)), []);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(asked, 1);
  assert.equal(a.fetching, false);
  const said = a.feed(28.6, 77.2, 0, 40, want, net, new Date(t0 + 1000));
  assert.deepEqual(said, ['Toll plaza in 2 kilometres, about 100 rupees. Keep to the FASTag lane.']);
  near(1668, a.view.tollM, 5);
  assert.equal(a.view.road, 'MG Road');
  assert.equal(ahead.line(a.view), 'Toll plaza in 1.7 km');
  assert.deepEqual(a.feed(28.6, 77.2, 0, 40, want, net, new Date(t0 + 2000)), []);
  // going south on the northbound one-way: the third fix in a row warns
  const south = (k: number) => a.feed(28.61, 77.2, 180, 30, want, net, new Date(t0 + 3000 + k * 1000));
  assert.deepEqual(south(0), []);
  assert.deepEqual(south(1), []);
  assert.deepEqual(south(2), ['Careful, this looks like a one-way street, MG Road, and you may be going against the traffic.']);
  assert.deepEqual(south(3), []);
  a.reset();
  const off = { toll: false, wrong: false, zones: false, fog: false, overtake: false, tollRate: 0 };
  assert.deepEqual(a.feed(28.6, 77.2, 0, 40, off, net, new Date(t0 + 9000)), []);
  assert.equal(a.view.tollM, -1);
});

test('spots: speed breakers learnt from three drives', () => {
  const b = spots.breakers();
  for (let d = 1; d <= 3; d++) b.add(28.61 + d * 0.00001, 77.2, 90, d, 1);
  b.add(28.61, 77.2, 90, 3, 1); // same drive twice counts once
  assert.equal(b.count(spots.isBreaker), 1);
  // approaching from the west, heading east, 120 m before it
  assert.notEqual(b.ahead(28.61, 77.19877, 90, 180, spots.isBreaker), null);
  assert.equal(b.ahead(28.61, 77.20123, 90, 180, spots.isBreaker), null);
  assert.equal(b.ahead(28.61, 77.20123, 270, 180, spots.isBreaker), null);
  const back = spots.breakers();
  back.load(b.save());
  assert.equal(back.count(spots.isBreaker), 1);
  assert.equal(back.save(), b.save());
});

test('spots: waits, medians and the size limit', () => {
  assert.equal(spots.median([30, 150, 90]), 90);
  assert.equal(spots.median([]), -1);
  assert.equal(errands.waitText(70), 'At the stop ahead you usually wait about a minute.');
  assert.equal(errands.waitText(150), 'At the stop ahead you usually wait about 2 and a half minutes.');
  assert.equal(errands.waitText(185), 'At the stop ahead you usually wait about 3 minutes.');
  assert.equal(spots.eighth(-1), -1);
  assert.equal(spots.eighth(350), 0);
  assert.equal(spots.eighth(270), 6);
  assert.equal(spots.eighth(383), 1);

  const w = spots.waits();
  const at = (h: number) => new Date(2026, 9, 12, h, 0).getTime();
  w.add(28.6, 77.2, 0, at(9), 120);
  w.add(28.6, 77.2, 0, at(9), 100);
  w.add(28.6, 77.2, 0, at(10), 140);
  w.add(28.6, 77.2, 0, at(22), 20);
  const s = w.ahead(28.598, 77.2, 0, 350, spots.isLongWait(9))!;
  assert.ok(s);
  assert.deepEqual(spots.waitsNear(s, 9), [120, 100, 140]);
  assert.deepEqual(spots.waitsNear(s, 22), [120, 100, 140, 20]); // fewer than three near: all of them
  assert.equal(w.ahead(28.598, 77.2, 0, 350, (x) => x.seen.length >= 5), null);

  const few = new spots.Spots(0.0003, 2, 2);
  few.add(1, 1, 0, 1, 1);
  few.add(2, 2, 0, 1, 1);
  few.add(3, 3, 0, 1, 1);
  assert.equal(few.size(), 2);
  const one = few.add(3, 3, 0, 2, 1);
  few.add(3, 3, 0, 3, 1);
  assert.deepEqual(one.seen.map((r) => r[0]), [2, 3]);
  few.load('1.0|2.0|0|5:x\nbad\n1.00000|2.00000|3|\n');
  assert.equal(few.size(), 0);
});

test('accel: the 0–100 timer', () => {
  const t = new accel.Timer();
  let at = 0;
  t.feed(0, at);
  t.feed(0, (at += 1000));
  t.feed(0, (at += 1000)); // armed
  let done = -1;
  // 0 -> 100 in 10 readings a second apart, 10 km/h a second
  for (let k = 1; k <= 11 && done < 0; k++) done = t.feed(Math.min(110, k * 10 + 5), (at += 1000));
  assert.ok(done > 0);
  near(9.5, done, 1);
  near(5.5, t.result60, 1);
  // backing off cancels the run
  const u = new accel.Timer();
  at = 0;
  u.feed(0, at);
  u.feed(0, (at += 1500));
  u.feed(30, (at += 1000));
  u.feed(20, (at += 1000));
  assert.equal(u.feed(100, (at += 1000)), -1);

  const p = memoryPrefs();
  assert.equal(accel.summary(p), 'no full run yet');
  assert.deepEqual(accel.done(p, 9.46, 5.12, 1000), { text: 'Nought to hundred in 9.5 seconds, your best', record: true });
  assert.equal(p.str('accelLast', ''), '9.5|5.1|1000');
  assert.equal(accel.done(p, 10.2, -1, 2000).text, 'Nought to hundred in 10.2 seconds');
  assert.equal(p.str('accelBest', ''), '9.5');
  assert.equal(accel.summary(p), 'last 10.2 s  ·  best 9.5 s');
  accel.forget(p);
  assert.equal(accel.summary(p), 'no full run yet');
});

test('rest: the drive clock and the break reminder', () => {
  const c = new rest.DriveClock();
  assert.equal(c.feed(5, 0), false);
  assert.equal(c.minutes(0), 0);
  c.feed(40, 1000);
  assert.equal(c.minutes(1000 + 125 * 60000), 125);
  c.feed(0, 60000);
  c.feed(30, 5 * 60000); // a short stop at a signal
  assert.equal(c.minutes(5 * 60000), 4);
  c.feed(0, 6 * 60000);
  assert.equal(c.feed(0, 16 * 60000), true);
  assert.equal(c.minutes(16 * 60000), 0);

  const p = memoryPrefs();
  assert.equal(rest.due(p, 119, 10 * 3600000, 0), false);
  assert.equal(rest.due(p, 120, 10 * 3600000, 0), true);
  assert.equal(rest.due(p, 150, 10 * 3600000, 10 * 3600000 - 30 * 60000), false);
  p.put('breakMin', '90');
  assert.equal(rest.due(p, 95, 10 * 3600000, 0), true);
  assert.equal(rest.restText(120), "You've been driving for 2 hours. Time for a short break. Looking for a stop ahead.");
  assert.equal(rest.restText(95), "You've been driving for 95 minutes. Time for a short break. Looking for a stop ahead.");
  assert.equal(rest.restText(130), "You've been driving for 2 hours. Time for a short break. Looking for a stop ahead.");
  assert.equal(rest.breakText(120), '2 hours of driving');
  assert.equal(rest.breakText(90), '1.5 hours of driving');
});

test('rest: accident help crash test', () => {
  assert.ok(rest.crash(60, 2, 1000));
  assert.ok(!rest.crash(60, 30, 1000));
  assert.ok(!rest.crash(30, 0, 1000));
  assert.ok(!rest.crash(60, 0, 5000));
});

test('sky: rain and fog from the saved weather', () => {
  const fresh = { current: { weather_code: 45 }, minutely_15: { precipitation: [0, 0, 0.4, 0, 0] } };
  assert.deepEqual(sky.now(fresh, 0, true), { wet: true, fog: true });
  assert.deepEqual(sky.now({ current: { weather_code: 3 }, minutely_15: { precipitation: [0.1] } }, 0, true), { wet: false, fog: false });
  const t = Date.UTC(2026, 9, 14, 9, 30);
  const old = {
    utc_offset_seconds: 19800,
    hourly: { time: ['2026-10-14T14:00', '2026-10-14T15:00', '2026-10-14T16:00'], weather_code: [61, 48, 3], precipitation: [2, 0, 0.5] },
  };
  // 09:30 UTC is 15:00 in India: fog, and rain due the next hour
  assert.deepEqual(sky.now(old, t, false), { wet: true, fog: true });
  assert.deepEqual(sky.now(old, t + 3 * 3600000, false), { wet: false, fog: false });
});
