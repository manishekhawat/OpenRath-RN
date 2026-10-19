// The unit's music and the gallery.
const denied = { status: 'undetermined', granted: false, canAskAgain: true };
export const MediaType = { audio: 'audio', photo: 'photo', video: 'video', unknown: 'unknown' };
export const AssetField = { creationTime: 'creationTime', duration: 'duration', filename: 'filename' };
export async function getPermissionsAsync() {
  return denied;
}
export async function requestPermissionsAsync() {
  return denied;
}
export class Asset {
  static async create() {
    return null;
  }
}
export class Query {
  constructor() {
    this.rows = [];
  }
  eq() {
    return this;
  }
  gt() {
    return this;
  }
  lt() {
    return this;
  }
  orderBy() {
    return this;
  }
  limit() {
    return this;
  }
  async exe() {
    return [];
  }
  async exec() {
    return [];
  }
}
