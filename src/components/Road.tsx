/**
 * The moving road under the car (CarCard.Road in the Android version), drawn in perspective. Its
 * lane markings slide away toward the horizon at a rate that follows the speed, so the car looks
 * like it's driving; standing still, the road stops too. Less movement (Home screen) slows the
 * frames at Reduced and keeps the road still at Off.
 */
import { useEffect, useRef, useState } from 'react';
import Svg, { Defs, LinearGradient, Polygon, Stop } from 'react-native-svg';

import * as Motion from '../logic/motion';
import { usePrefs } from '../state/prefs';

// in road units: short, so several dashes show below the car
const FAR = 40;
const DASH = 0.45;
const GAP = 0.4;

export function Road({ width, height, kmh, fill, line }: { width: number; height: number; kmh: number; fill: string; line: string }) {
  const { prefs } = usePrefs();
  const frame = Motion.frame(Motion.level(prefs));
  const [travelled, setTravelled] = useState(0);
  const speed = useRef(kmh);
  speed.current = kmh;
  const moving = kmh > 0.5 && frame > 0;

  useEffect(() => {
    if (!moving) return;
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      // a little slower than real life reads better at this size
      const d = ((speed.current / 3.6) * 0.16 * Math.min(200, now - last)) / 1000;
      last = now;
      setTravelled((x) => (x + d) % (DASH + GAP));
    }, frame);
    return () => clearInterval(t);
  }, [moving, frame]);

  const horizon = 0;
  const ground = height;
  const halfWidth = width * 0.5;
  const cx = width / 2;
  // screen y for a point z ahead of the near edge (z = 1 is the near edge)
  const y = (z: number) => horizon + (ground - horizon) / z;
  const quads: { key: string; pts: string; alpha: number }[] = [];
  /** a strip of paint from z a to z b, w wide (as a share of the half width), centred at x */
  const quad = (key: string, a: number, b: number, w: number, x: number) => {
    const ya = y(a);
    const yb = y(b);
    const ha = halfWidth / a;
    const hb = halfWidth / b;
    quads.push({
      key,
      pts: `${cx + (x - w) * ha},${ya} ${cx + (x + w) * ha},${ya} ${cx + (x + w) * hb},${yb} ${cx + (x - w) * hb},${yb}`,
      // nearer paint is brighter; far away it fades into the dark
      alpha: (200 / 255) * Math.max(0, 1 - (b - 1) / (FAR - 1)),
    });
  };
  // solid edge lines
  for (const side of [-1, 1]) for (let z = 1; z < FAR; z *= 1.6) quad(`e${side}${z}`, z, Math.min(z * 1.6, FAR), 0.01, side * 0.86);
  // centre dashes, moving away from the viewer
  const period = DASH + GAP;
  for (let z0 = 1 - period + travelled, i = 0; z0 < FAR; z0 += period, i++) {
    const a = Math.max(z0, 1);
    const b = Math.min(z0 + DASH, FAR);
    if (b > a) quad(`d${i}`, a, b, 0.028, 0);
  }
  const topY = y(FAR);
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
      {quads.map((q) => (
        <Polygon key={q.key} points={q.pts} fill={line} opacity={q.alpha} />
      ))}
    </Svg>
  );
}
