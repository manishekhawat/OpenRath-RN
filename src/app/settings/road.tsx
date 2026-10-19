/**
 * Settings > Road helpers (the Android version's Driving rows for the speed shown, badges, saved
 * places, fog, breaks, monsoon, the 0–100 timer and learnt spots): each row shows its value, and a
 * tap cycles it, opens a choice or clears it. The first row keeps trips counting behind other apps.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Switch, Text } from 'react-native';

import { Heading, Row, Screen } from '../../components/ui';
import * as Accel from '../../logic/accel';
import * as Achievements from '../../logic/achievements';
import * as Bg from '../../logic/background';
import * as Features from '../../logic/features';
import * as Fog from '../../logic/fog';
import { f, t } from '../../logic/i18n';
import * as Monsoon from '../../logic/monsoon';
import * as Places from '../../logic/places';
import * as Rest from '../../logic/rest';
import * as Speed from '../../logic/speed';
import * as Spots from '../../logic/spots';
import * as Background from '../../state/background';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** The road features, in the order shown, each with its switch (the 1.42 ids). */
const SWITCHES = ['smoothSpeed', 'stopSummary', 'places', 'achievements', 'highway', 'fog', 'zones', 'bumps', 'restStop', 'accel', 'dashcam', 'wake'];

const next = (list: number[], cur: number) => list[(list.indexOf(cur) + 1) % list.length];

const confirm = (message: string, action: string, run: () => void) =>
  Alert.alert('', message, [
    { text: t('Cancel'), style: 'cancel' },
    { text: action, style: 'destructive', onPress: run },
  ]);

/** A row whose value is picked from a list, as the Android version's single-choice dialogs did. */
function choose(title: string, names: string[], cur: number, pick: (i: number) => void) {
  Alert.alert(
    title,
    undefined,
    [...names.map((n, i) => ({ text: (i === cur ? '• ' : '') + n, onPress: () => pick(i) })), { text: t('Cancel'), style: 'cancel' as const }],
    { cancelable: true },
  );
}

/** The "behind other apps" row: the switch, and a tap asks for "all the time" again when it is missing. */
function BehindApps() {
  const { prefs, version } = usePrefs();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [src, setSrc] = useState(Background.current());
  const want = Bg.wanted(prefs);

  const refresh = () => {
    Background.allowed().then(setAllowed);
    setSrc(Background.current());
  };
  useEffect(refresh, [version]);

  const turn = (on: boolean) => {
    Bg.set(prefs, on);
    // the drive provider switches the source on the change; turning it on asks again if needed
    Background.sync(on).then(refresh);
  };
  return (
    <Row
      name={t(Bg.EXPLAIN_TITLE)}
      value={Bg.statusText(want, allowed, src)}
      onPress={() => (want && src !== 'task' ? Background.sync(true).then(refresh) : turn(!want))}
      right={<Switch value={want} onValueChange={turn} />}
    />
  );
}

