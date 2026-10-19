/**
 * 360 view of the owner's car (port of View360.java, new in 1.30): OpenRath's own 3D model
 * (logic/car3d.ts) in the car's shape, colour and number plate, turned with a finger or by the
 * Top, Front, Side and Rear buttons, and turning slowly by itself when left alone (not at Less
 * movement: Off). It also opens
 * the stereo's own 360 camera app (the one that stitches the four cameras, on units that have the
 * kit); OpenRath can't read those cameras itself. Drawn with react-native-svg, one polygon per face.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Line, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import { openCam } from '../components/MicButton';
import * as Car from '../logic/car';
import * as Car3D from '../logic/car3d';
import * as Errands from '../logic/errands';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Motion from '../logic/motion';
import { num, type Prefs } from '../logic/prefs';
import { useDrive } from '../state/drive';
import { usePrefs } from '../state/prefs';

/** Android drew a frame every 33 ms; the easing and the slow turn are per frame of that length. */
const FRAME_MS = 33;

/** Whether the headlights count as on (Hub.lightsOn without the stereo's light wire). */
function lightsOn(p: Prefs, lat: number, lon: number): boolean {
  const mode = p.str('lights', 'auto');
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  if (mode === 'times') {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    const from = num(p, 'lightsFrom', 18 * 60 + 30);
    const to = num(p, 'lightsTo', 6 * 60 + 30);
    // Lights.inWindow
    if (from === to) return false;
    return from < to ? now >= from && now < to : now >= from || now < to;
  }
  // no headlight wire reaches apps: count the lights as on from sunset to sunrise here
  return lat !== 0 && Errands.dark(lat, lon, Date.now());
}

/** Java's Math.IEEEremainder(x, y), for turning the short way round. */
const ieeeRemainder = (x: number, y: number) => x - y * Math.round(x / y);

/** The number plate picture (Car3D.plate), 520 × 112, laid on its quad by an affine matrix. */
function Plate({ q, text, yellow }: { q: number[][]; text: string; yellow: boolean }) {
  const t = Car3D.plateText(text);
  // Android measured the text and shrank it to fit 430 px; bold capitals are about 0.62 em wide
  const size = Math.min(64, 430 / Math.max(1, t.length * 0.62));
  const m = Car3D.plateMatrix(q);
  return (
    <G transform={`matrix(${m.join(' ')})`}>
      <Rect x={2} y={2} width={516} height={108} rx={14} fill={yellow ? '#F2C21B' : '#F4F4F2'} />
      <Rect x={6} y={6} width={508} height={100} rx={12} fill="none" stroke="#111111" strokeWidth={6} />
      {/* the blue IND strip of India's number plates */}
      <Rect x={14} y={16} width={44} height={80} fill="#1F4BA5" />
      <SvgText x={36} y={90} fontSize={20} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        IND
      </SvgText>
      <SvgText x={290} y={56 + size * 0.36} fontSize={size} fontWeight="bold" fill="#111111" textAnchor="middle">
        {t}
      </SvgText>
    </G>
  );
}

const pts = (p: number[][]) => p.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' ');

