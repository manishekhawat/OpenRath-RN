/**
 * The calendar box (Cards.CalendarCard, feature calendar): today's and the next few days' events
 * from the unit's calendars, read with expo-calendar every 5 minutes. A tap asks for the calendar
 * permission the first time, then opens the calendar app.
 */
import * as Calendar from 'expo-calendar';
import * as IntentLauncher from 'expo-intent-launcher';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Platform, StyleSheet, Text, ToastAndroid, View, type StyleProp, type ViewStyle } from 'react-native';

import * as Agenda from '../logic/agenda';
import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { TapBox } from './Tap';

const READ_MS = 5 * 60000;

function toast(s: string) {
  if (Platform.OS === 'android') ToastAndroid.show(s, ToastAndroid.LONG);
  else Alert.alert(s);
}

function ms(d: Date | string | undefined): number {
  return d == null ? 0 : new Date(d).getTime();
}

/**
 * What the box last read, for the clock box's line under the date (CalendarCard.seen); null until
 * the calendar has been read once.
 */
let seen: Agenda.Event[] | null = null;

/** The events the calendar box last read, or null. */
export function lastSeen(): Agenda.Event[] | null {
  return seen;
}

export const CalendarBox = memo(function CalendarBox({ style }: { style?: StyleProp<ViewStyle> }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const on = Features.on(prefs, 'calendar');
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [events, setEvents] = useState<Agenda.Event[] | null>(null);
  const [lines, setLines] = useState(Agenda.MAX);
  const readAt = useRef(0);

  const read = useCallback(async (force = false) => {
    if (!force && Date.now() - readAt.current < READ_MS) return;
    readAt.current = Date.now();
    try {
      const ok = (await Calendar.getCalendarPermissions()).granted;
      setAllowed(ok);
      if (!ok) return;
      const now = Date.now();
      const cals = await Calendar.getCalendars();
      const raw = await Calendar.listEvents(cals, new Date(now - 24 * 3600000), new Date(now + Agenda.DAYS * 24 * 3600000));
      const list = Agenda.upcoming(raw.map((e) => ({ title: e.title, start: ms(e.startDate), end: ms(e.endDate), allDay: !!e.allDay })), Date.now());
      seen = list;
      setEvents(list);
    } catch {
      seen = [];
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    read(true);
    // behind another app there is nothing to show, so the calendar is left alone
    const id = setInterval(() => {
      if (AppState.currentState === 'active') read();
    }, 60000);
    return () => clearInterval(id);
  }, [on, read]);

  const tapped = async () => {
    if (!on) return toast(t('Turn on Calendar in Settings, Home screen'));
    if (!allowed) {
      const r = await Calendar.requestCalendarPermissions().catch(() => null);
      if (r?.granted) read(true);
      return;
    }
    try {
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', { data: 'content://com.android.calendar/time/' + Date.now() });
    } catch {
      toast(t('No calendar app on this unit'));
    }
  };

  const foot = !on
    ? t('Calendar is off in Settings, Home screen')
    : allowed === false
      ? t('Tap to allow OpenRath to read your calendar')
      : events && events.length === 0
        ? t('Nothing in the next few days')
        : '';
  const now = Date.now();
  return (
    <TapBox title={t('CALENDAR')} style={style} onPress={tapped}>
      <View
        style={styles.list}
        onLayout={(e) => setLines(Math.max(1, Math.min(Agenda.MAX, Math.floor(e.nativeEvent.layout.height / 22))))}
      >
        {on && allowed
          ? (events ?? []).slice(0, lines).map((e, i) => {
              const [day, time] = Agenda.when(e.start, e.end, e.allDay, now);
              return (
                <Text key={i} style={[styles.line, { color: look.text }]} numberOfLines={1}>
                  {t(day) + (time ? ' ' + t(time) : '') + '   ' + e.title}
                </Text>
              );
            })
          : null}
      </View>
      {foot ? <Text style={[styles.foot, { color: look.textDim }]}>{foot}</Text> : null}
    </TapBox>
  );
});

const styles = StyleSheet.create({
  list: { flex: 1, minHeight: 22 },
  line: { fontSize: 15, lineHeight: 22 },
  foot: { fontSize: 12, textAlign: 'center' },
});
