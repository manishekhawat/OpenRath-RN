/**
 * Small Wi-Fi, mobile data, GPS and battery icons for the dock (StatusIcons.java, feature
 * dockStatus), because many stereos hide Android's status bar. Bright means working, dim means on
 * but not connected; an icon is left out when the unit has no such thing. Checked every 5 seconds.
 * From Expo's modules: the network in use (not the Wi-Fi strength, the SIM's signal bars or 4G/5G)
 * and the battery. The Bluetooth icon needs Android's Bluetooth adapter, which no Expo module
 * reads, so it is left out until a native module adds it. Nothing is read behind another app.
 */
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as Network from 'expo-network';
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { t } from '../logic/i18n';
import * as Status from '../logic/status';
import { useDriveTrip } from '../state/drive';
import { useLook } from '../state/look';

interface Read {
  /** -1 = hide, 0 = on but not joined, 1–4 bars */
  wifi: number;
  /** -1 = hide, else bars */
  mobile: number;
  gpsOn: boolean;
  /** -1 = no battery */
  battery: number;
  charging: boolean;
}

const NONE: Read = { wifi: -1, mobile: -1, gpsOn: false, battery: -1, charging: false };

export const StatusIcons = memo(function StatusIcons({ across = true, style }: { across?: boolean; style?: StyleProp<ViewStyle> }) {
  const look = useLook();
  const { trip } = useDriveTrip();
  const [r, setR] = useState<Read>(NONE);
  const fixAt = useRef(0);
  fixAt.current = trip.last?.t ?? 0;
  const [, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const read = async () => {
      const out: Read = { ...NONE };
      try {
        const n = await Network.getNetworkStateAsync();
        // the strength isn't known: a joined Wi-Fi shows full bars, mobile data shows as working
        if (n.type === Network.NetworkStateType.WIFI) out.wifi = n.isConnected ? 4 : 0;
        if (n.type === Network.NetworkStateType.CELLULAR) out.mobile = n.isInternetReachable === false ? 0 : 4;
      } catch {
        // no network module: the icons stay out
      }
      try {
        out.gpsOn = await Location.hasServicesEnabledAsync();
      } catch {
        out.gpsOn = false;
      }
      try {
        const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
        // a unit without a battery reports an unknown state (Java's "present" flag)
        out.battery = Status.percent(state !== Battery.BatteryState.UNKNOWN, level < 0 ? -1 : Math.round(level * 100), 100);
        out.charging = state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL || state === Battery.BatteryState.NOT_CHARGING;
      } catch {
        out.battery = -1;
      }
      if (live) {
        setR(out);
        setTick((x) => x + 1);
      }
    };
    read();
    const id = setInterval(() => {
      if (AppState.currentState === 'active') read();
    }, 5000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const age = fixAt.current ? Math.floor((Date.now() - fixAt.current) / 1000) : -1;
  const gps = Status.gps(age, r.gpsOn);
  const bright = look.text;
  const dim = look.textDim;
  const c = (on: boolean) => (on ? bright : dim);
  const s = 22;
  const icons: { key: string; el: ReactNode }[] = [];
  if (r.wifi >= 0)
    icons.push({
      key: 'wifi',
      el: (
        <G>
          {[1, 2, 3].map((i) => {
            const rr = s * 0.28 * i;
            const cx = s / 2;
            const by = s * 0.9;
            const a1 = (225 * Math.PI) / 180;
            const a2 = (315 * Math.PI) / 180;
            return (
              <Path
                key={i}
                d={`M ${cx + rr * Math.cos(a1)} ${by + rr * Math.sin(a1)} A ${rr} ${rr} 0 0 1 ${cx + rr * Math.cos(a2)} ${by + rr * Math.sin(a2)}`}
                stroke={c(r.wifi >= i)}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
          <Circle cx={s / 2} cy={s * 0.86} r={s * 0.07} fill={c(r.wifi > 0)} />
        </G>
      ),
    });
  if (r.mobile >= 0) {
    const w = s / 5.5;
    icons.push({
      key: 'mobile',
      el: (
        <G>
          {[0, 1, 2, 3].map((i) => {
            const h = s * (0.3 + 0.23 * i);
            return <Rect key={i} x={i * w * 1.45} y={s - h} width={w} height={h} fill={c(r.mobile > i)} />;
          })}
        </G>
      ),
    });
  }
  {
    const cx = s / 2;
    const rr = s * 0.3;
    const cy = s * 0.36;
    const a = (150 * Math.PI) / 180;
    const b = (30 * Math.PI) / 180;
    icons.push({
      key: 'gps',
      el: (
        <G>
          <Path
            d={`M ${cx + rr * Math.cos(a)} ${cy + rr * Math.sin(a)} A ${rr} ${rr} 0 1 1 ${cx + rr * Math.cos(b)} ${cy + rr * Math.sin(b)} L ${cx} ${s} Z`}
            fill={gps === Status.OFF ? 'none' : c(gps === Status.ON)}
            stroke={c(gps === Status.ON)}
            strokeWidth={2}
          />
          <Circle cx={cx} cy={cy} r={rr * 0.4} fill={look.background} />
        </G>
      ),
    });
  }
  if (r.battery >= 0) {
    const low = r.battery <= 15 && !r.charging;
    const col = low ? '#D5525A' : bright;
    const top = s * 0.18;
    const bot = s * 0.95;
    const l = s * 0.12;
    const rt = s * 0.88;
    const inner = s * 0.08;
    const fillTop = bot - inner - ((bot - top - 2 * inner) * r.battery) / 100;
    icons.push({
      key: 'battery',
      el: (
        <G>
          <Rect x={l} y={top} width={rt - l} height={bot - top} rx={s * 0.08} stroke={col} strokeWidth={2} fill="none" />
          <Rect x={s * 0.38} y={s * 0.05} width={s * 0.24} height={top - s * 0.05} fill={col} />
          <Rect x={l + inner} y={fillTop} width={rt - l - 2 * inner} height={bot - inner - fillTop} fill={col} />
        </G>
      ),
    });
  }

  const label =
    (r.wifi >= 0 ? `${t('Wi-Fi')} ${r.wifi > 0 ? t('connected') : t('not connected')}. ` : '') +
    `GPS ${gps === Status.ON ? t('connected') : t('not connected')}.`;
  return (
    <View style={[{ flexDirection: across ? 'row' : 'column', alignItems: 'center', gap: s * 0.4 }, style]} accessibilityLabel={label}>
      {icons.map((i) => (
        <Svg key={i.key} width={s} height={s}>
          {i.el}
        </Svg>
      ))}
    </View>
  );
});
