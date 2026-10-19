/**
 * Phrases for the passenger (Cab.phrases): seat belt, OTP, AC, payment and more, spoken in Hindi,
 * English or five other Indian languages, plus the driver's own in any language. A phrase with no
 * voice for its language on the unit is said in English instead.
 */
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Choice, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { f, t } from '../../logic/i18n';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

const NAMES: Record<string, string> = { hi: 'Hindi', en: 'English', mr: 'Marathi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ml: 'Malayalam' };

export default function Phrases() {
  const { prefs } = usePrefs();
  const look = useLook();
  const lang = prefs.str('cabLang', 'hi');
  const list = Cab.phraseList(prefs);
  const [own, setOwn] = useState('');
  const [adding, setAdding] = useState(false);
  const langOptions = Cab.LANGS.map((id, i) => ({ id, label: t(Cab.LANG_NAMES[i]) }));

  const speak = async (i: number) => {
    const text = list[i];
    const mine = i >= Cab.PHRASES.length;
    const voice = Cab.voiceFor(text, mine, lang);
    const code = voice.split('-')[0];
    toast(text);
    let has = true;
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      has = voices.length === 0 || voices.some((v) => v.language.toLowerCase().replace('_', '-').startsWith(code));
    } catch {
      // can't tell: try it
    }
    if (!has) {
      toast(f('No %1$s voice on the unit, so here it is in English', NAMES[code] ?? code));
      if (!mine) Speech.speak(Cab.PHRASES[i][0], { language: 'en-IN' });
      return;
    }
    Speech.speak(text, { language: voice });
  };

  return (
    <Screen title={f('Say to the passenger (%1$s)', Cab.langName(lang))}>
      {list.map((t, i) => (
        <Row key={i + t} name={t} onPress={() => speak(i)} />
      ))}
      <Heading>{t('Phrases in')}</Heading>
      <Choice options={langOptions} value={lang} onChange={(v) => prefs.put('cabLang', v)} />
      {adding ? (
        <>
          <Heading>{t('Your own phrase')}</Heading>
          <Field label={t('Type it in any language')} value={own} onChange={setOwn} />
          <Button label={t('Save')} kind="primary" onPress={() => {
            Cab.addPhrase(prefs, own);
            setOwn('');
            setAdding(false);
          }} />
          <Button label={t('Cancel')} onPress={() => setAdding(false)} />
        </>
      ) : (
        <Button label={t('Add your own')} onPress={() => setAdding(true)} />
      )}
      <Text style={{ color: look.textDim, marginTop: 8 }}>{t('Tap a phrase to say it aloud.')}</Text>
    </Screen>
  );
}
