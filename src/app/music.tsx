/**
 * The music page: the app's own player with its station and song lists (the Android version's
 * "Online radio station" and "Choose a song" pickers), adding music files, and the sound
 * settings from Settings > Radio and music. They all act on this player only: the system volume,
 * other apps and the equalizer need native code.
 */
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Choice, Field, Heading, Row, Screen } from '../components/ui';
import * as Features from '../logic/features';
import * as Player from '../logic/player';
import { FILES, WEB, type Mode } from '../logic/player';
import { num, type Prefs } from '../logic/prefs';
import * as Sound from '../logic/sound';
import { useLook } from '../state/look';
import * as P from '../state/player';
import { usePrefs } from '../state/prefs';

/** Lists longer than this show a search box and the first matches only. */
const SHOW = 60;

export default function MusicScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const s = P.usePlayer();
  const [tab, setTab] = useState<Mode>(s.mode ?? FILES);
  const [find, setFind] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    P.ensureList(tab);
  }, [tab]);

  const t = P.current();
  const mine = s.mode === tab;
  const all = tab === WEB ? s.stations : s.songs;
  const at = tab === WEB ? s.station : s.song;
  const q = find.trim().toLowerCase();
  const shown = all.map((x, i) => ({ x, i })).filter(({ x }) => q === '' || (x.name + ' ' + x.sub).toLowerCase().includes(q));

  const add = async () => {
    setAdding(true);
    try {
      const n = await P.addFiles();
      if (n > 0) Alert.alert(n === 1 ? 'Added one song' : `Added ${n} songs`);
    } catch {
      Alert.alert("The files couldn't be added");
    }
    setAdding(false);
  };

  const removeAdded = () =>
    Alert.alert('Remove the songs added here?', "The phone's own music stays.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => P.removeAdded() },
    ]);

  const base = P.baseVolume();
  const now = Math.round(s.level * 100);
  const on = (id: string) => Features.on(prefs, id);
  const flip = (id: string) => Features.set(prefs, id, !on(id));
  const tick = (id: string) => <Text style={{ color: look.accent, fontSize: 18 }}>{on(id) ? '✓' : ''}</Text>;
  const per = on('speedVolume') ? Math.max(1, Math.min(3, num(prefs, 'speedVolPer', 2))) : 0;

  return (
    <Screen title="Music">
      {/* now playing */}
      <Heading>{s.mode === WEB ? 'Online radio' : s.mode === FILES ? 'Music files' : 'Player'}</Heading>
      <Text style={{ color: look.text, fontSize: 22, fontWeight: '500' }} numberOfLines={2}>
        {t ? t.name : 'Nothing playing'}
      </Text>
      <Text style={{ color: look.textDim, marginTop: 2 }}>
        {s.status !== '' && (s.busy || !s.playing) ? s.status : s.busy ? 'Connecting…' : t ? t.sub : 'Pick a station or a song below'}
      </Text>
      {s.mode === FILES && s.duration > 0 ? (
        <Text style={{ color: look.textDim, marginTop: 4 }}>
          {Player.clock(s.position)} / {Player.clock(s.duration)}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Button label="⏮︎  Previous" onPress={() => (s.mode ? P.prev() : P.play(tab))} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={s.playing ? '❚❚  Pause' : '▶︎  Play'} kind="primary" onPress={() => P.toggle(s.mode ?? tab)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Next  ⏭︎" onPress={() => (s.mode ? P.next() : P.play(tab))} />
        </View>
      </View>
      {s.mode ? <Button label="■  Stop" onPress={P.stop} /> : null}

      <Heading>Volume</Heading>
      <Row
        name={`Volume ${base}%`}
        value={now !== base ? `Playing at ${now}% now (${volumeWhy(prefs, s.profile, s.ducked)})` : undefined}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="  −  " onPress={() => P.changeVolume(-10)} />
            <Button label="  +  " onPress={() => P.changeVolume(10)} />
          </View>
        }
      />

      {/* the lists */}
      <Heading>Play from</Heading>
      <Choice
        options={[
          { id: FILES, label: 'Music files' },
          { id: WEB, label: 'Online radio' },
        ]}
        value={tab}
        onChange={(m) => {
          setTab(m);
          setFind('');
        }}
      />
      {all.length > SHOW ? <Field label={tab === WEB ? 'Find a station' : 'Find a song'} value={find} onChange={setFind} /> : null}
      {all.length === 0 ? (
        <Text style={{ color: look.textDim, marginVertical: 8 }}>
          {s.loadingList === tab
            ? tab === WEB
              ? Player.STATUS.findingStations
              : Player.STATUS.findingMusic
            : tab === WEB
              ? 'No stations: Radio Browser needs the internet the first time.'
              : 'No music found. Allow access to music, or add files below.'}
        </Text>
      ) : (
        shown.slice(0, SHOW).map(({ x, i }) => (
          <Row
            key={tab + i}
            name={(mine && i === at && s.playing ? '▶︎  ' : '') + x.name}
            value={x.sub !== '' ? x.sub : undefined}
            onPress={() => P.pick(tab, i)}
          />
        ))
      )}
      {shown.length > SHOW ? (
        <Text style={{ color: look.textDim, marginTop: 8 }}>
          {shown.length - SHOW} more: type part of a name to find them.
        </Text>
      ) : null}
      {tab === WEB ? (
        <Button label={s.loadingList === WEB ? 'Finding stations…' : 'Fetch the stations again'} onPress={() => P.refreshStations()} />
      ) : (
        <>
          <Button label={adding ? 'Adding…' : 'Add music files…'} kind="primary" onPress={add} />
          <Button label={s.loadingList === FILES ? 'Looking for music…' : 'Look for music again'} onPress={() => P.rescan()} />
          {P.addedSongs().length > 0 ? <Button label="Remove the songs added here" kind="danger" onPress={removeAdded} /> : null}
          <Text style={{ color: look.textDim, marginTop: 4 }}>
            The phone's music library plays where it is. Files picked with "Add music files" are copied into the app,
            so they still play after a restart.
          </Text>
        </>
      )}

      {/* Settings > Radio and music, for this player */}
      <Heading>Sound</Heading>
      <Row
        name="Resume after switch-on"
        value="Plays what was on when the app starts, at the same volume"
        right={tick('resume')}
        onPress={() => flip('resume')}
      />
      <Row
        name="Louder with speed"
        value={Sound.PER_NAMES[per]}
        onPress={() => {
          const i = (per + 1) % 4;
          Features.set(prefs, 'speedVolume', i > 0);
          if (i > 0) prefs.put('speedVolPer', String(i));
        }}
      />
      <Row
        name="Quiet hours"
        value={
          on('quiet')
            ? `from ${Sound.hour(Sound.quietFrom(prefs))} to ${Sound.hour(Sound.quietTo(prefs))}, music at ${Sound.quietVol(prefs)}%`
            : 'off'
        }
        right={tick('quiet')}
        onPress={() => flip('quiet')}
      />
      {on('quiet') ? (
        <>
          <Row
            name="Quiet hours start at"
            value={Sound.hour(Sound.quietFrom(prefs))}
            onPress={() => prefs.put('quietFrom', String(Sound.cycle(Sound.QUIET_FROM, Sound.quietFrom(prefs))))}
          />
          <Row
            name="Quiet hours end at"
            value={Sound.hour(Sound.quietTo(prefs))}
            onPress={() => prefs.put('quietTo', String(Sound.cycle(Sound.QUIET_TO, Sound.quietTo(prefs))))}
          />
          <Row
            name="Quiet-hours volume"
            value={`${Sound.quietVol(prefs)}% of full volume`}
            onPress={() => prefs.put('quietVol', String(Sound.cycle(Sound.QUIET_VOL, Sound.quietVol(prefs))))}
          />
        </>
      ) : null}
      <Row
        name="Sound profiles"
        value={on('soundProfiles') ? 'City, highway and night volume' + (s.profile ? `  ·  ${s.profile} now` : '') : 'off'}
        right={tick('soundProfiles')}
        onPress={() => flip('soundProfiles')}
      />
      {on('soundProfiles')
        ? Sound.PROFILES.map((pr) => {
            const v = Sound.profileVol(prefs, pr);
            return (
              <Row
                key={pr}
                name={pr[0].toUpperCase() + pr.substring(1) + ' sound'}
                value={`volume ${v > 0 ? '+' : ''}${v} steps${pr === s.profile ? '  ·  now' : ''}`}
                onPress={() => prefs.put('sndVol:' + pr, String(v >= 5 ? -5 : v + 1))}
              />
            );
          })
        : null}
      <Row name="Music dips for voice prompts" value="While the car speaks a turn or a warning" right={tick('duck')} onPress={() => flip('duck')} />
      <Row
        name="Battery saver for parked music"
        value={on('parkedMusic') ? `Reminds once after ${Math.max(30, Sound.parkedMin(prefs))} minutes standing still` : 'off'}
        right={tick('parkedMusic')}
        onPress={() => flip('parkedMusic')}
      />
      <Row
        name="Equalizer"
        value="Needs Android's audio effects from native code: not in this version"
      />
      <Text style={{ color: look.textDim, marginTop: 8 }}>
        These change this player's own volume. The stereo's volume, the FM radio and other music apps need native code (see
        PORTING.md). Without an OBD adapter the engine can't be told apart from idling with the AC on, so parked music is
        reminded about, not paused.
      </Text>
    </Screen>
  );
}

/** Why the volume differs from the owner's level just now. */
function volumeWhy(prefs: Prefs, profile: string, ducked: boolean): string {
  if (ducked) return 'dipped while the car speaks';
  const parts: string[] = [];
  if (Features.on(prefs, 'speedVolume')) parts.push('speed');
  if (profile !== '') parts.push(profile + ' sound');
  return parts.length ? parts.join(' and ') : 'adjusted';
}
