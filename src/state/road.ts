/**
 * The road helpers of the Drive service, fed one GPS fix at a time: the 0–100 timer, learnt speed
 * breakers and waits, the break reminder, monsoon spots, the road ahead (tolls, schools and
 * hospitals, bends in fog) and highway mode. Each speaks through `speak` when its switch in
 * Settings > Features is on, and the dashboard reads what to show from `view`.
 *
 * Plain TypeScript with no React, so the drive engine (engine.ts) keeps one, on screen and behind
 * other apps alike.
 */
import * as Accel from '../logic/accel';
import * as Ahead from '../logic/ahead';
import { waitText } from '../logic/errands';
import * as Features from '../logic/features';
import * as Fog from '../logic/fog';
import { dist } from '../logic/geo';
import * as Highway from '../logic/highway';
import * as Monsoon from '../logic/monsoon';
import { num, type Prefs } from '../logic/prefs';
import * as Rest from '../logic/rest';
import * as Sky from '../logic/sky';
import * as Spots from '../logic/spots';

/** What the dashboard can show about the road. */
export interface RoadView {
  /** a short line about the road ahead ("Toll plaza in 1.4 km"), "" when nothing */
  line: string;
  /** the latest road warning spoken, for a minute or so on the dashboard */
  said: { text: string; at: number } | null;
  /** highway mode is on; `held` messages are waiting for it to end */
  highway: boolean;
  held: number;
  /** minutes at the wheel since the last long stop */
  drivingMin: number;
  /** fog mode now (the weather says fog, or it was switched on by hand); hidden for this drive by a tap */
  fog: boolean;
  fogHidden: boolean;
  fogGuide: number;
  /** the next bend in fog: metres (-1 = none known) and +1 right / -1 left */
  bendM: number;
  bendDir: number;
  /** raining, or rain due within the hour (for monsoon mode) */
  wet: boolean;
  /** the latest finished 0–100 run */
  accel: { t100: number; t60: number; record: boolean; at: number } | null;
  /** when the break reminder last spoke this drive, 0 = not yet */
  restAt: number;
}

export interface RoadFix {
  lat: number;
  lon: number;
  kmh: number;
  /** degrees, -1 when not known (or too slow to tell) */
  heading: number;
  t: number;
}

export const EMPTY: RoadView = {
  line: '',
  said: null,
  highway: false,
  held: 0,
  drivingMin: 0,
  fog: false,
  fogHidden: false,
  fogGuide: 40,
  bendM: -1,
  bendDir: 0,
  wet: false,
  accel: null,
  restAt: 0,
};

const SAVE_MS = 15000;

export class RoadWatch {
  private prefs: Prefs;
  private speak: (text: string) => void;
  private net: Ahead.Fetch;
  private ahead = new Ahead.Ahead();
  private highway = new Highway.Highway();
  private timer = new Accel.Timer();
  private clock = new Rest.DriveClock();
  // learnt from your drives: speed breakers and stops
  private bumps = Spots.breakers();
  private waits = Spots.waits();
  private spotsLoaded = false;
  private savedBumps = '';
  private savedWaits = '';
  private savedAt = 0;
  private spotTold = new Set<string>();
  private floodTold = new Set<string>();
  private driveId = 0;
  private stopStart = -1;
  private stop = { lat: 0, lon: 0, heading: -1 };
  private lastHeading = -1;
  private prevKmh = 0;
  private prevAt = 0;
  private sky = { at: '', checked: 0, wet: false, fog: false };
  private lat = 0;
  private lon = 0;
  view: RoadView = { ...EMPTY };

  constructor(prefs: Prefs, speak: (text: string) => void, net: Ahead.Fetch = Ahead.overpass) {
    this.prefs = prefs;
    this.speak = speak;
    this.net = net;
  }

