/**
 * A list of choices in a dialog, for menus longer than Android's three alert buttons (the
 * Android version's AlertDialog.setItems): the trip menu, what a box shows, an app's long press.
 */
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '../logic/i18n';
import { useLook } from '../state/look';

export interface Pick {
  label: string;
  onPress: () => void;
  /** a tick before it: what the box shows now */
  checked?: boolean;
}

export function PickList({ title, items, onClose }: { title: string; items: Pick[] | null; onClose: () => void }) {
  const look = useLook();
  return (
    <Modal transparent visible={!!items} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.shade} onPress={onClose}>
        <Pressable style={[styles.card, { backgroundColor: look.panel, borderColor: look.edge }]}>
          {title ? <Text style={[styles.title, { color: look.text }]}>{title}</Text> : null}
          <ScrollView>
            {(items ?? []).map((it, i) => (
              <Pressable
                key={i}
                style={[styles.row, { borderColor: look.edge }]}
                onPress={() => {
                  onClose();
                  it.onPress();
                }}
              >
                <Text style={{ color: look.text, fontSize: 16 }}>{(it.checked ? '✓  ' : '') + it.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={{ color: look.accent, fontSize: 16 }}>{t('Close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { minWidth: 300, maxWidth: 520, maxHeight: '90%', borderWidth: 1, borderRadius: 12, padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  close: { alignSelf: 'flex-end', paddingTop: 12, paddingHorizontal: 8 },
});
