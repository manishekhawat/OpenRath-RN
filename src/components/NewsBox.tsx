/**
 * The news box on the dashboard (NewsCard in the Android version): the top five headlines, a big
 * "Read aloud" button, and a tap on a headline reads just that one. Tapping the box fetches
 * fresh headlines; a long press opens the news page with the topic picker.
 */
import * as Speech from 'expo-speech';
import { router } from 'expo-router';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Features from '../logic/features';
import * as News from '../logic/news';
import type { Prefs } from '../logic/prefs';
import { say } from '../state/drive';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
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

export function NewsBox({ style, lines = News.COUNT }: { style?: StyleProp<ViewStyle>; lines?: number }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const news = useNews();
  const [speaking, setSpeaking] = useState(false);
  const [now, setNow] = useState(Date.now());

  // the age in the heading, and the button's Stop / Read aloud
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      Speech.isSpeakingAsync().then(setSpeaking, () => {});
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const toggle = async () => {
    if (await Speech.isSpeakingAsync().catch(() => false)) Speech.stop();
    else await readAll(prefs);
    setTimeout(() => Speech.isSpeakingAsync().then(setSpeaking, () => {}), 600);
  };

  const n = Math.max(1, Math.min(News.COUNT, lines));
  const on = Features.on(prefs, 'news');
  return (
    <Box style={style} onPress={() => News.refresh(prefs, true)} onLongPress={() => router.push('/news')}>
      <View style={styles.top}>
        <Text style={[styles.head, { color: look.textDim }]} numberOfLines={1}>
          {News.heading(prefs.str('newsTopic', 'top'), news.at, now)}
        </Text>
        {/* a big target: it's pressed while driving */}
        <Pressable onPress={toggle} style={[styles.read, { borderColor: look.edge }]} hitSlop={8} accessibilityRole="button">
          <Text style={[styles.readText, { color: look.text }]}>{speaking ? '■  Stop' : '▶  Read aloud'}</Text>
        </Pressable>
      </View>
      {news.items.length === 0 ? (
        <Text style={[styles.line, { color: look.textDim }]}>
          {!on ? 'The news box is switched off in Settings > Features.' : news.busy || news.tried === 0 ? 'Getting the headlines…' : 'Headlines show here when there\'s internet.'}
        </Text>
      ) : (
        news.items.slice(0, n).map((it, i) => (
          <Pressable key={i} onPress={() => say(News.readOne(it))}>
            <Text style={[styles.line, { color: look.text }]} numberOfLines={1}>
              {i + 1}.  {it.title}
            </Text>
          </Pressable>
        ))
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  head: { fontSize: 12.5, fontWeight: '500', flex: 1, marginRight: 8 },
  read: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 22, paddingVertical: 9 },
  readText: { fontSize: 17, fontWeight: '500' },
  line: { fontSize: 16, marginTop: 8 },
});