  /** One GPS fix; returns the new view for the dashboard. */
  feed(f: RoadFix): RoadView {
    const p = this.prefs;
    const now = f.t;
    const kmh = f.kmh;
    const v: RoadView = { ...this.view };
    this.lat = f.lat;
    this.lon = f.lon;

    if (Features.on(p, 'accel')) {
      const t100 = this.timer.feed(kmh, now);
      if (t100 > 0) {
        const r = Accel.done(p, t100, this.timer.result60, now);
        v.accel = { t100, t60: this.timer.result60, record: r.record, at: now };
        this.speak(r.text);
      }
    }
    if (kmh > 8 && this.driveId === 0) this.driveId = now;
    if (f.heading >= 0) this.lastHeading = f.heading;
    // a sharp slow-down: maybe a speed breaker; three drives at the same spot make it one
    if (this.prevAt !== 0 && now - this.prevAt <= 2500 && now - this.prevAt >= 500 && Features.on(p, 'bumps')) {
      const r = (kmh - this.prevKmh) / ((now - this.prevAt) / 1000);
      if (r < -8 && this.prevKmh >= 25 && kmh <= 22 && this.lastHeading >= 0 && this.driveId > 0) {
        this.loadSpots();
        this.bumps.add(f.lat, f.lon, this.lastHeading, this.driveId, 1);
      }
    }
    this.prevKmh = kmh;
    this.prevAt = now;

    if (this.clock.feed(kmh, now)) {
      // a real stop: the break clock starts again, and warnings can be said again
      v.restAt = 0;
      this.floodTold.clear();
      this.ahead.reset();
      this.driveId = 0;
      this.spotTold.clear();
      v.fogHidden = false;
    }
    v.drivingMin = this.clock.minutes(now);
    if (Features.on(p, 'restStop') && Rest.due(p, v.drivingMin, now, v.restAt)) {
      v.restAt = now;
      this.speak(Rest.restText(v.drivingMin));
    }

    this.weather(now);
    v.wet = this.sky.wet;
    const flood = Monsoon.check(p, this.floodTold, this.sky.wet, f.lat, f.lon, f.heading, kmh);
    if (flood) this.tell(v, flood, now);

    // the road ahead: tolls, schools and hospitals, bends in fog
    v.fog = Fog.now(p, this.sky.fog);
    v.fogGuide = Fog.guide(p);
    const said = this.ahead.feed(
      f.lat,
      f.lon,
      f.heading,
      kmh,
      {
        toll: Features.on(p, 'tolls'),
        zones: Features.on(p, 'zones'),
        fog: v.fog,
        tollRate: Features.on(p, 'tolls') ? num(p, 'tollRate', 100) : 0,
      },
      this.net,
      new Date(now),
    );
    for (const s of said) this.tell(v, s, now);
    v.line = Ahead.line(this.ahead.view);
    v.bendM = this.ahead.view.bendM;
    v.bendDir = this.ahead.view.bendDir;

    // highway mode: messages wait while cruising
    if (Features.on(p, 'highway')) {
      const hw = this.highway.feed(kmh, now);
      if (hw !== 0) this.speak(hw > 0 ? Highway.START_TEXT : Highway.endText(this.highway.held));
    } else if (this.highway.on) this.highway.reset();
    v.highway = this.highway.on;
    v.held = this.highway.on ? this.highway.held : 0;

    this.learnt(v, f, now);

    if (now - this.savedAt > SAVE_MS) {
      this.savedAt = now;
      this.saveSpots();
    }
    this.view = v;
    return v;
  }

  /** Say a road warning, and show it on the dashboard for a while. */
  private tell(v: RoadView, text: string, now: number) {
    v.said = { text, at: now };
    this.speak(text);
  }

  /** Rain and fog from the weather box's saved answer, checked once a minute. */
  private weather(now: number) {
    const at = this.prefs.str('wxSavedAt', '');
    if (at === this.sky.at && now - this.sky.checked < 60000) return;
    this.sky.at = at;
    this.sky.checked = now;
    try {
      const body = this.prefs.str('wxSaved', '');
      const r = body ? Sky.now(JSON.parse(body), now, now - Number(at) < 20 * 60000) : { wet: false, fog: false };
      this.sky.wet = r.wet;
      this.sky.fog = r.fog;
    } catch {
      this.sky.wet = this.sky.fog = false;
    }
  }

