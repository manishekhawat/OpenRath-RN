/**
 * The news page: which topic the news box shows (Settings > "News box shows" in the Android
 * version) and the headlines in full, each read aloud on a tap. ?read=1 (the voice command
 * "read the news") reads them all aloud on opening.
 */
import * as Speech from 'expo-speech';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import { readAll, useNews } from '../components/NewsBox';
import { Button, Choice, Heading, Row, Screen } from '../components/ui';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as News from '../logic/news';
import { say } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { stop as stopSpeech } from '../state/speech';

export default function NewsScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const news = useNews();
  const [busy, setBusy] = useState(false);
  const topic = prefs.str('newsTopic', 'top');
  const { read } = useLocalSearchParams<{ read?: string }>();

  useEffect(() => {
    if (read === '1') readAll(prefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [read]);

  const fetchNow = async () => {
    setBusy(true);
    await News.refresh(prefs, true);
    setBusy(false);
  };

  const pick = (id: string) => {
    News.setTopic(prefs, id);
    fetchNow();
  };

  const on = Features.on(prefs, 'news');
  return (
    <Screen title={t('News box')}>
      {!on ? <Text style={{ color: look.accent, marginBottom: 8 }}>{t('The news box is switched off in Settings > Features.')}</Text> : null}
      <Heading>{t('News box shows')}</Heading>
      <Choice options={News.TOPICS.map((id, i) => ({ id, label: t(News.TOPIC_NAMES[i]) }))} value={topic} onChange={pick} />
      <Heading>{News.heading(topic, news.at, Date.now())}</Heading>
      {news.items.length === 0 ? (
        <Text style={{ color: look.textDim, marginVertical: 8 }}>
          {busy ? t('Getting the headlines…') : t("Headlines show here when there's internet.")}
        </Text>
      ) : (
        news.items.map((it, i) => <Row key={i} name={`${i + 1}.  ${it.title}`} value={it.source} onPress={() => say(News.readOne(it))} />)
      )}
      <Button label={t('▶  Read aloud')} kind="primary" onPress={() => readAll(prefs)} />
      <Button label={t('■  Stop')} onPress={() => stopSpeech()} />
      <Button label={busy ? t('Fetching…') : t('Fetch the latest')} onPress={fetchNow} />
      <Text style={{ color: look.textDim, marginTop: 8 }}>
        {t("From Google News, every 30 minutes while there is internet. The last five are kept for when there isn't.")}
      </Text>
    </Screen>
  );
}
