/**
 * QR codes on screen (the view side of Qr.java): dark modules on white with the quiet border, in
 * whole pixels with no smoothing. QrCode is the code alone; QrSheet covers the screen with the
 * code full height and the words beside it, the way the Android version showed it for a phone.
 */
import { useKeepAwake } from 'expo-keep-awake';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { t } from '../logic/i18n';
import * as Qr from '../logic/qr';

/** The code at most `size` wide; every module a whole number of points. */
export function QrCode({ text, size, onPress }: { text: string; size: number; onPress?: () => void }) {
  const m = useMemo(() => Qr.modules(text), [text]);
  const { d, size: n } = useMemo(() => Qr.path(m), [m]);
  const px = n * Qr.scale(m, size);
  const code = (
    <Svg width={px} height={px} viewBox={`0 0 ${n} ${n}`}>
      <Rect x={0} y={0} width={n} height={n} fill="#FFFFFF" />
      <Path d={d} fill="#000000" />
    </Svg>
  );
  return onPress ? (
    <Pressable onPress={onPress} accessibilityLabel={t('QR code, tap to show it full screen')}>
      {code}
    </Pressable>
  ) : (
    code
  );
}

function Sheet({ title, text, caption, onClose }: { title: string; text: string; caption: string; onClose: () => void }) {
  // the screen stays on while the code shows. (Android also turned the brightness up to full,
  // since a dimmed night screen is the main reason a phone can't read it; that needs
  // expo-brightness, which this app doesn't include.)
  useKeepAwake();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const size = landscape ? height - 24 : width - 24;
  return (
    <View style={[styles.sheet, { flexDirection: landscape ? 'row' : 'column' }]}>
      <View style={styles.code}>
        <QrCode text={text} size={size} />
      </View>
      <View style={[styles.words, landscape ? { flex: 1 } : null]}>
        <Text style={styles.title}>{t(title)}</Text>
        <Text style={styles.caption}>{t(caption) + '\n\n' + t('Hold the phone about 30 cm away, straight on.')}</Text>
        <Pressable onPress={onClose} style={styles.done} accessibilityRole="button">
          <Text style={styles.doneText}>{t('Done')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The code full height on a white panel, the words beside it; shown while `visible`. */
export function QrSheet({
  visible,
  title,
  text,
  caption,
  onClose,
}: {
  visible: boolean;
  title: string;
  text: string;
  caption: string;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose} supportedOrientations={['landscape', 'portrait']}>
      {visible ? <Sheet title={title} text={text} caption={caption} onClose={onClose} /> : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  code: { padding: 12, alignItems: 'center', justifyContent: 'center' },
  words: { paddingLeft: 10, paddingRight: 28, paddingVertical: 12 },
  title: { fontSize: 26, color: '#111111', fontWeight: '500' },
  caption: { fontSize: 18, color: '#333333', paddingTop: 12, paddingBottom: 24 },
  done: { width: 180, height: 64, backgroundColor: '#2F6FD6', alignItems: 'center', justifyContent: 'center' },
  doneText: { fontSize: 20, color: '#FFFFFF', fontWeight: '500' },
});
