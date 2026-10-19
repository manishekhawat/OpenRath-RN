/**
 * Ride notes and lost items (Cab.notes / lostItem / showNote): quick notes, and a photo of
 * anything left in the car, kept in the app's own lost-items folder. The Android version shot
 * the photo with the car's own camera; here it is the device camera through the image picker.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Image, Text, View } from 'react-native';

import { Button, Field, Heading, Row, Screen } from '../../components/ui';
import * as Cab from '../../logic/cab';
import { t } from '../../logic/i18n';
import { useLook } from '../../state/look';
import { usePrefs } from '../../state/prefs';
import { toast } from './meter';

const stamp = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-` +
  `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;

export default function Notes() {
  const { prefs } = usePrefs();
  const look = useLook();
  const list = Cab.notesList(prefs);
  const [editing, setEditing] = useState<{ photo: string | null } | null>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<number | null>(null);

  const lostItem = async () => {
    let photo: string | null = null;
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.granted) {
        const r = await ImagePicker.launchCameraAsync({ quality: 0.6 });
        if (!r.canceled && r.assets[0]) {
          const dir = new Directory(Paths.document, 'lost-items');
          dir.create({ intermediates: true, idempotent: true });
          const to = new File(dir, stamp(new Date()) + '.jpg');
          new File(r.assets[0].uri).copySync(to);
          photo = to.uri;
          toast(t('Photo saved'));
        }
      }
    } catch {
      photo = null;
    }
    if (!photo) toast(t("No camera free for a photo, so it's a note only"));
    setText(t('Left in the car: '));
    setEditing({ photo });
  };

  const save = () => {
    const s = text.trim();
    if (!editing || (s === '' && !editing.photo)) return setEditing(null);
    Cab.addNote(prefs, s === '' ? t('Left in the car') : s, editing.photo, Date.now());
    toast(t('Saved in Ride notes'));
    setEditing(null);
  };

  const shown = open === null ? null : list[open];
  return (
    <Screen title={t(list.length === 0 ? 'No notes yet' : 'Ride notes')}>
      {editing ? (
        <View>
          <Heading>{t(editing.photo ? 'What was left, and by whom?' : 'Note')}</Heading>
          <Field label={t("Passenger's name, what was left, a phone number…")} value={text} onChange={setText} />
          <Button label={t('Save')} kind="primary" onPress={save} />
          <Button label={t('Cancel')} onPress={() => setEditing(null)} />
        </View>
      ) : shown ? (
        <View>
          <Heading>{Cab.longDate(shown.t)}</Heading>
          <Text style={{ color: look.text, fontSize: 18, marginBottom: 8 }}>{shown.text}</Text>
          {shown.photo ? <Image source={{ uri: shown.photo }} style={{ width: '100%', height: 300 }} resizeMode="contain" /> : null}
          <Button label={t('Close')} onPress={() => setOpen(null)} />
          <Button
            label={t('Delete')}
            kind="danger"
            onPress={() =>
              Alert.alert(t('Delete this entry?'), shown.text, [
                { text: t('Keep'), style: 'cancel' },
                {
                  text: t('Delete'),
                  style: 'destructive',
                  onPress: () => {
                    if (open !== null) Cab.deleteNote(prefs, open);
                    setOpen(null);
                  },
                },
              ])
            }
          />
        </View>
      ) : (
        <>
          <Button label={t('Lost item photo')} kind="primary" onPress={lostItem} />
          <Button label={t('Add a note')} onPress={() => {
            setText('');
            setEditing({ photo: null });
          }} />
          {list.map((_, j) => list.length - 1 - j).map((i) => (
            <Row key={list[i].t + ':' + i} name={Cab.when(list[i].t, ' ') + '   ' + (list[i].photo ? '📷 ' : '') + list[i].text} onPress={() => setOpen(i)} />
          ))}
        </>
      )}
    </Screen>
  );
}
