/**
 * The soundboard box's sounds (Soundboard.java): six pads of fun sounds (horn, fart, applause and
 * others) for when parked with friends. The sounds are made in code, so no recordings ship with
 * the app: the same 16-bit mono samples as the Android version (its java.util.Random included, so
 * they sound the same), wrapped as WAV files for expo-audio. Pads stay quiet while the car moves,
 * so they can't distract the driver; SoundboardBox plays them.
 */

export const RATE = 22050;
export const PADS = ['Horn', 'Fart', 'Applause', 'Ba-dum-tss', 'Bell', 'Wrong answer'];

/** Above this speed the pads don't play. */
export const PARKED_KMH = 5;

/** Whether a pad may play at this speed. */
export function canPlay(kmh: number): boolean {
  return !(kmh > PARKED_KMH);
}

// ------------------------------------------------------------------ java.util.Random

const M_HI = 0x5de;
const M_LO = 0xece66d;
const TWO24 = 16777216;

/** Java's java.util.Random (a 48-bit LCG), kept in two 24-bit halves so plain numbers stay exact. */
export class JavaRandom {
  private hi: number;
  private lo: number;
  private nextGauss: number | null = null;

  constructor(seed: number) {
    // (seed ^ 0x5DEECE66D) & (2^48 - 1), for small seeds
    this.lo = (seed & 0xffffff) ^ M_LO;
    this.hi = (Math.floor(seed / TWO24) & 0xffffff) ^ M_HI;
  }

  /** The top `bits` bits of the next seed (Random.next). */
  next(bits: number): number {
    const { hi, lo } = this;
    const l = lo * M_LO + 0xb;
    this.lo = l % TWO24;
    this.hi = (hi * M_LO + lo * M_HI + Math.floor(l / TWO24)) % TWO24;
    const v = Math.floor((this.hi * TWO24 + this.lo) / 2 ** (48 - bits));
    return bits === 32 ? v | 0 : v;
  }

  nextInt(bound: number): number {
    if ((bound & -bound) === bound) return Math.floor((bound * this.next(31)) / 2147483648);
    let r = this.next(31);
    const m = bound - 1;
    for (let u = r; ((u - (r = u % bound) + m) | 0) < 0; u = this.next(31));
    return r;
  }

  nextDouble(): number {
    return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
  }

  nextGaussian(): number {
    if (this.nextGauss != null) {
      const g = this.nextGauss;
      this.nextGauss = null;
      return g;
    }
    let v1: number;
    let v2: number;
    let s: number;
    do {
      v1 = 2 * this.nextDouble() - 1;
      v2 = 2 * this.nextDouble() - 1;
      s = v1 * v1 + v2 * v2;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.nextGauss = v2 * mul;
    return v1 * mul;
  }
}

// ------------------------------------------------------------------ the sounds

/** A fade in over `fadeIn` and out over `out` (shares of the sound), so it doesn't click. */
function env(i: number, n: number, fadeIn: number, out: number): number {
  const t = i / n;
  return Math.min(1, Math.min(t / fadeIn, (1 - t) / out));
}

const clip = (v: number) => Math.max(-1, Math.min(1, v));
/** Java's (short) cast of a double in range. */
const short = (v: number) => Math.trunc(v);
const TAU = 2 * Math.PI;

/** The sound for pad i as 16-bit mono samples at RATE. */
export function make(pad: number): Int16Array {
  const r = new JavaRandom(41 + pad);
  switch (pad) {
    case 0: {
      // two-tone car horn
      const n = Math.trunc(RATE * 0.9);
      const s = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const v = Math.sign(Math.sin(TAU * 420 * t)) * 0.5 + Math.sign(Math.sin(TAU * 500 * t)) * 0.5;
        s[i] = short(v * env(i, n, 0.02, 0.05) * 9000);
      }
      return s;
    }
    case 1: {
      // a low, wobbling buzz that falls away
      const n = Math.trunc(RATE * 0.8);
      const s = new Int16Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const f = 95 - 45 * t + 12 * Math.sin(TAU * 7 * t * 3) + r.nextGaussian() * 6;
        ph += (TAU * Math.max(30, f)) / RATE;
        let v = (ph % TAU) / Math.PI - 1; // sawtooth
        v = v * 0.8 + r.nextGaussian() * 0.12;
        s[i] = short(clip(v) * env(i, n, 0.03, 0.25) * 14000);
      }
      return s;
    }
    case 2: {
      // applause: many short claps of noise
      const n = RATE * 2;
      const d = new Float64Array(n);
      for (let c = 0; c < 140; c++) {
        const at = r.nextInt(n - 2000);
        const g = 0.3 + r.nextDouble() * 0.7;
        for (let k = 0; k < 1500; k++) d[at + k] += r.nextGaussian() * g * Math.exp(-k / 220.0);
      }
      const s = new Int16Array(n);
      for (let i = 0; i < n; i++) s[i] = short(clip(d[i] * 0.35) * env(i, n, 0.1, 0.3) * 16000);
      return s;
    }
    case 3: {
      // two drum hits and a cymbal
      const n = Math.trunc(RATE * 1.4);
      const d = new Float64Array(n);
      const at = [0, Math.trunc(RATE * 0.18), Math.trunc(RATE * 0.42)];
      for (let h = 0; h < 3; h++) {
        for (let k = 0; at[h] + k < n; k++) {
          const t = k / RATE;
          if (h < 2) {
            if (k > RATE * 0.2) break;
            d[at[h] + k] += (Math.sin(TAU * (h === 0 ? 110 : 150) * t) * 0.8 + r.nextGaussian() * 0.35) * Math.exp(-t * 22);
          } else {
            d[at[h] + k] += r.nextGaussian() * 0.45 * Math.exp(-t * 3.2);
          }
        }
      }
      const s = new Int16Array(n);
      for (let i = 0; i < n; i++) s[i] = short(clip(d[i]) * Math.min(1, i / 60.0) * 16000);
      return s;
    }
    case 4: {
      // a bell
      const n = Math.trunc(RATE * 1.6);
      const s = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const v = Math.sin(TAU * 880 * t) * 0.6 + Math.sin(TAU * 1760 * t) * 0.25 + Math.sin(TAU * 2640 * t) * 0.15;
        s[i] = short(v * Math.exp(-t * 2.5) * 14000);
      }
      return s;
    }
    default: {
      // a quiz-show buzzer
      const n = Math.trunc(RATE * 0.7);
      const s = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const v = Math.sign(Math.sin(TAU * 140 * t)) * 0.7 + Math.sign(Math.sin(TAU * 147 * t)) * 0.3;
        s[i] = short(v * env(i, n, 0.01, 0.05) * 8000);
      }
      return s;
    }
  }
}

/** The samples as a WAV file (16-bit PCM, mono, RATE), for the player. */
export function wav(samples: Int16Array, rate = RATE): Uint8Array {
  const data = samples.length * 2;
  const out = new Uint8Array(44 + data);
  const v = new DataView(out.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < 4; i++) out[at + i] = s.charCodeAt(i);
  };
  tag(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  tag(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, samples[i], true);
  return out;
}
