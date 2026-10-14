/** Settings (SettingsView in the Android version): each row shows its current value. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Car from '../../logic/car';
import * as Features from '../../logic/features';
import * as Fuel from '../../logic/fuel';
import * as Holidays from '../../logic/holidays';
import { num } from '../../logic/prefs';
import { DEFAULT_THEME, themeJson } from '../../state/look';
import { usePrefs } from '../../state/prefs';

export default function Settings() {
  const { prefs } = usePrefs();
  const [editing, setEditing] = useState<'' | 'price' | 'warn' | 'toll'>('');
  const [value, setValue] = useState('');
  const fuel = Car.fuel(prefs);
  const on = Features.ALL.filter((f) => Features.on(prefs, f.id)).length;

  const edit = (what: 'price' | 'warn' | 'toll', current: string) => {
    setEditing(what);
    setValue(current);
  };
  const save = () => {
    const v = value.trim();
    if (v !== '' && !(parseFloat(v) >= 0)) return Alert.alert('Enter a number');
    if (editing === 'price') prefs.put('fuelPrice', v === '' ? '0' : v);
    if (editing === 'warn') prefs.put('warnSpeed', v === '' ? '0' : String(Math.round(parseFloat(v))));
    if (editing === 'toll') prefs.put('tollRate', v === '' ? '100' : String(Math.round(parseFloat(v))));
    setEditing('');
  };
  const editor = (what: string, label: string) =>
    editing === what ? (
      <>
        <Field label={label} value={value} onChange={setValue} numeric />
        <Button label="Save" kind="primary" onPress={save} />
        <Button label="Cancel" onPress={() => setEditing('')} />
      </>
    ) : null;

  const warn = num(prefs, 'warnSpeed', 0);
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

      <Heading>Dashboard</Heading>
      <Row name="Theme" value={themeJson(prefs.str('theme', DEFAULT_THEME)).name} onPress={() => router.push('/settings/theme')} />
      <Row name="Features" value={`${on} of ${Features.ALL.length} on`} onPress={() => router.push('/settings/features')} />

      <Heading>Driving</Heading>
      <Row name="Warn above this speed anywhere" value={warn > 0 ? `${warn} km/h` : 'Only where the road has a limit'} onPress={() => edit('warn', warn > 0 ? String(warn) : '')} />
      {editor('warn', 'km/h (80 to 120); empty for off')}
      <Row name="Toll per plaza on routes" value={`₹${num(prefs, 'tollRate', 100)}`} onPress={() => edit('toll', String(num(prefs, 'tollRate', 100)))} />
      {editor('toll', 'Rupees per toll plaza')}
      <Row name="Holiday traffic ahead" value={Holidays.upcoming(new Date(), 3).join('; ')} />

      <Heading>Help</Heading>
      <Row name="About OpenRath" value="Version 1.28, React Native edition" onPress={() => router.push('/settings/about')} />
    </Screen>
  );
}
