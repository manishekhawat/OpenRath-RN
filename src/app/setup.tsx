/**
 * The setup screens on the first start, after the logo (Setup.java, the "setup" switch): language,
 * permissions (or bringing a backup back), your car, the look, how much OpenRath shows, your apps,
 * then the phone and the home app. Every step can be skipped, Back goes a step back, and the step
 * is remembered in 'setupStep' so coming back from Android's settings carries on where it was.
 * Settings > Help > Run setup again opens it. The dashboard sends the owner here while
 * Car.ready(prefs) is false, so finishing (or skipping) the car step keeps that working.
 *
 * Android's permission screens and app list aren't open to Expo: the permissions step asks through
 * Expo's own modules, and the apps step takes a package name, as the rest of this edition does.
 */
import { Camera } from 'expo-camera';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, PickList, Row, toast } from '../components/ui';
import brands from '../data/brands.json';
import * as Car from '../logic/car';
import * as Car3D from '../logic/car3d';
import * as Features from '../logic/features';
import { f, lang, load as loadLanguage, t } from '../logic/i18n';
import * as Layouts from '../logic/layouts';
import { num } from '../logic/prefs';
import * as Setup from '../logic/setup';
import { LAYOUTS } from '../components/LayoutView';
import { available, themeName, useLook } from '../state/look';
import { choose as chooseTheme, chosen as chosenTheme } from '../logic/theme';
import { usePrefs } from '../state/prefs';

type Fuel = (typeof Car.FUELS)[number];

