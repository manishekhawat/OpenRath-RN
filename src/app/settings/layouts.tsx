/**
 * Settings > Screen layout (LayoutGallery and the Layout rows in the Android version): a picture
 * of each layout, two to a row like the theme gallery. Tap one to use it. The boxes show in the
 * current theme; the others are pictures made at build time (assets/layouts/prev_*.jpg). Below,
 * the chosen layout's parts can be shown or hidden.
 */
import { useState } from 'react';
import { Alert, Image, Pressable, Text, useWindowDimensions, View } from 'react-native';

import { LAYOUTS, PREVIEWS, ThemePreview, mix } from '../../components/LayoutView';
import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Layouts from '../../logic/layouts';
import * as Profiles from '../../logic/profiles';
import { chosen } from '../../logic/theme';
import { lookFor, pack, useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';

/** {id, name, description} for every choice, in order. */
function choices(): [string, string, string][] {
  return [
    [Layouts.BOXES, 'Boxes', 'Five boxes you choose, with the buttons bar'],
    ...LAYOUTS.map((l): [string, string, string] => [l.id, l.name, 'Picture layout; parts can be hidden below']),
  ];
}

const check = (on: boolean) => (on ? '✓' : '');

export default function LayoutsScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { width } = useWindowDimensions();
  const [editing, setEditing] = useState<'' | 'user'>('');
  const [name, setName] = useState('');
  const [ordering, setOrdering] = useState(false);
  const current = Layouts.current(prefs);
  const cur = Layouts.get(LAYOUTS, current);
  const tile = Math.max(140, Math.min(360, (width - 32 - 14) / 2));
  const themePack = pack(chosen(prefs));

  const gallery = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {choices().map(([id, title, desc]) => {
        const on = id === current || (id === Layouts.BOXES && !cur);
        return (
          <Pressable
            key={id}
            onPress={() => Layouts.choose(prefs, id)}
            style={{
              width: tile + 16,
              padding: 8,
              paddingBottom: 12,
              borderRadius: 14,
              backgroundColor: on ? look.panelTop : look.panel,
              borderWidth: on ? 2.5 : 1.2,
              borderColor: on ? look.accent : mix(look.edge.substring(0, 7), look.panel.substring(0, 7), 0.6),
            }}
          >
            {id === Layouts.BOXES ? (
              <ThemePreview pack={themePack} look={lookFor(themePack)} width={tile} />
            ) : (
              <Image source={PREVIEWS[id]} style={{ width: tile, height: (tile * 225) / 384, borderRadius: 8 }} resizeMode="stretch" />
            )}
            <Text style={{ color: look.text, fontSize: 17, fontWeight: '500', paddingHorizontal: 6, paddingTop: 10 }}>{on ? title + '   ✓ in use' : title}</Text>
            <Text style={{ color: look.textDim, fontSize: 13, paddingHorizontal: 6, paddingTop: 4 }}>{desc}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!cur) {
    return (
      <Screen title="Screen layout">
        {gallery}
      </Screen>
    );
  }

  const opts = Layouts.opts(cur);
  const stats = Layouts.part(cur, 'stats');
  const showing = stats ? Layouts.statItems(prefs, cur.id, stats) : [];
  const profile = Profiles.current(prefs);
  const user = prefs.str('layUser', '');

  return (
    <Screen title="Screen layout">
      {gallery}

      {opts.length > 0 ? (
        <>
          <Heading>Show on {cur.name}</Heading>
          {opts.map((o) => {
            const on = Layouts.shown(prefs, cur.id, o);
            return (
              <Row
                key={o}
                name={Layouts.OPT_NAMES[o] ?? o}
                value={on ? 'shown' : 'hidden'}
                right={<Text style={{ color: look.accent, fontSize: 18 }}>{check(on)}</Text>}
                onPress={() => Layouts.setShown(prefs, cur.id, o, !on)}
              />
            );
          })}
        </>
      ) : null}

      {stats ? (
        <>
          <Heading>Details on {cur.name}</Heading>
                    {Layouts.statOrder(prefs, cur.id, stats).map((it) => {
            const on = showing.includes(it);
            const at = showing.indexOf(it);
            return (
              <Row
                key={it}
                name={(on ? at + 1 + '.  ' : '') + Layouts.statName(it)}
                right={<Text style={{ color: look.accent, fontSize: 18 }}>{check(on)}</Text>}
                onPress={() => (ordering ? on && Layouts.toTop(prefs, cur.id, stats, it) : Layouts.setStat(prefs, cur.id, stats, it, !on))}
              />
            );
          })}
          <Row
            name="Order of the details"
            value={ordering ? 'Tap one to put it first; tap here when done' : 'tap one to put it first'}
            onPress={() => {
              if (!ordering && showing.length < 2) return Alert.alert('Show two or more details first');
              setOrdering(!ordering);
            }}
          />
        </>
      ) : null}

      <Heading>Layout</Heading>
      {Layouts.part(cur, 'user') ? (
        <>
          <Row
            name="Driver's name"
            value={user || (profile ? profile + ' (driver profile)' : 'not set')}
            onPress={() => {
              setName(user);
              setEditing('user');
            }}
          />
          {editing === 'user' ? (
            <>
              <Field label="Driver's name" value={name} onChange={setName} />
              <Button
                label="OK"
                kind="primary"
                onPress={() => {
                  prefs.put('layUser', name.trim());
                  setEditing('');
                }}
              />
              <Button label="Cancel" onPress={() => setEditing('')} />
            </>
          ) : null}
        </>
      ) : null}
      {cur.roadHorizon > 0 ? (
        <Row name="Moving road lines" value={Layouts.roadOn(prefs) ? 'on, while driving' : 'off'} onPress={() => prefs.put('layRoad', Layouts.roadOn(prefs) ? 'off' : 'on')} />
      ) : null}
      <Row
        name="Phone mirroring button"
        value={Layouts.mirrorOn(prefs) ? "on the layout's buttons" : 'off'}
        onPress={() => {
          prefs.put('layMirror', Layouts.mirrorOn(prefs) ? 'off' : 'on');
          if (Layouts.mirrorOn(prefs)) Alert.alert('Phone mirroring', 'Long-press the new button to choose your mirroring app');
        }}
      />
      <Row name="Background movement" value={Layouts.animOn(prefs) ? 'gentle, while driving' : 'off'} onPress={() => prefs.put('layAnim', Layouts.animOn(prefs) ? 'off' : 'on')} />
      {Layouts.part(cur, 'favourites') ? (
        <Row
          name="Favourite apps"
          value={`${Array.from({ length: Layouts.FAVOURITES }, (_, i) => Layouts.favourite(prefs, i)).filter(Boolean).length} of ${Layouts.FAVOURITES} chosen; tap a tile on the layout to choose, long-press to change`}
          onPress={() =>
            Alert.alert('Clear the favourite apps?', undefined, [
              { text: 'Keep', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: () => prefs.put('layApps', '') },
            ])
          }
        />
      ) : null}
      <Row name="Back to the boxes" value="The classic dashboard" onPress={() => Layouts.choose(prefs, Layouts.BOXES)} />
    </Screen>
  );
}
