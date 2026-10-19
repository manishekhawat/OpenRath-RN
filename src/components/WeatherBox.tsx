/**
 * The weather box (Cards.WeatherCard): the temperature and sky, humidity and wind, rain coming,
 * the air quality and, offline, how old the kept forecast is. A tall box with Hourly weather on
 * (1.38) also shows the next 24 hours: a temperature curve, the hours marked, and a blue bar where
 * rain is expected (Cards.Hours).
 */
import { useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

import * as Air from '../logic/air';
import * as Features from '../logic/features';
import { f, t } from '../logic/i18n';
import * as Units from '../logic/units';
import * as Weather from '../logic/weather';
import { useLook } from '../state/look';
import { usePrefs } from '../state/prefs';
import type { WeatherInfo } from '../state/weather';
import { TapBox } from './Tap';

const RAIN = '#7FB8FF';

export function WeatherBox({ weather, waiting, style, onPress }: { weather: WeatherInfo; waiting: boolean; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { prefs } = usePrefs();
  const look = useLook();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const wx = weather.wx;
  const want = Features.on(prefs, 'hourlyWeather') && !!wx && wx.hours.length >= 6;
  // a tall box has room for the next 24 hours under the reading
  const curve = want && size.h > 170 * Math.min(1, size.w / 300);
  let rain = wx && Features.on(prefs, 'rain') ? Weather.showRain(wx.rain) : '';
  // offline: say the reading comes from the kept forecast
  if (wx?.savedNote) rain = rain ? rain + '  ·  ' + t('offline') : wx.savedNote;
  return (
    <TapBox title={weather.place ? weather.place.toUpperCase() : t('Weather').toUpperCase()} style={style} onPress={onPress}>
      <View style={{ flex: 1 }} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height + 30 })}>
        {wx ? (
          <>
            <Text style={[styles.big, { color: look.text }]}>{Units.temp(prefs, wx.tempC)}</Text>
            <Text style={{ color: look.textDim }} numberOfLines={1}>
              {t(wx.text)} · {Math.round(wx.humidity)}% · {f('wind %1$s km/h', Math.round(wx.wind))}
            </Text>
            {rain ? (
              <Text style={[styles.small, { color: wx.savedNote && !wx.rain ? look.textDim : RAIN }]} numberOfLines={1}>
                {rain}
              </Text>
            ) : null}
            {weather.aqi > 0 ? (
              <Text style={[styles.small, { color: weather.aqi > 200 ? '#FFB02E' : look.textDim }]}>
                {f('Air: %1$s (AQI %2$s)', t(Air.band(weather.aqi)), weather.aqi)}
              </Text>
            ) : null}
            {curve ? <Hours temps={wx.hours} rain={wx.hoursRain} fahrenheit={Units.fahrenheit(prefs)} line={look.text} dim={look.textDim} /> : null}
          </>
        ) : (
          <Text style={{ color: look.textDim }}>{waiting ? t('Waiting for the location') : t('Loading the weather')}</Text>
        )}
      </View>
    </TapBox>
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
  big: { fontSize: 34, fontWeight: '300' },
  small: { fontSize: 12, letterSpacing: 0.5 },
  hours: { flex: 1, minHeight: 60, marginTop: 8 },
});