export default function SetupScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const { only } = useLocalSearchParams<{ only?: string }>();
  const carOnly = only === 'car';
  const [step, setStep] = useState(() => (carOnly ? Setup.CAR : Math.max(Setup.WELCOME, Math.min(Setup.FINISH, num(prefs, 'setupStep', Setup.WELCOME)))));
  const [level, setLevel] = useState(() => (Features.levelPicked(prefs) ? Features.level(prefs) : Features.SIMPLE));
  const [asked, setAsked] = useState(false);
  const [pick, setPick] = useState<{ title: string; options: string[]; onPick: (i: number) => void } | null>(null);

  // what the car step types in, kept while it is on screen
  const [brandId, setBrandId] = useState(Car.brand(prefs));
  const [otherBrand, setOtherBrand] = useState(brands.some((b) => b.id === Car.brand(prefs)) ? '' : Car.brandName(prefs));
  const [model, setModel] = useState(Car.model(prefs));
  const [fuel, setFuel] = useState<Fuel>(Car.fuel(prefs) as Fuel);
  const [shape, setShape] = useState(Car3D.shape(prefs));
  const [colour, setColour] = useState(Car3D.colour(prefs));
  const [tank, setTank] = useState(prefs.str('tankL', ''));
  const [carName, setCarName] = useState(prefs.str('carName', ''));
  const [ownerName, setOwnerName] = useState(prefs.str('ownerName', ''));
  const brand = useMemo(() => brands.find((b) => b.id === brandId), [brandId]);

  // what has been allowed, read when the permissions step shows and after each ask
  const [allowed, setAllowed] = useState<Record<string, boolean>>({});
  const readAllowed = () => {
    void (async () => {
      const [loc, media, cam] = await Promise.all([
        Location.getForegroundPermissionsAsync().catch(() => null),
        MediaLibrary.getPermissionsAsync().catch(() => null),
        Camera.getCameraPermissionsAsync().catch(() => null),
      ]);
      setAllowed({ location: !!loc?.granted, files: !!media?.granted, camera: !!cam?.granted });
    })();
  };
  useEffect(() => {
    if (step === Setup.ACCESS) readAllowed();
  }, [step]);

  const remember = (to: number) => {
    setStep(to);
    prefs.put('setupStep', String(to));
  };

  /** What a step keeps when it is left: the typed car, the level. */
  const leave = (from: number) => {
    if (from === Setup.CAR) saveCar();
    if (from === Setup.LEVEL) Features.setLevel(prefs, level);
  };

  const saveCar = () => {
    const bName = brand ? brand.name : otherBrand.trim();
    Car.save(
      prefs,
      { brandId: brand ? brand.id : Car.idFor(bName), brandName: bName, model: model.trim(), fuel, tank: tank.trim(), shape, colour },
      (id, on) => Features.set(prefs, id, on),
    );
    if (carName.trim()) prefs.put('carName', carName.trim().toUpperCase());
    prefs.put('ownerName', ownerName.trim());
  };

  const done = () => {
    leave(step);
    for (const k of Setup.DONE_KEYS) prefs.put(k, 'yes');
    prefs.put('setupStep', '');
    if (!Features.levelPicked(prefs)) prefs.put('level', 'custom');
    toast('All set. Long-press any box, or open Settings, to change things.', true);
    router.replace('/');
  };

  const forward = () => {
    if (carOnly) {
      saveCar();
      return router.back();
    }
    if (step === Setup.ACCESS && !asked) {
      setAsked(true);
      prefs.put('permsExplained', 'yes');
      void askAll();
      return;
    }
    if (step === Setup.FINISH) return done();
    leave(step);
    remember(Setup.next(step, false));
  };

  const back = () => {
    if (carOnly) return router.back();
    if (step === Setup.WELCOME) return;
    leave(step);
    remember(Setup.back(step, false));
  };

  const skipAll = () =>
    Alert.alert(t('Skip setup?'), t('OpenRath starts with its usual settings. You can set everything up later in Settings, or run this setup again from Settings, Help.'), [
      { text: t('Keep going'), style: 'cancel' },
      { text: t('Skip'), onPress: done },
    ]);

  const askAll = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
      await MediaLibrary.requestPermissionsAsync(false, ['audio', 'photo']);
      await Camera.requestCameraPermissionsAsync();
    } catch {
      // refused or not on this unit: only that part stops working
    }
    readAllowed();
  };

  // ------------------------------------------------------------------ pieces
  const title = (s: string) => <Text style={[styles.title, { color: look.text }]}>{t(s)}</Text>;
  const body = (s: string) => <Text style={[styles.body, { color: look.textDim }]}>{t(s)}</Text>;
  const label = (s: string) => <Text style={[styles.label, { color: look.accent }]}>{t(s).toUpperCase()}</Text>;
  const chip = (name: string, on: boolean, tap: () => void, key?: string) => (
    <Pressable
      key={key ?? name}
      onPress={tap}
      style={[styles.chip, { borderColor: on ? look.accent : look.edge, backgroundColor: on ? look.accent : look.panel }]}
    >
      <Text style={{ color: on ? look.background : look.text, fontSize: 16 }}>{t(name)}</Text>
    </Pressable>
  );
  const card = (name: string, about: string, on: boolean, tap: () => void) => (
    <Pressable
      key={name}
      onPress={tap}
      style={[styles.card, { borderWidth: on ? 2.5 : 1.2, borderColor: on ? look.accent : look.edge, backgroundColor: on ? look.panelTop : look.panel }]}
    >
      <Text style={{ color: look.text, fontSize: 19, fontWeight: '500' }}>{(on ? '● ' : '○ ') + t(name)}</Text>
      <Text style={{ color: look.textDim, fontSize: 14, marginTop: 6 }}>{t(about)}</Text>
    </Pressable>
  );

  // ------------------------------------------------------------------ the steps
  const welcome = (
    <>
      {title('Welcome to OpenRath')}
      {body("Let's get your stereo ready in a few quick steps. You can change all of it later in Settings.")}
      {label('Language')}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[
          ['English', 'Menus and voice in English', 'en'],
          ['हिन्दी', 'मेन्यू और आवाज़ हिन्दी में', 'hi'],
        ].map(([name, about, code]) => (
          <View key={code} style={{ flex: 1 }}>
            {card(name, about, lang(prefs) === code, () => {
              prefs.put('lang', code);
              loadLanguage(prefs);
            })}
          </View>
        ))}
      </View>
    </>
  );

  const access = (
    <>
      {title('Allow what OpenRath needs')}
      {body('Android asks about each one. Refuse any you like: only that part stops working. Nothing is sent online.')}
      {Setup.KINDS.filter(([k]) => k === 'location' || k === 'files').map(([k, name, about]) => (
        <Row key={k} name={name} value={about} state={allowed[k] ? '✓ ' + t('Allowed') : t(asked ? 'Not allowed' : 'Not yet')} />
      ))}
      <Row
        name="Camera"
        value="The dashcam and the photo of where you parked."
        state={allowed.camera ? '✓ ' + t('Allowed') : t(asked ? 'Not allowed' : 'Not yet')}
      />
      {asked ? <Button label="Ask again" onPress={() => void askAll()} /> : null}
      {label('Used OpenRath before?')}
      <Row
        name="Bring a backup back"
        value="Settings, the fuel log and trips from an OpenRath backup, including one made by the Android version."
        state={t('Open')}
        onPress={() => {
          prefs.put('restoreAsked', 'yes');
          router.push('/settings/backup');
        }}
      />
    </>
  );

  const pickBrand = () => {
    const names = [...brands.map((b) => b.name), t('Another brand…')];
    setPick({
      title: 'Which brand?',
      options: names,
      onPick: (i) => {
        if (i < brands.length) {
          setBrandId(brands[i].id);
          setOtherBrand('');
        } else setBrandId('other');
        setModel('');
      },
    });
  };
  const pickModel = () => {
    if (!brand || brand.models.length === 0) return;
    setPick({
      title: f('%1$s: which model?', brand.name),
      options: brand.models,
      onPick: (i) => {
        setModel(brand.models[i]);
        if (carName.trim() === '') setCarName(Car.nameFor(brand.models[i]));
      },
    });
  };
  const car = (
    <>
      {title('Your car')}
      {body('It picks the car picture, the name beside the logo, fuel words and service reminders.')}
      {label('Brand and model')}
      <Row
        name={brand ? brand.name : otherBrand.trim() || t('Choose your car')}
        value={model || null}
        state={t(brand || otherBrand ? 'Change' : 'Choose')}
        onPress={pickBrand}
      />
      {brandId === 'other' || (brandId !== '' && !brand) ? <Field label="Brand name" value={otherBrand} onChange={setOtherBrand} /> : null}
      {brand && brand.models.length > 0 ? <Row name="Model" value={null} state={model || t('Choose')} onPress={pickModel} /> : null}
      <Field label="Model (pick above or type it)" value={model} onChange={setModel} />
      {label('Shape')}
      <View style={styles.flow}>{Car3D.SHAPES.map((id, i) => chip(Car3D.SHAPE_NAMES[i], shape === id, () => setShape(id), id))}</View>
      {label('Runs on')}
      <View style={styles.flow}>{Car.FUELS.map((id, i) => chip(Car.FUEL_NAMES[i], fuel === id, () => setFuel(id), id))}</View>
      {fuel !== 'ev' ? (
        <Field
          label={fuel === 'cng' ? 'CNG cylinder, kg' : 'Fuel tank, litres'}
          value={tank}
          onChange={setTank}
          numeric
          placeholder="Leave empty if unsure"
        />
      ) : null}
      {label('Colour')}
      <View style={styles.flow}>
        {Car3D.COLOURS.map((c, i) => (
          <Pressable key={c} onPress={() => setColour(c)} accessibilityLabel={Car3D.COLOUR_NAMES[i]} style={{ alignItems: 'center', width: 72 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c,
                borderWidth: colour.toUpperCase() === c ? 3 : 1,
                borderColor: colour.toUpperCase() === c ? look.accent : look.edge,
              }}
            />
            <Text style={{ color: look.textDim, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{t(Car3D.COLOUR_NAMES[i])}</Text>
          </Pressable>
        ))}
      </View>
      <Field label="Name beside the logo (e.g. SWIFT, BALENO)" value={carName} onChange={setCarName} placeholder={Car.nameFor(model)} />
      <Field label="Your name, for the greeting under the car" value={ownerName} onChange={setOwnerName} placeholder="Leave empty for no greeting" />
    </>
  );

  const layout = Layouts.get(LAYOUTS, Layouts.current(prefs));
  const lookStep = (
    <>
      {title('Choose the look')}
      {body("A theme for the colours, and a screen layout. There are more of both in Settings, and you can make your own.")}
      {label('Theme')}
      <View style={styles.flow}>
        {available().map((p) => chip(p.name, chosenTheme(prefs) === p.id, () => chooseTheme(prefs, p.id), p.id))}
      </View>
      <Row name="Themes" value="every theme as a picture of the home screen" state={themeName(prefs)} onPress={() => router.push('/settings/theme')} />
      {label('Screen layout')}
      <Row
        name="Screen layout"
        value="the boxes you choose, or one of the picture layouts"
        state={layout ? layout.name : t('Boxes')}
        onPress={() => router.push('/settings/layouts')}
      />
    </>
  );

  const levelStep = (
    <>
      {title('How much should OpenRath show?')}
      {body('Start simple if you like: you can add more any time in Settings, OpenRath level, or switch single features on.')}
      {Features.LEVEL_NAMES.map((name, i) => card(name, Features.LEVEL_ABOUT[i], level === i, () => setLevel(i)))}
    </>
  );

  const apps = (
    <>
      {title('Your apps')}
      {body('The buttons and boxes open these. Apps cannot be listed on this edition, so type the package name of each one.')}
      {Setup.APP_KEYS.map(([key, name, about]) => {
        const pkg = prefs.str('app:' + key, '');
        return (
          <View key={key}>
            {label(name)}
            <Field label={about} value={pkg} onChange={(v) => prefs.put('app:' + key, v.trim())} placeholder="e.g. com.google.android.apps.maps" />
          </View>
        );
      })}
    </>
  );

  const finish = (
    <>
      {title('Almost done')}
      {body('Two things make OpenRath feel like part of the car.')}
      <Row
        name="Connect your phone"
        value="Pair it in Bluetooth settings for calls and music through the stereo."
        state={t('Bluetooth settings')}
        onPress={() =>
          IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.BLUETOOTH_SETTINGS).catch(() =>
            toast('This unit has no Bluetooth settings screen', true),
          )
        }
      />
      <Row
        name="Make OpenRath the home app"
        value="The stereo starts in OpenRath, and the Home button comes back to it."
        state={t('Set')}
        onPress={() =>
          IntentLauncher.startActivityAsync('android.settings.HOME_SETTINGS').catch(() =>
            toast('This unit has no screen to choose the home app; press Home and choose OpenRath, Always', true),
          )
        }
      />
      {body('Tip: long-press any box to change what it shows. Settings is the gear in the buttons bar.')}
    </>
  );

  const steps = [welcome, access, car, lookStep, levelStep, apps, finish];
  const nextLabel = carOnly
    ? 'Save'
    : step === Setup.WELCOME
      ? "Let's start"
      : step === Setup.ACCESS && !asked
        ? 'Allow and continue'
        : step === Setup.FINISH
          ? 'Start driving'
          : 'Next';
  const at = step + 1;
  const total = Setup.STEPS.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: look.background }}>
      {carOnly ? null : (
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Text style={{ color: look.accent, fontSize: 13, fontWeight: '500' }}>
            {f('Step %1$s of %2$s', String(at), String(total)) + '  ·  ' + t(Setup.STEPS[step])}
          </Text>
          <View style={{ flexDirection: 'row', height: 5, marginTop: 8, borderRadius: 3, overflow: 'hidden', backgroundColor: look.panelTop }}>
            <View style={{ flex: at, backgroundColor: look.accent }} />
            <View style={{ flex: Math.max(0, total - at) }} />
          </View>
        </View>
      )}
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>{carOnly ? car : steps[step]}</ScrollView>
      <View style={[styles.bar, { borderColor: look.edge }]}>
        {step > Setup.WELCOME || carOnly ? (
          <View style={{ minWidth: 110 }}>
            <Button label="Back" onPress={back} />
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {step < Setup.FINISH && !carOnly ? (
          <Pressable onPress={skipAll} style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
            <Text style={{ color: look.textDim, fontSize: 15 }}>{t('Skip setup')}</Text>
          </Pressable>
        ) : null}
        <View style={{ minWidth: 170 }}>
          <Button label={nextLabel} kind="primary" onPress={forward} />
        </View>
      </View>
      {pick ? (
        <PickList title={pick.title} options={pick.options} onPick={pick.onPick} onClose={() => setPick(null)} />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '300', marginBottom: 8 },
  body: { fontSize: 16, lineHeight: 22, marginBottom: 18 },
  label: { fontSize: 12, letterSpacing: 1.6, marginTop: 18, marginBottom: 10, fontWeight: '500' },
  chip: { borderWidth: 1, borderRadius: 24, minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
  card: { borderRadius: 14, padding: 16, marginBottom: 12 },
  flow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
