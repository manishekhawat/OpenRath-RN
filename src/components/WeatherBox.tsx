/**
 * The weather box (Cards.WeatherCard): the temperature and sky, rain coming, and, offline, how old
 * the kept forecast is. Since 1.44 it also shows the car's altitude, the way it points and the air
 * quality on one row, and the next two days' highs and lows under that; a box much wider than it is
 * tall puts those beside the reading instead of under it. A tall box with Hourly weather on (1.38)
 * ends with the next 24 hours: a temperature curve, the hours marked, and a blue bar where rain is
 * expected (Cards.Hours). Rows the box has no room for are left out, the tallest first
 * (Weather.rows).
 */
import { memo, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';

import * as Features from '../logic/features';
import { t } from '../logic/i18n';
import * as Units from '../logic/units';
import * as Weather from '../logic/weather';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import type { WeatherInfo } from '../state/weather';
import { TapBox } from './Tap';

const RAIN = '#7FB8FF';

export const WeatherBox = memo(function WeatherBox({
  weather,
  waiting,
  altM = -1,
  heading = -1,
  style,
  onPress,
}: {
  weather: WeatherInfo;
  waiting: boolean;
  /** metres above sea level from the last fix that gave one, -1 until then */
  altM?: number;
  /** the way the car points in degrees, -1 while parked */
  heading?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const { prefs } = usePrefs();
  const look = useLook();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wx = weather.wx;
  const hourly = Features.on(prefs, 'hourlyWeather') && !!wx && wx.hours.length >= 6;
  const room = Weather.rows(size.w, size.h, hourly);
  const side = Weather.wide(size.w, size.h);
  // air quality is part of Weather alerts since 1.35 (the old 'aqi' switch)
  const aqiOn = Features.on(prefs, 'rain');
  let rain = wx && Features.on(prefs, 'rain') ? Weather.showRain(wx.rain) : '';
  // offline: say the reading comes from the kept forecast
  if (wx?.savedNote) rain = rain ? rain + '  ·  ' + t('offline') : wx.savedNote;

  const reading = wx ? (
    <View style={side ? styles.readingWide : undefined}>
      <Text style={[styles.big, { color: look.text }]}>{Units.temp(prefs, wx.tempC)}</Text>
      <Text style={{ color: look.text, fontWeight: '500' }} numberOfLines={1}>
        {t(wx.text)}
      </Text>
      {rain ? (
        <Text style={[styles.small, { color: wx.savedNote && !wx.rain ? look.textDim : RAIN }]} numberOfLines={1}>
          {rain}
        </Text>
      ) : null}
    </View>
  ) : null;

  const facts = (
    <View style={styles.facts}>
      <Fact ink={look.textDim} text={Weather.altText(altM)} colour={look.text} kind="hill" />
      <Fact ink={look.textDim} text={Weather.headingText(heading)} colour={look.text} kind="arrow" turn={heading} />
      {aqiOn ? (
        <Fact
          ink={Weather.aqiColour(weather.aqi, look.textDim)}
          text={Weather.aqiText(weather.aqi, true)}
          colour={weather.aqi > 200 ? '#FFB02E' : look.text}
          kind="dot"
        />
      ) : null}
    </View>
  );

  // the next two days, today left out: "Mon ☁ 32° / 24°"
  const ahead = wx ? wx.daily.slice(1, 3) : [];
  const days = ahead.length === 0 ? null : (
    <View style={styles.days}>
      {ahead.map((d) => (
        <View key={d.date} style={styles.day}>
          <Text style={[styles.dayName, { color: look.textDim }]} numberOfLines={1}>
            {Weather.dayName(d.date)}
          </Text>
          <Text style={[styles.dayTemp, { color: look.text }]} numberOfLines={1}>
            {`${Units.temp(prefs, d.max)} / ${Units.temp(prefs, d.min)}`}
          </Text>
        </View>
      ))}
    </View>
  );

  return (
    <TapBox title={weather.place ? weather.place.toUpperCase() : t('Weather').toUpperCase()} style={style} onPress={onPress}>
      <View
        style={side ? styles.bodyWide : styles.body}
        onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height + 30 })}
      >
        {wx ? (
          <>
            {reading}
            {room.facts ? facts : null}
            {room.days ? days : null}
            {room.hours ? (
              <Hours temps={wx.hours} rain={wx.hoursRain} fahrenheit={Units.fahrenheit(prefs)} line={look.text} dim={look.textDim} />
            ) : null}
          </>
        ) : (
          <Text style={[styles.big, { color: look.textDim }]}>{waiting ? t('No GPS position yet') : '--'}</Text>
        )}
      </View>
    </TapBox>
  );
});