export default function View360() {
  const { prefs, version } = usePrefs();
  const { trip } = useDrive();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, setFrame] = useState(0);
  const [menu, setMenu] = useState<'' | 'colour' | 'shape' | 'plate'>('');
  const [plateEdit, setPlateEdit] = useState('');

  const cam = useRef(new Car3D.Cam()).current;
  const go = useRef({ yaw: NaN, pitch: NaN });
  const touchedAt = useRef(0);
  const drag = useRef({ x: 0, y: 0 });

  const shape = Car3D.shape(prefs);
  const faces = useMemo(() => Car3D.build(shape), [shape]);
  const dims = useMemo(() => Car3D.dims(shape), [shape]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colour = useMemo(() => Car3D.colour(prefs), [prefs, version]);
  const plate = Car3D.plate(prefs);
  const yellow = Features.on(prefs, 'cab');
  const lights = lightsOn(prefs, trip.lat, trip.lon);
  const camApp = prefs.str('app:cam360', '') !== '';
  const carName = Car.name(prefs);

  /** Ease towards a view a button asks for, the short way round. */
  const view = (yaw: number, pitch: number) => {
    go.current = { yaw: cam.yaw + ieeeRemainder(yaw - cam.yaw, 2 * Math.PI), pitch };
    touchedAt.current = Date.now();
  };

  // the animation: easing towards a button's view, else a slow turn after 4 s untouched
  // (left out when Less movement is Off)
  const still = Motion.frame(Motion.level(prefs)) <= 0;
  useEffect(() => {
    let raf = 0;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const frames = Math.min(4, (now - last) / FRAME_MS);
      last = now;
      const g = go.current;
      let moved = false;
      if (!Number.isNaN(g.yaw)) {
        const k = 1 - Math.pow(1 - 0.18, frames);
        cam.yaw += (g.yaw - cam.yaw) * k;
        cam.pitch += (g.pitch - cam.pitch) * k;
        if (Math.abs(g.yaw - cam.yaw) < 0.002 && Math.abs(g.pitch - cam.pitch) < 0.002) go.current = { yaw: NaN, pitch: NaN };
        moved = true;
      } else if (now - touchedAt.current > 4000 && !still) {
        cam.yaw += 0.006 * frames; // turns slowly by itself when left alone
        moved = true;
      }
      if (moved) setFrame((n) => (n + 1) % 1000000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cam, still]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          touchedAt.current = Date.now();
          go.current = { yaw: NaN, pitch: NaN };
          drag.current = { x: 0, y: 0 };
        },
        onPanResponderMove: (_, s) => {
          touchedAt.current = Date.now();
          go.current = { yaw: NaN, pitch: NaN };
          cam.yaw -= (s.dx - drag.current.x) * 0.01;
          cam.pitch = Math.max(0.1, Math.min(1.53, cam.pitch + (s.dy - drag.current.y) * 0.006));
          drag.current = { x: s.dx, y: s.dy };
          setFrame((n) => (n + 1) % 1000000);
        },
        onPanResponderRelease: () => {
          touchedAt.current = Date.now();
        },
      }),
    [cam],
  );

  const scene = size.w > 0 ? Car3D.paint(cam, size.w, size.h, faces, dims, colour, lights) : null;
  const stroke = Math.max(1, size.w / 500);

  // the polygons back to front, each plate in its face's place
  const body: ReactNode[] = [];
  if (scene) {
    let pi = 0;
    scene.polys.forEach((p, i) => {
      body.push(<Polygon key={'f' + i} points={pts(p.pts)} fill={p.fill} />);
      while (pi < scene.plates.length && scene.plates[pi].at === i + 1) {
        body.push(<Plate key={'p' + pi} q={scene.plates[pi].q} text={plate} yellow={yellow} />);
        pi++;
      }
    });
  }

  const press = (n: string) => {
    switch (n) {
      case 'Top':
        return view(cam.yaw, 1.53);
      case 'Front':
        return view(0, 0.3);
      case 'Rear':
        return view(Math.PI, 0.3);
      case 'Left':
        return view(-Math.PI / 2, 0.22);
      case 'Right':
        return view(Math.PI / 2, 0.22);
      case 'Colour':
        return setMenu('colour');
      case 'Shape':
        return setMenu('shape');
      case 'Plate':
        setPlateEdit(Car3D.plate(prefs));
        return setMenu('plate');
      case '360 camera':
        router.back();
        openCam(prefs);
        return;
      default:
        router.back();
    }
  };

  const names = ['Top', 'Front', 'Left', 'Right', 'Rear', 'Colour', 'Shape', 'Plate', camApp ? '360 camera' : null, 'Close'];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.fill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
        {scene ? (
          <Svg width={size.w} height={size.h}>
            {/* the 360 ring around the car, and its shadow */}
            {scene.ground.rings.map((r, i) => (
              <Polygon key={'r' + i} points={pts(r.pts)} fill="none" stroke={r.colour} strokeOpacity={r.opacity} strokeWidth={stroke} />
            ))}
            {scene.ground.spokes.map((s, i) => (
              <Line
                key={'s' + i}
                x1={s[0][0]}
                y1={s[0][1]}
                x2={s[1][0]}
                y2={s[1][1]}
                stroke={Car3D.GROUND.spoke[0]}
                strokeOpacity={Car3D.GROUND.spoke[1]}
                strokeWidth={stroke}
              />
            ))}
            <Polygon points={pts(scene.ground.shadow)} fill={Car3D.GROUND.shadow[0]} fillOpacity={Car3D.GROUND.shadow[1]} />
            {body}
          </Svg>
        ) : null}
      </View>

      <Text style={styles.title} pointerEvents="none">
        {f('360 VIEW  ·  %1$s', carName === '' ? t('YOUR CAR') : carName.toUpperCase())}
      </Text>

      <View style={styles.barWrap} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar}>
          {names.map((n) =>
            n == null ? null : (
              <Pressable
                key={n}
                onPress={() => press(n)}
                style={[styles.pill, { backgroundColor: n === 'Close' ? '#7A2328' : n === '360 camera' ? '#1F6F45' : 'rgba(255,255,255,0.12)' }]}
              >
                <Text style={styles.pillText}>{t(n)}</Text>
              </Pressable>
            ),
          )}
        </ScrollView>
      </View>

      <Modal visible={menu !== ''} transparent animationType="fade" onRequestClose={() => setMenu('')}>
        <Pressable style={styles.scrim} onPress={() => setMenu('')}>
          <Pressable style={styles.dialog} onPress={() => {}}>
            {menu === 'colour' ? (
              <>
                <Text style={styles.dialogTitle}>{t('Car colour')}</Text>
                <ScrollView>
                  {Car3D.COLOUR_NAMES.map((name, i) => (
                    <Pressable
                      key={name}
                      style={styles.item}
                      onPress={() => {
                        prefs.put('carColour', Car3D.colourPref(Car3D.COLOURS[i]));
                        setMenu('');
                      }}
                    >
                      <View style={[styles.swatch, { backgroundColor: Car3D.COLOURS[i] }]} />
                      <Text style={styles.itemText}>{t(name)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            ) : null}
            {menu === 'shape' ? (
              <>
                <Text style={styles.dialogTitle}>{t('Car shape')}</Text>
                {Car3D.SHAPE_NAMES.map((name, i) => (
                  <Pressable
                    key={name}
                    style={styles.item}
                    onPress={() => {
                      prefs.put('carShape', Car3D.SHAPES[i]);
                      setMenu('');
                    }}
                  >
                    <Text style={[styles.itemText, shape === Car3D.SHAPES[i] ? { fontWeight: '700' } : null]}>{t(name)}</Text>
                  </Pressable>
                ))}
              </>
            ) : null}
            {menu === 'plate' ? (
              <>
                <Text style={styles.dialogTitle}>{t('Number plate (e.g. DL 3C AB 1234)')}</Text>
                <TextInput
                  value={plateEdit}
                  onChangeText={setPlateEdit}
                  autoCapitalize="characters"
                  autoFocus
                  style={styles.input}
                  onSubmitEditing={() => {
                    prefs.put('carPlate', plateEdit.trim().toUpperCase());
                    setMenu('');
                  }}
                />
                <View style={styles.actions}>
                  <Pressable onPress={() => setMenu('')} style={styles.action}>
                    <Text style={styles.actionText}>{t('Cancel')}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      prefs.put('carPlate', plateEdit.trim().toUpperCase());
                      setMenu('');
                    }}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>{t('Save')}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07080A' },
  fill: { flex: 1 },
  title: { position: 'absolute', left: 20, top: 20, color: '#FFFFFF', fontSize: 14, letterSpacing: 1.5, opacity: 0.85 },
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  bar: { paddingHorizontal: 10, alignItems: 'center' },
  pill: { height: 46, borderRadius: 23, paddingHorizontal: 16, marginHorizontal: 5, justifyContent: 'center' },
  pillText: { color: '#FFFFFF', fontSize: 15 },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 420, maxHeight: '90%', backgroundColor: '#1E1F22', borderRadius: 8, padding: 20 },
  dialogTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', marginBottom: 12 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  itemText: { color: '#FFFFFF', fontSize: 16 },
  swatch: { width: 24, height: 24, borderRadius: 12, marginRight: 14, borderWidth: 1, borderColor: '#555A60' },
  input: { color: '#FFFFFF', fontSize: 18, borderBottomWidth: 1, borderColor: '#8A8F96', paddingVertical: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 8 },
  action: { paddingVertical: 10, paddingHorizontal: 14 },
  actionText: { color: '#80CBC4', fontSize: 15, fontWeight: '600' },
});
