// The unit's battery, for the dock's icons.
export const BatteryState = { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3 };
export async function getBatteryLevelAsync() {
  return 0.82;
}
export async function getBatteryStateAsync() {
  return BatteryState.CHARGING;
}
