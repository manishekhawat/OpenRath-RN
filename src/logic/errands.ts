import { band } from './air.ts';
import { f } from './i18n.ts';

/**
 * Small helpers with no platform types (port of Errands.java): cost split by UPI, paid parking
 * reminder, the start-up summary (spoken, so in English), the fuel leak check and the weekly report.
 */

/** Each person's share in rupees, rounded up to the next rupee. */
export function share(total: number, people: number): number {
  return people <= 0 ? 0 : Math.ceil(total / people - 1e-9);
}

function enc(s: string): string {
  let b = '';
  for (const c of s) {
    if (/^[A-Za-z0-9.\-_@]$/.test(c)) b += c;
    else if (c === ' ') b += '%20';
    else
      for (const x of new TextEncoder().encode(c)) b += '%' + x.toString(16).toUpperCase().padStart(2, '0');
  }
  return b;
}

/** A UPI payment link any UPI app opens with the amount filled in. */
export function upiLink(vpa: string, name: string, amount: number, note: string): string {
  return (
    'upi://pay?pa=' + enc(vpa.trim()) + '&pn=' + enc(name.trim() === '' ? vpa.trim() : name.trim()) +
    '&am=' + amount + '.00&cu=INR&tn=' + enc(note)
  );
}

/** A UPI id looks like name@bank. */
export function validVpa(v: string | null | undefined): boolean {
  return v != null && /^[A-Za-z0-9._-]{2,64}@[A-Za-z][A-Za-z0-9]{1,64}$/.test(v.trim());
}

