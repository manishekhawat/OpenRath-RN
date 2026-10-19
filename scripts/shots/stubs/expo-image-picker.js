// Taking or picking a photo (the documents wallet).
const denied = { status: 'undetermined', granted: false, canAskAgain: true };
export async function requestCameraPermissionsAsync() {
  return denied;
}
export async function requestMediaLibraryPermissionsAsync() {
  return denied;
}
export async function launchCameraAsync() {
  return { canceled: true, assets: null };
}
export async function launchImageLibraryAsync() {
  return { canceled: true, assets: null };
}
export const MediaTypeOptions = { Images: 'Images', Videos: 'Videos', All: 'All' };
