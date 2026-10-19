/**
 * Settings (SettingsView, SettingsRows and the rows of Extras in the Android version, 1.42): the
 * sections down the left, that section's settings on the right (one after the other on a narrow
 * screen). Each section starts with its feature switches under "Turn on or off", then its groups
 * under small headings; each row shows its state on the right and its explanation in grey. A search
 * box finds any setting, and "Recently used" keeps the last four changed. Only the switches of the
 * owner's level show (all of them in developer mode: seven taps on Version), and only rows this
 * version can do: steering-wheel buttons, OBD, tyre sensors, the LED strip, the FM tuner, the
 * equalizer, managed settings, app updates and widgets need native Android code and are left out.
 * With valet mode on, the owner's PIN is asked for in front of the whole group (_layout.tsx).
 */
import Constants from 'expo-constants';
import * as IntentLauncher from 'expo-intent-launcher';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LAYOUTS } from '../../components/LayoutView';
import { Button, Field, PickList, Row, toast } from '../../components/ui';
import * as Car from '../../logic/car';
import * as Car3D from '../../logic/car3d';
import * as Care from '../../logic/care';
import * as ChildLock from '../../logic/childlock';
import * as Chores from '../../logic/chores';
import * as Dashcam from '../../logic/dashcam';
import * as Features from '../../logic/features';
import * as Fuel from '../../logic/fuel';
import * as Holidays from '../../logic/holidays';
import { f, hindi, lang, load as loadLanguage, t } from '../../logic/i18n';
import * as Layouts from '../../logic/layouts';
import * as Motion from '../../logic/motion';
import * as News from '../../logic/news';
import { num, type Prefs } from '../../logic/prefs';
import * as Profiles from '../../logic/profiles';
import * as Reports from '../../logic/reports';
import * as S from '../../logic/settings';
import * as Trip from '../../logic/trip';
import * as Units from '../../logic/units';
import * as Valet from '../../logic/valet';
import * as Cam from '../../state/camera';
import { useDrive } from '../../state/drive';
import { themeName, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { getVoice } from '../../state/speech';

const VERSION = Constants.expoConfig?.version ?? '1.42';

/** A question with a typed answer: what it asks, and what to do with the answer (an error to show, or nothing). */
interface Ask {
  title: string;
  value: string;
  numeric?: boolean;
  secret?: boolean;
  placeholder?: string;
  save: (v: string) => string | void;
}

interface Pick {
  title: string;
  options: string[];
  picked: number;
  onPick: (i: number) => void;
}

const capital = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** An app chosen by package name ('app:' + key), as the apps can't be listed. */
function appName(p: Prefs, key: string): string {
  const v = p.str('app:' + key, '');
  return v === '' ? 'not chosen' : v;
}

export default function Settings() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { trip } = useDrive();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ section?: string }>();
  const wide = width >= 760;
  const [chosen, setChosen] = useState<string>(params.section ?? '');
  const [q, setQ] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [answer, setAnswer] = useState('');
  const [pick, setPick] = useState<Pick | null>(null);
  const taps = useRef({ n: 0, at: 0 });

  const askText = (a: Ask) => {
    setAnswer(a.value);
    setAsk(a);
  };
  const choose = (title: string, options: string[], picked: number, onPick: (i: number) => void) => setPick({ title, options, picked, onPick });
  const askPackage = (key: string, name: string) =>
    askText({
      title: f('Choose the app for %1$s', t(name)),
      value: prefs.str('app:' + key, ''),
      placeholder: 'Package name, e.g. com.example.app',
      save: (v) => prefs.put('app:' + key, v),
    });

  const versionTapped = () => {
    if (Features.dev(prefs)) return toast('Developer mode is already on');
    const now = Date.now();
    taps.current.n = now - taps.current.at > 3000 ? 1 : taps.current.n + 1;
    taps.current.at = now;
    if (taps.current.n >= 7) {
      prefs.put('devMode', 'on');
      toast('Developer mode is on: every switch, diagnostics and tests are in Settings', true);
    } else if (taps.current.n >= 3) toast(f('%1$s more taps for developer mode', String(7 - taps.current.n)));
  };

  const valetRow = () => {
    if (Valet.on(prefs)) {
      prefs.put('valet', 'off');
      return toast('Valet mode is off');
    }
    if (Valet.pin(prefs).length < 4) return askPin(true);
    prefs.put('valet', 'on');
    Alert.alert(t(Valet.onText(prefs)));
  };
  const askPin = (thenOn: boolean) =>
    askText({
      title: 'Choose a 4-digit PIN for valet mode',
      value: '',
      numeric: true,
      secret: true,
      save: (v) => {
        if (!Valet.validPin(v)) return 'Use 4 to 8 digits';
        prefs.put('valetPin', v);
        if (thenOn) {
          prefs.put('valet', 'on');
          Alert.alert(t(Valet.onText(prefs)));
        }
        return;
      },
    });

  // ------------------------------------------------------------------ the rows, by group, in 1.42's order
  const rows: S.Row[] = [];
  const add = (group: string, title: string, value: string | null, action: (() => void) | string, when = true) => {
    if (!when) return;
    rows.push(typeof action === 'string' ? { group, title, value, route: action } : { group, title, value, action });
  };
  const fuel = Car.fuel(prefs);
  const on = (id: string) => Features.on(prefs, id);

  // ---- Level
  const lv = Features.level(prefs);
  add('Level', 'OpenRath level', t(Features.LEVEL_NAMES[lv]) + ': ' + t(Features.LEVEL_ABOUT[lv]), '/settings/level');
  add('Level', 'Language', hindi() ? 'हिन्दी' : 'English', () => {
    prefs.put('lang', lang(prefs) === 'hi' ? 'en' : 'hi');
    loadLanguage(prefs);
  });
  add('Level', 'Features', f('%1$s of %2$s on', String(Features.ALL.filter((x) => Features.on(prefs, x.id)).length), String(Features.ALL.length)), '/settings/features');
  add('Level', 'Developer mode', 'on: every switch, diagnostics and tests. Tap to turn off', () => {
    prefs.put('devMode', 'off');
    taps.current.n = 0;
    toast('Developer mode is off');
  }, Features.dev(prefs));

  // ---- Dashboard
  const mph = Units.mph(prefs);
  const fahr = Units.fahrenheit(prefs);
  add('Dashboard', 'Units', `${mph ? 'mph' : 'km/h'}, ${fahr ? '°F' : '°C'}`, () => {
    const vals = [['kmh', 'c'], ['mph', 'f'], ['kmh', 'f'], ['mph', 'c']];
    choose('Units for speed and temperature', ['km/h and °C', 'mph and °F', 'km/h and °F', 'mph and °C'], vals.findIndex((v) => v[0] === (mph ? 'mph' : 'kmh') && v[1] === (fahr ? 'f' : 'c')), (i) => {
      prefs.put('speedUnit', vals[i][0]);
      prefs.put('tempUnit', vals[i][1]);
    });
  });
  const motion = Motion.level(prefs);
  add('Dashboard', 'Less movement', t(Motion.NAMES[Motion.LEVELS.indexOf(motion)]), () =>
    choose('Animations', Motion.NAMES, Motion.LEVELS.indexOf(motion), (i) => prefs.put('motion', Motion.LEVELS[i])),
  );
  const topic = prefs.str('newsTopic', 'top');
  add('Dashboard', 'News box shows', News.topicName(topic), () => News.setTopic(prefs, News.TOPICS[(News.TOPICS.indexOf(topic) + 1) % News.TOPICS.length]), on('news'));
  const owner = Layouts.owner(prefs);
  add('Dashboard', 'Your name', owner === '' ? 'hidden' : owner, () =>
    askText({ title: 'Your name, on the home screen (empty to hide)', value: owner, save: (v) => Layouts.saveOwner(prefs, v) }),
  );
  const saverMin = num(prefs, 'saverMin', 5);
  add('Dashboard', 'Clock screensaver after', on('saver') ? f('%1$s min idle while parked', saverMin) : 'off (switch above)', () => {
    const steps = [1, 2, 5, 10, 20];
    prefs.put('saverMin', String(steps[(Math.max(0, steps.indexOf(saverMin)) + 1) % steps.length]));
    Features.set(prefs, 'saver', true);
  }, Features.shown(prefs, Features.get('saver') as Features.Feature));

  // ---- Voice
  if (on('voice')) {
    const hi = prefs.str('voiceLang', 'en-IN') === 'hi-IN';
    add('Voice', 'Listen mainly for', hi ? 'Hindi (English words understood too)' : 'English (Hindi words understood too)', () =>
      prefs.put('voiceLang', hi ? 'en-IN' : 'hi-IN'),
    );
    add('Voice', 'What you can say', 'radio, calls, music, volume, places', () =>
      Alert.alert(
        t('What you can say'),
        t(
          'Radio: "FM 91.1", "radio chalao", "रेडियो 98.3"\n' +
            'Calls: "call Mom", "papa ko call karo", "मम्मी को फोन लगाओ" (uses your favourites)\n' +
            'Music: "play music", "gaana chalao", "next", "अगला", "pause", "रोको"\n' +
            'Volume: "volume up", "awaaz kam karo", "आवाज़ बढ़ाओ"\n' +
            'Places: "take me home", "घर ले चलो", "office", "petrol pump", "dhaba", "navigate to India Gate"\n\nAnything else is searched on the map.',
        ),
      ),
    );
  }

  // ---- Screen layout and themes
  const layout = Layouts.get(LAYOUTS, Layouts.current(prefs));
  add('Layout', 'Screen layout', layout ? layout.name : 'Boxes', '/settings/layouts');
  add('Themes', 'Themes', themeName(prefs), '/settings/theme');
  add('Themes', 'Theme changes by itself', on('autoTheme') ? 'on' : 'off', '/settings/theme', Features.shown(prefs, Features.get('autoTheme') as Features.Feature));
  add('Themes', 'Boot logo and animation', "make them with your car's badge and name", '/bootart', on('bootArt'));

  // ---- Car picture
  add('Car', 'Brand, model and fuel', Car.summary(prefs), '/setup?only=car');
  if (on('view360')) {
    const plate = Car3D.plate(prefs);
    add('Car', '360 view of your car', t(Car3D.SHAPE_NAMES[Car3D.SHAPES.indexOf(Car3D.shape(prefs) as never)] ?? '') + (plate ? ', ' + plate : ''), '/view360');
    add('Car', "Stereo's 360 camera app", prefs.str('app:cam360', '') || 'none found (pick one)', () => askPackage('cam360', 'The 360 camera app'));
  }
  add('Car', 'Car name', Car.name(prefs), () =>
    askText({ title: 'Name beside the logo (e.g. SWIFT, BALENO)', value: Car.name(prefs), save: (v) => prefs.put('carName', v) }),
  );

  // ---- Radio and music
  add('Radio and music', 'Music files', 'songs and online radio, played by OpenRath itself', '/music');
  add('Radio and music', 'FM radio app', appName(prefs, 'media:radio'), () => askPackage('media:radio', 'Radio'));
  add('Radio and music', 'Music app', appName(prefs, 'media:music'), () => askPackage('media:music', 'Music'));
  add('Radio and music', 'Sound', 'profiles, quiet hours, louder with speed', '/music');
  add('Radio and music', 'Video window', 'plays a video in a box; the picture shows only when the car is stopped', '/video', on('video'));

  // ---- Phone
  for (let i = 0; i < 3; i++) {
    const v = prefs.str('fav' + (i + 1), '');
    const bar = v.indexOf('|');
    add('Phone', `Favourite ${i + 1}`, bar > 0 ? v.substring(0, bar) + '  ' + v.substring(bar + 1) : 'not set', () =>
      askText({
        title: f('Favourite %1$s (empty to remove)', String(i + 1)),
        value: v.replace('|', ', '),
        placeholder: 'Name, phone number',
        save: (s) => {
          const c = s.lastIndexOf(',');
          if (s.trim() === '') return prefs.put('fav' + (i + 1), '');
          if (c <= 0) return 'Name, phone number';
          prefs.put('fav' + (i + 1), s.substring(0, c).trim() + '|' + s.substring(c + 1).trim());
        },
      }),
    );
  }
  add('Phone', 'Phone app', appName(prefs, 'dock:phone'), () => askPackage('dock:phone', 'Phone'));
  add('Phone', 'Guest Wi-Fi', prefs.str('apName', '') === '' ? 'a code passengers scan to join the hotspot' : prefs.str('apName', ''), '/chores?open=hotspot', on('hotspot'));

  // ---- Map and navigation
  add('Map and navigation', 'Saved places', 'Home, Office and your own places', '/places', on('places'));
  const google = prefs.str('src:navi', 'own') === 'google';
  add('Map and navigation', 'Guide routes in', google ? 'Google Maps' : "OpenRath's map", () => prefs.put('src:navi', google ? 'own' : 'google'));
  add('Map and navigation', 'Navigation button opens', prefs.str('app:dock:navi', '') || 'com.google.android.apps.maps', () => askPackage('dock:navi', 'Navigation'));
  add('Map and navigation', 'Guide without internet in', appName(prefs, 'offlineNav'), () => askPackage('offlineNav', 'Offline map app'));
  // one row for both halves, as in the Android version: when it dims, and how dark it gets.
  // "With the headlights" needs the unit's own lights (native code), so only sunset is offered.
  const dimOn = prefs.str('dim', 'off') !== 'off';
  const dimLevel = num(prefs, 'dimLevel', 40);
  const dimSteps = [0, 20, 40, 60, 80];
  const dimText = (pc: number) => f('%1$s, %2$s%% darker', t('after sunset'), String(pc));
  add('Map and navigation', 'Night dimming', dimOn ? dimText(dimLevel) : 'off', () =>
    choose('How dark at night', dimSteps.map((pc) => (pc === 0 ? 'off' : dimText(pc))), dimOn ? dimSteps.indexOf(dimLevel) : 0, (i) => {
      prefs.put('dim', i === 0 ? 'off' : 'sunset');
      if (i > 0) prefs.put('dimLevel', String(dimSteps[i]));
    }),
  );
  // Expo can't list the installed voices, so the row always offers to pick one or get Google's
  add('Map and navigation', 'Spoken voice', "tap to pick a voice, or get Google's, which speaks Hindi", () => {
    getVoice();
  });

  // ---- Driving
  add('Driving', 'Badges', 'smooth-driving streaks, weeks within the limit and distance milestones', '/achievements', on('achievements'));
  const warn = num(prefs, 'warnSpeed', 0);
  add('Driving', 'Warn above a speed anywhere', warn === 0 ? 'off' : f('%1$s km/h', String(warn)), () => {
    const steps = [0, 80, 90, 100, 110, 120];
    prefs.put('warnSpeed', String(steps[(steps.indexOf(warn) + 1) % steps.length]));
  });
  add('Driving', 'Road helpers', 'highway, fog, breaks, learnt spots and the 0–100 km/h timer', '/settings/road');
  const fills = Fuel.stats(Fuel.log(prefs)).fills;
  add('Driving', 'Trips, fuel and tolls', Care.tripRow(trip.todayKm, Trip.score(trip), fills), '/tripmenu');
  add('Driving', 'Toll estimate per plaza', f('₹%1$s (for route estimates)', String(num(prefs, 'tollRate', 100))), () =>
    askText({
      title: 'Typical car toll per plaza (₹)',
      value: String(num(prefs, 'tollRate', 100)),
      numeric: true,
      save: (v) => {
        if (!(parseFloat(v) >= 0)) return 'Enter a number';
        return prefs.put('tollRate', String(Math.round(parseFloat(v))));
      },
    }),
  on('tolls'));
  add('Driving', capital(Car.word(fuel)) + ' price', Fuel.priceText(prefs), () =>
    askText({
      title: 'Price per litre (₹); empty to use your fill-ups',
      value: prefs.str('fuelPrice', ''),
      numeric: true,
      save: (v) => {
        if (v !== '' && !(parseFloat(v) >= 0)) return 'Enter a number';
        return prefs.put('fuelPrice', v === '' ? '0' : v);
      },
    }),
  on('fuelPrice'));
  add('Driving', capital(Car.word(fuel)) + ' log', 'fill-ups, mileage and how far the tank goes', '/fuel', on('fuelPrice'));
  add('Driving', 'Split the cost', 'a UPI QR code for each share; or say "split the cost"', '/chores?open=split', on('split'));
  add('Driving', 'Paid parking reminder', Chores.parkingRow(prefs), '/chores?open=parkTimer', on('parking'));
  add('Driving', "This week's report", 'km, time, petrol, tolls, score; or say "weekly report"', '/report', on('startSummary'));
  add('Driving', 'Last parking photo', Cam.photoRowText(), '/parkphoto', on('parking'));
  add('Driving', 'Holidays ahead', Holidays.upcoming(new Date(), 3).join(';  '), () =>
    Alert.alert(t('Holidays with heavy traffic'), Holidays.upcoming(new Date(), 12).join('\n')),
  );
  add('Monsoon', 'Marked spots', 'waterlogging spots warned before in rain', '/settings/road', on('rain'));
  add('Dashcam', 'Dashcam', Dashcam.rowText(prefs, Cam.get().status), '/dashcam', on('dashcam'));

  // ---- Valet and family
  add('Valet', 'Kids or valet mode', Valet.on(prefs) ? 'On: Settings need the PIN' : 'Limits volume and speed, locks Settings', valetRow);
  add('Valet', 'Speed warning above', `${Valet.speed(prefs)} km/h`, () =>
    askText({
      title: 'km/h',
      value: String(Valet.speed(prefs)),
      numeric: true,
      save: (v) => {
        if (!(parseFloat(v) >= 20)) return 'Enter a speed in km/h';
        return prefs.put('valetSpeed', String(Math.round(parseFloat(v))));
      },
    }),
  );
  add('Valet', Valet.pin(prefs) === '' ? 'Choose the PIN' : 'Change the PIN', null, () => askPin(false));
  add('Family', 'Trip games for children', on('kids') ? 'spot the colour, number plates, how far; say "games"' : 'off (switch above)', () => {
    if (on('kids')) router.push('/kids');
  });
  const locked = ChildLock.apps(prefs).size;
  add('Family', 'Apps locked while moving', locked === 0 ? 'none chosen; long-press an app in All apps' : f('%1$s apps', String(locked)), '/apps', on('childLock'));
  add('Family', "Who's driving", !on('profiles') ? 'off (switch above)' : Profiles.current(prefs) === '' ? 'no drivers yet: tap to add' : Profiles.current(prefs), () => {
    if (on('profiles')) router.push('/settings/profiles');
  });

  // ---- Car care
  add('Car care', 'Car care', 'Odometer, service, insurance and PUC', '/care', on('care'));
  add('Car care', 'Car documents', on('wallet') ? 'RC, insurance, PUC and licence' : 'off (switch above)', '/wallet');
  const lights = prefs.str('lights', 'auto');
  const lightModes = ['auto', 'on', 'off'];
  const lightNames = ['follow the car (else sunset to sunrise)', 'always on', 'always off'];
  add('Car signals', 'Car picture headlights', lightNames[Math.max(0, lightModes.indexOf(lights))], () =>
    choose('Car picture headlights', lightNames, lightModes.indexOf(lights), (i) => prefs.put('lights', lightModes[i])),
  );

  // ---- Cab
  add('Cab', 'Cab driver tools', on('cab') ? 'earnings, meter, papers and ride apps' : 'off (switch above)', '/cab');
  add('Cab', 'Cab settings', 'target, fare meter rates, UPI, SOS contacts, papers', '/cab/settings', on('cab'));

  // ---- Backup and help
  add('Backup', 'Backup and restore', on('backup') ? 'daily, the last seven kept; or a file of your own' : 'save your settings to a file, or bring them back', '/settings/backup');
  add('Help', 'Home app', 'tap to make the unit start in it', () =>
    IntentLauncher.startActivityAsync('android.settings.HOME_SETTINGS').catch(() =>
      toast('This unit has no screen to choose the home app; press Home and choose OpenRath, Always', true),
    ),
  );
  add('Help', 'Run setup again', 'language, car, look, apps and the home app, step by step', () => {
    prefs.put('setupDone', '');
    prefs.put('setupStep', '0');
    router.push('/setup');
  }, Features.shown(prefs, Features.get('setup') as Features.Feature));
  add('Help', 'Android settings', null, () => IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.SETTINGS).catch(() => {}));
  add('Help', 'Version', 'OpenRath ' + VERSION + (Features.dev(prefs) ? t(', developer mode') : ''), versionTapped);
  add('Help', 'About and licences', 'free and open source (GPL-3.0)', '/settings/about');
  add('Help', 'Privacy', "what leaves the unit, and what doesn't", '/settings/about?show=privacy');
  add('Help', 'Crash reports', f('%1$s saved', String(Reports.crashes().length)), '/settings/reports');
  add('Help', 'Usage report', 'see it and share it', '/settings/reports', on('reports'));

  // the switches, each in its section: the owner's level, and only what this version does
  for (const ft of Features.ALL) {
    if (!Features.shown(prefs, ft) || !ft.ported) continue;
    rows.push({
      group: 'Features',
      title: ft.name,
      value: ft.about,
      on: Features.on(prefs, ft.id),
      feature: ft.id,
      action: () => {
        Features.set(prefs, ft.id, !Features.on(prefs, ft.id));
        if (ft.id === 'reports' && !Features.on(prefs, ft.id)) Reports.clear();
      },
    });
  }
  const shownRows = Features.dev(prefs) ? rows : rows.filter((r) => !S.DEV_ROWS.has(r.title));

  // ------------------------------------------------------------------ arranging and drawing
  let all = S.arrange(shownRows);
  const used = S.recent(prefs.str('recentRows', ''), all);
  if (used.length > 0) all = new Map([[S.RECENT, used], ...all]);
  const names = [...all.keys()];
  const current = chosen !== '' && all.has(chosen) ? chosen : wide ? names[0] : '';
  const query = q.trim();

  const tap = (r: S.Row) => {
    Reports.count(r.title);
    prefs.put('recentRows', S.remember(prefs.str('recentRows', ''), r.title));
    if (r.route) router.push(r.route as never);
    else r.action?.();
  };
  const row = (r: S.Row, key: string) => (
    <Row key={key} name={r.title} value={r.value} split on={r.on} chevron={r.on == null} onPress={() => tap(r)} />
  );
  const heading = (h: string, key: string) => (
    <Text key={key} style={[styles.small, { color: look.textDim }]}>
      {t(h).toUpperCase()}
    </Text>
  );

  let body: ReactNode[] = [];
  let title = '';
  let sub = '';
  if (query !== '') {
    title = t('Search');
    let found = 0;
    for (const [name, items] of all) {
      if (name === S.RECENT) continue;
      let head = false;
      for (const o of items) {
        if (typeof o === 'string' || !S.matches(o, name, query, t)) continue;
        if (!head) body.push(heading(name, 'h' + name));
        head = true;
        body.push(row(o, name + o.title));
        found++;
      }
    }
    sub = found === 0 ? f('Nothing matches "%1$s"', query) : found === 1 ? t('1 setting') : f('%1$s settings', String(found));
  } else if (current !== '') {
    title = t(current);
    sub = t(S.section(current).about);
    body = (all.get(current) ?? []).map((o, i) => (typeof o === 'string' ? heading(o, 'h' + i) : row(o, 'r' + i + o.title)));
  }

  const sections = (
    <View>
      {names.map((n) => {
        const lit = query === '' && n === current;
        return (
          <Pressable
            key={n}
            onPress={() => {
              setChosen(n);
              setQ('');
            }}
            style={[styles.section, { backgroundColor: lit ? look.panelTop : look.panel, borderColor: lit ? look.accent : look.edge }]}
          >
            <Text style={{ color: look.text, fontSize: 17, fontWeight: lit ? '600' : '400' }}>{t(n)}</Text>
            <Text style={{ color: look.textDim, fontSize: 12, marginTop: 4 }}>{t(S.section(n).about)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  const search = (
    <TextInput
      value={q}
      onChangeText={setQ}
      placeholder={t('Search settings')}
      placeholderTextColor={look.textDim}
      style={[styles.search, { color: look.text, borderColor: look.edge, backgroundColor: look.panel }]}
    />
  );
  const back = (label: string, go: () => void) => (
    <Pressable onPress={go} style={[styles.back, { borderColor: look.edge, backgroundColor: look.panel }]}>
      <Text style={{ color: look.text, fontSize: 17 }}>{t(label)}</Text>
    </Pressable>
  );
  const right = (
    <>
      <Text style={[styles.title, { color: look.text }]}>{title}</Text>
      {sub ? <Text style={{ color: look.textDim, marginBottom: 10 }}>{sub}</Text> : null}
      {body}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: look.background }}>
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <View style={[styles.side, { borderColor: look.edge }]}>
            {back('‹  Back to the dashboard', () => (router.canGoBack() ? router.back() : router.replace('/')))}
            {search}
            <ScrollView>{sections}</ScrollView>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingHorizontal: 28, paddingBottom: 48 }}>
            {right}
          </ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          {query === '' && current !== ''
            ? back('‹  ' + t('Settings'), () => setChosen(''))
            : back('‹  Back to the dashboard', () => (router.canGoBack() ? router.back() : router.replace('/')))}
          {search}
          {query === '' && current === '' ? sections : right}
        </ScrollView>
      )}
      {pick ? <PickList title={pick.title} options={pick.options} picked={pick.picked} onPick={pick.onPick} onClose={() => setPick(null)} /> : null}
      {ask ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setAsk(null)}>
          <View style={styles.scrim}>
            <View style={[styles.sheet, { backgroundColor: look.panelTop, borderColor: look.edge }]}>
              <Field label={ask.title} value={answer} onChange={setAnswer} numeric={ask.numeric} secret={ask.secret} placeholder={ask.placeholder} />
              <Button
                label="Save"
                kind="primary"
                onPress={() => {
                  const err = ask.save(answer.trim());
                  if (err) return Alert.alert(t(err));
                  setAsk(null);
                }}
              />
              <Button label="Cancel" onPress={() => setAsk(null)} />
            </View>
          </View>
        </Modal>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  side: { width: 300, padding: 18, borderRightWidth: StyleSheet.hairlineWidth },
  back: { borderWidth: 1, borderRadius: 12, height: 54, justifyContent: 'center', paddingHorizontal: 14 },
  search: { borderWidth: 1, borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 16, marginVertical: 12 },
  section: { borderWidth: 1, borderRadius: 12, minHeight: 64, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '300', marginTop: 8, marginBottom: 4 },
  small: { fontSize: 12, letterSpacing: 1.2, marginTop: 18, marginBottom: 4 },
  scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 520, borderWidth: 1, borderRadius: 14, padding: 16 },
});
