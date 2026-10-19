/// <reference types="node" />
// The dashboard's checks from Tests.java (1.42): compass, all-apps screen, status icons, calendar,
// hourly and offline weather, and the drive summary when stopped.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as Agenda from '../agenda.ts';
import * as Apps from '../apps.ts';
import { memoryPrefs } from '../prefs.ts';
import * as Status from '../status.ts';
import * as Tap from '../tap.ts';
import * as Trip from '../trip.ts';
import * as Weather from '../weather.ts';

test('compass points', () => {
  assert.equal(Status.point(2), 'N');
  assert.equal(Status.point(355), 'N');
  assert.equal(Status.point(90), 'E');
  assert.equal(Status.point(225), 'SW');
});

test('all-apps screen helpers', () => {
  assert.ok(Apps.matches('Google Maps', 'com.google.android.apps.maps', 'maps'));
  assert.ok(Apps.matches('Google Maps', 'com.google.android.apps.maps', 'goo map'));
  assert.ok(!Apps.matches('Google Maps', 'com.google.android.apps.maps', 'radio'));
  assert.ok(Apps.matches('X', 'y', '  '));
  assert.equal(Apps.letter('maps'), 'M');
  assert.equal(Apps.letter('360 Camera'), '#');
  assert.equal(Apps.letter(''), '#');
  const r = Apps.split('a,b,c');
  assert.equal(Apps.join(Apps.push(r, 'c', 6)), 'c,a,b');
  assert.equal(Apps.join(Apps.push(r, 'd', 2)), 'd,a');
  assert.equal(Apps.join(Apps.remove(r, 'b')), 'a,c');
  assert.equal(Apps.split('').length, 0);
});

test('status icons', () => {
  assert.equal(Status.gps(3, true), Status.ON);
  assert.equal(Status.gps(60, true), Status.SEARCHING);
  assert.equal(Status.gps(-1, false), Status.OFF);
  assert.equal(Status.percent(false, 50, 100), -1);
  assert.equal(Status.percent(true, 25, 50), 50);
  assert.equal(Status.wifiBars(-50), 4);
  assert.equal(Status.wifiBars(-90), 1);
  assert.equal(Status.label(13), '4G');
  assert.equal(Status.label(20), '5G');
  assert.equal(Status.label(0), '');
});

test('drive summary when stopped', () => {
  assert.equal(Trip.stopText(12, 1800, 68, false), '12.0 km · 30 min · avg 24 · top 68 km/h');
  assert.equal(Trip.stopText(12, 3900, 100, true), '12.0 km · 1 h 05 min · avg 7 · top 62 mph');
});

test('calendar', () => {
  const ist = 'Asia/Kolkata';
  const now = Date.UTC(2026, 9, 18, 10, 0, 0) - 5.5 * 3600000; // Sunday 18 Oct 2026, 10:00 in India
  const h = 3600000;
  assert.equal(Agenda.when(now + h * 4, now + h * 5, false, now, ist).join(' '), 'Today 14:00');
  assert.equal(Agenda.when(now + h * 24, now + h * 25, false, now, ist).join(' '), 'Tomorrow 10:00');
  assert.equal(Agenda.when(now + h * 72, now + h * 73, false, now, ist)[0], 'Wed');
  assert.equal(Agenda.when(now - 600000, now + 600000, false, now, ist)[1], 'now');
  assert.equal(Agenda.when(now + h * 24, now + h * 48, true, now, ist)[1], '');
  // finished events drop out, untitled ones get a title, soonest first
  const ev = Agenda.upcoming(
    [
      { title: 'Later', start: now + 2 * h, end: now + 3 * h, allDay: false },
      { title: 'Done', start: now - 2 * h, end: now - h, allDay: false },
      { title: '  ', start: now + h, end: now + 2 * h, allDay: false },
    ],
    now,
    ist,
  );
  assert.deepEqual(
    ev.map((e) => e.title),
    ['(no title)', 'Later'],
  );
});

test('hourly weather', () => {
  const t = [20, 21, 22, NaN, 24];
  assert.equal(Weather.next(t, 1, 24).length, 2);
  assert.equal(Weather.next(t, -1, 24).length, 0);
  assert.equal(Weather.next([1, 2, 3, 4], 0, 2).length, 2);
  assert.equal(Weather.firstRain([0, 0.1, 0.5]), 2);
  assert.equal(Weather.firstRain([0, 0.1]), -1);
});

test('offline weather', () => {
  // 2026-10-14 09:40 UTC is 15:10 in India (+5:30)
  const t = 1791972000000 - 20 * 60000;
  assert.equal(Weather.hourKey(t, 19800), '2026-10-14T15:00');
  assert.equal(Weather.hourKey(t, 0), '2026-10-14T09:00');
  const hours = ['2026-10-14T14:00', '2026-10-14T15:00', '2026-10-14T16:00'];
  assert.equal(Weather.slot(hours, '2026-10-14T15:00'), 1);
  assert.equal(Weather.slot(hours, '2026-10-19T15:00'), -1);
  assert.equal(Weather.savedNote(0, 25 * 60000), 'Offline · forecast from 25 min ago');
  assert.equal(Weather.savedNote(0, 3 * 3600000 + 5), 'Offline · forecast from 3 h ago');
  assert.equal(Weather.savedNote(0, 3 * 86400000), 'Offline · forecast from 3 days ago');
  // a saved answer gives the hour that is now, its next hours, and drops the days gone by
  const j = {
    utc_offset_seconds: 19800,
    hourly: {
      time: hours,
      temperature_2m: [30, 31, 29],
      weather_code: [1, 61, 3],
      is_day: [1, 1, 1],
      relative_humidity_2m: [50, 60, 70],
      wind_speed_10m: [5, 6, 7],
      precipitation: [0, 0.5, 0],
    },
    daily: { time: ['2026-10-13', '2026-10-14'], weather_code: [0, 61], temperature_2m_max: [32, 31], temperature_2m_min: [22, 23] },
  };
  const w = Weather.read(j, t, true, t - 3 * 3600000);
  assert.ok(w);
  assert.equal(w.temp, 31);
  assert.equal(w.text, 'Rain');
  assert.equal(w.rain, 'Rain likely this hour');
  assert.deepEqual(w.hours, [31, 29]);
  assert.equal(w.daily.length, 1);
  assert.equal(w.savedNote, 'Offline · forecast from 3 h ago');
  assert.equal(Weather.showRain('Rain in about 30 min'), 'Rain in about 30 min');
});

test('tap feedback', () => {
  const p = memoryPrefs();
  assert.equal(Tap.on(p), false); // off until turned on
  const w = Tap.wav();
  assert.equal(String.fromCharCode(...w.slice(0, 4)), 'RIFF');
  assert.equal(w.length, 44 + Math.round((Tap.RATE * Tap.TICK_MS) / 1000) * 2);
});
