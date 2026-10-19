/**
 * The moving road under the car (CarCard.Road in the Android version), drawn in perspective. Its
 * lane markings slide away toward the horizon at a rate that follows the speed, so the car looks
 * like it's driving; standing still, the road stops too. Less movement (Home screen) slows the
 * frames at Reduced and keeps the road still at Off, and behind another app the frames stop
 * altogether: there is nothing to see there, and the edge lines are built once for the size.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

import * as Motion from '../logic/motion';
import { usePrefs } from '../state/prefs';

// in road units: short, so several dashes show below the car
const FAR = 40;
const DASH = 0.45;
const GAP = 0.4;

interface Quad {
  key: string;
  pts: string;
  alpha: number;
}

/** A strip of paint from z a to z b, w wide (as a share of the half width), centred at x. */
function quad(width: number, height: number, key: string, a: number, b: number, w: number, x: number): Quad {
  const horizon = 0;
  const ground = height;
  const halfWidth = width * 0.5;
  const cx = width / 2;
  // screen y for a point z ahead of the near edge (z = 1 is the near edge)
  const ya = horizon + (ground - horizon) / a;
  const yb = horizon + (ground - horizon) / b;
  const ha = halfWidth / a;
  const hb = halfWidth / b;
  return {
    key,
    pts: `${cx + (x - w) * ha},${ya} ${cx + (x + w) * ha},${ya} ${cx + (x + w) * hb},${yb} ${cx + (x - w) * hb},${yb}`,
    // nearer paint is brighter; far away it fades into the dark
    alpha: (200 / 255) * Math.max(0, 1 - (b - 1) / (FAR - 1)),
  };
}

export function Road({ width, height, kmh, fill, line }: { width: number; height: number; kmh: number; fill: string; line: string }) {
  const { prefs } = usePrefs();
  const frame = Motion.frame(Motion.level(prefs));
  const [travelled, setTravelled] = useState(0);
  const speed = useRef(kmh);
  speed.current = kmh;
  const moving = kmh > 0.5 && frame > 0;
  // nothing to draw behind another app, so the frames stop there (as the engine's easing does)
  const [active, setActive] = useState(() => AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setActive(st === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!moving || !active) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      // a little slower than real life reads better at this size
      const d = ((speed.current / 3.6) * 0.16 * Math.min(200, now - last)) / 1000;
      last = now;
      setTravelled((x) => (x + d) % (DASH + GAP));
    }, frame);
    return () => clearInterval(t);
  }, [moving, frame, active]);

  const ground = height;
  const halfWidth = width * 0.5;
  const cx = width / 2;
  // the solid edge lines stand still, so they are built once for this size
  const edges = useMemo(() => {
    const out: Quad[] = [];
    for (const side of [-1, 1])
      for (let z = 1; z < FAR; z *= 1.6) out.push(quad(width, height, `e${side}${z}`, z, Math.min(z * 1.6, FAR), 0.01, side * 0.86));
    return out;
  }, [width, height]);
  // centre dashes, moving away from the viewer: the only part rebuilt on each frame
  const dashes: Quad[] = [];
  const period = DASH + GAP;
  for (let z0 = 1 - period + travelled, i = 0; z0 < FAR; z0 += period, i++) {
    const a = Math.max(z0, 1);
    const b = Math.min(z0 + DASH, FAR);
    if (b > a) dashes.push(quad(width, height, `d${i}`, a, b, 0.028, 0));
  }
  const topY = ground / FAR;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="asphalt" x1="0" y1={topY} x2="0" y2={ground} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={fill} stopOpacity={0} />
          <Stop offset="0.35" stopColor={fill} stopOpacity={0.2} />
          <Stop offset="1" stopColor={fill} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Polygon
        points={`${cx - halfWidth / FAR},${topY} ${cx + halfWidth / FAR},${topY} ${cx + halfWidth},${ground} ${cx - halfWidth},${ground}`}
        fill="url(#asphalt)"
      />
      {edges.map((q) => (
        <Polygon key={q.key} points={q.pts} fill={line} opacity={q.alpha} />
      ))}
      {dashes.map((q) => (
        <Polygon key={q.key} points={q.pts} fill={line} opacity={q.alpha} />
      ))}
    </Svg>
  );
}
