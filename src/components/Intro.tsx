/**
 * The OpenRath logo when the app opens (Intro.java, the "intro" switch): the wheel rolls in from
 * the left, its rim draws round, the spokes grow out from the hub one after another, the name fades
 * in under it with a line in the theme's colour, then it all fades to the dashboard. Two seconds,
 * half that at Reduced movement (and no rolling), left out at Off. A tap skips it, and it only plays
 * when the app starts, not on every return to the home screen.
 *
 * With the Glass look on (1.44) the wheel and the name sit on a frosted card over the blurred
 * background, as the rest of the app does.
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { LENGTH, part } from '../logic/intro';
import * as Motion from '../logic/motion';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import { GlassBack } from './GlassBack';

/** An arc of `sweep` degrees from the top, clockwise, as an SVG path. */
function arc(cx: number, cy: number, r: number, sweep: number): string {
  const s = Math.max(0.01, Math.min(359.99, sweep));
  const a = ((s - 90) * Math.PI) / 180;
  const x = cx + r * Math.cos(a);
  const y = cy + r * Math.sin(a);
  return `M ${cx} ${cy - r} A ${r} ${r} 0 ${s > 180 ? 1 : 0} 1 ${x} ${y}`;
}

export function Intro({ onDone }: { onDone: () => void }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const motion = Motion.level(prefs);
  const length = Math.max(1, Motion.ms(motion, LENGTH));
  const still = motion === 'reduced';
  const [t, setT] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const done = useRef(false);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone();
  };

  useEffect(() => {
    const start = Date.now();
    const frame = Math.max(16, Motion.frame(motion));
    const timer = setInterval(() => {
      const now = Date.now() - start;
      if (now >= length) {
        clearInterval(timer);
        finish();
        return;
      }
      setT(now);
    }, frame);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the steps are laid out on the standard 2-second timeline, however long this one runs
  const at = (from: number, len: number) => part((t * LENGTH) / length, from, len);
  const fade = 1 - at(1600, 400);
  const w = size.w;
  const h = size.h;
  const span = Math.min(w, h) * 0.32;
  const u = span / 24;
  const cy = h / 2 - span * 0.18;
  const roll = still ? 0 : 1 - at(0, 900);
  const cx = w / 2 - roll * span * 0.9;
  const rim = 10.7 * u;
  const hub = 3.1 * u;
  const name = at(800, 500);
  const line = at(1000, 500) * span * 0.9;
  const ty = cy + span * 0.5 + span * 0.38 + (1 - name) * span * 0.08;
  // the frosted card the wheel and the name sit on, with room round both
  const card = { x: w / 2 - span * 1.45, y: cy - span * 0.95, w: span * 2.9, h: ty + span * 0.45 - (cy - span * 0.95) };

  return (
    <Pressable
      onPress={finish}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessibilityLabel="OpenRath"
      style={[StyleSheet.absoluteFill, { backgroundColor: look.background, opacity: fade }]}
    >
      {look.glass ? <GlassBack look={look} /> : null}
      {w > 0 ? (
        <>
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            {look.glass ? (
              <>
                <Defs>
                  <LinearGradient id="introcard" x1={0} y1={card.y} x2={0} y2={card.y + card.h} gradientUnits="userSpaceOnUse">
                    <Stop offset={0} stopColor={look.panelTop} />
                    <Stop offset={1} stopColor={look.panel} />
                  </LinearGradient>
                </Defs>
                <Rect
                  x={card.x}
                  y={card.y}
                  width={card.w}
                  height={card.h}
                  rx={look.radius}
                  fill="url(#introcard)"
                  stroke={look.edge}
                  strokeWidth={Math.max(1, u * 0.3)}
                />
              </>
            ) : null}
            <Path
              d={arc(cx, cy, rim, 360 * at(0, 700))}
              stroke={look.text}
              strokeWidth={2.2 * u}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(${-roll * 270} ${cx} ${cy})`}
            />
            <Path
              d={arc(cx, cy, hub, 360 * at(200, 400))}
              stroke={look.text}
              strokeWidth={1.8 * u}
              strokeLinecap="round"
              fill="none"
              transform={`rotate(${-roll * 270} ${cx} ${cy})`}
            />
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
              const g = at(350 + i * 60, 300);
              if (g <= 0) return null;
              const ang = (i * Math.PI) / 4 + Math.PI / 8;
              const dx = Math.cos(ang);
              const dy = Math.sin(ang);
              const from = 3.6 * u;
              const to = from + (9.9 * u - from) * g;
              return (
                <Line
                  key={i}
                  x1={cx + dx * from}
                  y1={cy + dy * from}
                  x2={cx + dx * to}
                  y2={cy + dy * to}
                  stroke={look.text}
                  strokeWidth={1.5 * u}
                  transform={`rotate(${-roll * 270} ${cx} ${cy})`}
                />
              );
            })}
            {line > 0 ? (
              <Line
                x1={w / 2 - line / 2}
                y1={ty + span * 0.12}
                x2={w / 2 + line / 2}
                y2={ty + span * 0.12}
                stroke={look.accent}
                strokeWidth={Math.max(2, u * 0.6)}
                strokeLinecap="round"
              />
            ) : null}
            {/* the hub's middle, so the spokes meet something */}
            <Circle cx={cx} cy={cy} r={Math.max(0, hub * 0.25 * at(200, 400))} fill={look.text} />
          </Svg>
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-start', alignItems: 'center' }]} pointerEvents="none">
            <Text
              style={{
                position: 'absolute',
                top: ty - span * 0.3,
                color: look.text,
                opacity: name,
                fontSize: span * 0.3,
                fontWeight: '300',
              }}
            >
              OpenRath
            </Text>
          </View>
        </>
      ) : null}
    </Pressable>
  );
}

export default Intro;
