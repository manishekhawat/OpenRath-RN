/** Shared building blocks: themed boxes, screens, rows and buttons. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLook } from '../state/look';

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
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.box,
        { backgroundColor: look.panel, borderColor: look.edge, borderRadius: look.radius },
        style,
      ]}
    >
      {title ? <Text style={[styles.boxTitle, { color: look.textDim }]}>{title}</Text> : null}
      {children}
    </Pressable>
  );
}

/** A full-screen page with a back arrow and a title, like the Android version's settings screens. */
export function Screen({ title, children, scroll = true }: { title: string; children: ReactNode; scroll?: boolean }) {
  const look = useLook();
  const body = scroll ? <ScrollView contentContainerStyle={styles.screenBody}>{children}</ScrollView> : <View style={{ flex: 1 }}>{children}</View>;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: look.background }]}>
      <View style={[styles.header, { borderColor: look.edge }]}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={16} accessibilityLabel="Back">
          <Text style={[styles.back, { color: look.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: look.text }]}>{title}</Text>
      </View>
      {body}
    </SafeAreaView>
  );
}

/** A settings row: a name, its current value underneath, and what a tap does. */
export function Row({ name, value, onPress, right }: { name: string; value?: string; onPress?: () => void; right?: ReactNode }) {
  const look = useLook();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderColor: look.edge }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowName, { color: look.text }]}>{name}</Text>
        {value ? <Text style={[styles.rowValue, { color: look.textDim }]}>{value}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const look = useLook();
  return <Text style={[styles.heading, { color: look.accent }]}>{children}</Text>;
}

export function Button({ label, onPress, kind = 'plain' }: { label: string; onPress: () => void; kind?: 'plain' | 'primary' | 'danger' }) {
  const look = useLook();
  const bg = kind === 'primary' ? look.accent : 'transparent';
  const fg = kind === 'primary' ? look.background : kind === 'danger' ? '#E5484D' : look.text;
  return (
    <Pressable onPress={onPress} style={[styles.button, { backgroundColor: bg, borderColor: kind === 'primary' ? look.accent : look.edge }]}>
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChange,
  numeric = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  numeric?: boolean;
  placeholder?: string;
}) {
  const look = useLook();
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: look.textDim, marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={numeric ? 'decimal-pad' : 'default'}
        placeholder={placeholder}
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
            <Text style={{ color: on ? look.background : look.text }}>{o.label}</Text>
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
  heading: { fontSize: 13, letterSpacing: 1.2, marginTop: 20, marginBottom: 4, textTransform: 'uppercase' },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 18, alignItems: 'center', marginVertical: 6 },
  buttonText: { fontSize: 16, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  choice: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: { borderWidth: 1, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
});