/**
 * One of the three facts: a hill for the altitude, an arrow that turns with the heading, a dot for
 * the air, then the reading itself (Cards.Glyph).
 */
function Fact({ kind, text, ink, colour, turn = -1 }: { kind: 'hill' | 'arrow' | 'dot'; text: string; ink: string; colour: string; turn?: number }) {
  if (!text) return null;
  const s = 18;
  return (
    <View style={styles.fact}>
      <Svg width={s} height={s} viewBox="0 0 24 24">
        {kind === 'hill' ? <Polygon points="2,19 9,8 13,14 16,10 22,19" fill="none" stroke={ink} strokeWidth={2} /> : null}
        {kind === 'arrow' ? (
          <Polygon points="12,3 17,20 12,16 7,20" fill={ink} transform={turn >= 0 ? `rotate(${turn} 12 12)` : undefined} />
        ) : null}
        {kind === 'dot' ? <Circle cx={12} cy={12} r={6} fill={ink} /> : null}
      </Svg>
      <Text style={[styles.factText, { color: colour }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

/** The next 24 hours: a temperature curve with the hours marked, and a blue bar where rain is expected. */
function Hours({ temps: c, rain, fahrenheit, line, dim }: { temps: number[]; rain: number[]; fahrenheit: boolean; line: string; dim: string }) {
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const temps = c.map((x) => Units.tempValue(x, fahrenheit));
  const n = temps.length;
  let body = null;
  if (w > 0 && h > 0 && n >= 2) {
    const lo = Math.min(...temps);
    const hi = Math.max(...temps);
    const text = Math.max(9, h * 0.2);
    const top = text * 1.3;
    const bottom = h - text * 1.4;
    const span = Math.max(4, hi - lo);
    const x = (i: number) => (w * i) / (n - 1);
    const d = temps.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${bottom - ((v - lo) / span) * (bottom - top)}`).join(' ');
    const nowHour = new Date().getHours();
    body = (
      <>
        {rain.slice(0, n).map((r, i) =>
          r < 0.3 ? null : (
            <Rect
              key={'r' + i}
              x={x(i) - w / n / 2}
              y={bottom - Math.min(1, r / 4) * (bottom - top) * 0.5}
              width={w / n}
              height={Math.min(1, r / 4) * (bottom - top) * 0.5}
              fill={RAIN}
              opacity={0.53}
            />
          ),
        )}
        <Path d={d} stroke={line} strokeWidth={Math.max(1.5, text * 0.15)} fill="none" />
        <SvgText x={0} y={text} fontSize={text} fill={dim}>
          {`${Math.round(hi)}° / ${Math.round(lo)}°`}
        </SvgText>
        {temps.map((_, i) =>
          i % 6 !== 0 ? null : (
            <SvgText key={'h' + i} x={x(i)} y={h - text * 0.2} fontSize={text} fill={dim} textAnchor={i === 0 ? 'start' : 'middle'}>
              {i === 0 ? t('Now') : String((nowHour + i) % 24).padStart(2, '0')}
            </SvgText>
          ),
        )}
      </>
    );
  }
  return (
    <View
      style={styles.hours}
      onLayout={(e) => {
        setW(e.nativeEvent.layout.width);
        setH(e.nativeEvent.layout.height);
      }}
    >
      <Svg width={w} height={h}>
        {body}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  bodyWide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 18 },
  readingWide: { minWidth: 120 },
  big: { fontSize: 34, fontWeight: '300' },
  small: { fontSize: 12, letterSpacing: 0.5 },
  facts: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'nowrap' },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  factText: { fontSize: 14, fontWeight: '500' },
  days: { flexDirection: 'row', gap: 14, marginTop: 8 },
  day: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dayName: { fontSize: 13, fontWeight: '500' },
  dayTemp: { fontSize: 14, fontWeight: '500' },
  hours: { flex: 1, minHeight: 60, marginTop: 8 },
});
