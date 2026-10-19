/**
 * Tools for cab drivers (port of Cab.java), all behind one switch (Features > Cab driver tools) and
 * each with its own: an earnings log (rides and costs, net per day and week), a fare meter for the
 * passenger, the ride apps one tap away, permit / fitness / badge reminders, a CNG log, pickup
 * hotspots learnt from your own rides, a daily target and duty-hours reminder, one-tap SOS,
 * quiet-ride mode, ride notes, and spoken phrases for passengers. Everything stays on the unit.
 * This file has the log and its sums, the fare sum, hotspots, papers, phrases, CNG and notes, and
 * the once-a-second tick; as in 1.42 the earnings report (cabEarnings.ts), the fare meter
 * (cabMeter.ts), SOS (cabSos.ts) and the settings rows (cabSettings.ts) are files of their own.
 * The screens are in app/cab. Shown text goes through t()/f(); spoken text stays English.
 */
import * as Features from './features.ts';
import { compute as fuelCompute, fmt } from './fuel.ts';
import { f, t } from './i18n.ts';
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
  return m < 60 ? f('%1$s min', m) : f('%1$s h %2$s min', Math.floor(m / 60), m % 60);
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const two = (n: number) => String(n).padStart(2, '0');

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

/** A line of the hotspot list; `farKm` is null while the GPS has no fix. */
export function hotspotRow(s: [number, number, number], hour: number, farKm: number | null): string {
  const far = farKm === null ? '' : f('%1$s km away  ·  ', farKm.toFixed(1));
  return far + f('%1$s rides around %2$s:00   (%3$s)', Math.round(s[2]), hour, where(s[0], s[1]));
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

/** dueText() for the screen, in the owner's language (dueText itself is also spoken). */
export function dueShow(name: string, days: number): string {
  const n = t(name);
  if (days < 0) return -days === 1 ? f('%1$s expired yesterday', n) : f('%1$s expired %2$s days ago', n, -days);
  if (days === 0) return f('%1$s expires today', n);
  return days === 1 ? f('%1$s expires in 1 day', n) : f('%1$s expires in %2$s days', n, days);
}

/** The papers due within 15 days (or gone by), as the once-a-day reminder says them (or shows them). */
export function papersDue(p: Prefs, now: number, show = false): string[] {
  const due: string[] = [];
  PAPERS.forEach((id, i) => {
    const d = daysTo(p.str(paperKey(id), ''), now);
    if (d !== null && d <= 15) due.push(show ? dueShow(PAPER_NAMES[i], d) : dueText(PAPER_NAMES[i], d));
  });
  return due;
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

/** The language's name, shown in the owner's language. */
export function langName(lang: string): string {
  return t(LANG_NAMES[Math.max(0, LANGS.indexOf(lang))]);
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

/**
 * Passenger in or out; returns the message to show. The Android version also turned the music
 * down to "cabQuietPct" of full and back, which needs the unit's system volume.
 */
export function setQuiet(p: Prefs, yes: boolean): string {
  p.put('cabQuietNow', yes ? 'on' : '');
  return t(yes ? 'Quiet ride: music down, messages not read aloud' : 'Quiet ride ended');
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

/**
 * A message from the cab tools: `text` is the English that is spoken (only when `speak`, which is
 * false during a quiet ride), `shown` the same in the owner's language for the screen.
 */
export interface Note {
  text: string;
  shown: string;
  speak: boolean;
}

/** Log a ride; returns the target message when this ride passed the daily target, else null. */
export function addRide(
  p: Prefs, v: { rs: number; km?: number; app: string; pay: string; lat?: number; lon?: number }, now: number,
): Note | null {
  const before = sum(log(p), dayStart(now), now + 1);
  save(p, [...log(p), entry({ t: now, ride: true, rs: v.rs, km: v.km ?? 0, app: v.app, pay: v.pay, lat: v.lat ?? 0, lon: v.lon ?? 0 })]);
  startDuty(p, now);
  // the daily target, said once when it is passed
  const target = num(p, 'cabTargetRs', 2000);
  if (on(p, 'cabTarget') && target > 0 && net(before) < target && net(before) + v.rs >= target) {
    const total = rs(net(before) + v.rs);
    return { text: 'Target reached: ' + total + ' today. Well done!', shown: f('Target reached: %1$s today. Well done!', total), speak: !quiet(p) };
  }
  return null;
}

export function addCost(p: Prefs, amount: number, what: string, now: number): void {
  save(p, [...log(p), entry({ t: now, rs: amount, what })]);
}

export function removeEntry(p: Prefs, index: number): void {
  save(p, log(p).filter((_, i) => i !== index));
}

// ================================================================== every second

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
    if (live.waitMs < 0) live.waitMs = num(p, 'cabMeterWait', 0);
    live.waitMs += dt;
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
      out.push({
        text: "You've been on duty for " + h + ' hours. Time for a proper break.',
        shown: f("You've been on duty for %1$s hours. Time for a proper break.", h),
        speak,
      });
    }
  }
  // papers: once a day, anything due within 15 days
  if (on(p, 'cabPapers')) {
    const today = isoDay(now);
    if (today !== p.str('cabPapersDay', '') && now - fixAt < 600000) {
      p.put('cabPapersDay', today);
      const due = papersDue(p, now);
      if (due.length > 0) out.push({ text: due.join('. ') + '.', shown: papersDue(p, now, true).join('. ') + '.', speak });
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
    return f('Duty ended after %1$s', hm(now - d));
  }
  p.put('cabDutyAt', String(now));
  p.put('cabDutyTold', '0');
  return null;
}

// ================================================================== the menu

/** The menu's title. */
export function title(p: Prefs, now: number): string {
  const s = sum(log(p), dayStart(now), now + 1);
  return s.rides === 1 ? f('Cab  ·  today %1$s net, 1 ride', rs(net(s))) : f('Cab  ·  today %1$s net, %2$s rides', rs(net(s)), s.rides);
}

/** Today's net against the target, 0 to 1, for the Cab box's bar; -1 with no target. */
export function targetShare(p: Prefs, now: number): number {
  const target = num(p, 'cabTargetRs', 2000);
  if (!on(p, 'cabTarget') || target <= 0) return -1;
  return Math.max(0, Math.min(1, net(sum(log(p), dayStart(now), now + 1)) / target));
}

/** A list of English words, each in the owner's language, for a list of choices. */
export function tr(en: string[]): string[] {
  return en.map((s) => t(s));
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
  return st[1] > 0 ? f('CNG  ·  %1$s km/kg average, %2$s last, ₹%3$s a km', fmt(st[1]), fmt(st[0]), fmt(st[2]))
    : t(l.length === 0 ? 'No CNG fills yet' : 'CNG  ·  km/kg shows after two fills');
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