export default function RoadSettings() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { road, markFlood } = useDrive();

  const bumps = Spots.breakers();
  bumps.load(prefs.str('bumps', ''));
  const waits = Spots.waits();
  waits.load(prefs.str('waits', ''));
  const learnt = bumps.count(Spots.isBreaker);
  const floods = Monsoon.spots(prefs).length;
  const fogNow = prefs.str('fogNow', 'off') === 'on';
  const breakMin = Rest.breakMin(prefs);
  const fix = Speed.fix(prefs);
  const filter = Speed.filter(prefs);
  const badges = Achievements.earned(Achievements.days({})).length;
  const places = Places.own(prefs.str('places', '')).length;

  return (
    <Screen title={t('Road helpers')}>
      <Heading>{t('Behind other apps')}</Heading>
      <BehindApps />

      <Heading>{t('The speed shown')}</Heading>
      <Row
        name={t('Speed correction')}
        value={Speed.fixText(fix)}
        onPress={() =>
          choose(t("Add to the GPS speed, so it matches your car's speedometer"), Speed.FIX_CHOICES.map(Speed.fixChoice), Speed.FIX_CHOICES.indexOf(fix), (i) =>
            prefs.put('speedFix', String(Speed.FIX_CHOICES[i])),
          )
        }
      />
      <Row
        name={t('Speed filter')}
        value={Speed.filterText(filter)}
        onPress={() =>
          choose(t('Show 0 below this speed, for GPS that drifts when parked'), Speed.FILTER_CHOICES.map(Speed.filterChoice), Speed.FILTER_CHOICES.indexOf(filter), (i) =>
            prefs.put('speedFilter', String(Speed.FILTER_CHOICES[i])),
          )
        }
      />

      <Heading>{t('Driving')}</Heading>
      <Row
        name={t('Badges')}
        value={Features.on(prefs, 'achievements') ? Achievements.countText(prefs.str('badges', '') === '' ? badges : prefs.str('badges', '').split(',').length) : t('off (switch below)')}
        onPress={() => router.push('/achievements')}
      />
      <Row
        name={t('Saved places')}
        value={places === 0 ? t('Home, Office and the parked car; add your own') : f('%1$s of your own places', places)}
        onPress={() => router.push('/places')}
      />

      <Heading>{t('Fog')}</Heading>
      <Row
        name={t('Fog mode now')}
        value={fogNow ? t('on (switched on by hand)') : road.fog ? t('on: the weather says fog') : t('off; comes on by itself in fog, or say "fog mode"')}
        onPress={() => prefs.put('fogNow', fogNow ? 'off' : 'on')}
      />
      <Row name={t('Speed in fog')} value={Fog.guideRow(prefs)} onPress={() => prefs.put('fogSpeed', String(next(Fog.GUIDE_CHOICES, Fog.guide(prefs))))} />

      <Heading>{t('Breaks')}</Heading>
      <Row name={t('Break reminder after')} value={Rest.breakText(breakMin)} onPress={() => prefs.put('breakMin', String(next(Rest.BREAK_CHOICES, breakMin)))} />

      <Heading>{t('Monsoon')}</Heading>
      <Row name={t('Mark a waterlogging spot here')} value={t('or say "waterlogging", or set a steering-wheel button')} onPress={() => Alert.alert('', markFlood())} />
      <Row
        name={t('Marked spots')}
        value={floods === 0 ? t('none yet') : f(floods === 1 ? '%1$s spot; tap to clear' : '%1$s spots; tap to clear all', floods)}
        onPress={() => floods > 0 && confirm(f('Clear all %1$s waterlogging spots?', floods), t('Clear'), () => Monsoon.clear(prefs))}
      />

      <Heading>{t('Learnt from your drives')}</Heading>
      <Row
        name={t('Speed breakers learnt')}
        value={f('%1$s (%2$s places seen); tap to forget them', learnt, bumps.size())}
        onPress={() => confirm(t('Forget all learnt speed breakers?'), t('Forget'), () => prefs.put('bumps', ''))}
      />
      <Row
        name={t('Stops learnt')}
        value={f('%1$s signals and toll plazas; tap to forget them', waits.size())}
        onPress={() => confirm(t('Forget all learnt waiting times?'), t('Forget'), () => prefs.put('waits', ''))}
      />
      <Row
        name="0–100 km/h"
        value={Accel.summary(prefs)}
        onPress={() =>
          Alert.alert(
            t('0–100 km/h timer'),
            t(
              'Stop completely, then accelerate. The time is spoken when you pass 100 km/h. It uses GPS (or OBD-II speed when connected), so it is good to about half a second. Only on a safe, empty road.',
            ),
            [
              { text: t('Forget the best time'), style: 'destructive', onPress: () => Accel.forget(prefs) },
              { text: t('OK') },
            ],
          )
        }
      />

      <Heading>{t('Switches')}</Heading>
      {SWITCHES.map((id) => {
        const feat = Features.get(id);
        if (!feat || !Features.shown(prefs, feat)) return null;
        return (
          <Row
            key={id}
            name={t(feat.name)}
            value={t(feat.about)}
            onPress={() => Features.set(prefs, id, !Features.on(prefs, id))}
            right={<Switch value={Features.on(prefs, id)} onValueChange={(v) => Features.set(prefs, id, v)} />}
          />
        );
      })}
      <Text style={{ color: look.textDim, marginTop: 12 }}>
        {t(
          'Map data © OpenStreetMap contributors, through the Overpass API. Warnings are spoken while the app is open, and behind other apps when trips count there.',
        )}
      </Text>
    </Screen>
  );
}
