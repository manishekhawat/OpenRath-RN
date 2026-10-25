/// <reference types="node" />
/**
 * The cab driver checks from Tests.java 1.42 (cab()), plus the saved log's format, the meter, SOS,
 * the settings rows and the Hindi of the shown text.
 * Run with `node --test src/logic/__tests__/cab.test.ts`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as cab from '../cab.ts';
import * as earnings from '../cabEarnings.ts';
import * as meter from '../cabMeter.ts';
import * as settings from '../cabSettings.ts';
import * as sos from '../cabSos.ts';
import { setOn } from '../i18n.ts';
import { memoryPrefs } from '../prefs.ts';

test('cab: fare and night', () => {
  const r = cab.RATES; // ₹50 for 2 km, ₹16 a km, ₹2 a minute after 5 free, night +25%
  assert.equal(cab.fare(r, 1.5, 0, false), 50);
  assert.equal(cab.fare(r, 10, 0, false), 178);
  assert.equal(cab.fare(r, 10, 12, false), 192);
  assert.equal(cab.fare(r, 10, 0, true), 223);
  assert.ok(cab.night(23));
  assert.ok(cab.night(4));
  assert.ok(!cab.night(5));
});

function sample(day: number): cab.Entry[] {
  const l: cab.Entry[] = [];
  for (let i = 0; i < 3; i++) {
    l.push(cab.entry({
      t: day + 9 * 3600000 + i * 600000, ride: true, rs: 200 + i * 100, app: i === 2 ? 'Ola' : 'Uber', pay: 'Cash',
      lat: 28.6139 + i * 0.0005, lon: 77.209,
    }));
  }
  l.push(cab.entry({ t: day + 10 * 3600000, rs: 150, what: 'CNG' }));
  l.push(cab.entry({ t: day - 3600000, ride: true, rs: 999 }));
  return l;
}

test('cab: sums, by app, week and hotspots', () => {
  const day = cab.dayStart(Date.now());
  const l = sample(day);
  const s = cab.sum(l, day, day + 86400000);
  assert.equal(s.rides, 3);
  assert.equal(Math.round(s.in), 900);
  assert.equal(Math.round(cab.net(s)), 750);
  assert.equal(cab.by(l, day, day + 86400000, false)[0][0], 'Uber');
  assert.ok(cab.weekStart(day + 3600000) <= day);
  assert.equal(new Date(cab.weekStart(new Date(2026, 9, 18, 12).getTime())).getDate(), 12); // Sunday -> Monday 12th
  const hot = cab.hotspots(l, 9, 3);
  assert.equal(hot.length, 1);
  assert.equal(Math.round(hot[0][2]), 3);
  assert.equal(cab.hotspots(l, 15, 3).length, 0);
});

test('cab: papers', () => {
  const now = new Date(2026, 9, 14, 15, 0).getTime();
  assert.equal(cab.daysTo('2026-10-24', now), 10);
  assert.equal(cab.daysTo('2026-10-12', now), -2);
  assert.equal(cab.daysTo('', now), null);
  assert.equal(cab.dueText('Permit', 10), 'Permit expires in 10 days');
  assert.equal(cab.dueText('PUC certificate', -1), 'PUC certificate expired yesterday');
  assert.equal(cab.paperKey('puc'), 'care:puc:due');
  assert.equal(cab.paperKey('permit'), 'cab:permit:due');
  const p = memoryPrefs({ 'cab:permit:due': '2026-10-24', 'care:puc:due': '2026-12-01' });
  assert.deepEqual(cab.papersDue(p, now), ['Permit expires in 10 days']);
  assert.equal(settings.papersSummary(p, now), 'Permit expires in 10 days  (2 of 6 set)');
  assert.equal(settings.papersSummary(memoryPrefs(), now), 'permit, fitness, badge, road tax, insurance, PUC: not set');
  assert.equal(cab.dueShow('Permit', 1), 'Permit expires in 1 day');
  assert.equal(cab.dueShow('Permit', -3), 'Permit expired 3 days ago');
});

test('cab: phrases', () => {
  assert.equal(cab.phrase(1, 'hi'), 'कृपया अपना OTP बताइए।');
  assert.equal(cab.phrase(6, 'en'), 'We have reached your destination.');
  for (const ph of cab.PHRASES) assert.equal(ph.length, cab.LANGS.length);
  assert.equal(cab.guess('நன்றி'), 'ta');
  assert.equal(cab.guess('धन्यवाद'), 'hi');
  assert.equal(cab.guess('Thank you'), 'en');
  const p = memoryPrefs({ cabLang: 'en' });
  cab.addPhrase(p, 'Mind the step\n');
  assert.equal(cab.phraseList(p).length, cab.PHRASES.length + 1);
  assert.equal(cab.langName('ta'), 'Tamil');
});

test('cab: log keeps the Android keys; target message once', () => {
  const p = memoryPrefs({ 'feat:cab': 'on', cabTargetRs: '500' });
  const now = new Date(2026, 9, 14, 12, 0).getTime();
  assert.equal(cab.addRide(p, { rs: 300, app: 'Uber', pay: 'Cash', lat: 28.6, lon: 77.2 }, now), null);
  const hit = cab.addRide(p, { rs: 250, app: 'Ola', pay: 'UPI' }, now + 1000);
  assert.equal(hit?.text, 'Target reached: ₹550 today. Well done!');
  assert.equal(hit?.shown, 'Target reached: ₹550 today. Well done!');
  assert.equal(cab.addRide(p, { rs: 100, app: 'Ola', pay: 'UPI' }, now + 2000), null);
  cab.addCost(p, 120, 'Toll', now + 3000);
  const saved = JSON.parse(p.str('cabLog', '[]'));
  assert.deepEqual(saved[0], { t: now, k: 'ride', rs: 300, la: 28.6, lo: 77.2, app: 'Uber', pay: 'Cash' });
  assert.deepEqual(saved[3], { t: now + 3000, k: 'cost', rs: 120, w: 'Toll' });
  assert.equal(cab.title(p, now + 5000), 'Cab  ·  today ₹530 net, 3 rides');
  assert.ok(earnings.report(p, now + 5000).startsWith('Today: ₹530 net\n   3 rides ₹650,  costs ₹120'));
  assert.ok(earnings.report(p, now + 5000).endsWith('Daily target ₹500: reached'));
  assert.ok(earnings.report(p, now + 5000).includes('Today by payment: UPI ₹350,  Cash ₹300'));
  assert.equal(earnings.boxFoot(p, now + 5000, 0), 'Target ₹500 reached  ·  on duty 0 min');
  assert.equal(earnings.entryRow(cab.log(p)[3]), '14 Oct  12:00   −₹120  Toll');
  assert.equal(earnings.spoken(p, now + 5000), 'Today, 3 rides, 650 rupees in, 120 rupees of costs, 530 rupees net.');
  assert.ok(cab.onDuty(p, now), 'a ride starts duty');
  cab.removeEntry(p, 3);
  assert.equal(cab.log(p).length, 3);
});

test('cab: rupees and hours', () => {
  assert.equal(cab.rs(1234567.4), '₹12,34,567');
  assert.equal(cab.rs(999), '₹999');
  assert.equal(cab.rs(1000), '₹1,000');
  assert.equal(cab.hm(45 * 60000), '45 min');
  assert.equal(cab.hm(125 * 60000), '2 h 5 min');
  // the day the earnings log is kept under, and the dates on its rows
  const at = new Date(2026, 9, 14, 9, 5).getTime();
  assert.equal(cab.isoDay(at), '2026-10-14');
  assert.equal(cab.isoDay(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
  assert.equal(cab.shortDate(at), '14 Oct');
  assert.equal(cab.longDate(at), '14 Oct 2026, 09:05');
});

test('cab: meter waits while standing and stops with the fare', () => {
  const p = memoryPrefs({ 'feat:cab': 'on' });
  const t0 = new Date(2026, 9, 14, 12, 0).getTime();
  cab.live.lastTick = 0;
  meter.startMeter(p, 100, 28.6, 77.2, t0);
  assert.ok(meter.running(p));
  assert.ok(cab.quiet(p), 'quiet ride starts with the meter');
  // eight minutes standing, one tick a second (the first only starts the clock)
  for (let s = 0; s <= 480; s++) cab.tick(p, t0 + s * 1000, 0, t0 + s * 1000);
  assert.equal(Math.round(meter.meterWaitMs(p) / 60000), 8);
  assert.equal(meter.fareNow(p, 110, t0 + 480000), 50 + 8 * 16 + 3 * 2);
  assert.equal(earnings.boxFoot(p, t0 + 480000, 110), 'Quiet ride  ·  Meter ₹184  ·  10.0 km  ·  8 min waiting');
  assert.ok(meter.meterInfo(p, 110, t0 + 480000).startsWith('10.0 km   ·   8 min waiting   ·   8 min\n₹50 for the first 2.0 km'));
  const s = meter.stopMeter(p, 110, t0 + 480000);
  assert.ok(s);
  assert.equal(s.fare, 184);
  assert.equal(s.said, '10.0 km, 8 min waiting');
  assert.equal(s.lat, 28.6);
  assert.ok(!meter.running(p));
  assert.ok(!cab.quiet(p));
});

test('cab: duty reminder and papers once a day', () => {
  const p = memoryPrefs({ 'feat:cab': 'on', cabDutyH: '10', 'cab:badge:due': '2026-10-20' });
  const t0 = new Date(2026, 9, 14, 6, 0).getTime();
  cab.live.lastTick = 0;
  const first = cab.tick(p, t0, 30, t0);
  assert.deepEqual(first.map((n) => n.text), ['Driver badge expires in 6 days.']);
  assert.deepEqual(first.map((n) => n.shown), ['Driver badge expires in 6 days.']);
  assert.equal(cab.tick(p, t0 + 1000, 30, t0 + 1000).length, 0);
  const later = cab.tick(p, t0 + 10 * 3600000 + 5000, 30, t0 + 10 * 3600000 + 5000);
  assert.equal(later[0].text, "You've been on duty for 10 hours. Time for a proper break.");
  assert.equal(cab.toggleDuty(p, t0 + 11 * 3600000), 'Duty ended after 11 h 0 min');
  assert.equal(settings.nextDutyH(12), 0);
  assert.equal(settings.nextDutyH(0), 8);
  assert.equal(settings.nextQuietPct(50), 10);
  assert.equal(settings.ratesText(meter.rates(p)), '₹50 for 2.0 km, ₹16/km, waiting ₹2/min after 5 min, night +25%');
});

test('cab: CNG and SOS', () => {
  const p = memoryPrefs({ 'feat:cab': 'on' });
  cab.addCng(p, 8, 640, 1000, 1);
  cab.addCng(p, 6, 480, 1150, 2);
  const st = cab.cngStats(cab.cng(p));
  assert.equal(st[0], 25);
  assert.equal(cab.cngHead(cab.cng(p)), 'CNG  ·  25.0 km/kg average, 25.0 last, ₹3.2 a km');
  assert.equal(cab.log(p).length, 2, 'fills are costs too');
  assert.equal(sos.contact(p, 1), null);
  assert.equal(settings.contactsText(p), 'not set');
  sos.setContact(p, 1, 'Papa', '+91 98765-43210');
  sos.setContact(p, 2, '', '9123456789');
  assert.deepEqual(sos.contact(p, 1), ['Papa', '+919876543210']);
  assert.equal(sos.sosWho(p), 'Papa and 9123456789');
  assert.equal(settings.contactsText(p), 'Papa, 9123456789');
  p.put('welcome', 'Ravi');
  p.put('cabVehicle', 'DL 1R AB 1234');
  const t = new Date(2026, 9, 14, 21, 5).getTime();
  assert.equal(sos.sosText(p, 28.6139, 77.209, t),
    'SOS from Ravi (DL 1R AB 1234): I need help. I am here: https://www.google.com/maps/search/?api=1&query=28.61390,77.20900 at 21:05, 14 Oct.');
  assert.ok(sos.sosText(p, 0, 0, t).includes('Location not known yet.'));
  assert.ok(sos.sosSms(p, 'x').startsWith('sms:+919876543210,9123456789?body=x'));
  assert.equal(sos.sosQr(p, 'help'), 'SMSTO:+919876543210:help');
});

test('cab: ride apps, last used first', () => {
  const p = memoryPrefs({ cabLastRideApp: 'com.rapido.rider' });
  assert.equal(cab.rideApps(p)[0][0], 'Rapido Captain');
  assert.equal(cab.rideApps(p).length, 5);
  assert.ok(cab.RIDE_NAME.test('Namma Yatri Partner'));
  assert.ok(!cab.RIDE_NAME.test('Bolero'));
});

test('cab: shown text in Hindi, spoken text in English', () => {
  setOn(true);
  try {
    const p = memoryPrefs({ 'feat:cab': 'on', cabTargetRs: '500', cabDutyH: '10' });
    const now = new Date(2026, 9, 14, 12, 0).getTime();
    assert.equal(cab.title(p, now), 'कैब  ·  आज ₹0 शुद्ध, 0 सवारियाँ');
    const hit = cab.addRide(p, { rs: 600, app: 'Uber', pay: 'Cash' }, now);
    assert.equal(hit?.text, 'Target reached: ₹600 today. Well done!');
    assert.notEqual(hit?.shown, hit?.text);
    assert.equal(cab.title(p, now + 1000), 'कैब  ·  आज ₹600 शुद्ध, 1 सवारी');
    assert.equal(cab.hm(45 * 60000), '45 मिनट');
    assert.equal(earnings.spoken(p, now + 1000), 'Today, 1 ride, 600 rupees in, 0 rupees of costs, 600 rupees net.');
    assert.ok(!earnings.entryRow(cab.log(p)[0]).includes('Cash'), 'the payment is shown in Hindi');
    assert.equal(cab.dueText('Permit', 10), 'Permit expires in 10 days');
    assert.notEqual(cab.dueShow('Permit', 10), 'Permit expires in 10 days');
    assert.equal(sos.sosText(p, 0, 0, now).startsWith('SOS from your driver'), true, 'the SOS text stays English');
  } finally {
    setOn(false);
  }
});
