// The app's own folders (routes driven, dashcam clips, themes, boot animations), in memory: a
// browser has no such folders, and the screens only need them to say "nothing saved yet".
const files = new Map();

export const Paths = { cache: 'file:///shots/cache/', document: 'file:///shots/documents/' };

const join = (base, name) => String(base).replace(/\/?$/, '/') + String(name ?? '').replace(/^\//, '');

export class Directory {
  constructor(base, name) {
    this.uri = name === undefined ? String(base) : join(base.uri ?? base, name);
  }
  get exists() {
    return files.has(this.uri);
  }
  create() {
    files.set(this.uri, null);
  }
  delete() {
    for (const k of [...files.keys()]) if (k.startsWith(this.uri)) files.delete(k);
  }
  list() {
    return [];
  }
  get parentDirectory() {
    return new Directory(this.uri.replace(/[^/]*\/?$/, ''));
  }
}

export class File {
  constructor(base, name) {
    this.uri = name === undefined ? String(base) : join(base.uri ?? base, name);
    this.name = this.uri.split('/').pop() ?? '';
  }
  get exists() {
    return typeof files.get(this.uri) === 'string';
  }
  get size() {
    return (files.get(this.uri) ?? '').length;
  }
  get modificationTime() {
    return Date.now();
  }
  get contentUri() {
    return this.uri;
  }
  get parentDirectory() {
    return new Directory(this.uri.replace(/[^/]*$/, ''));
  }
  create() {
    files.set(this.uri, '');
  }
  write(body, options) {
    files.set(this.uri, (options?.append ? (files.get(this.uri) ?? '') : '') + String(body));
  }
  async text() {
    return files.get(this.uri) ?? '';
  }
  async bytes() {
    return new Uint8Array();
  }
  delete() {
    files.delete(this.uri);
  }
  moveSync(to) {
    files.set(to.uri ?? String(to), files.get(this.uri) ?? '');
    files.delete(this.uri);
  }
  copySync(to) {
    files.set(to.uri ?? String(to), files.get(this.uri) ?? '');
  }
}