  private loadSpots() {
    if (this.spotsLoaded) return;
    this.spotsLoaded = true;
    this.savedBumps = this.prefs.str('bumps', '');
    this.savedWaits = this.prefs.str('waits', '');
    this.bumps.load(this.savedBumps);
    this.waits.load(this.savedWaits);
  }

  /** Keep the learnt spots in the settings, as the Android version did ("bumps" and "waits"). */
  saveSpots() {
    if (!this.spotsLoaded) return;
    // forgotten in Settings (or restored from a backup) since the last save: start from that
    if (this.prefs.str('bumps', '') !== this.savedBumps) this.bumps.load((this.savedBumps = this.prefs.str('bumps', '')));
    if (this.prefs.str('waits', '') !== this.savedWaits) this.waits.load((this.savedWaits = this.prefs.str('waits', '')));
    this.savedBumps = this.bumps.save();
    this.savedWaits = this.waits.save();
    this.prefs.put('bumps', this.savedBumps);
    this.prefs.put('waits', this.savedWaits);
  }

  /** Speed breakers and stops learnt from earlier drives: learn more, and warn about the ones ahead. */
  private learnt(v: RoadView, f: RoadFix, now: number) {
    const p = this.prefs;
    // one switch since 1.35 ("Road learning"): speed breakers and waiting times
    const wantBumps = Features.on(p, 'bumps');
    const wantWaits = wantBumps;
    if (!wantBumps) return;
    this.loadSpots();
    const kmh = f.kmh;
    // a stop: how long it lasted, when the car moves on
    if (kmh < 3) {
      if (this.stopStart < 0 && this.driveId > 0) {
        this.stopStart = now;
        this.stop = { lat: f.lat, lon: f.lon, heading: this.lastHeading };
      }
    } else if (kmh > 10 && this.stopStart > 0) {
      const d = now - this.stopStart;
      if (wantWaits && d >= 10000 && d <= 10 * 60000 && dist(this.stop.lat, this.stop.lon, f.lat, f.lon) < 150)
        this.waits.add(this.stop.lat, this.stop.lon, this.stop.heading, this.stopStart, Math.floor(d / 1000));
      this.stopStart = -1;
    }
    if (f.heading < 0) return;
    if (wantBumps && kmh > 25) {
      const b = this.bumps.ahead(f.lat, f.lon, f.heading, 180, Spots.isBreaker);
      if (b && this.once('b' + Spots.id(b))) this.tell(v, 'Speed breaker ahead.', now);
    }
    if (wantWaits && kmh > 15) {
      const hour = new Date(now).getHours();
      const w = this.waits.ahead(f.lat, f.lon, f.heading, 350, Spots.isLongWait(hour));
      if (w && this.once('w' + Spots.id(w))) this.tell(v, waitText(Spots.median(Spots.waitsNear(w, hour))), now);
    }
  }

  private once(id: string): boolean {
    if (this.spotTold.has(id)) return false;
    this.spotTold.add(id);
    return true;
  }

  /** A message came in: true when highway mode holds it back (it is counted and mentioned later). */
  holdMessage(): boolean {
    if (!this.highway.on || !Features.on(this.prefs, 'highway')) return false;
    this.highway.held++;
    this.view = { ...this.view, held: this.highway.held };
    return true;
  }

  /** Mark where the car is as a waterlogging spot; returns the message to show. */
  markFlood(): string {
    return Monsoon.mark(this.prefs, this.lat, this.lon, Date.now());
  }

  /** Tap on the fog screen: hide it for the rest of this drive. */
  hideFog(): RoadView {
    this.view = { ...this.view, fogHidden: true };
    return this.view;
  }
}
