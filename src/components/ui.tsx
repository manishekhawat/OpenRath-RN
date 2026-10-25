/**
 * Shared building blocks: themed boxes, screens, rows and buttons. Text given to them is passed
 * through t(), so screens in Hindi show Hindi (text already translated stays as it is).
 */
import { router } from 'expo-router';
import type { ReactElement, ReactNode, Ref } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  ToastAndroid,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '../logic/i18n';
import { split as splitValue } from '../logic/settings';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { GlassBack } from './GlassBack';
import { feedback } from './Tap';

/** A short message at the bottom of the screen (Android's Toast), or an alert elsewhere. */
export function toast(message: string, long = false): void {
  if (Platform.OS === 'android') ToastAndroid.show(t(message), long ? ToastAndroid.LONG : ToastAndroid.SHORT);
  else Alert.alert('', t(message));
}

/** A dashboard box, in the theme's panel colours and corner radius. */
export function Box({
  title,
  children,
  style,
  onPress,
  onLongPress,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  const look = useLook();
  const { prefs } = usePrefs();
  // every box ticks and buzzes when that is on (Cards.Card.clickable)
  const tap = (fn?: () => void) =>
    fn
      ? () => {
          feedback(prefs);
          fn();
        }
      : undefined;
  return (
    <Pressable
      onPress={tap(onPress)}
      onLongPress={tap(onLongPress)}
      style={[
        styles.box,
        { backgroundColor: look.panel, borderColor: look.edge, borderRadius: look.radius },
        style,
      ]}
    >
      {title ? <Text style={[styles.boxTitle, { color: look.textDim }]}>{t(title)}</Text> : null}
      {children}
    </Pressable>
  );
}

/** The back arrow and the title at the top of a full-screen page. */
function Bar({ title }: { title: string }) {
  const look = useLook();
  return (
    <View style={[styles.header, { borderColor: look.edge }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={16} accessibilityLabel={t('Back')}>
        <Text style={[styles.back, { color: look.text }]}>‹</Text>
      </Pressable>
      <Text style={[styles.headerTitle, { color: look.text }]}>{t(title)}</Text>
    </View>
  );
}

/** A full-screen page with a back arrow and a title, like the Android version's settings screens. */
export function Screen({ title, children, scroll = true }: { title: string; children: ReactNode; scroll?: boolean }) {
  const look = useLook();
  const body = scroll ? <ScrollView contentContainerStyle={styles.screenBody}>{children}</ScrollView> : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: look.background }]}>
      <GlassBack look={look} />
      <Bar title={title} />
      {body}
    </SafeAreaView>
  );
}

/**
 * The same page, for screens whose body is one long list: the fuel log, the app drawer, the saved
 * places, the headlines and the two galleries. A list keeps only the rows near the screen made,
 * so a log with a year of fill-ups opens as quickly as an empty one. Whatever the screen draws
 * above and below the rows goes in `header` and `footer`, and `children` are drawn over the list,
 * like the app drawer's A to Z column.
 */
export function ListScreen<T>({
  title,
  data,
  row,
  keyOf,
  header,
  footer,
  children,
  gap = 0,
  rowHeight,
  listRef,
  contentStyle,
  initialNumToRender = 12,
  windowSize = 7,
}: {
  title: string;
  data: readonly T[];
  row: (item: T, index: number) => ReactElement | null;
  keyOf: (item: T, index: number) => string;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** the space between rows, for tiles that stand apart rather than settings rows */
  gap?: number;
  /** a row's height, when every row is the same height: a jump to a row then lands exactly */
  rowHeight?: number;
  listRef?: Ref<FlatList<T>>;
  contentStyle?: StyleProp<ViewStyle>;
  /** how many rows are made before the first paint, and how many screenfuls are kept around */
  initialNumToRender?: number;
  windowSize?: number;
}) {
  const look = useLook();
  const step = rowHeight == null ? 0 : rowHeight + gap;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: look.background }]}>
      <GlassBack look={look} />
      <Bar title={title} />
      <FlatList
        ref={listRef}
        data={data}
        renderItem={({ item, index }) => row(item, index)}
        keyExtractor={keyOf}
        ListHeaderComponent={<>{header}</>}
        ListFooterComponent={<>{footer}</>}
        ItemSeparatorComponent={gap > 0 ? () => <View style={{ height: gap }} /> : undefined}
        getItemLayout={step > 0 ? (_d, i) => ({ length: step, offset: step * i, index: i }) : undefined}
        contentContainerStyle={[styles.screenBody, contentStyle]}
        initialNumToRender={initialNumToRender}
        windowSize={windowSize}
      />
      {children}
    </SafeAreaView>
  );
}

