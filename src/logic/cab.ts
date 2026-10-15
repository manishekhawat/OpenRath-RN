/**
 * Tools for cab drivers (port of Cab.java), all behind one switch (Features > Cab driver tools) and
 * each with its own: an earnings log (rides and costs, net per day and week), a fare meter for the
 * passenger, the ride apps one tap away, permit / fitness / badge reminders, a CNG log, pickup
 * hotspots learnt from your own rides, a daily target and duty-hours reminder, one-tap SOS,
 * quiet-ride mode, ride notes, and spoken phrases for passengers. Everything stays on the unit.
 * This file has the sums, fare, hotspots and saved lists; the screens are in app/cab.
 */
import * as Features from './features.ts';
import { compute as fuelCompute, fmt } from './fuel.ts';
import { mapsLink } from './geo.ts';
import { num, type Prefs } from './prefs.ts';

export function on(p: Prefs, id: string): boolean {
  return Features.on(p, 'cab') && Features.on(p, id);
}

// ================================================================== earnings log (pure part)

/** One line of the log: a ride (money in) or a cost (money out). */
export interface Entry {
  t: number;
  ride: boolean;
  rs: number;
  km: number;
  lat: number;
  lon: number;
  app: string;
  pay: string;
  what: string;
}

export interface Sum {
  rides: number;
  in: number;
  out: number;
}

export const net = (s: Sum) => s.in - s.out;

export function entry(e: Partial<Entry>): Entry {
  return { t: 0, ride: false, rs: 0, km: 0, lat: 0, lon: 0, app: '', pay: '', what: '', ...e };
}

export function sum(l: Entry[], from: number, to: number): Sum {
  const s: Sum = { rides: 0, in: 0, out: 0 };
  for (const e of l) {
    if (e.t < from || e.t >= to) continue;
    if (e.ride) {
      s.rides++;
      s.in += e.rs;
    } else s.out += e.rs;
  }
  return s;
}