function utcStamp(t: number): string {
  return new Date(t).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function clock(t: number): string {
  const d = new Date(t);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** A Google Calendar link: an event that ends when the parking does, with a reminder before it. */
export function parkingLink(start: number, minutes: number): string {
  const end = start + minutes * 60000;
  const remind = Math.max(start, end - 10 * 60000);
  return (
    'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + enc('Parking ends') +
    '&dates=' + utcStamp(remind) + '/' + utcStamp(end) + '&details=' + enc('Back to the car by ' + clock(end))
  );
}

export function greeting(d: Date): string {
  const h = d.getHours();
  return h < 5 ? 'Hello' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/**
 * One short paragraph for the first start of the day, from whatever is known; parts that
 * aren't known are left out.
 */
export function summary(
  now: Date, name: string, temp: string, weather: string, rain: string, aqi: number,
  rangeKm: number, care: string, holiday: string,
): string {
  let b = greeting(now);
  if (name) b += ', ' + name;
  b += '.';
  if (temp && temp !== '--') b += " It's " + temp.replace('°', ' degrees') + (weather ? ' and ' + weather.toLowerCase() : '') + '.';
  if (rain) b += ' ' + rain + '.';
  if (aqi > 200) b += ` The air is ${band(aqi).toLowerCase()}, A Q I ${aqi}.`;
  if (rangeKm >= 0) b += ` Petrol for about ${Math.round(rangeKm / 10) * 10} kilometres.`;
  if (care) b += ' ' + care.substring(0, 1) + care.substring(1).toLowerCase() + '.';
  if (holiday) b += ' Coming up: ' + holiday + '.';
  return b;
}

/** Km per litre for each stretch between full tanks, oldest first. */
export function fullTankKmpl(km: number[], litres: number[], full: boolean[]): number[] {
  const out: number[] = [];
  let last = -1;
  let l = 0;
  for (let i = 0; i < km.length; i++) {
    if (last >= 0) l += litres[i];
    if (!full[i]) continue;
    if (last >= 0 && l > 0 && km[i] > km[last]) out.push((km[i] - km[last]) / l);
    last = i;
    l = 0;
  }
  return out;
}

/** A warning when the latest full-tank mileage is under 75% of the usual (median of up to six earlier). */
export function fuelDrop(kmpl: number[]): string | null {
  if (kmpl.length < 4) return null;
  const now = kmpl[kmpl.length - 1];
  const before = kmpl.slice(Math.max(0, kmpl.length - 7), kmpl.length - 1).sort((a, b) => a - b);
  const usual = before[Math.floor(before.length / 2)];
  if (now >= usual * 0.75) return null;
  return (
    `The last tank gave ${now.toFixed(1)} km per litre, well below your usual ${usual.toFixed(1)}. ` +
    "If you didn't drive differently, check for a fuel leak, or that the pump filled what it showed."
  );
}

/** "At the stop ahead you usually wait about 2 and a half minutes." */
export function waitText(sec: number): string {
  if (sec < 90) return 'At the stop ahead you usually wait about a minute.';
  const halves = Math.round(sec / 30);
  const m = Math.floor(halves / 2) + (halves % 2 === 1 ? ' and a half' : '');
  return 'At the stop ahead you usually wait about ' + m + ' minutes.';
}

/** Remind once a drive: dark, moving, and the headlights known to be off (or not known). */
export function lightsReminder(dark: boolean, kmh: number, known: boolean, on: boolean, told: boolean): string | null {
  if (told || !dark || kmh < 20 || (known && on)) return null;
  return known ? "It's dark and your headlights look off. Please switch them on." : "It's getting dark. Remember your headlights.";
}

export function soundProfile(highway: boolean, dark: boolean): 'city' | 'highway' | 'night' {
  return highway ? 'highway' : dark ? 'night' : 'city';
}

const inr = (v: number) => Math.round(v).toLocaleString('en-US');

/** The week's report as lines; empty parts are skipped. */
export function weekly(km: number, seconds: number, fuelRs: number, tollRs: number, score: number, best: string, worst: string): string {
  const lines: string[] = [];
  let first = f('Driven: %1$s km in %2$s h %3$s min', Math.round(km).toFixed(0), Math.floor(seconds / 3600),
    String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'));
  if (km > 0 && seconds > 0) first += f(' (average %1$s km/h)', Math.round(km / (seconds / 3600)).toFixed(0));
  lines.push(first);
  if (fuelRs > 0) lines.push(f('Petrol: ₹%1$s', inr(fuelRs)) + (km > 0 ? f(' (₹%1$s a km)', (fuelRs / km).toFixed(1)) : ''));
  if (tollRs > 0) lines.push(f('Tolls: ₹%1$s', inr(tollRs)));
  if (score >= 0) lines.push(f('Driving score: %1$s out of 100', score));
  if (best) lines.push(f('Best drive: %1$s', best));
  if (worst) lines.push(f('Needs work: %1$s', worst));
  return lines.join('\n');
}

const wifiEsc = (v: string) =>
  v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:').replace(/"/g, '\\"');

/** The text a phone camera reads to join a Wi-Fi network. */
export function wifiQr(ssid: string, password: string): string {
  const s = wifiEsc(ssid);
  return password === '' ? `WIFI:T:nopass;S:${s};;` : `WIFI:T:WPA;S:${s};P:${wifiEsc(password)};;`;
}

/** True between sunset and sunrise at this place (NOAA's approximate formula). Port of Care.dark. */
export function dark(lat: number, lon: number, now: number): boolean {
  const d = new Date(now);
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 1);
  const day = Math.floor((now - startOfYear) / 86400000) + 1;
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
  const g = ((2 * Math.PI) / 365) * (day - 1 + (hour - 12) / 24);
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eqt =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const la = (lat * Math.PI) / 180;
  const cosHa = Math.cos((90.833 * Math.PI) / 180) / (Math.cos(la) * Math.cos(decl)) - Math.tan(la) * Math.tan(decl);
  if (cosHa > 1) return true;
  if (cosHa < -1) return false;
  const ha = (Math.acos(cosHa) * 180) / Math.PI;
  const sunrise = 720 - 4 * (lon + ha) - eqt;
  const sunset = 720 - 4 * (lon - ha) - eqt;
  const m = hour * 60;
  return m < sunrise || m > sunset;
}
