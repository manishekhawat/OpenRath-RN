/**
 * The music page: the app's own player with its station and song lists (the Android version's
 * "Online radio station" and "Choose a song" pickers), adding music files, and the sound
 * settings from Settings > Radio and music: resume, volume by speed, quiet hours, sound profiles,
 * ducking, parked music, and since 1.36 to 1.39 the phone projection app, the soundboard, the
 * video window and drag to seek. The sound ones act on this player only: the system volume,
 * other apps and the equalizer need native code.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { SeekBar } from '../components/MusicBox';
import { Button, Choice, Field, Heading, Row, Screen } from '../components/ui';
import * as ChildLock from '../logic/childlock';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Player from '../logic/player';
import { FILES, WEB, type Mode } from '../logic/player';
import { num, type Prefs } from '../logic/prefs';
import * as Sound from '../logic/sound';
import { useDriveSpeed } from '../state/drive';
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
  // 1.44: while the car moves, lists stop at twelve rows and the search box goes, as Android Auto does
  const speed = useDriveSpeed();
  const moving = ChildLock.movingShown(Math.max(0, speed.speedShown), speed.fixAt);

  useEffect(() => {
    P.ensureList(tab);
  }, [tab]);

  const tr = P.current();
  const mine = s.mode === tab;
  const all = tab === WEB ? s.stations : s.songs;
  const at = tab === WEB ? s.station : s.song;
  const q = moving ? '' : find.trim().toLowerCase();
  const found = all.map((x, i) => ({ x, i })).filter(({ x }) => q === '' || (x.name + ' ' + x.sub).toLowerCase().includes(q));
  const shown = Player.trim(found, moving);
  const room = moving ? Player.MOVING_ROWS : SHOW;

  const add = async () => {
    setAdding(true);
    try {
      const n = await P.addFiles();
      if (n > 0) Alert.alert(n === 1 ? t('Added one song') : f('Added %1$s songs', n));
    } catch {
      Alert.alert(t("The files couldn't be added"));
    }
    setAdding(false);
  };

  const removeAdded = () =>
    Alert.alert(t('Remove the songs added here?'), t("The phone's own music stays."), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Remove'), style: 'destructive', onPress: () => P.removeAdded() },
    ]);

  const base = P.baseVolume();
  const now = Math.round(s.level * 100);
  const on = (id: string) => Features.on(prefs, id);
  const flip = (id: string) => Features.set(prefs, id, !on(id));
  const tick = (id: string) => <Text style={{ color: look.accent, fontSize: 18 }}>{on(id) ? '✓' : ''}</Text>;
  const [proj, setProj] = useState(prefs.str('app:projection', ''));
  const per = on('speedVolume') ? Math.max(1, Math.min(3, num(prefs, 'speedVolPer', 2))) : 0;

  return (
    <Screen title="Music">
      {/* now playing */}
      <Heading>{s.mode === WEB ? 'Online radio' : s.mode === FILES ? 'Music files' : 'Player'}</Heading>
      <Text style={{ color: look.text, fontSize: 22, fontWeight: '500' }} numberOfLines={2}>
        {tr ? tr.name : t('Nothing playing')}
      </Text>
      <Text style={{ color: look.textDim, marginTop: 2 }}>
        {t(s.status !== '' && (s.busy || !s.playing) ? s.status : s.busy ? 'Connecting…' : tr ? tr.sub : 'Pick a station or a song below')}
      </Text>
      {s.mode === FILES && s.duration > 0 ? (
        <>
          <Text style={{ color: look.textDim, marginTop: 4 }}>
            {Player.clock(s.position)} / {Player.clock(s.duration)}
          </Text>
          {/* 1.44: the screen has the bar too, not only the box, and a drag along it moves in the song */}
          <SeekBar position={s.position} duration={s.duration} />
        </>
      ) : null}
      {/* the app's own player can always move in a song; the box's drag bar follows the 'seek' switch */}
      {s.mode === FILES && s.duration > 0 ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <View style={{ flex: 1 }}>
            <Button label="−30 s" onPress={() => P.seek(s.position - 30)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="+30 s" onPress={() => P.seek(s.position + 30)} />
          </View>
        </View>
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
        name={f('Volume %1$s%%', base)}
        value={now !== base ? f('Playing at %1$s%% now (%2$s)', now, volumeWhy(prefs, s.profile, s.ducked)) : undefined}
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
      {moving ? (
        <Text style={{ color: look.textDim, marginVertical: 8 }}>{t('Search when the car is stopped')}</Text>
      ) : all.length > SHOW ? (
        <Field label={tab === WEB ? 'Find a station' : 'Find a song'} value={find} onChange={setFind} />
      ) : null}
      {all.length === 0 ? (
        <Text style={{ color: look.textDim, marginVertical: 8 }}>
          {t(s.loadingList === tab
            ? tab === WEB
              ? Player.STATUS.findingStations
              : Player.STATUS.findingMusic
            : tab === WEB
              ? 'No stations: Radio Browser needs the internet the first time.'
              : 'No music found. Allow access to music, or add files below.')}
        </Text>
      ) : (
        shown.slice(0, room).map(({ x, i }) => (
          <Row
            key={tab + i}
            name={(mine && i === at && s.playing ? '▶︎  ' : '') + x.name}
            value={x.sub !== '' ? x.sub : undefined}
            onPress={() => P.pick(tab, i)}
          />
        ))
      )}
      {moving && found.length > shown.length ? (
        <Text style={{ color: look.textDim, marginTop: 8 }}>
          {f('%1$s more when the car is stopped', found.length - shown.length)}
        </Text>
      ) : shown.length > room ? (
        <Text style={{ color: look.textDim, marginTop: 8 }}>
          {f('%1$s more: type part of a name to find them.', shown.length - room)}
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
            {t('The phone\'s music library plays where it is. Files picked with "Add music files" are copied into the app, so they still play after a restart.')}
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
        name="Volume for each music app"
        value="Online radio and your music files come back at the volume they last played at"
        right={tick('sourceVolume')}
        onPress={() => flip('sourceVolume')}
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
            ? f('from %1$s to %2$s, music at %3$s%%', Sound.hour(Sound.quietFrom(prefs)), Sound.hour(Sound.quietTo(prefs)), Sound.quietVol(prefs))
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
            value={f('%1$s%% of full volume', Sound.quietVol(prefs))}
            onPress={() => prefs.put('quietVol', String(Sound.cycle(Sound.QUIET_VOL, Sound.quietVol(prefs))))}
          />
        </>
      ) : null}
      <Row
        name="Sound profiles"
        value={on('soundProfiles') ? t('City, highway and night volume') + (s.profile ? '  ·  ' + f('%1$s now', t(s.profile)) : '') : 'off'}
        right={tick('soundProfiles')}
        onPress={() => flip('soundProfiles')}
      />
      {on('soundProfiles')
        ? Sound.PROFILES.map((pr) => {
            const v = Sound.profileVol(prefs, pr);
            return (
              <Row
                key={pr}
                name={f('%1$s sound', t(pr[0].toUpperCase() + pr.substring(1)))}
                value={f('volume %1$s steps', (v > 0 ? '+' : '') + v) + (pr === s.profile ? '  ·  ' + t('now') : '')}
                onPress={() => prefs.put('sndVol:' + pr, String(v >= 5 ? -5 : v + 1))}
              />
            );
          })
        : null}
      <Row name="Music dips for voice prompts" value="While the car speaks a turn or a warning" right={tick('duck')} onPress={() => flip('duck')} />
      <Row
        name="Battery saver for parked music"
        value={on('parkedMusic') ? f('Reminds once after %1$s minutes standing still', Math.max(30, Sound.parkedMin(prefs))) : 'off'}
        right={tick('parkedMusic')}
        onPress={() => flip('parkedMusic')}
      />
      <Row
        name="Equalizer"
        value="Needs Android's audio effects from native code: not in this version"
      />
      <Text style={{ color: look.textDim, marginTop: 8 }}>
        {t(
          "These change this player's own volume. The stereo's volume, the FM radio and other music apps need native code (see PORTING.md). Without an OBD adapter the engine can't be told apart from idling with the AC on, so parked music is reminded about, not paused.",
        )}
      </Text>

      {/* 1.36 to 1.39: the music box's extras and the fun boxes */}
      <Heading>Music box</Heading>
      <Row
        name="Drag to seek in the music box"
        value="A bar with the time played; drag along it to move in the song (music apps that allow it)"
        right={tick('seek')}
        onPress={() => flip('seek')}
      />
      <Row
        name="Music box colours from the album cover"
        value="Needs the song's cover: this player has none (the phone's music library gives no covers), and other apps' covers need notification access, which needs native code"
      />
      <Row
        name="Phone projection app"
        value="A button in the music box opens your wireless CarPlay or Android Auto app (ZLink, AutoKit and others)"
        right={tick('projection')}
        onPress={() => flip('projection')}
      />
      {on('projection') ? (
        <>
          <Field
            label="Your CarPlay or Android Auto app"
            value={proj}
            placeholder="com.zjinnova.zlink"
            onChange={(v) => {
              setProj(v);
              prefs.put('app:projection', v.trim());
            }}
          />
          <Text style={{ color: look.textDim, marginTop: 4 }}>
            {proj.trim() !== '' && !Player.looksLikeProjection(proj, '')
              ? t("That doesn't look like a CarPlay or Android Auto app, but it will be opened.")
              : t('Its package name, as in the app\'s Play Store link. Finding it by itself needs the list of installed apps, which needs native code.')}
          </Text>
        </>
      ) : null}
      <Row
        name="Soundboard"
        value="A box of fun sounds (horn, fart, applause and more) that plays only when the car is stopped"
        right={tick('soundboard')}
        onPress={() => flip('soundboard')}
      />
      <Row
        name="Video window"
        value="Plays a video from the unit or a USB stick in a box; the picture shows only when the car is stopped"
        right={tick('video')}
        onPress={() => flip('video')}
      />
      {on('video') ? <Button label="Play a video" onPress={() => router.push('/video')} /> : null}
    </Screen>
  );
}

/** Why the volume differs from the owner's level just now. */
function volumeWhy(prefs: Prefs, profile: string, ducked: boolean): string {
  if (ducked) return t('dipped while the car speaks');
  const parts: string[] = [];
  if (Features.on(prefs, 'speedVolume')) parts.push(t('speed'));
  if (profile !== '') parts.push(f('%1$s sound', t(profile)));
  return parts.length ? parts.join(' ' + t('and') + ' ') : t('adjusted');
}
