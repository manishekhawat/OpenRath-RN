/**
 * Trip games for children (Kids.java): spot a car of the colour shown, with two players keeping
 * score; number plates from other states; and a big "how far?" countdown to the map's
 * destination, Home or Office. Its own bright colours, whatever the theme.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Screen } from '../components/ui';
import * as Features from '../logic/features';
import { dist } from '../logic/geo';
import * as Kids from '../logic/kids';
import { useDrive } from '../state/drive';
import { usePrefs } from '../state/prefs';

const PAGE = '#1B2330';
const IDLE = '#2C3A50';
const ON = '#3E7BD8';
const GOT = '#2E7D4F';

function Pill({
  label,
  colour,
  size = 18,
  textColour = '#FFFFFF',
  style,
  onPress,
  onLongPress,
}: {
  label: string;
  colour: string;
  size?: number;
  textColour?: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={[styles.pill, { backgroundColor: colour }, style]}>
      <Text style={{ color: textColour, fontSize: size, fontWeight: '500', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

/** A one-line editor in place of Android's little dialog. */
function Ask({ title, value, hint, onDone }: { title: string; value: string; hint?: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value);
  return (
    <View style={styles.ask}>
      <Text style={styles.askTitle}>{title}</Text>
      <TextInput value={v} onChangeText={setV} placeholder={hint} placeholderTextColor="#8FA0B6" autoFocus selectTextOnFocus style={styles.input} />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Pill label="OK" colour={ON} style={{ flex: 1, height: 48 }} onPress={() => onDone(v.trim())} />
        <Pill label="Cancel" colour={IDLE} style={{ flex: 1, height: 48 }} onPress={() => onDone(null)} />
      </View>
    </View>
  );
}

function Colours() {
  const { prefs } = usePrefs();
  const [cur, setCur] = useState(() => Kids.nextColour(-1));
  const [renaming, setRenaming] = useState<number | null>(null);
  const [name, hex] = Kids.COLOURS[cur];
  return (
    <View style={styles.body}>
      <View style={[styles.card, { backgroundColor: hex }]}>
        <Text style={{ fontSize: 64, fontWeight: '500', color: Kids.light(name) ? PAGE : '#FFFFFF' }}>{name} car</Text>
      </View>
      <Text style={styles.hint}>Who sees a car this colour first? Tap your name.</Text>
      {renaming != null ? (
        <Ask
          title="Player's name"
          value={Kids.player(prefs, renaming)}
          onDone={(v) => {
            if (v) Kids.rename(prefs, renaming, v);
            setRenaming(null);
          }}
        />
      ) : (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {[0, 1].map((i) => (
            <Pill
              key={i}
              label={`${Kids.player(prefs, i)}   ${Kids.score(prefs, i)}`}
              colour={i === 0 ? GOT : '#8A4FBF'}
              size={24}
              style={{ flex: 1, height: 96 }}
              onPress={() => {
                Kids.point(prefs, i);
                setCur(Kids.nextColour(cur));
              }}
              onLongPress={() => setRenaming(i)}
            />
          ))}
        </View>
      )}
      <Text style={styles.foot}>Long-press a name to change it. Scores start again each day.</Text>
    </View>
  );
}

function Plates() {
  const { prefs } = usePrefs();
  const got = Kids.found(prefs);
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>
      <Text style={styles.platesHead}>{Kids.platesHeading(got.length)}</Text>
      <View style={styles.grid}>
        {Kids.STATES.map(([code, state]) => (
          <Pill
            key={code}
            label={code + '\n' + state}
            size={15}
            colour={got.includes(code) ? GOT : IDLE}
            style={styles.plate}
            onPress={() => Kids.toggle(prefs, code)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function Far() {
  const { prefs } = usePrefs();
  const { trip } = useDrive();
  const [naming, setNaming] = useState(false);
  const ts = Kids.targets(prefs);
  if (ts.length === 0) {
    return (
      <View style={[styles.body, { justifyContent: 'center' }]}>
        <Text style={{ color: '#FFFFFF', fontSize: 22, textAlign: 'center' }}>Search for a place on the map first,{'\n'}or save Home or Office there.</Text>
      </View>
    );
  }
  const at = Kids.targetIndex(prefs, ts.length);
  const t = ts[at];
  const m = trip.lat === 0 && trip.lon === 0 ? -1 : dist(trip.lat, trip.lon, t.lat, t.lon);
  const hasDest = prefs.str('dest', '') !== '' || prefs.str('lastDest', '') !== '';
  return (
    <View style={[styles.body, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: '#FFFFFF', fontSize: 150, fontWeight: '300' }}>{Kids.km(m)}</Text>
      {naming ? (
        <Ask
          title="Call this place"
          value={prefs.str('destNick', '')}
          hint="e.g. Nani's house"
          onDone={(v) => {
            if (v != null) prefs.put('destNick', v);
            setNaming(false);
          }}
        />
      ) : (
        <Pressable
          onPress={() => Kids.nextTarget(prefs, ts.length)}
          onLongPress={() => {
            if (at === 0 && hasDest) setNaming(true);
          }}
        >
          <Text style={{ color: '#C8D2E0', fontSize: 30, textAlign: 'center' }}>km to {t.name}</Text>
        </Pressable>
      )}
      <Text style={[styles.foot, { marginTop: 12 }]}>
        Straight-line distance; the road is a little longer.  Tap the place to change it, long-press to give it a name.
      </Text>
    </View>
  );
}

const TABS = ['Spot the colour', 'Number plates', 'How far?'];

export default function KidsScreen() {
  const { prefs } = usePrefs();
  const [tab, setTab] = useState(0);
  if (!Features.on(prefs, 'kids')) {
    return (
      <Screen title="Trip games">
        <Text style={{ color: '#8FA0B6' }}>Turn on "Trip games for children" in Settings &gt; Features.</Text>
      </Screen>
    );
  }
  return (
    <Screen title="Trip games" scroll={false}>
      <View style={{ flex: 1, backgroundColor: PAGE }}>
        <View style={styles.tabs}>
          {TABS.map((n, i) => (
            <Pill key={n} label={n} colour={i === tab ? ON : IDLE} style={{ flex: 1, height: 54 }} onPress={() => setTab(i)} />
          ))}
        </View>
        <View style={{ flex: 1 }}>{tab === 0 ? <Colours /> : tab === 1 ? <Plates /> : <Far />}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  tabs: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  card: { flex: 1, borderRadius: 16, alignItems: 'center', justifyContent: 'center', minHeight: 140 },
  hint: { color: '#C8D2E0', fontSize: 18, textAlign: 'center', marginVertical: 10 },
  foot: { color: '#8FA0B6', fontSize: 13, textAlign: 'center', paddingTop: 8 },
  platesHead: { color: '#FFFFFF', fontSize: 20, fontWeight: '500', marginVertical: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  plate: { width: 176, height: 72, margin: 5 },
  ask: { backgroundColor: IDLE, borderRadius: 16, padding: 14, gap: 10, alignSelf: 'stretch' },
  askTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '500' },
  input: { backgroundColor: PAGE, color: '#FFFFFF', fontSize: 20, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
});