/** Ride money by app (or by how it was paid), biggest first: [name, ₹]. */
export function by(l: Entry[], from: number, to: number, pay: boolean): [string, number][] {
  const m = new Map<string, number>();
  for (const e of l) {
    if (!e.ride || e.t < from || e.t >= to) continue;
    const k = (pay ? e.pay : e.app) || 'Other';
    m.set(k, (m.get(k) ?? 0) + e.rs);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function dayStart(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of this week. */
export function weekStart(now: number): number {
  const d = new Date(dayStart(now));
  const back = (d.getDay() + 6) % 7; // Monday 0 … Sunday 6
  d.setDate(d.getDate() - back);
  return d.getTime();
}

/** Rupees in Indian grouping, whole: ₹1,23,456. */
export function rs(v: number): string {
  const n = Math.round(v);
  const s = String(Math.abs(n));
  const last = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + '₹' + (rest ? rest + ',' + last : last);
}

export function hm(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number) => String(n).padStart(2, '0');

/** "14 Oct  09:30", as the log's rows. */
export function when(t: number, gap = '  '): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${gap}${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function shortDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function longDate(t: number): string {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

export function isoDay(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

// ================================================================== fare meter (pure part)

export interface Rates {
  base: number;
  baseKm: number;
  perKm: number;
  waitPerMin: number;
  freeWait: number;
  nightPct: number;
}

/** ₹50 for 2 km, ₹16 a km, ₹2 a minute after 5 free, night +25%. */
export const RATES: Rates = { base: 50, baseKm: 2, perKm: 16, waitPerMin: 2, freeWait: 5, nightPct: 25 };

/** The pref key of each rate, with its label on the rates screen. */
export const RATE_KEYS: [keyof Rates, string, string][] = [
  ['base', 'cabBase', 'Base fare (₹)'],
  ['baseKm', 'cabBaseKm', 'Km included in the base fare'],
  ['perKm', 'cabPerKm', '₹ a km after that'],
  ['waitPerMin', 'cabWaitRs', 'Waiting ₹ a minute'],
  ['freeWait', 'cabFreeWait', 'Free waiting minutes'],
  ['nightPct', 'cabNightPct', 'Night charge, 11 pm to 5 am (%)'],
];

/** Base fare covers the first km, then per km; waiting after the free minutes; night adds a share. */
export function fare(r: Rates, km: number, waitMin: number, night: boolean): number {
  let f = r.base + Math.max(0, km - r.baseKm) * r.perKm + Math.max(0, waitMin - r.freeWait) * r.waitPerMin;
  if (night) f *= 1 + r.nightPct / 100;
  return Math.round(f);
}

/** Night charges from 11 pm to 5 am. */
export function night(hour: number): boolean {
  return hour >= 23 || hour < 5;
}

// ================================================================== hotspots (pure part)

/**
 * Where rides came from around this hour (±1 h), in squares of about 1 km: [lat, lon, rides],
 * busiest first, only squares with two rides or more.
 */
export function hotspots(l: Entry[], hourNow: number, max: number): [number, number, number][] {
  const cells = new Map<string, [number, number, number]>();
  for (const e of l) {
    if (!e.ride || (e.lat === 0 && e.lon === 0)) continue;
    const d = Math.abs(new Date(e.t).getHours() - hourNow);
    if (Math.min(d, 24 - d) > 1) continue;
    const k = Math.round(e.lat * 100) + ':' + Math.round(e.lon * 100);
    let v = cells.get(k);
    if (!v) cells.set(k, (v = [0, 0, 0]));
    v[0] += e.lat;
    v[1] += e.lon;
    v[2]++;
  }
  const out: [number, number, number][] = [];
  for (const v of cells.values()) if (v[2] >= 2) out.push([v[0] / v[2], v[1] / v[2], v[2]]);
  out.sort((a, b) => b[2] - a[2]);
  return out.slice(0, max);
}

/** "28.61390, 77.20900" (Rescue.where). */
export function where(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// ================================================================== papers (pure part)

export const PAPERS = ['permit', 'fitness', 'badge', 'tax', 'insurance', 'puc'];
export const PAPER_NAMES = ['Permit', 'Fitness certificate', 'Driver badge', 'Road tax', 'Insurance', 'PUC certificate'];

/** Insurance and PUC share their dates with the service reminders. */
export function paperKey(id: string): string {
  return id === 'insurance' || id === 'puc' ? 'care:' + id + ':due' : 'cab:' + id + ':due';
}

/** Whole days from today to a "yyyy-MM-dd" date (negative = gone by), or null if not set. */
export function daysTo(due: string | null | undefined, now: number): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec((due ?? '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]).getTime();
  return Math.round((dayStart(d) - dayStart(now)) / 86400000);
}

export function dueText(name: string, days: number): string {
  if (days < 0) return name + ' expired ' + (-days === 1 ? 'yesterday' : -days + ' days ago');
  if (days === 0) return name + ' expires today';
  return name + ' expires in ' + days + (days === 1 ? ' day' : ' days');
}

/** The papers due within 15 days (or gone by), as the once-a-day reminder says them. */
export function papersDue(p: Prefs, now: number): string[] {
  const due: string[] = [];
  PAPERS.forEach((id, i) => {
    const d = daysTo(p.str(paperKey(id), ''), now);
    if (d !== null && d <= 15) due.push(dueText(PAPER_NAMES[i], d));
  });
  return due;
}

/** The settings row: the soonest paper and how many are set. */
export function papersSummary(p: Prefs, now: number): string {
  let set = 0;
  let best = Infinity;
  let soonest = '';
  PAPERS.forEach((id, i) => {
    const d = daysTo(p.str(paperKey(id), ''), now);
    if (d === null) return;
    set++;
    if (d < best) {
      best = d;
      soonest = dueText(PAPER_NAMES[i], d);
    }
  });
  return set === 0 ? 'permit, fitness, badge, road tax, insurance, PUC: not set' : soonest + '  (' + set + ' of 6 set)';
}

// ================================================================== phrases

export const LANGS = ['hi', 'en', 'mr', 'kn', 'ta', 'te', 'bn'];
export const LANG_NAMES = ['Hindi', 'English', 'Marathi', 'Kannada', 'Tamil', 'Telugu', 'Bengali'];

/** Each phrase: English, Hindi, Marathi, Kannada, Tamil, Telugu, Bengali (not the order of LANGS). */
export const PHRASES: string[][] = [
  ['Welcome! Please fasten your seat belt.', 'नमस्ते! कृपया सीट बेल्ट लगा लीजिए।', 'नमस्कार! कृपया सीट बेल्ट लावा.',
    'ನಮಸ್ಕಾರ! ದಯವಿಟ್ಟು ಸೀಟ್ ಬೆಲ್ಟ್ ಹಾಕಿಕೊಳ್ಳಿ.', 'வணக்கம்! தயவுசெய்து சீட் பெல்ட் அணியுங்கள்.',
    'నమస్కారం! దయచేసి సీట్ బెల్ట్ పెట్టుకోండి.', 'নমস্কার! দয়া করে সিট বেল্ট লাগিয়ে নিন।'],
  ['Please tell me your OTP.', 'कृपया अपना OTP बताइए।', 'कृपया तुमचा OTP सांगा.', 'ದಯವಿಟ್ಟು ನಿಮ್ಮ OTP ಹೇಳಿ.',
    'தயவுசெய்து உங்கள் OTP-ஐ சொல்லுங்கள்.', 'దయచేసి మీ OTP చెప్పండి.', 'দয়া করে আপনার OTP বলুন।'],
  ['Is the AC temperature all right?', 'AC का तापमान ठीक है?', 'AC चे तापमान ठीक आहे का?', 'AC ತಾಪಮಾನ ಸರಿಯಾಗಿದೆಯೇ?',
    'AC வெப்பநிலை சரியாக உள்ளதா?', 'AC ఉష్ణోగ్రత సరిగ్గా ఉందా?', 'AC-র তাপমাত্রা ঠিক আছে তো?'],
  ['Please close the window, the AC is on.', 'कृपया खिड़की बंद कर दीजिए, AC चल रहा है।', 'कृपया खिडकी बंद करा, AC चालू आहे.',
    'ದಯವಿಟ್ಟು ಕಿಟಕಿ ಮುಚ್ಚಿ, AC ಆನ್ ಆಗಿದೆ.', 'தயவுசெய்து ஜன்னலை மூடுங்கள், AC ஓடுகிறது.',
    'దయచేసి కిటికీ మూసేయండి, AC ఆన్‌లో ఉంది.', 'দয়া করে জানালাটা বন্ধ করুন, AC চলছে।'],
  ['Shall I take the route on the map?', 'क्या मैं मैप वाले रास्ते से चलूँ?', 'मी नकाशातल्या रस्त्याने जाऊ का?',
    'ನಕ್ಷೆಯ ದಾರಿಯಲ್ಲೇ ಹೋಗಲೇ?', 'வரைபடத்தில் உள்ள வழியிலேயே போகலாமா?', 'మ్యాప్‌లోని దారిలోనే వెళ్ళమంటారా?',
    'ম্যাপের রাস্তা দিয়েই যাব?'],
  ['There is traffic ahead, it may take a little longer.', 'आगे ट्रैफ़िक है, थोड़ा ज़्यादा समय लग सकता है।',
    'पुढे ट्रॅफिक आहे, थोडा जास्त वेळ लागू शकतो.', 'ಮುಂದೆ ಟ್ರಾಫಿಕ್ ಇದೆ, ಸ್ವಲ್ಪ ಹೆಚ್ಚು ಸಮಯ ಆಗಬಹುದು.',
    'முன்னால் போக்குவரத்து நெரிசல் உள்ளது, கொஞ்சம் அதிக நேரம் ஆகலாம்.',
    'ముందు ట్రాఫిక్ ఉంది, కొంచెం ఎక్కువ సమయం పట్టవచ్చు.', 'সামনে জ্যাম আছে, একটু বেশি সময় লাগতে পারে।'],
  ['We have reached your destination.', 'आपकी मंज़िल आ गई है।', 'तुमचे ठिकाण आले आहे.', 'ನಿಮ್ಮ ಸ್ಥಳ ಬಂದಿದೆ.',
    'நீங்கள் செல்ல வேண்டிய இடம் வந்துவிட்டது.', 'మీ గమ్యస్థానం వచ్చేసింది.', 'আপনার গন্তব্যে পৌঁছে গেছি।'],
  ['You can pay by cash or UPI.', 'आप नकद या UPI से भुगतान कर सकते हैं।', 'तुम्ही रोख किंवा UPI ने पैसे देऊ शकता.',
    'ನೀವು ನಗದು ಅಥವಾ UPI ಮೂಲಕ ಪಾವತಿಸಬಹುದು.', 'நீங்கள் பணமாகவோ UPI மூலமாகவோ செலுத்தலாம்.',
    'మీరు నగదు లేదా UPI ద్వారా చెల్లించవచ్చు.', 'আপনি নগদ বা UPI-তে টাকা দিতে পারেন।'],
  ['Please check that you have all your belongings.', 'कृपया देख लीजिए, आपका सारा सामान ले लिया है।',
    'कृपया तुमचे सर्व सामान घेतले आहे का ते पाहा.', 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಎಲ್ಲಾ ವಸ್ತುಗಳನ್ನು ತೆಗೆದುಕೊಂಡಿದ್ದೀರಾ ನೋಡಿ.',
    'தயவுசெய்து உங்கள் எல்லா பொருட்களையும் எடுத்துக்கொண்டீர்களா என்று பாருங்கள்.',
    'దయచేసి మీ వస్తువులన్నీ తీసుకున్నారో లేదో చూసుకోండి.', 'দয়া করে দেখে নিন, আপনার সব জিনিস নিয়েছেন তো।'],
  ['Thank you, have a nice day!', 'धन्यवाद, आपका दिन शुभ हो!', 'धन्यवाद, तुमचा दिवस चांगला जावो!',
    'ಧನ್ಯವಾದಗಳು, ನಿಮ್ಮ ದಿನ ಶುಭವಾಗಲಿ!', 'நன்றி, உங்கள் நாள் இனிதாகட்டும்!', 'ధన్యవాదాలు, మీ రోజు శుభంగా గడవాలి!',
    'ধন্যবাদ, আপনার দিন ভালো কাটুক!'],
];

const COLUMN: Record<string, number> = { en: 0, hi: 1, mr: 2, kn: 3, ta: 4, te: 5, bn: 6 };

/** The phrase in a language; English is column 0, then LANGS without English. */
export function phrase(i: number, lang: string): string {
  return PHRASES[i][COLUMN[lang] ?? 1];
}

/** The built-in phrases in a language, then the driver's own ("cabOwnPhrases", one a line). */
export function phraseList(p: Prefs): string[] {
  const lang = p.str('cabLang', 'hi');
  const list = PHRASES.map((_, i) => phrase(i, lang));
  for (const s of p.str('cabOwnPhrases', '').split('\n')) if (s.trim() !== '') list.push(s.trim());
  return list;
}

export function addPhrase(p: Prefs, text: string): void {
  const s = text.replace(/\n/g, ' ').trim();
  if (s === '') return;
  const old = p.str('cabOwnPhrases', '');
  p.put('cabOwnPhrases', old === '' ? s : old + '\n' + s);
}

export function langName(lang: string): string {
  return LANG_NAMES[Math.max(0, LANGS.indexOf(lang))];
}

/** The language of a typed phrase, from its script: "hi", "ta"… or "en". */
export function guess(s: string): string {
  const scripts: [RegExp, string][] = [
    [/[ऀ-ॿ]/, 'hi'], // Devanagari
    [/[ಀ-೿]/, 'kn'],
    [/[஀-௿]/, 'ta'],
    [/[ఀ-౿]/, 'te'],
    [/[ঀ-৿]/, 'bn'],
    [/[઀-૿]/, 'gu'],
    [/[਀-੿]/, 'pa'], // Gurmukhi
    [/[ഀ-ൿ]/, 'ml'],
  ];
  // the first character in a known script decides, as the Java loop did
  for (const ch of s) for (const [re, l] of scripts) if (re.test(ch)) return l;
  return 'en';
}

/** The voice to speak a phrase in: a built-in one in the chosen language, an own one by its script. */
export function voiceFor(text: string, own: boolean, lang: string): string {
  if (own) return guess(text) + '-IN';
  return (lang === 'en' ? 'en' : lang) + '-IN';
}

// ================================================================== ride apps

export const RIDE_APPS: [string, string][] = [
  ['Uber Driver', 'com.ubercab.driver'], ['Ola Driver', 'com.olacabs.oladriver'], ['Rapido Captain', 'com.rapido.rider'],
  ['inDrive', 'sinet.startup.inDriver'], ['Namma Yatri Driver', 'in.juspay.nammayatripartner'],
];
/** Other ride apps, by the name a launcher shows (for when the installed apps can be listed). */
export const RIDE_NAME = /(uber|\bola\b|rapido|indrive|namma ?yatri|yatri sathi|blu ?smart|quick ?ride|jugnoo|meru)/i;

/** The ride apps, the last used first. */
export function rideApps(p: Prefs, apps: [string, string][] = RIDE_APPS): [string, string][] {
  const out = [...apps];
  const i = out.findIndex((a) => a[1] === p.str('cabLastRideApp', ''));
  if (i > 0) out.unshift(...out.splice(i, 1));
  return out;
}

export const playStore = (pkg: string) => 'https://play.google.com/store/apps/details?id=' + pkg;

// ================================================================== state

/**
 * What the Android version kept in memory: the meter's waiting time between saves and the last
 * tick. Quiet ride is a setting here ("cabQuietNow") so every screen sees it.
 */
export const live = { waitMs: -1, lastTick: 0, waitSavedAt: 0 };

export function quiet(p: Prefs): boolean {
  return p.str('cabQuietNow', '') === 'on';
}

export function log(p: Prefs): Entry[] {
  try {
    const a = JSON.parse(p.str('cabLog', '[]'));
    if (!Array.isArray(a)) return [];
    return a.map((o) =>
      entry({
        t: +o.t || 0,
        ride: o.k === 'ride',
        rs: +o.rs || 0,
        km: +o.km || 0,
        lat: +o.la || 0,
        lon: +o.lo || 0,
        app: o.app ?? '',
        pay: o.pay ?? '',
        what: o.w ?? '',
      }),
    );
  } catch {
    return [];
  }
}

/** Saved with the Android version's short keys, so a backup carries over. */
export function save(p: Prefs, l: Entry[]): void {
  const from = Math.max(0, l.length - 3000); // a year or so of rides
  const a = l.slice(from).map((e) => {
    const o: Record<string, unknown> = { t: e.t, k: e.ride ? 'ride' : 'cost', rs: e.rs };
    if (e.km > 0) o.km = e.km;
    if (e.lat !== 0 || e.lon !== 0) {
      o.la = e.lat;
      o.lo = e.lon;
    }
    if (e.app) o.app = e.app;
    if (e.pay) o.pay = e.pay;
    if (e.what) o.w = e.what;
    return o;
  });
  p.put('cabLog', JSON.stringify(a));
}

/** Log a ride; returns the target message when this ride passed the daily target, else null. */
export function addRide(
  p: Prefs, v: { rs: number; km?: number; app: string; pay: string; lat?: number; lon?: number }, now: number,
): string | null {
  const before = sum(log(p), dayStart(now), now + 1);
  save(p, [...log(p), entry({ t: now, ride: true, rs: v.rs, km: v.km ?? 0, app: v.app, pay: v.pay, lat: v.lat ?? 0, lon: v.lon ?? 0 })]);
  startDuty(p, now);
  // the daily target, said once when it is passed
  const target = num(p, 'cabTargetRs', 2000);
  if (on(p, 'cabTarget') && target > 0 && net(before) < target && net(before) + v.rs >= target) {
    return 'Target reached: ' + rs(net(before) + v.rs) + ' today. Well done!';
  }
  return null;
}

export function addCost(p: Prefs, amount: number, what: string, now: number): void {
  save(p, [...log(p), entry({ t: now, rs: amount, what })]);
}

export function removeEntry(p: Prefs, index: number): void {
  save(p, log(p).filter((_, i) => i !== index));
}

/** The text to show for a line of the log. */
export function entryRow(e: Entry): string {
  return when(e.t) + '   ' + (e.ride
    ? '+' + rs(e.rs) + '  ' + e.app + ', ' + e.pay + (e.km > 0 ? ', ' + fmt(e.km) + ' km' : '')
    : '−' + rs(e.rs) + '  ' + e.what);
}

// ================================================================== every second

/** A message to show, and whether to speak it too (not during a quiet ride). */
export interface Note {
  text: string;
  speak: boolean;
}

/**
 * Every second while the app is open: the meter's waiting time while standing or crawling, the
 * duty-hours reminder, and once a day the papers due. `fixAt` is when the GPS last gave a fix.
 */
export function tick(p: Prefs, now: number, kmh: number, fixAt: number): Note[] {
  const out: Note[] = [];
  if (!Features.on(p, 'cab')) return out;
  const dt = live.lastTick === 0 ? 0 : now - live.lastTick;
  live.lastTick = now;
  const fresh = now - fixAt < 10000;
  const speak = !quiet(p);
  // meter: waiting time while standing or crawling
  if (num(p, 'cabMeterAt', 0) > 0 && fresh && kmh < 5 && dt > 0 && dt < 5000) {
    live.waitMs = meterWaitMs(p) + dt;
    if (now - live.waitSavedAt > 15000) {
      live.waitSavedAt = now;
      p.put('cabMeterWait', String(live.waitMs));
    }
  }
  // duty starts with the first drive of the day
  if (on(p, 'cabTarget')) {
    if (fresh && kmh > 10) startDuty(p, now);
    const duty = num(p, 'cabDutyAt', 0);
    const warnH = num(p, 'cabDutyH', 10);
    const h = duty === 0 ? 0 : Math.floor((now - duty) / 3600000);
    if (duty > 0 && warnH > 0 && h >= warnH && h > num(p, 'cabDutyTold', 0)) {
      p.put('cabDutyTold', String(h));
      out.push({ text: "You've been on duty for " + h + ' hours. Time for a proper break.', speak });
    }
  }
  // papers: once a day, anything due within 15 days
  if (on(p, 'cabPapers')) {
    const today = isoDay(now);
    if (today !== p.str('cabPapersDay', '') && now - fixAt < 600000) {
      p.put('cabPapersDay', today);
      const due = papersDue(p, now);
      if (due.length > 0) out.push({ text: due.join('. ') + '.', speak });
    }
  }
  return out;
}

export function startDuty(p: Prefs, now: number): void {
  if (!on(p, 'cabTarget')) return;
  if (num(p, 'cabDutyAt', 0) >= dayStart(now)) return;
  p.put('cabDutyAt', String(now));
  p.put('cabDutyTold', '0');
}

export function onDuty(p: Prefs, now: number): boolean {
  return num(p, 'cabDutyAt', 0) >= dayStart(now);
}

/** Start or end duty from the Cab menu; returns the message for an end. */
export function toggleDuty(p: Prefs, now: number): string | null {
  const d = num(p, 'cabDutyAt', 0);
  if (d >= dayStart(now)) {
    p.put('cabDutyAt', '0');
    // stays ended for today unless started again from here
    p.put('cabDutyEnded', String(now));
    return 'Duty ended after ' + hm(now - d);
  }
  p.put('cabDutyAt', String(now));
  p.put('cabDutyTold', '0');
  return null;
}

// ================================================================== reports

/** The menu's title. */
export function title(p: Prefs, now: number): string {
  const s = sum(log(p), dayStart(now), now + 1);
  return 'Cab  ·  today ' + rs(net(s)) + ' net, ' + s.rides + (s.rides === 1 ? ' ride' : ' rides');
}

export function report(p: Prefs, now: number): string {
  const l = log(p);
  const today = dayStart(now);
  const week = weekStart(now);
  let b = '';
  const spans: [string, number, number][] = [
    ['Today', today, now + 1], ['Yesterday', dayStart(today - 3600000), today],
    ['This week (from Monday)', week, now + 1], ['Last 30 days', today - 29 * 86400000, now + 1],
  ];
  for (const [name, from, to] of spans) {
    const x = sum(l, from, to);
    b += name + ': ' + rs(net(x)) + ' net\n   ' + x.rides + (x.rides === 1 ? ' ride ' : ' rides ') + rs(x.in) + ',  costs ' + rs(x.out) + '\n';
  }
  const apps = by(l, week, now + 1, false);
  const pays = by(l, today, now + 1, true);
  if (apps.length > 0) b += '\nThis week by app: ' + apps.map(([k, v]) => k + ' ' + rs(v)).join(',  ');
  if (pays.length > 0) b += '\nToday by payment: ' + pays.map(([k, v]) => k + ' ' + rs(v)).join(',  ');
  const target = num(p, 'cabTargetRs', 2000);
  if (on(p, 'cabTarget') && target > 0) {
    const n = net(sum(l, today, now + 1));
    b += '\n\nDaily target ' + rs(target) + ': ' + (n >= target ? 'reached' : rs(target - n) + ' to go');
  }
  return b.trim();
}

/** What "how much did I earn" says. */
export function spoken(p: Prefs, now: number): string {
  const s = sum(log(p), dayStart(now), now + 1);
  if (s.rides === 0 && s.out === 0) return 'No rides logged today yet.';
  return 'Today, ' + s.rides + (s.rides === 1 ? ' ride, ' : ' rides, ') + Math.round(s.in) + ' rupees in, ' +
    Math.round(s.out) + ' rupees of costs, ' + Math.round(net(s)) + ' rupees net.';
}

/** Today's net against the target, 0 to 1, for the Cab box's bar; -1 with no target. */
export function targetShare(p: Prefs, now: number): number {
  const target = num(p, 'cabTargetRs', 2000);
  if (!on(p, 'cabTarget') || target <= 0) return -1;
  return Math.max(0, Math.min(1, net(sum(log(p), dayStart(now), now + 1)) / target));
}

// ================================================================== fare meter

export const APPS = ['Uber', 'Ola', 'Rapido', 'inDrive', 'Namma Yatri', 'Street', 'Other'];
export const PAYS = ['Cash', 'UPI', 'In the app'];
export const COSTS = ['Fuel or CNG', 'Toll', 'Parking', 'Food', 'Commission', 'Repair', 'Other'];

function dbl(p: Prefs, k: string, def: number): number {
  const v = parseFloat(p.str(k, String(def)));
  return Number.isFinite(v) ? v : def;
}

export function rates(p: Prefs): Rates {
  const r = { ...RATES };
  for (const [field, key] of RATE_KEYS) r[field] = dbl(p, key, RATES[field]);
  return r;
}

export function ratesText(r: Rates): string {
  return rs(r.base) + ' for ' + fmt(r.baseKm) + ' km, ' + rs(r.perKm) + '/km, waiting ' + rs(r.waitPerMin) + '/min after ' +
    Math.round(r.freeWait) + ' min, night +' + Math.round(r.nightPct) + '%';
}

export const running = (p: Prefs) => num(p, 'cabMeterAt', 0) > 0;

/** Km since the meter started, by the GPS odometer. */
export function meterKm(p: Prefs, odoKm: number): number {
  return Math.max(0, odoKm - dbl(p, 'cabMeterOdo', odoKm));
}

export function meterWaitMs(p: Prefs): number {
  if (live.waitMs < 0) live.waitMs = num(p, 'cabMeterWait', 0);
  return live.waitMs;
}

/** Night rates if the ride started or is now between 11 pm and 5 am. */
export function meterNight(p: Prefs, now: number): boolean {
  return night(new Date(num(p, 'cabMeterAt', now) || now).getHours()) || night(new Date(now).getHours());
}

export function fareNow(p: Prefs, odoKm: number, now: number): number {
  return fare(rates(p), meterKm(p, odoKm), meterWaitMs(p) / 60000, meterNight(p, now));
}

/** Start the meter; quiet ride starts with it unless switched off ("cabQuietWithMeter"). */
export function startMeter(p: Prefs, odoKm: number, lat: number, lon: number, now: number): void {
  p.put('cabMeterAt', String(now));
  p.put('cabMeterOdo', String(odoKm));
  p.put('cabMeterWait', '0');
  p.put('cabMeterLat', String(lat));
  p.put('cabMeterLon', String(lon));
  live.waitMs = 0;
  startDuty(p, now);
  if (on(p, 'cabQuiet') && p.str('cabQuietWithMeter', 'on') === 'on' && !quiet(p)) p.put('cabQuietNow', 'on');
}

/** The meter's lines under the fare, for the passenger. */
export function meterInfo(p: Prefs, odoKm: number, now: number): string {
  const r = rates(p);
  const w = Math.floor(meterWaitMs(p) / 60000);
  return fmt(meterKm(p, odoKm)) + ' km   ·   ' + w + ' min waiting   ·   ' + hm(now - num(p, 'cabMeterAt', 0)) +
    (meterNight(p, now) ? '\nNight charge +' + Math.round(r.nightPct) + '%' : '') +
    '\n' + rs(r.base) + ' for the first ' + fmt(r.baseKm) + ' km, then ' + rs(r.perKm) + ' a km';
}

export interface Stopped {
  fare: number;
  km: number;
  lat: number;
  lon: number;
  said: string;
}

/** Stop the meter: the fare and the ride's details, for logging it and showing the UPI code. */
export function stopMeter(p: Prefs, odoKm: number, now: number): Stopped | null {
  if (!running(p)) return null;
  const f = fareNow(p, odoKm, now);
  const km = meterKm(p, odoKm);
  const w = Math.floor(meterWaitMs(p) / 60000);
  const said = fmt(km) + ' km, ' + w + ' min waiting' + (meterNight(p, now) ? ', night charge' : '');
  const s = { fare: f, km, lat: dbl(p, 'cabMeterLat', 0), lon: dbl(p, 'cabMeterLon', 0), said };
  p.put('cabMeterAt', '0');
  p.put('cabMeterWait', '0');
  live.waitMs = 0;
  if (quiet(p) && p.str('cabQuietWithMeter', 'on') === 'on') p.put('cabQuietNow', '');
  return s;
}

// ================================================================== CNG

export interface CngFill {
  t: number;
  kg: number;
  rs: number;
  odo: number;
}

export function cng(p: Prefs): CngFill[] {
  try {
    const a = JSON.parse(p.str('cabCng', '[]'));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

/** Km per kg between fills (each fill tops the cylinder up): [last, average, ₹ a km]. */
export function cngStats(l: CngFill[]): [number, number, number] {
  const s = fuelCompute(l.map((e) => e.odo), l.map((e) => e.kg), l.map((e) => e.rs), l.map(() => true), l.map((e) => e.t));
  return [s.lastKmpl, s.avgKmpl, s.rupeesPerKm];
}

export function cngHead(l: CngFill[]): string {
  const st = cngStats(l);
  return st[1] > 0 ? 'CNG  ·  ' + fmt(st[1]) + ' km/kg average, ' + fmt(st[0]) + ' last, ₹' + fmt(st[2]) + ' a km'
    : l.length === 0 ? 'No CNG fills yet' : 'CNG  ·  km/kg shows after two fills';
}

export function cngRow(e: CngFill): string {
  return shortDate(e.t) + '   ' + fmt(e.kg) + ' kg   ' + rs(e.rs) + '   ' + Math.round(e.odo) + ' km';
}

/** Add a fill; it is a cost in the earnings too. */
export function addCng(p: Prefs, kg: number, rupees: number, odo: number, now: number): void {
  p.put('cabCng', JSON.stringify([...cng(p), { t: now, kg, rs: Math.max(0, rupees), odo }]));
  if (rupees > 0 && on(p, 'cabEarnings')) addCost(p, rupees, 'CNG', now);
}

/** A map search for CNG stations around here (a geo: link any map app opens). */
export function cngSearch(lat: number, lon: number): string {
  return 'geo:' + (lat === 0 ? '0,0' : `${lat.toFixed(5)},${lon.toFixed(5)}`) + '?q=' + encodeURIComponent('CNG station');
}

// ================================================================== notes and lost items

export interface RideNote {
  t: number;
  text: string;
  photo?: string;
}

export function notesList(p: Prefs): RideNote[] {
  try {
    const a = JSON.parse(p.str('cabNotes', '[]'));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

export function addNote(p: Prefs, text: string, photo: string | null, now: number): void {
  const o: RideNote = { t: now, text };
  if (photo) o.photo = photo;
  p.put('cabNotes', JSON.stringify([...notesList(p), o]));
}

export function deleteNote(p: Prefs, index: number): void {
  p.put('cabNotes', JSON.stringify(notesList(p).filter((_, i) => i !== index)));
}

// ================================================================== SOS

/** SOS contact 1 or 2 ("cabSos1", saved as name|number), or null. */
export function contact(p: Prefs, i: number): [string, string] | null {
  const v = p.str('cabSos' + i, '');
  const bar = v.indexOf('|');
  if (bar < 0 || bar === v.length - 1) return null;
  return [v.substring(0, bar), v.substring(bar + 1)];
}

export function setContact(p: Prefs, i: number, name: string, phone: string): void {
  const n = phone.replace(/[^0-9+]/g, '');
  const nm = name.trim().replace(/\|/g, ' ');
  p.put('cabSos' + i, n === '' ? '' : (nm === '' ? n : nm) + '|' + n);
}

export function contactsText(p: Prefs): string {
  const c1 = contact(p, 1);
  const c2 = contact(p, 2);
  return c1 === null && c2 === null ? 'not set' : (c1 ? c1[0] : '') + (c1 && c2 ? ', ' : '') + (c2 ? c2[0] : '');
}

/** "Papa and Ravi", for the countdown. */
export function sosWho(p: Prefs): string {
  const c1 = contact(p, 1);
  const c2 = contact(p, 2);
  return (c1 ? c1[0] : '') + (c1 && c2 ? ' and ' : '') + (c2 ? c2[0] : '');
}

export function sosText(p: Prefs, lat: number, lon: number, now: number): string {
  const name = p.str('welcome', ''); // Prefs.welcome(); the Android default was the author's own name
  const who = name === '' ? 'your driver' : name;
  const car = p.str('cabVehicle', '');
  const d = new Date(now);
  return 'SOS from ' + who + (car === '' ? '' : ' (' + car + ')') + ': I need help. ' +
    (lat === 0 && lon === 0 ? 'Location not known yet.' : 'I am here: ' + mapsLink(lat, lon)) +
    ' at ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + '.';
}

/** An SMS link to every SOS contact with the text filled in. */
export function sosSms(p: Prefs, text: string): string {
  const to = [contact(p, 1), contact(p, 2)].filter((c): c is [string, string] => c !== null).map((c) => c[1]);
  return 'sms:' + to.join(',') + '?body=' + encodeURIComponent(text);
}

/** The QR a phone scans to send the SOS text to the first contact. */
export function sosQr(p: Prefs, text: string): string {
  const c = contact(p, 1) ?? contact(p, 2);
  return c ? 'SMSTO:' + c[1] + ':' + text : '';
}

// ================================================================== settings

/** Break reminder after 8, 9, 10, 11, 12 hours or never (0), stepping on a tap. */
export function nextDutyH(cur: number): number {
  const steps = [8, 9, 10, 11, 12, 0];
  const i = steps.indexOf(cur);
  return i < 0 ? 10 : steps[(i + 1) % steps.length];
}

/** Quiet ride volume 10% … 50%, stepping on a tap. */
export function nextQuietPct(cur: number): number {
  return cur >= 50 ? 10 : cur + 10;
}
