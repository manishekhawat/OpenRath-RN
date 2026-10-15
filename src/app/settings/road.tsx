/**
 * Settings > Road helpers (the Android version's rows for fog, monsoon, breaks, the 0–100 timer
 * and learnt spots): each row shows its value, and a tap cycles it or clears it.
 */
import { Alert, Switch, Text } from 'react-native';

import { Heading, Row, Screen } from '../../components/ui';
import * as Accel from '../../logic/accel';
import * as Features from '../../logic/features';
import * as Fog from '../../logic/fog';
import * as Monsoon from '../../logic/monsoon';
import * as Rest from '../../logic/rest';
import * as Spots from '../../logic/spots';
import { useDrive } from '../../state/drive';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** The road features, in the order shown, each with its switch. */
const SWITCHES = ['highway', 'fog', 'hill', 'monsoon', 'tollAhead', 'wrongWay', 'zones', 'overtake', 'bumps', 'waits', 'restStop', 'accel', 'accidentHelp'];

const next = (list: number[], cur: number) => list[(list.indexOf(cur) + 1) % list.length];

const confirm = (message: string, action: string, run: () => void) =>
  Alert.alert('', message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: run },
  ]);

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

  return (
    <Screen title="Road helpers">
      <Heading>Fog</Heading>
      <Row
        name="Fog mode now"
        value={fogNow ? 'on (switched on by hand)' : road.fog ? 'on: the weather says fog' : 'off; comes on by itself in fog'}
        onPress={() => prefs.put('fogNow', fogNow ? 'off' : 'on')}
      />
      <Row name="Speed in fog" value={`keep below ${Fog.guide(prefs)} km/h`} onPress={() => prefs.put('fogSpeed', String(next(Fog.GUIDE_CHOICES, Fog.guide(prefs))))} />

      <Heading>Breaks</Heading>
      <Row name="Break reminder after" value={Rest.breakText(breakMin)} onPress={() => prefs.put('breakMin', String(next(Rest.BREAK_CHOICES, breakMin)))} />

      <Heading>Monsoon</Heading>
      <Row name="Mark a waterlogging spot here" value="where the car is now" onPress={() => Alert.alert('', markFlood())} />
      <Row
        name="Marked spots"
        value={floods === 0 ? 'none yet' : floods + (floods === 1 ? ' spot; tap to clear' : ' spots; tap to clear all')}
        onPress={() => floods > 0 && confirm(`Clear all ${floods} waterlogging spots?`, 'Clear', () => Monsoon.clear(prefs))}
      />

      <Heading>Learnt from your drives</Heading>
      <Row
        name="Speed breakers learnt"
        value={`${learnt} (${bumps.size()} places seen); tap to forget them`}
        onPress={() => confirm('Forget all learnt speed breakers?', 'Forget', () => prefs.put('bumps', ''))}
      />
      <Row
        name="Stops learnt"
        value={`${waits.size()} signals and toll plazas; tap to forget them`}
        onPress={() => confirm('Forget all learnt waiting times?', 'Forget', () => prefs.put('waits', ''))}
      />
      <Row
        name="0–100 km/h"
        value={Accel.summary(prefs)}
        onPress={() =>
          Alert.alert(
            '0–100 km/h timer',
            'Stop completely, then accelerate. The time is spoken when you pass 100 km/h. It uses GPS, so it is good to about half a second. Only on a safe, empty road.',
            [
              { text: 'Forget the best time', style: 'destructive', onPress: () => Accel.forget(prefs) },
              { text: 'OK' },
            ],
          )
        }
      />

      <Heading>Switches</Heading>
      {SWITCHES.map((id) => {
        const f = Features.get(id);
        if (!f) return null;
        return (
          <Row
            key={id}
            name={f.name}
            value={f.about}
            onPress={() => Features.set(prefs, id, !Features.on(prefs, id))}
            right={<Switch value={Features.on(prefs, id)} onValueChange={(v) => Features.set(prefs, id, v)} />}
          />
        );
      })}
      <Text style={{ color: look.textDim, marginTop: 12 }}>
        Map data © OpenStreetMap contributors, through the Overpass API. Warnings are spoken while the app is open.
      </Text>
    </Screen>
  );
}
