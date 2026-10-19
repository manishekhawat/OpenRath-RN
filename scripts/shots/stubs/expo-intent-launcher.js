// Starting another Android app: there is none to start here.
export const ActivityAction = { SETTINGS: 'android.settings.SETTINGS', LOCATION_SOURCE_SETTINGS: 'android.settings.LOCATION_SOURCE_SETTINGS' };
export const ResultCode = { Success: -1, Canceled: 0, FirstUser: 1 };
export async function startActivityAsync() {
  return { resultCode: ResultCode.Canceled };
}
export async function openApplication() {}
export async function getApplicationIconAsync() {
  return null;
}
