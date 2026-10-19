/**
 * Settings > Cab driver (CabSettings.rows): the cab switches ("Turn on or off"), then the daily
 * target and break reminder, fare meter rates, the UPI id for fares, quiet ride, SOS contacts and
 * vehicle number, papers, phrase language, and clearing the earnings log. Each row shows only
 * when its tool is switched on.
 */
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { rates } from '../../logic/cabMeter';
import * as CabSettings from '../../logic/cabSettings';
import { contact, setContact } from '../../logic/cabSos';
import * as Errands from '../../logic/errands';
import * as Features from '../../logic/features';
import { fmt } from '../../logic/fuel';
import { f, t } from '../../logic/i18n';
import { num } from '../../logic/prefs';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

type Edit = 'target' | 'rates' | 'upi' | 'sos' | 'vehicle' | null;

export default function CabSettingsScreen() {
  const { prefs: p } = usePrefs();
  const look = useLook();
  const [edit, setEdit] = useState<Edit>(null);
  const [fields, setFields] = useState<string[]>([]);
  const set = (i: number) => (v: string) => setFields((old) => old.map((x, j) => (j === i ? v : x)));
  const on = (id: string) => Features.on(p, id);

  // the switches: the main one, and the tools under it while it is on
  const switches = (
    <>
      <Heading>{t('Turn on or off')}</Heading>
      {CabSettings.SWITCHES.filter((id) => id === 'cab' || on('cab')).map((id) => {
        const ft = Features.get(id);
        return (
          <Row
            key={id}
            name={t(ft?.name ?? id)}
            value={ft ? t(ft.about) : undefined}
            onPress={() => Features.set(p, id, !on(id))}
            right={<Switch value={on(id)} onValueChange={(v) => Features.set(p, id, v)} />}
          />
        );
      })}
    </>
  );

  if (!on('cab')) {
    return (
      <Screen title={t('Cab driver')}>
        {switches}
        <Row name={t('Cab driver tools are off')} value={t('switch them on above')} />
      </Screen>
    );
  }

  const open = (what: Edit) => {
    setEdit(what);
    if (what === 'target') setFields([String(num(p, 'cabTargetRs', 2000))]);
    if (what === 'rates') {
      const r = rates(p);
      setFields(CabSettings.RATE_KEYS.map(([field]) => fmt(r[field]).replace('.0', '')));
    }
    if (what === 'upi') setFields([p.str('upiId', '')]);
    if (what === 'vehicle') setFields([p.str('cabVehicle', '')]);
    if (what === 'sos') {
      const c1 = contact(p, 1);
      const c2 = contact(p, 2);
      setFields([c1?.[0] ?? '', c1?.[1] ?? '', c2?.[0] ?? '', c2?.[1] ?? '']);
    }
  };

  const save = () => {
    if (edit === 'target') {
      const v = parseInt(fields[0], 10);
      if (!Number.isFinite(v)) return toast(t('Enter a number'));
      p.put('cabTargetRs', String(v));
    } else if (edit === 'rates') {
      CabSettings.RATE_KEYS.forEach(([, key], i) => {
        const v = parseFloat(fields[i]);
        if (v >= 0) p.put(key, String(v));
      });
    } else if (edit === 'upi') {
      const v = fields[0].trim();
      if (v !== '' && !Errands.validVpa(v)) return toast(t("That doesn't look like a UPI id (name@bank)"));
      p.put('upiId', v);
    } else if (edit === 'vehicle') {
      p.put('cabVehicle', fields[0].trim().toUpperCase());
    } else if (edit === 'sos') {
      setContact(p, 1, fields[0], fields[1]);
      setContact(p, 2, fields[2], fields[3]);
    }
    setEdit(null);
  };

  const editor = (what: Edit, title: string, body: ReactNode, note?: string) =>
    edit === what ? (
      <View style={{ marginVertical: 12 }}>
        <Heading>{t(title)}</Heading>
        {note ? <Text style={{ color: look.textDim, marginBottom: 8 }}>{t(note)}</Text> : null}
        {body}
        <Button label={t('Save')} kind="primary" onPress={save} />
        <Button label={t('Cancel')} onPress={() => setEdit(null)} />
      </View>
    ) : null;

  const upi = p.str('upiId', '');
  const vehicle = p.str('cabVehicle', '');
  return (
    <Screen title={t('Cab driver')}>
      {switches}
      <Heading>{t('Cab driver')}</Heading>
      <Row name={t('Cab box')} value={t('long-press any box on the dashboard and pick Cab driver')} />
      {on('cabTarget') ? (
        <>
          <Row name={t('Daily target')} value={f('%1$s net', Cab.rs(num(p, 'cabTargetRs', 2000)))} onPress={() => open('target')} />
          {editor('target', 'Daily target (₹ net)', <Field label={t('Daily target (₹ net)')} value={fields[0] ?? ''} onChange={set(0)} numeric />)}
          <Row
            name={t('Break reminder after')}
            value={f('%1$s hours on duty', num(p, 'cabDutyH', 10))}
            onPress={() => p.put('cabDutyH', String(CabSettings.nextDutyH(num(p, 'cabDutyH', 10))))}
          />
        </>
      ) : null}
      {on('cabMeter') ? (
        <>
          <Row name={t('Fare meter rates')} value={CabSettings.ratesText(rates(p))} onPress={() => open('rates')} />
          {editor('rates', 'Fare meter rates', CabSettings.RATE_KEYS.map(([field, , label], i) => (
            <Field key={field} label={t(label)} value={fields[i] ?? ''} onChange={set(i)} numeric />
          )))}
        </>
      ) : null}
      {on('cabMeter') || on('cabEarnings') ? (
        <>
          <Row name={t('UPI id for fares')} value={upi === '' ? t('not set: the meter can show a QR code to pay you') : upi} onPress={() => open('upi')} />
          {editor('upi', 'Your UPI id', <Field label={t('Your UPI id')} value={fields[0] ?? ''} onChange={set(0)} placeholder="name@bank" />)}
        </>
      ) : null}
      {on('cabQuiet') ? (
        <>
          <Row
            name={t('Quiet ride volume')}
            value={f('%1$s%% of full', num(p, 'cabQuietPct', 30))}
            onPress={() => p.put('cabQuietPct', String(CabSettings.nextQuietPct(num(p, 'cabQuietPct', 30))))}
          />
          <Row
            name={t('Quiet ride with the meter')}
            value={t(p.str('cabQuietWithMeter', 'on') === 'on' ? 'starts and ends with the fare meter' : 'only from the Cab menu')}
            onPress={() => p.put('cabQuietWithMeter', p.str('cabQuietWithMeter', 'on') === 'on' ? 'off' : 'on')}
          />
        </>
      ) : null}
      {on('cabSos') ? (
        <>
          <Row name={t('SOS contacts')} value={CabSettings.contactsText(p)} onPress={() => open('sos')} />
          {editor(
            'sos',
            'SOS contacts',
            <>
              <Field label={f('Contact %1$s: name', 1)} value={fields[0] ?? ''} onChange={set(0)} />
              <Field label={f('Contact %1$s: phone number', 1)} value={fields[1] ?? ''} onChange={set(1)} numeric />
              <Field label={f('Contact %1$s: name', 2)} value={fields[2] ?? ''} onChange={set(2)} />
              <Field label={f('Contact %1$s: phone number', 2)} value={fields[3] ?? ''} onChange={set(3)} numeric />
            </>,
            'SOS texts them where the car is. Without a SIM in the stereo it calls the first one through your phone instead.',
          )}
        </>
      ) : null}
      {on('cabSos') || on('cabMeter') ? (
        <>
          <Row name={t('Vehicle number')} value={vehicle === '' ? t('not set (goes in the SOS text)') : vehicle} onPress={() => open('vehicle')} />
          {editor('vehicle', 'Vehicle number', <Field label={t('Vehicle number')} value={fields[0] ?? ''} onChange={set(0)} placeholder={t('e.g. DL 1R AB 1234')} />)}
        </>
      ) : null}
      {on('cabPapers') ? (
        <Row name={t('Papers due dates')} value={CabSettings.papersSummary(p, Date.now())} onPress={() => router.push('/cab/papers')} />
      ) : null}
      {on('cabPhrases') ? (
        <Row
          name={t('Phrases in')}
          value={Cab.langName(p.str('cabLang', 'hi'))}
          onPress={() => {
            const i = Math.max(0, Cab.LANGS.indexOf(p.str('cabLang', 'hi')));
            p.put('cabLang', Cab.LANGS[(i + 1) % Cab.LANGS.length]);
          }}
        />
      ) : null}
      {on('cabEarnings') ? (
        <Row
          name={t('Clear the earnings log')}
          value={f('%1$s entries', Cab.log(p).length)}
          onPress={() =>
            Alert.alert(t('Delete every ride and cost in the log?'), undefined, [
              { text: t('Keep'), style: 'cancel' },
              { text: t('Delete all'), style: 'destructive', onPress: () => Cab.save(p, []) },
            ])
          }
        />
      ) : null}
    </Screen>
  );
}
