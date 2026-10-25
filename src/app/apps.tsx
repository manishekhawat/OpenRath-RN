/**
 * All apps (AppsActivity in the Android version), with the better screen of 1.38 (appDrawer): a
 * search box, a row of pinned and recently opened apps, an A to Z column to jump with, and a long
 * press for Pin to the top, App info or Uninstall.
 *
 * A launcher lists every installed app through PackageManager, which Expo has no module for; until
 * a small native module adds that (see PORTING.md), this page opens the apps you add by their
 * package name, with their own icon when Android gives it to us.
 */
import * as IntentLauncher from 'expo-intent-launcher';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button, Field, Heading, ListScreen, PickList, toast } from '../components/ui';
import * as Apps from '../logic/apps';
import * as ChildLock from '../logic/childlock';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import { useDrive } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

interface App {
  label: string;
  pkg: string;
}

const DEFAULTS: App[] = [
  { label: 'Google Maps', pkg: 'com.google.android.apps.maps' },
  { label: 'YouTube Music', pkg: 'com.google.android.apps.youtube.music' },
  { label: 'Spotify', pkg: 'com.spotify.music' },
  { label: 'Phone', pkg: 'com.google.android.dialer' },
  { label: 'Settings', pkg: 'com.android.settings' },
];

/** A tile's side and the space between tiles, as the grid has always had them. */
const TILE = 120;
const GAP = 12;

