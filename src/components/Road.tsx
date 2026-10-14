/**
 * The moving road under the car: drawn in perspective, its centre dashes slide away at a rate
 * that follows the speed and stop when the car stops (the car box's road in the Android version).
 */
import { useEffect, useRef, useState } from 'react';
import Svg, { Polygon } from 'react-native-svg';

const DASHES = 6;

export function Road({ width, height, kmh, fill, line }: { width: number; height: number; kmh: number; fill: string; line: string }) {
  const [phase, setPhase] = useState(0);
  const last = useRef(Date.now());
  const speed = useRef(kmh);
  speed.current = kmh;

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (speed.current > 1) setPhase((p) => (p + (dt * speed.current) / 40) % 1);
    }, 50);
    return () => clearInterval(t);
  }, []);

  const cx = width / 2;
  const topHalf = width * 0.06;
  const bottomHalf = width * 0.48;
  // depth 0 at the horizon, 1 at the bottom; perspective squeezes far dashes together
  const y = (d: number) => height * d * d;
  const half = (d: number) => topHalf + (bottomHalf - topHalf) * d;
  const dashes = [];
  for (let i = 0; i < DASHES; i++) {
    const a = (i + phase) / DASHES;
    const b = a + 0.45 / DASHES;
    if (b > 1) continue;
    const da = Math.sqrt(a);
    const db = Math.sqrt(b);
    const wa = half(da) * 0.025;
    const wb = half(db) * 0.025;
    dashes.push(
      <Polygon
        key={i}
        points={`${cx - wa},${y(da)} ${cx + wa},${y(da)} ${cx + wb},${y(db)} ${cx - wb},${y(db)}`}
        fill={line}
        opacity={0.35 + 0.65 * db}
      />,
    );
  }
  return (
    <Svg width={width} height={height}>
      <Polygon points={`${cx - topHalf},0 ${cx + topHalf},0 ${cx + bottomHalf},${height} ${cx - bottomHalf},${height}`} fill={fill} />
      {dashes}
    </Svg>
  );
}
