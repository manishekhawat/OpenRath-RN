/** Settings (SettingsView in the Android version): each row shows its current value. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Car from '../../logic/car';
import * as Car3D from '../../logic/car3d';
import * as Chores from '../../logic/chores';
import * as Dashcam from '../../logic/dashcam';
import * as Features from '../../logic/features';
import * as Fuel from '../../logic/fuel';
import * as Holidays from '../../logic/holidays';
import { num } from '../../logic/prefs';
import * as Rescue from '../../logic/rescue';
import * as Valet from '../../logic/valet';
import * as Layouts from '../../logic/layouts';
import * as Cam from '../../state/camera';
import { themeName } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function Settings() {
  const { prefs } = usePrefs();
  type Edit = '' | 'price' | 'warn' | 'toll' | 'cam' | 'pin' | 'valetSpeed';
  const [editing, setEditing] = useState<Edit>('');
  const [unlocked, setUnlocked] = useState(false);
  const [pinTry, setPinTry] = useState('');
  const [value, setValue] = useState('');
  const fuel = Car.fuel(prefs);
  const on = Features.ALL.filter((f) => Features.on(prefs, f.id)).length;

  const edit = (what: Edit, current: string) => {
    setEditing(what);
    setValue(current);
  };
  const save = () => {
    const v = value.trim();
    if (editing === 'cam') {
      prefs.put('app:cam360', v);
      return setEditing('');
    }
    if (editing === 'pin') {
      // the first time valet mode goes on, a PIN is chosen
      if (!Valet.validPin(v)) return Alert.alert('Use 4 to 8 digits');
      prefs.put('valetPin', v);
      prefs.put('valet', 'on');
      Alert.alert(Valet.onText(prefs));
      return setEditing('');
    }
    if (editing === 'valetSpeed') {
      if (!(parseFloat(v) >= 20)) return Alert.alert('Enter a speed in km/h');
      prefs.put('valetSpeed', String(Math.round(parseFloat(v))));
      return setEditing('');
    }
    if (v !== '' && !(parseFloat(v) >= 0)) return Alert.alert('Enter a number');
    if (editing === 'price') prefs.put('fuelPrice', v === '' ? '0' : v);
    if (editing === 'warn') prefs.put('warnSpeed', v === '' ? '0' : String(Math.round(parseFloat(v))));
    if (editing === 'toll') prefs.put('tollRate', v === '' ? '100' : String(Math.round(parseFloat(v))));
    setEditing('');
  };
  const editor = (what: string, label: string, numeric = true) =>
    editing === what ? (
      <>
        <Field label={label} value={value} onChange={setValue} numeric={numeric} secret={what === 'pin'} />
        <Button label="Save" kind="primary" onPress={save} />
        <Button label="Cancel" onPress={() => setEditing('')} />
      </>
    ) : null;

  const warn = num(prefs, 'warnSpeed', 0);

  // valet mode: Settings needs the owner's PIN
  if (Valet.on(prefs) && !unlocked) {
    return (
      <Screen title="Settings">
        <Text style={{ color: '#9AA0A6', marginBottom: 12 }}>Valet mode is on. Enter the PIN</Text>
        <Field label="PIN" value={pinTry} onChange={setPinTry} numeric secret />
        <Button
          label="OK"
          kind="primary"
          onPress={() => {
            if (pinTry.trim() === Valet.pin(prefs)) setUnlocked(true);
            else Alert.alert('Wrong PIN');
            setPinTry('');
          }}
        />
      </Screen>
    );
  }

  const valetRow = () => {
    if (Valet.on(prefs)) {
      prefs.put('valet', 'off');
      return Alert.alert('Valet mode is off');
    }
    if (Valet.pin(prefs).length < 4) return edit('pin', '');
    prefs.put('valet', 'on');
    Alert.alert(Valet.onText(prefs));
  };
  const saverMins = [2, 5, 10, 15, 30];
  const saverMin = num(prefs, 'saverMin', 5);

  return (
    <Screen title="Settings">
      <Heading>Car</Heading>
      <Row
        name="Your car"
        value={[Car.brandName(prefs), Car.model(prefs), Car.FUEL_NAMES[Car.FUELS.indexOf(fuel as never)] ?? fuel].filter(Boolean).join(' · ')}
        onPress={() => router.push('/setup')}
      />
      <Row name="Car care" value="Odometer, service, insurance and PUC" onPress={() => router.push('/care')} />
      <Row name={`${Car.word(fuel).replace(/^./, (c) => c.toUpperCase())} log`} value="Fill-ups and mileage" onPress={() => router.push('/fuel')} />
      <Row name={`${Car.word(fuel).replace(/^./, (c) => c.toUpperCase())} price`} value={Fuel.priceText(prefs)} onPress={() => edit('price', prefs.str('fuelPrice', ''))} />
      {editor('price', 'Price per litre (₹); empty to use your fill-ups')}
      <Row name="Trip history" value="Drives, mileage tips, commute and routes" onPress={() => router.push('/trips')} />
      <Row name="Tolls paid" value="Log tolls and see the totals" onPress={() => router.push('/tolls')} />
      <Row name="Weekly report" value="Last week's driving and spending" onPress={() => router.push('/report')} />
      {Features.on(prefs, 'wallet') ? <Row name="Car documents" value="RC, insurance, PUC and licence" onPress={() => router.push('/wallet')} /> : null}
      {Features.on(prefs, 'view360') ? (
        <>
          <Row name="360 view of your car" value={[Car3D.SHAPE_NAMES[Car3D.SHAPES.indexOf(Car3D.shape(prefs) as never)], Car3D.plate(prefs)].filter(Boolean).join(' · ')} onPress={() => router.push('/view360')} />
          <Row name="Stereo's 360 camera app" value={prefs.str('app:cam360', '') || 'Not set: type its package name'} onPress={() => edit('cam', prefs.str('app:cam360', ''))} />
          {editor('cam', 'Package name, e.g. com.example.camera360', false)}
        </>
      ) : null}

      <Heading>Dashboard</Heading>
      <Row name="Theme" value={themeName(prefs)} onPress={() => router.push('/settings/theme')} />
      <Row name="Picture layouts" value={Layouts.current(prefs) === Layouts.BOXES ? 'Boxes (the classic dashboard)' : 'A picture layout is on'} onPress={() => router.push('/settings/layouts')} />
      <Row name="Features" value={`${on} of ${Features.ALL.length} on`} onPress={() => router.push('/settings/features')} />
      {Features.on(prefs, 'voice') ? (
        <Row
          name="Voice commands language"
          value={prefs.str('voiceLang', 'en-IN') === 'hi-IN' ? 'Hindi' : 'English (India)'}
          onPress={() => prefs.put('voiceLang', prefs.str('voiceLang', 'en-IN') === 'hi-IN' ? 'en-IN' : 'hi-IN')}
        />
      ) : null}
      {Features.on(prefs, 'news') ? <Row name="News" value="Topic and headlines" onPress={() => router.push('/news')} /> : null}
      {Features.on(prefs, 'saver') ? (
        <Row
          name="Clock screensaver after"
          value={`${saverMin} minutes idle while parked`}
          onPress={() => prefs.put('saverMin', String(saverMins[(saverMins.indexOf(saverMin) + 1) % saverMins.length]))}
        />
      ) : null}

      <Heading>Driving</Heading>
      <Row name="Warn above this speed anywhere" value={warn > 0 ? `${warn} km/h` : 'Only where the road has a limit'} onPress={() => edit('warn', warn > 0 ? String(warn) : '')} />
      {editor('warn', 'km/h (80 to 120); empty for off')}
      <Row name="Toll per plaza on routes" value={`₹${num(prefs, 'tollRate', 100)}`} onPress={() => edit('toll', String(num(prefs, 'tollRate', 100)))} />
      {editor('toll', 'Rupees per toll plaza')}
      <Row name="Holiday traffic ahead" value={Holidays.upcoming(new Date(), 3).join('; ')} />
      {Features.on(prefs, 'dashcam') ? <Row name="Dashcam" value={Dashcam.rowText(prefs, Cam.get().status)} onPress={() => router.push('/dashcam')} /> : null}
      {Features.on(prefs, 'parkPhoto') ? <Row name="Last parking photo" value={Cam.photoRowText()} onPress={() => router.push('/parkphoto')} /> : null}
      <Row name="Road helpers" value="Highway, hills, fog, monsoon, breaks and learnt spots" onPress={() => router.push('/settings/road')} />
      <Row name="Emergency contact" value={Rescue.contactRow(prefs, Features.on(prefs, 'accidentHelp'))} onPress={() => router.push('/sos?setup=1')} />

      <Heading>Errands</Heading>
      <Row name="Paid parking reminder" value={Chores.parkingRow(prefs)} onPress={() => router.push('/chores?open=parkTimer')} />
      <Row name="Split a bill, guest Wi-Fi, wash" value="UPI split, hotspot QR code and the wash reminder" onPress={() => router.push('/chores')} />
      {Features.on(prefs, 'kids') ? <Row name="Trip games" value="For the kids in the back" onPress={() => router.push('/kids')} /> : null}
      <Row name="Cab driver tools" value="Earnings, meter, papers and ride apps" onPress={() => router.push('/cab')} />
      <Row name="Boot animation maker" value="Your car's name on the stereo's start-up" onPress={() => router.push('/bootart')} />

      <Heading>Family</Heading>
      <Row
        name="Valet or kids mode"
        value={Valet.on(prefs) ? `On: warning above ${Valet.speed(prefs)} km/h, Settings locked` : 'Off'}
        onPress={valetRow}
      />
      {editor('pin', 'Choose a 4-digit PIN for valet mode')}
      <Row name="Valet warning speed" value={`${Valet.speed(prefs)} km/h`} onPress={() => edit('valetSpeed', String(Valet.speed(prefs)))} />
      {editor('valetSpeed', 'km/h')}

      <Heading>Your data</Heading>
      <Row name="Driver profiles" value={prefs.str('profile', '') || 'One driver'} onPress={() => router.push('/settings/profiles')} />
      <Row name="Backup and restore" value="Save your settings to a file, or bring them back" onPress={() => router.push('/settings/backup')} />

      <Heading>Help</Heading>
      <Row name="About OpenRath" value="Version 1.30, React Native edition" onPress={() => router.push('/settings/about')} />
    </Screen>
  );
}
