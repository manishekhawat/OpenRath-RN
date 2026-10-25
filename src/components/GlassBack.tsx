/**
 * The Glass look's wallpaper, behind every screen (Glass.backdrop): a soft, colourful, blurred
 * picture that the see-through panels sit on. The Android version paints spots of colour and blurs
 * the result once into a small bitmap; here the same thing is drawn as one SVG of a top-to-bottom
 * gradient with five radial spots on it, which is what that blurred bitmap looks like and is drawn
 * once by the platform. The whole wallpaper is darkened (a black sheet over it), as the Android
 * version shades its pixels, so white text reads on it; at night it is darkened further.
 *
 * "My picture" uses the theme's own background picture. It is darkened but not blurred: blurring a
 * picture needs a filter the stereos this runs on cannot be relied on to draw.
 */
import { StyleSheet } from 'react-native';
import Svg, { Defs, Image as SvgImage, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import * as Glass from '../logic/glass';
import type { Look } from '../logic/theme';

/** The viewBox the wallpaper is drawn in; it is scaled up to cover whatever it sits behind. */
const W = Glass.SMALL_W;
const H = Glass.SMALL_H;

/**
 * How much of a spot's colour lands at each distance from its centre, as the Android version's
 * smooth falloff (strength * t * t * (3 - 2t), t going 1 at the centre to 0 at the edge).
 */
const FALLOFF = [0, 0.25, 0.5, 0.75, 1].map((d) => {
  const t = 1 - d;
  return { offset: d, opacity: 0.85 * t * t * (3 - 2 * t) };
});

export function GlassBack({ look }: { look: Look }) {
  const g = look.glass;
  if (!g) return null;
  const wall = Glass.spots(g.which);
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      <Defs>
        <LinearGradient id="gwall" x1={0} y1={0} x2={0} y2={H} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={wall.top} />
          <Stop offset={1} stopColor={wall.bottom} />
        </LinearGradient>
        {wall.spots.map((s, i) => (
          <RadialGradient
            key={i}
            id={`gspot${i}`}
            cx={s.x * W}
            cy={s.y * H}
            r={s.r * H}
            gradientUnits="userSpaceOnUse"
          >
            {FALLOFF.map((f) => (
              <Stop key={f.offset} offset={f.offset} stopColor={s.colour} stopOpacity={f.opacity} />
            ))}
          </RadialGradient>
        ))}
      </Defs>
      <Rect x={0} y={0} width={W} height={H} fill="url(#gwall)" />
      {g.picture ? <SvgImage href={{ uri: g.picture }} x={0} y={0} width={W} height={H} preserveAspectRatio="xMidYMid slice" /> : null}
      {g.picture
        ? null
        : wall.spots.map((_, i) => <Rect key={i} x={0} y={0} width={W} height={H} fill={`url(#gspot${i})`} />)}
      <Rect x={0} y={0} width={W} height={H} fill="#000000" opacity={1 - g.shade} />
    </Svg>
  );
}
