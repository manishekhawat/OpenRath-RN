/// <reference types="node" />
/**
 * The checks from the Android version's Tests.java, for the logic ported so far.
 * Run with `npm test` (Node's own test runner; no build step).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as air from '../air.ts';
import * as car from '../car.ts';
import * as care from '../care.ts';
import * as errands from '../errands.ts';
import * as features from '../features.ts';
import * as fuel from '../fuel.ts';
import * as geo from '../geo.ts';
import * as holidays from '../holidays.ts';
import { memoryPrefs } from '../prefs.ts';
import * as speed from '../speed.ts';
import * as theme from '../theme.ts';
import * as trip from '../trip.ts';
import * as weather from '../weather.ts';

const near = (want: number, got: number, tol: number) => assert.ok(Math.abs(want - got) <= tol, `want ${want}, got ${got}`);

test('fuel: full to full', () => {
  const s = fuel.compute([1000, 1300, 1500], [35, 30, 10], [3500, 3000, 1000], [true, false, true], [1, 2, 3]);
  near(12.5, s.lastKmpl, 1e-9);
  near(12.5, s.avgKmpl, 1e-9);
  near(8.0, s.rupeesPerKm, 1e-9);
  assert.equal(s.fills, 3);
  assert.equal(fuel.compute([1000], [35], [3500], [true], [1]).lastKmpl, 0);
  assert.equal(fuel.compute([1000, 900], [35, 30], [1, 1], [true, true], [1, 2]).avgKmpl, 0);
});

test('fuel: price from fill-ups in this city', () => {
  const p = memoryPrefs({ city: 'Pune' });
  fuel.setLog(p, [
    { t: 1, l: 10, rs: 1000, odo: 100, city: 'Pune' },
    { t: 2, l: 10, rs: 1100, odo: 200, city: 'Delhi' },
  ]);
  assert.equal(fuel.price(p), 100);
  p.put('fuelPrice', '105');
  assert.equal(fuel.price(p), 105);
  assert.equal(fuel.suggestOdo([{ t: 1, l: 1, rs: 1, odo: 1000, gps: 50 }], 80), 1030);
});

test('fuel leak check', () => {
  const k = errands.fullTankKmpl([1000, 1500, 2000, 2500, 3000, 3300], [30, 28, 28, 28, 28, 28], [true, true, true, true, true, true]);
  assert.equal(k.length, 5);
  near(17.86, k[0], 0.01);
  assert.notEqual(errands.fuelDrop(k), null);
  assert.equal(errands.fuelDrop(errands.fullTankKmpl([1000, 1500, 2000, 2500, 3000], [30, 28, 28, 28, 28], [true, true, true, true, true])), null);
  near(20.0, errands.fullTankKmpl([0, 300, 600], [30, 10, 20], [true, false, true])[0], 0.01);
});

test('driving score', () => {
  const s = trip.initial(0);
  assert.equal(trip.score(s), 100);
  assert.equal(trip.score({ ...s, todayBrakes: 2, todayAccels: 3, todaySpeedSec: 90 }), 100 - 8 - 6 - 3);
  assert.equal(trip.score({ ...s, todayBrakes: 40 }), 0);
});

test('trip: counts movement and remembers where it parked', () => {
  let s = trip.initial(Date.UTC(2026, 9, 14, 6));
  const t0 = Date.UTC(2026, 9, 14, 6);
  const opts = { over: false, scoring: true, parking: true };
  // drive north at ~36 km/h (10 m/s), a fix a second
  for (let i = 0; i <= 100; i++) {
    s = trip.feed(s, { lat: 28.6 + (i * 10) / 111195, lon: 77.2, speed: 10, heading: 0, accuracy: 5, t: t0 + i * 1000 }, opts).state;
  }
  near(1.0, s.todayKm, 0.01);
  assert.equal(s.todaySec, 100);
  // stand still for over 90 s
  let parked = false;
  for (let i = 1; i <= 95; i++) {
    const r = trip.feed(s, { lat: 28.609, lon: 77.2, speed: 0, heading: null, accuracy: 5, t: t0 + 100000 + i * 1000 }, opts);
    s = r.state;
    parked = parked || r.parked;
  }
  assert.ok(parked);
  assert.ok(s.park && Math.abs(s.park.lat - 28.609) < 1e-6);
});

test('speed limits', () => {
  assert.equal(speed.speed('50'), 50);
  assert.equal(speed.speed('30 mph'), 48);
  assert.equal(speed.speed('IN:urban'), 0);
  assert.equal(speed.speed(null), 0);
  const near: [number, number][] = [
    [28.6, 77.2],
    [28.601, 77.2],
  ];
  const r = speed.parse({
    elements: [
      { type: 'way', tags: { maxspeed: '60' }, geometry: near.map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way', tags: { maxspeed: '40' }, geometry: near.map(([lat, lon]) => ({ lat, lon })) },
      { type: 'way', tags: { maxspeed: '80' }, geometry: [{ lat: 29, lon: 78 }, { lat: 29.001, lon: 78 }] },
      { type: 'way', tags: { maxspeed: '30' } },
      { type: 'node', lat: 28.603, lon: 77.2, tags: { highway: 'speed_camera', maxspeed: '50' } },
    ],
  });
  assert.equal(r.ways.length, 3, 'a road with no shape is no use for a limit along it');
  assert.equal(speed.limitAt(r.ways, 28.6, 77.2, speed.ON_ROAD_M), 40, 'the lowest limit of the roads here');
  assert.equal(speed.limitAt(r.ways, 28.8, 77.5, speed.ON_ROAD_M), 0, 'no road here, no limit');
  assert.ok(speed.onWay(r.ways, 28.6, 77.2, speed.ON_ROAD_M));
  assert.ok(!speed.onWay(r.ways, 28.8, 77.5, speed.ON_ROAD_M));
  assert.ok(!speed.limitsStale(true, false, 400, false), 'the answer covers 600 m around where it was asked');
  assert.ok(speed.limitsStale(true, false, 700, false), 'past that, off the roads it named, ask again');
  assert.ok(!speed.limitsStale(true, false, 700, true), 'still on one of them: keep it');
  assert.ok(speed.limitsStale(true, false, 5200, true), 'and after 5 km ask whatever the roads say');
  assert.ok(speed.limitsStale(true, true, 0, true), 'a failed answer is asked again');
  assert.ok(speed.limitsStale(false, false, 0, true), 'so is never having asked');
  assert.equal(r.cameras.length, 1);
  assert.equal(speed.nearestCamera(28.6, 77.2, 0, 40, r.cameras), 334);
  assert.ok(speed.isOver(44, 40, 0));
  assert.ok(!speed.isOver(43, 40, 0));
});

test('sunset', () => {
  const noonUtc = 1791806400000; // 2026-10-12 12:00 UTC = 17:30 IST
  assert.ok(!errands.dark(28.61, 77.21, noonUtc));
  assert.ok(errands.dark(28.61, 77.21, noonUtc + 3600000));
  assert.ok(!errands.dark(28.61, 77.21, noonUtc - 10 * 3600000 - 30 * 60000));
  assert.ok(errands.dark(28.61, 77.21, noonUtc - 12 * 3600000));
});

test('offline weather', () => {
  const t = 1791972000000 - 20 * 60000;
  assert.equal(weather.hourKey(t, 19800), '2026-10-14T15:00');
  assert.equal(weather.hourKey(t, 0), '2026-10-14T09:00');
  const hours = ['2026-10-14T14:00', '2026-10-14T15:00', '2026-10-14T16:00'];
  assert.equal(weather.slot(hours, '2026-10-14T15:00'), 1);
  assert.equal(weather.slot(hours, '2026-10-19T15:00'), -1);
  assert.equal(weather.savedNote(0, 25 * 60000), 'Offline · forecast from 25 min ago');
  assert.equal(weather.savedNote(0, 3 * 3600000 + 5), 'Offline · forecast from 3 h ago');
  assert.equal(weather.savedNote(0, 3 * 86400000), 'Offline · forecast from 3 days ago');
  const saved = {
    utc_offset_seconds: 19800,
    hourly: {
      time: hours,
      temperature_2m: [30, 31.4, 29],
      weather_code: [0, 61, 3],
      is_day: [1, 1, 1],
      relative_humidity_2m: [50, 60, 70],
      wind_speed_10m: [5, 6, 7],
    },
  };
  const w = weather.read(saved, t, true, t - 3 * 3600000);
  assert.equal(w?.temp, 31);
  assert.equal(w?.text, 'Rain');
  assert.equal(w?.savedNote, 'Offline · forecast from 3 h ago');
});

test('geo', () => {
  near(1000, geo.dist(28.6, 77.2, 28.6 + 1 / 111.195, 77.2), 2);
  near(90, geo.bearing(28.6, 77.2, 28.6, 77.3), 0.5);
  assert.ok(geo.ahead(28.6, 77.2, 0, 28.603, 77.2, 700));
  assert.ok(!geo.ahead(28.6, 77.2, 180, 28.603, 77.2, 700));
  assert.ok(!geo.ahead(28.6, 77.2, 0, 28.62, 77.2, 700));
});

test('holidays', () => {
  // the next ones, for Settings and the start-up summary; the traffic warning went in 1.35
  const next = holidays.upcoming(new Date(2026, 9, 13, 9), 3);
  assert.equal(next.length, 3);
  assert.ok(next[0].startsWith('Dussehra'));
  assert.equal(next[1], 'Diwali, Sun 8 Nov');
  assert.equal(holidays.of(2026).length, 12);
  // 1.44: India's list says nothing about the traffic anywhere else
  assert.deepEqual(holidays.upcoming(new Date(2026, 9, 13, 9), 3, false), []);
});

test('errands', () => {
  assert.equal(errands.share(1000, 3), 334);
  assert.equal(errands.share(1000, 2), 500);
  assert.equal(
    errands.upiLink('tech@okaxis', 'Tech B', 334, 'Trip share'),
    'upi://pay?pa=tech@okaxis&pn=Tech%20B&am=334.00&cu=INR&tn=Trip%20share',
  );
  assert.equal(errands.validVpa('tech.b-1@okaxis'), true);
  assert.equal(errands.validVpa('tech okaxis'), false);
  assert.ok(errands.parkingLink(0, 60).includes('dates=19700101T005000Z/19700101T010000Z'));
  assert.equal(
    errands.summary(new Date(2026, 9, 13, 8, 0), 'Tech', '24°', 'Clear', '', 230, 312, 'OIL CHANGE DUE IN 300 KM', 'Diwali, Sun 8 Nov'),
    "Good morning, Tech. It's 24 degrees and clear. The air is poor, A Q I 230. Petrol for about 310 kilometres. " +
      'Oil change due in 300 km. Coming up: Diwali, Sun 8 Nov.',
  );
  assert.equal(errands.waitText(70), 'At the stop ahead you usually wait about a minute.');
  assert.equal(errands.waitText(150), 'At the stop ahead you usually wait about 2 and a half minutes.');
  assert.equal(errands.waitText(185), 'At the stop ahead you usually wait about 3 minutes.');
  assert.equal(errands.lightsReminder(true, 40, true, false, false), "It's dark and your headlights look off. Please switch them on.");
  assert.equal(errands.lightsReminder(true, 40, true, true, false), null);
  assert.equal(errands.lightsReminder(true, 40, false, false, false), "It's getting dark. Remember your headlights.");
  assert.equal(errands.lightsReminder(false, 40, true, false, false), null);
  assert.equal(errands.lightsReminder(true, 40, true, false, true), null);
  assert.equal(errands.soundProfile(true, true), 'highway');
  assert.equal(errands.soundProfile(false, true), 'night');
  assert.equal(errands.soundProfile(false, false), 'city');
  assert.equal(
    errands.weekly(240, 5 * 3600 + 30 * 60, 1800, 230, 86, 'Tue, 12 km: smooth drive', ''),
    'Driven: 240 km in 5 h 30 min (average 44 km/h)\nPetrol: ₹1,800 (₹7.5 a km)\nTolls: ₹230\nDriving score: 86 out of 100\n' +
      'Best drive: Tue, 12 km: smooth drive',
  );
  assert.equal(errands.wifiQr('Dzire;Car', 'pa:ss'), 'WIFI:T:WPA;S:Dzire\\;Car;P:pa\\:ss;;');
  assert.equal(errands.wifiQr('Dzire', ''), 'WIFI:T:nopass;S:Dzire;;');
});

test('car profile', () => {
  assert.equal(car.idFor('Maruti Suzuki'), 'maruti-suzuki');
  assert.equal(car.idFor('Citroën'), 'citro-n');
  assert.equal(car.idFor(' Mercedes-Benz '), 'mercedes-benz');
  assert.equal(car.nameFor('Grand Vitara'), 'GRAND VITARA');
  assert.equal(car.nameFor('A Very Long Model Name Indeed').length, 14);
  assert.equal(car.searchWords('maruti-suzuki', 'Maruti Suzuki'), 'maruti|suzuki|nexa|arena|true value');
  assert.equal(car.searchWords('tata-motors', 'Tata Motors'), 'tata');
  assert.equal(car.searchWords('hyundai', 'Hyundai'), 'hyundai');
  assert.equal(car.searchWords('land-rover', 'Land Rover'), 'land|rover');
  assert.equal(car.searchWords('', ''), '');
  assert.equal(car.serviceSearch('Kia'), 'Kia service centre');
  assert.equal(car.serviceSearch(''), 'car service centre');
  assert.equal(car.word('cng'), 'CNG');
  assert.equal(car.stations('ev'), 'charging stations');
  assert.equal(car.stations('diesel'), 'fuel pumps');
  assert.equal(car.kmpl('ev'), 0);
  assert.ok(car.kmpl('diesel') > car.kmpl('petrol'));
});

test('service reminders', () => {
  const p = memoryPrefs({ 'care:oil:last': '20000', 'care:insurance:due': '2026-10-20' });
  const today = new Date(2026, 9, 14);
  assert.equal(care.kmLeft(p, 0, 29700), 300);
  assert.equal(care.describe(p, 0, 29700, today), 'in 300 km (every 10000 km)');
  assert.equal(care.daysLeft(p, 4, today), 6);
  // 6 days scores 240, 300 km scores 300: insurance is the more urgent
  assert.equal(care.alert(p, 29700, today), 'INSURANCE RENEWAL DUE IN 6 DAYS');
  assert.equal(care.alert(p, 30100, today), 'OIL CHANGE OVERDUE');
  assert.equal(care.bookingDue(p, 29700), 0);
  assert.equal(care.describe(p, 1, 29700, today), 'every 10000 km; last one not set');
  // the odometer entered once is read back as it was, and the GPS keeps counting from there
  care.setOdo(p, 30000, 1200);
  assert.equal(care.odo(p, 1200), 30000);
  assert.equal(care.odo(p, 1250), 30050);
});

test('air quality', () => {
  assert.equal(air.index(45, 80), 80); // PM10 80 -> 80.4, PM2.5 45 -> 75.5
  assert.equal(air.band(230), 'Poor');
  assert.equal(air.alert(150, 0, -1e10), null);
  assert.ok(air.alert(250, 4 * 3600000, 0)?.includes('recirculate'));
});

test('features and themes', () => {
  const p = memoryPrefs();
  assert.equal(features.on(p, 'weather'), true);
  assert.equal(features.on(p, 'dashcam'), false);
  features.set(p, 'weather', false);
  assert.equal(features.on(p, 'weather'), false);
  assert.equal(theme.colour('#CC2A1250'), '#2A1250CC');
  assert.equal(theme.colour('nope'), null);
  const l = theme.lookOf({ colours: { text: '#FFFFFF', accent: 'bad' } });
  assert.equal(l.text, '#FFFFFF');
  assert.equal(l.accent, theme.PAINT_ACCENT);
  assert.ok(l.problem.includes('accent'));
});