export default function AppsScreen() {
  const { prefs, version } = usePrefs();
  const look = useLook();
  const drive = useDrive();
  const { trip } = drive;
  const extras = Features.on(prefs, 'appDrawer');
  const locked = ChildLock.apps(prefs);
  const apps = useMemo<App[]>(() => {
    try {
      return JSON.parse(prefs.str('apps', JSON.stringify(DEFAULTS)));
    } catch {
      return DEFAULTS;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs, version]);
  const [label, setLabel] = useState('');
  const [pkg, setPkg] = useState('');
  const [query, setQuery] = useState('');
  const [menu, setMenu] = useState<App | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const grid = useRef<FlatList<App[]> | null>(null);
  const { width } = useWindowDimensions();

  // the apps' own icons, when Android hands them over
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let gone = false;
    (async () => {
      const out: Record<string, string> = {};
      for (const a of apps) {
        try {
          out[a.pkg] = await IntentLauncher.getApplicationIconAsync(a.pkg);
        } catch {
          // not installed: the tile shows its first letter
        }
      }
      if (!gone) setIcons(out);
    })();
    return () => {
      gone = true;
    };
  }, [apps]);

  // 1.44: A to Z or the apps opened most, and apps hidden from the list (a search still finds them)
  const hidden = Apps.split(prefs.str('hiddenApps', ''));
  const uses = Apps.counts(prefs.str('appUses', ''));
  const mostUsed = Apps.order(prefs, extras) === 'used';
  const az = extras ? [...apps].sort((a, b) => a.label.localeCompare(b.label)) : apps;
  const sorted = extras ? Apps.shown(az, (a) => a.pkg, (a) => a.label, query, hidden, mostUsed, uses) : az;
  const pinned = Apps.split(prefs.str('pinnedApps', ''));
  const recent = Apps.split(prefs.str('recentApps', ''));
  const strip = extras ? [...pinned, ...recent.filter((p) => !pinned.includes(p))].map((p) => apps.find((a) => a.pkg === p)).filter((a): a is App => !!a) : [];
  // as many tiles to a row as fit between the padding, the rest wrapping as the grid used to
  const cols = Math.max(1, Math.floor((width - 16 - 48 + GAP) / (TILE + GAP)));
  const rows: App[][] = [];
  const letters: string[] = [];
  const letterRow: Record<string, number> = {};
  sorted.forEach((a, i) => {
    if (i % cols === 0) rows.push([]);
    rows[rows.length - 1].push(a);
    const l = Apps.letter(a.label);
    if (letters[letters.length - 1] !== l) letters.push(l);
    if (!(l in letterRow)) letterRow[l] = rows.length - 1;
  });

  const open = (a: App) => {
    if (Platform.OS !== 'android') return toast('Opening other apps works on Android only');
    if (ChildLock.blocked(prefs, a.pkg, trip.kmh, drive.fixAt)) return toast(ChildLock.SORRY);
    if (extras) {
      prefs.put('recentApps', Apps.join(Apps.push(recent, a.pkg, Apps.RECENT)));
      prefs.put('appUses', Apps.bump(prefs.str('appUses', ''), a.pkg));
    }
    try {
      IntentLauncher.openApplication(a.pkg);
    } catch {
      toast(f("%1$s isn't installed", a.label), true);
    }
  };

  const start = (action: string, data: string) => {
    IntentLauncher.startActivityAsync(action, { data }).catch(() => toast('This unit doesn’t allow that'));
  };

  // the long-press menu: pin, the child lock, Android's own app info and uninstall, remove
  const items: { label: string; run: () => void }[] = menu
    ? [
        ...(extras
          ? [
              pinned.includes(menu.pkg)
                ? { label: 'Unpin', run: () => prefs.put('pinnedApps', Apps.join(Apps.remove(pinned, menu.pkg))) }
                : { label: 'Pin to the top', run: () => prefs.put('pinnedApps', Apps.join(Apps.push(Apps.remove(pinned, menu.pkg), menu.pkg, Apps.PINS))) },
              hidden.includes(menu.pkg)
                ? { label: 'Show in the list', run: () => prefs.put('hiddenApps', Apps.join(Apps.remove(hidden, menu.pkg))) }
                : {
                    label: 'Hide from the list',
                    run: () => {
                      prefs.put('hiddenApps', Apps.join(Apps.push(hidden, menu.pkg, Apps.HIDDEN)));
                      toast('Hidden. Search for it to find it again.');
                    },
                  },
            ]
          : []),
        { label: 'App info', run: () => start(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, 'package:' + menu.pkg) },
        { label: 'Uninstall', run: () => start('android.intent.action.DELETE', 'package:' + menu.pkg) },
        ...(Features.on(prefs, 'childLock')
          ? [
              {
                label: locked.has(menu.pkg) ? 'Unlock while moving' : 'Lock while moving',
                run: () => void ChildLock.toggle(prefs, menu.pkg),
              },
            ]
          : []),
        {
          label: 'Remove from this screen',
          run: () => prefs.put('apps', JSON.stringify(apps.filter((x) => x.pkg !== menu.pkg))),
        },
      ]
    : [];

  const tile = (a: App, size: number) => (
    <Pressable
      key={a.pkg}
      onPress={() => open(a)}
      onLongPress={() => setMenu(a)}
      style={[styles.tile, { width: size, height: size - 10, backgroundColor: look.panel, borderColor: look.edge, borderRadius: look.radius }]}
    >
      {icons[a.pkg] ? (
        <Image source={{ uri: icons[a.pkg] }} style={styles.icon} />
      ) : (
        <Text style={[styles.initial, { color: look.accent }]}>{a.label.substring(0, 1)}</Text>
      )}
      <Text style={{ color: look.text, textAlign: 'center' }} numberOfLines={1}>
        {a.label}
        {locked.has(a.pkg) ? ' 🔒' : ''}
      </Text>
    </Pressable>
  );

  return (
    <ListScreen
      title="All apps"
      data={rows}
      keyOf={(r) => r[0].pkg}
      row={(r) => <View style={styles.gridRow}>{r.map((a) => tile(a, TILE))}</View>}
      gap={GAP}
      rowHeight={TILE - 10}
      listRef={grid}
      contentStyle={styles.body}
      initialNumToRender={6}
      windowSize={5}
      header={
        extras ? (
          <>
            <View style={styles.top}>
              <View style={styles.search}>
                <Field label="Search apps" value={query} onChange={setQuery} placeholder={t('Search apps')} />
              </View>
              {/* 1.44: a tap swaps A to Z for the apps opened most */}
              <Pressable
                onPress={() => prefs.put('appOrder', mostUsed ? 'az' : 'used')}
                style={[styles.order, { backgroundColor: look.panel, borderColor: look.edge, borderRadius: look.radius }]}
              >
                <Text style={{ color: look.text, fontSize: 16 }}>{t(mostUsed ? 'Most used' : 'A to Z')}</Text>
              </Pressable>
            </View>
            {strip.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                {strip.map((a) => tile(a, 96))}
              </ScrollView>
            ) : null}
          </>
        ) : null
      }
      footer={
        <>
          <Text style={{ color: look.textDim, marginTop: 8 }}>
            {t(
              'Long-press an app to pin it, hide it, see its app info, uninstall it, lock it while the car is moving, or remove it from this screen.',
            )}
          </Text>
          <Heading>Add an app</Heading>
          <Field label="Name" value={label} onChange={setLabel} />
          <Field label="Package name (from the app's Play Store link, id=…)" value={pkg} onChange={setPkg} placeholder="com.example.app" />
          <Button
            label="Add"
            kind="primary"
            onPress={() => {
              if (!/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/.test(pkg.trim())) return toast('That is not a package name, it looks like com.example.app', true);
              prefs.put('apps', JSON.stringify([...apps, { label: label.trim() || pkg.trim(), pkg: pkg.trim() }]));
              setLabel('');
              setPkg('');
            }}
          />
        </>
      }
    >
      {/* the A to Z column: a tap jumps to the first app filed under that letter */}
      {extras && !mostUsed && letters.length > 1 ? (
        <View style={styles.letters}>
          {letters.map((l) => (
            <Pressable key={l} onPress={() => grid.current?.scrollToIndex({ index: letterRow[l] ?? 0, animated: true })} hitSlop={6}>
              <Text style={[styles.letter, { color: look.textDim }]}>{l}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {menu ? (
        <PickList title={menu.label} options={items.map((i) => i.label)} onPick={(i) => items[i].run()} onClose={() => setMenu(null)} />
      ) : null}
    </ListScreen>
  );
}

const styles = StyleSheet.create({
  body: { paddingRight: 48 },
  top: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  search: { flex: 1 },
  order: { borderWidth: 1, minHeight: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  gridRow: { flexDirection: 'row', gap: GAP },
  strip: { gap: 12, paddingBottom: 12 },
  tile: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  icon: { width: 48, height: 48, marginBottom: 6, resizeMode: 'contain' },
  initial: { fontSize: 34, fontWeight: '600' },
  letters: { position: 'absolute', right: 4, top: 70, bottom: 20, justifyContent: 'center' },
  letter: { fontSize: 14, paddingVertical: 3, textAlign: 'center', width: 28 },
});
