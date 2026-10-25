/**
 * The news box on the dashboard (NewsCard in the Android version): the top headlines, a big
 * "Read aloud" button, and a tap on a headline reads just that one. Tapping the box fetches
 * fresh headlines; a long press opens the news page with the topic picker. Since 1.44 each
 * headline sits in its own soft panel, with a numbered badge and the paper's name under it, and a
 * tall box holds up to eight.
 */
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { memo, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as News from '../logic/news';
import type { Prefs } from '../logic/prefs';
import { say } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { isSpeaking, onSpeaking, stop as stopSpeech } from '../state/speech';
import { Box } from './ui';

/** The shared headlines, refreshed when old (every 30 minutes, retried after 3), re-rendering on change. */
export function useNews(): typeof News.state {
  const { prefs } = usePrefs();
  useSyncExternalStore(News.subscribe, () => News.state.version);
  useEffect(() => {
    News.refresh(prefs, false);
    const t = setInterval(() => News.refresh(prefs, false), 60000);
    return () => clearInterval(t);
  }, [prefs]);
  return News.state;
}

/** Read every headline aloud, fetching first when there are none yet. */
export async function readAll(prefs: Prefs) {
  if (News.state.items.length === 0) await News.refresh(prefs, true);
  say(News.read(News.state.items, News.topicName(prefs.str('newsTopic', 'top'))));
}

export const NewsBox = memo(function NewsBox({ style, lines = News.KEEP }: { style?: StyleProp<ViewStyle>; lines?: number }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const news = useNews();
  const [speaking, setSpeaking] = useState(isSpeaking);
  const [now, setNow] = useState(Date.now());

  // the button's Stop / Read aloud: the car says when it starts and stops talking
  useEffect(() => onSpeaking(setSpeaking), []);

  // the age in the heading, which is in minutes
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const toggle = async () => {
    if (await Speech.isSpeakingAsync().catch(() => false)) stopSpeech();
    else await readAll(prefs);
  };

  const n = Math.max(1, Math.min(News.KEEP, lines));
  const on = Features.on(prefs, 'news');
  return (
    <Box style={style} onPress={() => News.refresh(prefs, true)} onLongPress={() => router.push('/news')}>
      <View style={styles.top}>
        <Text style={[styles.head, { color: look.textDim }]} numberOfLines={1}>
          {News.heading(prefs.str('newsTopic', 'top'), news.at, now)}
        </Text>
        {/* a big target: it's pressed while driving */}
        <Pressable onPress={toggle} style={[styles.read, { borderColor: look.edge }]} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.readText, { color: look.text }]}>{speaking ? t('■  Stop') : t('▶  Read aloud')}</Text>
        </Pressable>
      </View>
      {news.items.length === 0 ? (
        <Text style={[styles.line, { color: look.textDim }]}>
          {!on ? t('The news box is switched off in Settings > Features.') : news.busy || news.tried === 0 ? t('Getting the headlines…') : t("Headlines show here when there's internet.")}
        </Text>
      ) : (
        news.items.slice(0, n).map((it, i) => (
          <Pressable
            key={i}
            onPress={() => say(News.readOne(it))}
            style={[styles.item, { backgroundColor: look.panelTop, borderColor: look.edge, borderRadius: Math.min(look.radius, 14) }]}
          >
            <View style={[styles.badge, { backgroundColor: look.accent }]}>
              <Text style={[styles.badgeText, { color: look.panel }]}>{i + 1}</Text>
            </View>
            <View style={styles.itemText}>
              <Text style={[styles.line, { color: look.text }]} numberOfLines={2}>
                {it.title}
              </Text>
              {it.source !== '' ? (
                <Text style={[styles.source, { color: look.textDim }]} numberOfLines={1}>
                  {it.source}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))
      )}
    </Box>
  );
});

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  head: { fontSize: 12.5, fontWeight: '500', flex: 1, marginRight: 8 },
  read: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 9 },
  readText: { fontSize: 17, fontWeight: '500' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, padding: 8, marginTop: 8 },
  itemText: { flex: 1 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '700' },
  line: { fontSize: 16 },
  source: { fontSize: 12.5, marginTop: 2 },
});
