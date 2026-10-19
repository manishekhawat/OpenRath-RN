// The accelerometer the dashcam watches for a jolt: still, in a browser.
export const Accelerometer = {
  addListener() {
    return { remove() {} };
  },
  setUpdateInterval() {},
  removeAllListeners() {},
};
export const DeviceMotion = Accelerometer;
export const Gyroscope = Accelerometer;
