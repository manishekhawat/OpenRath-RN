/**
 * Boot logo and animation maker (BootArt.menu / make / done): pick the stereo's screen size, see
 * a frame, then make bootanimation.zip and bootlogo.bmp, save them in the app's documents and
 * share them (to a USB stick, a phone or a computer). Installing them is the stereo's own job:
 * its factory settings for the logo, its boot animation app or ADB for the animation (writing to
 * /system needs root), so the Android version's steps are shown with the files.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Dimensions, Image, PixelRatio, Text, View } from 'react-native';

import { Button, Choice, Heading, Screen } from '../components/ui';
import * as Art from '../logic/bootart';
import { f, t } from '../logic/i18n';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';

/** This screen in pixels, the long side first (stereos are landscape). */
function here(): [number, number] {
  const s = Dimensions.get('screen');
  const r = PixelRatio.get();
  const a = Math.round(s.width * r);
  const b = Math.round(s.height * r);
  return [Math.max(a, b), Math.min(a, b)];
}

const MOMENTS = () => [
  { id: '1.0', label: t('Wheel rolling in') },
  { id: '2.0', label: t('Light sweep') },
  { id: String(Art.FRAMES / Art.FPS), label: t('Last frame') },
];

export default function BootArtScreen() {
  const { prefs } = usePrefs();
  const look = useLook();
  const sizes = useMemo(() => [here(), ...Art.SIZES], []);
  const [size, setSize] = useState('0');
  const [moment, setMoment] = useState(String(Art.FRAMES / Art.FPS));
  const [busy, setBusy] = useState('');
  const [made, setMade] = useState<{ zip: string; logo: string; dir: string } | null>(null);
  const [error, setError] = useState('');

  const [w, h] = sizes[Number(size)];
  const brand = Art.brandLine(prefs);
  const name = Art.nameLine(prefs);
  // the Android version used the brand pack's badge when there was one; those aren't published, so the wheel
  const mark = useMemo(() => Art.mark(prefs.str('carBrand', '')), [prefs]);

  // a small copy of one frame, the same drawing scaled down
  const preview = useMemo(() => {
    const pw = 480;
    const ph = Math.round((pw * h) / w);
    return { uri: 'data:image/png;base64,' + Art.base64(Art.preview(pw, ph, Number(moment), mark, brand, name)), pw, ph };
  }, [w, h, moment, mark, brand, name]);

  const make = async () => {
    setError('');
    setMade(null);
    setBusy(f('Drawing frame %1$s of %2$s…', 1, Art.FRAMES + 1));
    try {
      const files = await Art.make(w, h, mark, brand, name, async (n) => {
        if (n % 5 === 0) setBusy(f('Drawing frame %1$s of %2$s…', n + 1, Art.FRAMES + 1));
        await new Promise((r) => setTimeout(r, 0)); // let the screen redraw between frames
      });
      const dir = new Directory(Paths.document, 'OpenRath boot ' + w + 'x' + h);
      dir.create({ intermediates: true, idempotent: true });
      const zip = new File(dir, 'bootanimation.zip');
      const logo = new File(dir, 'bootlogo.bmp');
      for (const [f, bytes] of [[zip, files.zip], [logo, files.logo]] as const) {
        if (f.exists) f.delete();
        f.create();
        f.write(bytes);
      }
      setMade({ zip: zip.uri, logo: logo.uri, dir: decodeURIComponent(dir.uri.replace(/^file:\/\//, '')) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const share = async (uri: string, mimeType: string) => {
    if (!(await Sharing.isAvailableAsync())) return setError(t('Sharing is not available on this unit'));
    await Sharing.shareAsync(uri, { mimeType, dialogTitle: t('Save or send the file') });
  };

  return (
    <Screen title="Boot logo and animation">
      <Heading>Make a boot logo and animation for</Heading>
      <Choice
        options={sizes.map(([a, b], i) => ({ id: String(i), label: (i === 0 ? t('This screen, ') : '') + a + ' x ' + b }))}
        value={size}
        onChange={(v) => {
          setSize(v);
          setMade(null);
        }}
      />
      <Heading>Preview</Heading>
      <Choice options={MOMENTS()} value={moment} onChange={setMoment} />
      <Image source={{ uri: preview.uri }} style={{ width: '100%', aspectRatio: preview.pw / preview.ph, borderRadius: 6, backgroundColor: '#000' }} />
      <Text style={{ color: look.textDim, marginTop: 6 }}>
        {brand + (name ? ' · ' + name : '') + ': '}
        {f('from the car profile. %1$s frames at %2$s a second, then the last frame holds until the stereo has started.', Art.FRAMES + 1, Art.FPS)}
      </Text>

      {busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 }}>
          <ActivityIndicator color={look.accent} />
          <Text style={{ color: look.text }}>{t('Making the boot animation')}: {busy}</Text>
        </View>
      ) : (
        <Button label={f('Make them for %1$s x %2$s', w, h)} kind="primary" onPress={make} />
      )}
      {error ? (
        <>
          <Heading>Couldn&apos;t make them</Heading>
          <Text style={{ color: look.text }}>{error}</Text>
        </>
      ) : null}

      {made ? (
        <>
          <Heading>Boot logo and animation made</Heading>
          <Button label="Share bootanimation.zip" kind="primary" onPress={() => share(made.zip, 'application/zip')} />
          <Button label="Share bootlogo.bmp" onPress={() => share(made.logo, 'image/bmp')} />
          <Text style={{ color: look.text, lineHeight: 22, marginTop: 8 }}>{Art.instructions(made.dir, null, null)}</Text>
        </>
      ) : null}
    </Screen>
  );
}