/**
 * A settings row: a name, its current value underneath, and what a tap does. As in Settings since
 * 1.37, a row can instead show its state on the right with the explanation as the grey line:
 * `state` and `value` given apart, or `split` to divide `value` the way SettingsView does ("on; the
 * rest" or a short value on the right, a long one underneath). `on` draws a switch; `chevron` a ›.
 */
export function Row({
  name,
  value,
  onPress,
  right,
  state,
  split = false,
  on,
  chevron = false,
}: {
  name: string;
  value?: string | null;
  onPress?: () => void;
  right?: ReactNode;
  state?: string;
  split?: boolean;
  on?: boolean;
  chevron?: boolean;
}) {
  const look = useLook();
  let st = state ?? '';
  let hint = value ? t(value) : '';
  if (split && on == null) [st, hint] = state ? [state, hint] : splitValue(hint);
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: look.edge }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: look.text }]}>{t(name)}</Text>
        {hint ? <Text style={[styles.rowValue, { color: look.textDim }]}>{hint}</Text> : null}
      </View>
      {st ? (
        <Text numberOfLines={1} style={[styles.rowState, { color: look.accent }]}>
          {t(st)}
        </Text>
      ) : null}
      {on != null ? <Switch value={on} onValueChange={() => onPress?.()} /> : null}
      {chevron && on == null ? <Text style={[styles.chevron, { color: look.textDim }]}>›</Text> : null}
      {right}
    </Pressable>
  );
}

/** A list to pick one from, over the screen (Android's single-choice dialog). */
export function PickList({
  title,
  options,
  picked = -1,
  onPick,
  onClose,
}: {
  title: string;
  options: string[];
  picked?: number;
  onPick: (i: number) => void;
  onClose: () => void;
}) {
  const look = useLook();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <Pressable onPress={onClose} style={styles.scrim}>
        <Pressable style={[styles.sheet, { backgroundColor: look.panelTop, borderColor: look.edge }]}>
          <Text style={[styles.headerTitle, { color: look.text, marginBottom: 8 }]}>{t(title)}</Text>
          <ScrollView>
            {options.map((o, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  onClose();
                  onPick(i);
                }}
                style={[styles.option, { borderColor: look.edge }]}
              >
                <Text style={{ color: i === picked ? look.accent : look.text, fontSize: 16 }}>
                  {(i === picked ? '● ' : picked >= 0 ? '○ ' : '') + t(o)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button label="Cancel" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const look = useLook();
  return <Text style={[styles.heading, { color: look.accent }]}>{typeof children === 'string' ? t(children) : children}</Text>;
}

export function Button({ label, onPress, kind = 'plain' }: { label: string; onPress: () => void; kind?: 'plain' | 'primary' | 'danger' }) {
  const look = useLook();
  const bg = kind === 'primary' ? look.accent : 'transparent';
  const fg = kind === 'primary' ? look.background : kind === 'danger' ? '#E5484D' : look.text;
  return (
    <Pressable onPress={onPress} style={[styles.button, { backgroundColor: bg, borderColor: kind === 'primary' ? look.accent : look.edge }]}>
      <Text style={[styles.buttonText, { color: fg }]}>{t(label)}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
  /** hide what is typed (a PIN) */
  secret?: boolean;
}) {
  const look = useLook();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: look.textDim, marginBottom: 4 }}>{t(label)}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        secureTextEntry={secret}
        placeholder={placeholder ? t(placeholder) : placeholder}
        placeholderTextColor={look.textDim}
        style={[styles.input, { color: look.text, borderColor: look.edge, backgroundColor: look.panel }]}
      />
    </View>
  );
}

/** A choice of a few options, in a row of pills. */
export function Choice<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const look = useLook();
  return (
    <View style={styles.choice}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={[styles.pill, { borderColor: on ? look.accent : look.edge, backgroundColor: on ? look.accent : 'transparent' }]}
          >
            <Text style={{ color: on ? look.background : look.text }}>{t(o.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const styles = StyleSheet.create({
  box: { borderWidth: 1, padding: 12, overflow: 'hidden' },
  boxTitle: { fontSize: 12, letterSpacing: 1.5, marginBottom: 6 },
  screen: { flex: 1 },
  screenBody: { padding: 16, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  back: { fontSize: 34, lineHeight: 36, marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowName: { fontSize: 16 },
  rowValue: { fontSize: 13, marginTop: 2 },
  rowState: { fontSize: 15, fontWeight: '500', marginLeft: 16, maxWidth: '45%' },
  chevron: { fontSize: 24, marginLeft: 12 },
  scrim: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '85%', borderWidth: 1, borderRadius: 14, padding: 16 },
  option: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  heading: { fontSize: 13, letterSpacing: 1.2, marginTop: 20, marginBottom: 4, textTransform: 'uppercase' },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginVertical: 6 },
  buttonText: { fontSize: 16, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  choice: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
});
