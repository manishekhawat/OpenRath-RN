/// <reference types="node" />
/**
 * Trips, mileage and money: the mileage coach, the fuel-low planner, routes and the 0–100 timer,
 * tolls and the trip history, and the weekly report (from Tests.java, plus a few more).
 * (Commute insights were removed in 1.35.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as care from '../care.ts';
import * as coach from '../coach.ts';
import * as fuel from '../fuel.ts';
import * as fuelplan from '../fuelplan.ts';
import { memoryPrefs } from '../prefs.ts';
import * as tracks from '../tracks.ts';
import { dayKey } from '../trip.ts';
import * as weekly from '../weekly.ts';

const near = (want: number, got: number, tol: number) => assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}`);

test('coach: a drive with idling, a hard start and speed', () => {
  const t = new coach.Tracker();
  let now = 0;
  assert.equal(t.feed(now, 0, 0, false, false), null);
  assert.equal(t.cur, null, 'no drive while still');
  t.feed((now += 1000), 20, 0.005, false, false); // moves off: drive starts
  assert.ok(t.cur, 'drive started');
  for (let i = 0; i < 60; i++) t.feed((now += 1000), 50, 0.014, i === 5, false); // a minute at 50
  for (let i = 0; i < 120; i++) t.feed((now += 1000), 0, 0, false, false); // two minutes at a signal
  for (let i = 0; i < 60; i++) t.feed((now += 1000), 100, 0.028, false, false); // a minute at 100
  const cur = t.cur as coach.Trip | null; // (the asserts above narrowed t.cur to null)
  assert.equal(cur?.idleSec, 120, 'idle counted after moving again');
  assert.equal(cur?.fastSec, 60);
  assert.equal(cur?.starts, 1);
  let done: coach.Trip | null = null;
  for (let i = 0; i < 11 * 60 && !done; i++) done = t.feed((now += 1000), 0, 0, false, false);
  assert.ok(done && t.cur === null, 'ten-minute stop ends the drive');
  assert.equal(done!.idleSec, 120, "long stop isn't idling");
  const w = coach.waste(done!, 18);
  near((120 / 3600) * coach.IDLE_LPH, w[0], 1e-9);
  near(coach.START_L, w[1], 1e-9);
  const r = coach.reasons(done!, w);
  assert.ok(r.startsWith('2 min idling') || w[2] > w[0], r);
  assert.equal(new coach.Tracker().drivingMinutes(5), 0, 'break clock');
});

test('coach: start and end positions, close', () => {
  const tr = new coach.Tracker();
  tr.feed(0, 30, 0, false, false, 1, 2);
  tr.feed(1000, 30, 0.01, false, false, 1.1, 2.1);
  const c = tr.close(2000)!;
  assert.ok(c.sLat === 1 && c.sLon === 2, 'start kept');
  assert.ok(c.eLat === 1.1 && c.eLon === 2.1, 'end kept');
  assert.equal(c.end, 2000);
  assert.equal(tr.close(3000), null);
});

test('coach: saved as Java arrays, short drives skipped, last 120 kept', () => {
  const p = memoryPrefs();
  const t = { ...coach.newTrip(1000), end: 61000, km: 12.34, idleSec: 60, starts: 2, sLat: 28.6, sLon: 77.2 };
  coach.save(p, { ...t, km: 0.5 });
  assert.equal(coach.trips(p).length, 0, 'under a km');
  coach.save(p, t);
  const raw = JSON.parse(p.str('drives', '[]'));
  assert.equal(raw[0][2], '12.3', 'km kept as a string like String.valueOf');
  const back = coach.trips(p)[0];
  assert.equal(back.km, 12.3);
  assert.equal(back.sLat, 28.6);
  assert.equal(coach.minutes(back), 1);
  for (let i = 0; i < 130; i++) coach.save(p, { ...t, start: i });
  assert.equal(coach.trips(p).length, 120);
  assert.equal(coach.trips(p)[119].start, 129);
  // a Java backup's drive, with numbers where strings are expected
  const j = memoryPrefs({ drives: '[[1,2,5.5,3,4,5,6,7,0,0,0,0]]' });
  assert.equal(coach.trips(j)[0].km, 5.5);
});

test('coach: tips and the report', () => {
  assert.equal(coach.tip([0, 0, 0]), 'Your driving is already easy on fuel.');
  assert.ok(coach.tip([1, 0, 0]).startsWith('Idling'));
  assert.ok(coach.tip([0, 1, 0]).startsWith('Hard starts'));
  assert.ok(coach.tip([0, 0, 1]).startsWith('Speed'));
  const smooth = { ...coach.newTrip(0), km: 10, end: 600000 };
  assert.equal(coach.reasons(smooth, coach.waste(smooth, 18)), 'smooth drive');
  const p = memoryPrefs();
  assert.equal(coach.report(p), coach.empty());
  coach.save(p, { ...coach.newTrip(Date.UTC(2026, 9, 12, 3)), end: Date.UTC(2026, 9, 12, 4), km: 40, idleSec: 1200, starts: 3 });
  const r = coach.report(p);
  assert.ok(r.startsWith('Your last 1 drives used about 0.3 litres more than they needed.'), r);
  assert.ok(r.includes('20 min idling, 3 hard starts'), r);
  assert.ok(r.endsWith('using 18.0 km/l.'), r);
});

test('fuel plan: litres left', () => {
  // full at 1000 km, 300 km at 20 km/l = 15 l used of 37
  const gps = [1000, 1200];
  const litres = [30, 5];
  near(37 - 10 + 5 - 5, fuelplan.litresLeft(37, gps, litres, [true, false], 1300, 20), 1e-9);
  near(-1, fuelplan.litresLeft(37, gps, litres, [false, false], 1300, 20), 1e-9);
  near(0, fuelplan.litresLeft(37, [0], [37], [true], 5000, 20), 1e-9);
});

test('fuel plan: tank, range and the low warning', () => {
  const p = memoryPrefs({ fuel: 'petrol' });
  assert.equal(fuelplan.tank(p), 40);
  fuelplan.setTank(p, 500);
  assert.equal(fuelplan.tank(p), 120);
  fuelplan.setTank(p, 2);
  assert.equal(fuelplan.tank(p), 5);
  fuelplan.setTank(p, 40);
  assert.equal(fuelplan.rangeKm(p, 0), -1);
  assert.ok(fuelplan.text(p, 0).startsWith('not known yet'));
  fuel.setLog(p, [{ t: 1, l: 35, rs: 3500, odo: 10000, gps: 100, full: true }]);
  // no mileage learnt yet: a petrol car's typical 17 km/l
  near(40 * 17 - 100, fuelplan.rangeKm(p, 200), 1e-6);
  assert.equal(fuelplan.text(p, 200), 'about 580 km of petrol left');
  const low = new fuelplan.LowCheck();
  assert.equal(low.check(p, 200), null, 'plenty left');
  const s = low.check(p, 100 + 40 * 17 - 50); // 50 km left: below 60
  assert.equal(s, 'About 50 kilometres of petrol left. Showing petrol pumps ahead.');
  assert.equal(low.check(p, 100 + 40 * 17 - 45), null, 'once per level');
  assert.ok(low.check(p, 100 + 40 * 17 - 20)?.startsWith('About 20 kilometres'), 'again below half');
  assert.equal(low.check(p, 200), null, 'filled up');
  assert.equal(low.told, Number.MAX_SAFE_INTEGER);
  p.put('feat:fuelPrice', 'off');   // one switch since 1.35
  assert.equal(low.check(p, 100 + 40 * 17 - 20), null);
  assert.equal(fuelplan.summaryRange(p, 200), -1);
  assert.equal(fuelplan.nextWarnKm(60), 80);
  assert.equal(fuelplan.nextWarnKm(100), 40);
});

test('tracks: 0–100 timer', () => {
  const t = new tracks.Timer();
  let at = 0;
  t.feed(0, at);
  t.feed(0, (at += 1000));
  t.feed(0, (at += 1000)); // armed
  let done = -1;
  // 0 -> 100 in 10 readings a second apart, 10 km/h a second
  for (let k = 1; k <= 11 && done < 0; k++) done = t.feed(Math.min(110, k * 10 + 5), (at += 1000));
  assert.ok(done > 0, 'timer finished');
  near(9.5, done, 1.0);
  near(5.5, t.result60, 1.0);
  // backing off cancels the run
  const u = new tracks.Timer();
  at = 0;
  u.feed(0, at);
  u.feed(0, (at += 1500));
  u.feed(30, (at += 1000));
  u.feed(20, (at += 1000));
  assert.equal(u.feed(100, (at += 1000)), -1, 'lifting off cancels');
});

test('tracks: best time saved and spoken', () => {
  const p = memoryPrefs();
  assert.equal(tracks.accelText(p), 'no full run yet');
  assert.equal(tracks.accelDone(p, 11.24, 6.01, 5), 'Nought to hundred in 11.2 seconds, your best');
  assert.equal(tracks.accelDone(p, 12, -1, 6), 'Nought to hundred in 12.0 seconds');
  assert.equal(p.str('accelBest', ''), '11.2');
  assert.equal(tracks.accelText(p), 'last 12.0 s  ·  best 11.2 s');
  tracks.accelDone(p, 10, 5.5, 7);
  assert.equal(tracks.accelText(p), 'last 10.0 s (0–60 5.5 s)  ·  best 10.0 s');
  tracks.forgetAccel(p);
  assert.equal(tracks.accelText(p), 'no full run yet');
});

test('tracks: volume with speed', () => {
  assert.equal(tracks.extraSteps(35, 20), 0);
  assert.equal(tracks.extraSteps(40, 20), 1);
  assert.equal(tracks.extraSteps(100, 20), 4);
  assert.equal(tracks.extraSteps(250, 15), 6);
  assert.equal(tracks.extraSteps(120, 0), 0);
});

test('tracks: points kept every 5 s or 30 m while moving', () => {
  const s = new tracks.Sampler();
  assert.equal(s.keep(28.6, 77.2, 2, 1000), false, 'standing');
  assert.equal(s.keep(28.6, 77.2, 30, 1000), true, 'first');
  assert.equal(s.keep(28.6001, 77.2, 30, 3000), false, '11 m in 2 s');
  assert.equal(s.keep(28.6004, 77.2, 30, 4000), true, '44 m');
  assert.equal(s.keep(28.6004, 77.2, 30, 9000), true, '5 s on');
  assert.equal(tracks.csvLine(5, 28.6139391, 77.2090212, 215.6, 42.25), '5,28.613939,77.209021,216,42.3\n');
});

test('tracks: GPX', () => {
  const pt = tracks.gpxPoint(28.613939, 77.209021, 216, 1791806400000);
  assert.ok(pt.includes('lat="28.613939"') && pt.includes('lon="77.209021"') && pt.includes('<time>2026-10-12T12:00:00Z</time>'), pt);
  assert.ok(tracks.gpxHead('A & B').includes('A &amp; B'));
  const csv = '1000,28.6,77.2,200,30.0\n6000,28.601,77.2,200,30.0\nbroken\n' + (6000 + 6 * 60000) + ',28.7,77.3,210,40.0\n';
  const g = tracks.gpx('2026-10-12', csv);
  assert.equal(g.match(/<trkseg>/g)?.length, 2, 'a new segment after a 5-minute gap');
  assert.equal(g.match(/<trkpt/g)?.length, 3);
  assert.ok(g.includes('<name>Drives on 2026-10-12</name>') && g.endsWith('  </trk>\n</gpx>\n'));
  const sum = tracks.summarize(tracks.parse(csv));
  assert.equal(sum.points, 3);
  near(0.111, sum.km, 0.002);
  assert.equal(tracks.gpxName('2026-10-12'), 'openrath-2026-10-12.gpx');
});

test('tracks: 60 days kept', () => {
  const names = ['notes.txt'];
  for (let i = 0; i < 65; i++) names.push(dayKey(Date.UTC(2026, 0, 1) + i * 86400000) + '.csv');
  const d = tracks.days(names);
  assert.equal(d.length, 65);
  assert.ok(d[0] > d[1], 'newest first');
  assert.equal(tracks.toPrune(d).length, 5);
  assert.ok(tracks.toPrune(d).every((x) => x < d[59]));
});

test('care: tolls and spent', () => {
  const p = memoryPrefs();
  care.addToll(p, 100, 1000);
  care.addToll(p, 0, 1500);
  care.addToll(p, 65, 2000);
  assert.deepEqual(care.tolls(p), [{ t: 1000, rs: 100 }, { t: 2000, rs: 65 }]);
  assert.equal(care.spent(care.tolls(p), 0, 2000), 100, 'to is not included');
  assert.equal(care.spent(care.tolls(p), 1000, 3000), 165);
  assert.equal(care.tolls(memoryPrefs({ tolls: 'oops' })).length, 0);
  const now = new Date();
  care.addToll(p, 250, now.getTime());
  assert.equal(care.tollsThisMonth(p, now), '  ·  tolls ₹250 this month');
});

test('care: the history periods', () => {
  const now = new Date(2026, 9, 15, 10); // a Thursday
  const [tw, lw, tm, lm] = care.periods(now);
  assert.equal(new Date(tw.from).getDate(), 11, 'week starts on Sunday');
  assert.equal(new Date(tw.to).getDate(), 16);
  assert.equal(new Date(lw.from).getDate(), 4);
  assert.equal(lw.to, tw.from);
  assert.equal(new Date(tm.from).getDate(), 1);
  assert.equal(new Date(lm.from).getMonth(), 8);
  assert.equal(lm.to, tm.from);
  const hist = { '2026-10-12': [20.5, 3600, 1, 0, 0, 90], '2026-10-13': [0.5, 60, 0, 0, 0, 100], '2026-10-01': [10, 600, 0, 0, 0, 80] };
  const p = memoryPrefs();
  fuel.setLog(p, [{ t: new Date(2026, 9, 12, 9).getTime(), l: 20, rs: 2000, odo: 1 }]);
  care.addToll(p, 150, new Date(2026, 9, 13, 9).getTime());
  const t = care.totals(p, hist, tw.from, tw.to);
  assert.equal(care.periodLine(tw.name, t), 'This week: 21.0 km, 1 h 1 min, fuel ₹2000, tolls ₹150, score 90');
  assert.equal(care.periodLine(lw.name, care.totals(p, hist, lw.from, lw.to)), 'Last week: 0.0 km, 0 h 0 min');
  assert.equal(care.totals(p, hist, tm.from, tm.to).km, 31);
  const today = care.withToday(hist, '2026-10-15', [5, 600, 0, 0, 0, 100]);
  assert.equal(care.totals(p, today, tw.from, tw.to).km, 26);
  assert.equal(care.scoreLine(92, 1, 2, 125), "Today's driving score: 92 / 100 (1 harsh brakes, 2 hard starts, 2 min over the limit)");
});

test('weekly: due on Sundays, report text', () => {
  const p = memoryPrefs();
  const sun = new Date(2026, 9, 18, 9);
  assert.equal(weekly.due(p, sun), false, 'first time starts the clock');
  assert.equal(weekly.due(p, new Date(2026, 9, 25, 8)), true, 'a week on, Sunday');
  assert.equal(weekly.due(p, new Date(2026, 9, 26, 8)), false, 'shown yesterday');
  assert.equal(weekly.due(p, new Date(2026, 10, 3, 9)), true, 'missed Sunday: after 8 days');
  p.put('feat:startSummary', 'off');   // one switch since 1.35
  assert.equal(weekly.due(p, new Date(2026, 11, 3, 9)), false);

  const q = memoryPrefs();
  const now = new Date(2026, 9, 18, 20).getTime();
  const tue = new Date(2026, 9, 13, 9).getTime();
  coach.save(q, { ...coach.newTrip(tue), end: tue + 1800000, km: 12 });
  coach.save(q, { ...coach.newTrip(tue + 86400000), end: tue + 86400000 + 3600000, km: 30, idleSec: 900, starts: 4 });
  coach.save(q, { ...coach.newTrip(now - 9 * 86400000), km: 50, idleSec: 9000 }); // too old
  care.addToll(q, 230, tue);
  const w = weekly.week(q, { '2026-10-13': [240, 5 * 3600 + 30 * 60, 0, 0, 0, 86] }, now);
  assert.equal(w.bestText, 'Tue, 12 km: smooth drive');
  assert.equal(w.worstText, 'Wed, 30 km: 15 min idling, 4 hard starts');
  assert.equal(
    w.text,
    'Driven: 240 km in 5 h 30 min (average 44 km/h)\nTolls: ₹230\nDriving score: 86 out of 100\nBest drive: Tue, 12 km: smooth drive\nNeeds work: Wed, 30 km: 15 min idling, 4 hard starts',
  );
});

test('weekly: start-up summary extras', () => {
  assert.equal(weekly.holidaySoon(new Date(2026, 10, 3)), 'Diwali, Sun 8 Nov');
  assert.equal(weekly.holidaySoon(new Date(2026, 9, 21)), '', 'Diwali is more than a week off');
  const p = memoryPrefs();
  assert.equal(weekly.summaryExtras(p, 0, new Date(2026, 10, 3)).rangeKm, -1);
  fuel.setLog(p, [{ t: 1, l: 35, rs: 3500, odo: 10000, gps: 0, full: true }]);
  near(680, weekly.summaryExtras(p, 0).rangeKm, 1e-6);
});

test('the trip menu, one row since 1.35', () => {
  const p = memoryPrefs();
  assert.equal(care.TRIP_MENU.length, 5);
  assert.equal(care.tripMenuTitle(12.34, 4567.8), 'Today 12.3 km  ·  GPS odometer 4568 km');
  assert.equal(care.tripRow(12.34, 92, 0), 'today 12.3 km, score 92; no fill-ups yet');
  fuel.setLog(p, [{ t: 1, l: 30, rs: 3000, odo: 1000, full: true }]);
  assert.equal(care.tripRow(0, 100, fuel.stats(fuel.log(p)).fills), 'today 0.0 km, score 100; 1 fill-ups');
  // the parking spot only from a fix of the last 30 seconds (Hub.liveFix)
  assert.ok(care.liveFix(1000, 20000));
  assert.ok(!care.liveFix(1000, 40000));
  assert.ok(!care.liveFix(0, 1000));
});
