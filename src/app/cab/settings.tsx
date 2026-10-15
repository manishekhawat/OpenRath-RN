/**
 * Settings > Cab driver (Cab.rows): daily target and break reminder, fare meter rates, the UPI id
 * for fares, quiet ride, SOS contacts and vehicle number, papers, phrase language, and clearing
 * the earnings log. Each row shows only when its tool is switched on in Features.
 */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import * as Errands from '../../logic/errands';
import * as Features from '../../logic/features';
import { fmt } from '../../logic/fuel';
import { num } from '../../logic/prefs';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

type Edit = 'target' | 'rates' | 'upi' | 'sos' | 'vehicle' | null;

export default function CabSettings() {
  const { prefs: p } = usePrefs();
  const look = useLook();
  const [edit, setEdit] = useState<Edit>(null);
  const [f, setF] = useState<string[]>([]);
  const set = (i: number) => (v: string) => setF((old) => old.map((x, j) => (j === i ? v : x)));
  const on = (id: string) => Features.on(p, id);

  if (!on('cab')) {
    return (
      <Screen title="Cab driver">
        <Row name="Cab driver tools are off" value="switch them on in Features" onPress={() => router.push('/settings/features')} />
      </Screen>
    );
  }

  const open = (what: Edit) => {
    setEdit(what);
    if (what === 'target') setF([String(num(p, 'cabTargetRs', 2000))]);
    if (what === 'rates') {
      const r = Cab.rates(p);
      setF(Cab.RATE_KEYS.map(([field]) => fmt(r[field]).replace('.0', '')));
    }
    if (what === 'upi') setF([p.str('upiId', '')]);
    if (what === 'vehicle') setF([p.str('cabVehicle', '')]);
    if (what === 'sos') {
      const c1 = Cab.contact(p, 1);
      const c2 = Cab.contact(p, 2);
      setF([c1?.[0] ?? '', c1?.[1] ?? '', c2?.[0] ?? '', c2?.[1] ?? '']);
    }
  };

  const save = () => {
    if (edit === 'target') {
      const v = parseInt(f[0], 10);
      if (!Number.isFinite(v)) return toast('Enter a number');
      p.put('cabTargetRs', String(v));
    } else if (edit === 'rates') {
      Cab.RATE_KEYS.forEach(([, key], i) => {
        const v = parseFloat(f[i]);
        if (v >= 0) p.put(key, String(v));
      });
    } else if (edit === 'upi') {
      const v = f[0].trim();
      if (v !== '' && !Errands.validVpa(v)) return toast("That doesn't look like a UPI id (name@bank)");
      p.put('upiId', v);
    } else if (edit === 'vehicle') {
      p.put('cabVehicle', f[0].trim().toUpperCase());
    } else if (edit === 'sos') {
      Cab.setContact(p, 1, f[0], f[1]);
      Cab.setContact(p, 2, f[2], f[3]);
    }
    setEdit(null);
  };

  const editor = (what: Edit, title: string, fields: ReactNode, note?: string) =>
    edit === what ? (
      <View style={{ marginVertical: 12 }}>
        <Heading>{title}</Heading>
        {note ? <Text style={{ color: look.textDim, marginBottom: 8 }}>{note}</Text> : null}
        {fields}
        <Button label="Save" kind="primary" onPress={save} />
        <Button label="Cancel" onPress={() => setEdit(null)} />
      </View>
    ) : null;

  const upi = p.str('upiId', '');
  const vehicle = p.str('cabVehicle', '');
  return (
    <Screen title="Cab driver">
      <Row name="Cab box" value="long-press any box on the dashboard and pick Cab driver" />
      {on('cabTarget') ? (
        <>
          <Row name="Daily target" value={Cab.rs(num(p, 'cabTargetRs', 2000)) + ' net'} onPress={() => open('target')} />
          {editor('target', 'Daily target (₹ net)', <Field label="₹ net" value={f[0] ?? ''} onChange={set(0)} numeric />)}
          <Row
            name="Break reminder after"
            value={num(p, 'cabDutyH', 10) + ' hours on duty'}
            onPress={() => p.put('cabDutyH', String(Cab.nextDutyH(num(p, 'cabDutyH', 10))))}
          />
        </>
      ) : null}
      {on('cabMeter') ? (
        <>
          <Row name="Fare meter rates" value={Cab.ratesText(Cab.rates(p))} onPress={() => open('rates')} />
          {editor('rates', 'Fare meter rates', Cab.RATE_KEYS.map(([field, , label], i) => (
            <Field key={field} label={label} value={f[i] ?? ''} onChange={set(i)} numeric />
          )))}
        </>
      ) : null}
      {on('cabMeter') || on('cabEarnings') ? (
        <>
          <Row name="UPI id for fares" value={upi === '' ? 'not set: the meter can show a QR code to pay you' : upi} onPress={() => open('upi')} />
          {editor('upi', 'Your UPI id', <Field label="UPI id" value={f[0] ?? ''} onChange={set(0)} placeholder="name@bank" />)}
        </>
      ) : null}
      {on('cabQuiet') ? (
        <>
          <Row
            name="Quiet ride volume"
            value={num(p, 'cabQuietPct', 30) + '% of full'}
            onPress={() => p.put('cabQuietPct', String(Cab.nextQuietPct(num(p, 'cabQuietPct', 30))))}
          />
          <Row
            name="Quiet ride with the meter"
            value={p.str('cabQuietWithMeter', 'on') === 'on' ? 'starts and ends with the fare meter' : 'only from the Cab menu'}
            onPress={() => p.put('cabQuietWithMeter', p.str('cabQuietWithMeter', 'on') === 'on' ? 'off' : 'on')}
          />
        </>
      ) : null}
      {on('cabSos') ? (
        <>
          <Row name="SOS contacts" value={Cab.contactsText(p)} onPress={() => open('sos')} />
          {editor(
            'sos',
            'SOS contacts',
            <>
              <Field label="Contact 1: name" value={f[0] ?? ''} onChange={set(0)} />
              <Field label="Contact 1: phone number" value={f[1] ?? ''} onChange={set(1)} numeric />
              <Field label="Contact 2: name" value={f[2] ?? ''} onChange={set(2)} />
              <Field label="Contact 2: phone number" value={f[3] ?? ''} onChange={set(3)} numeric />
            </>,
            'SOS texts them where the car is. Without a SIM in the stereo it calls the first one through your phone instead.',
          )}
        </>
      ) : null}
      {on('cabSos') || on('cabMeter') ? (
        <>
          <Row name="Vehicle number" value={vehicle === '' ? 'not set (goes in the SOS text)' : vehicle} onPress={() => open('vehicle')} />
          {editor('vehicle', 'Vehicle number', <Field label="Vehicle number" value={f[0] ?? ''} onChange={set(0)} placeholder="e.g. DL 1R AB 1234" />)}
        </>
      ) : null}
      {on('cabPapers') ? <Row name="Papers due dates" value={Cab.papersSummary(p, Date.now())} onPress={() => router.push('/cab/papers')} /> : null}
      {on('cabPhrases') ? (
        <Row
          name="Phrases in"
          value={Cab.langName(p.str('cabLang', 'hi'))}
          onPress={() => {
            const i = Math.max(0, Cab.LANGS.indexOf(p.str('cabLang', 'hi')));
            p.put('cabLang', Cab.LANGS[(i + 1) % Cab.LANGS.length]);
          }}
        />
      ) : null}
      {on('cabEarnings') ? (
        <Row
          name="Clear the earnings log"
          value={Cab.log(p).length + ' entries'}
          onPress={() =>
            Alert.alert('Delete every ride and cost in the log?', undefined, [
              { text: 'Keep', style: 'cancel' },
              { text: 'Delete all', style: 'destructive', onPress: () => Cab.save(p, []) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
