import * as FaultCodes from './faultcodes.ts';
import { f, t } from './i18n.ts';

/**
 * Answers to "ask the car" voice questions (CarAnswer.java), from the live engine data and the
 * trip: "how much fuel?", "how's the engine?", "any faults?", "how's the battery?", "how far
 * today?". Plain values in, a sentence out, so the tests can check every answer. Engine data
 * needs the OBD-II adapter, which needs native code here, so until then only "how far today"
 * has a real answer and the rest say the adapter isn't connected.
 */

export interface Car {
  connected: boolean;
  /** percent, -1 when the car doesn't report it */
  fuel: number;
  /** °C, -999 when not known */
  coolant: number;
  rpm: number;
  /** stored fault codes, -1 when not read yet */
  faults: number;
  /** the most urgent code's urgency (FaultCodes), -1 for none */
  worst: number;
  /** °C at which the engine counts as hot ('obdHot') */
  hot: number;
  volts: number;
  todayKm: number;
  todaySec: number;
}

/** CarAnswer.Car's starting values: nothing known. */
export function car(over: Partial<Car> = {}): Car {
  return { connected: false, fuel: -1, coolant: -999, rpm: -1, faults: -1, worst: -1, hot: 105, volts: -1, todayKm: 0, todaySec: 0, ...over };
}

const has = (s: string, re: string) => new RegExp(re).test(s);

/** The question's topic from what was heard (already normalised), or null when it isn't a question about the car. */
export function topic(s: string): string | null {
  if (has(s, '(how much (fuel|petrol|diesel)|fuel level|tank level|kitna (petrol|diesel|fuel)|(petrol|diesel|fuel) kitna|कितना पेट्रोल|पेट्रोल कितना|टंकी)')) return 'fuel';
  if (has(s, '(fault|error code|check engine|engine light|कोई खराबी|kharabi|खराबी)')) return 'faults';
  if (has(s, "(how('s| is) the engine|engine (ok|kaisa|kaise|temperature|temp)|engine status|इंजन कैसा|इंजन ठीक|coolant)")) return 'engine';
  if (has(s, "(how('s| is) the battery|battery (ok|kaisi|status|voltage|level)|बैटरी)")) return 'battery';
  if (has(s, '(how far (have i|did i|today)|aaj kitna chal|आज कितना|km today|kilometres today|kilometers today)')) return 'trip';
  return null;
}

/** The spoken answer, already in the chosen language. */
export function answer(topic: string, c: Car): string {
  if (topic === 'trip') return f('Today you have driven %1$s km in %2$s minutes.', c.todayKm.toFixed(1), Math.floor(c.todaySec / 60));
  if (!c.connected) return t("The engine adapter isn't connected, so I can't see the engine.");
  if (topic === 'fuel') {
    if (c.fuel < 0) return t("This car doesn't report its fuel level.");
    return c.fuel <= 15 ? f('Fuel is low, %1$s percent. Time to fill up.', c.fuel) : f('Fuel is at %1$s percent.', c.fuel);
  }
  if (topic === 'battery') {
    if (c.volts <= 0) return t("I can't read the battery voltage.");
    const v = c.volts.toFixed(1);
    if (c.volts < 11.8) return f('The battery is weak, %1$s volts. Get it checked.', v);
    if (c.rpm > 0 && c.volts < 13.2) return f('The battery is %1$s volts with the engine running, which is low; the alternator may not be charging.', v);
    return f('The battery is fine, %1$s volts.', v);
  }
  if (topic === 'faults') {
    if (c.faults < 0) return t("I haven't read the fault codes yet. Open the engine box and tap Read fault codes.");
    if (c.faults === 0) return t('No fault codes are stored.');
    return f('%1$s fault codes are stored. %2$s', c.faults, t(FaultCodes.URGENCY[Math.max(0, c.worst)]));
  }
  // engine
  if (c.coolant > -999 && c.coolant >= c.hot) return f('The engine is hot, %1$s degrees. Stop when it is safe and let it cool.', c.coolant);
  const temp = c.coolant > -999 ? f('Coolant is at %1$s degrees.', c.coolant) : '';
  const faults = c.faults > 0 ? ' ' + f('%1$s fault codes are stored.', c.faults) : '';
  return (t('The engine looks fine.') + ' ' + temp + faults).trim();
}
