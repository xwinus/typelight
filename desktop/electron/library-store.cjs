'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAXIMUM_BYTES = 50 * 1024 * 1024;
const ALLOWED_KEYS = new Set(['typelight.text', 'typelight.edited', 'typelight.title',
  'typelight.drawer', 'typelight.prefs', 'typelight.document']);
const invalid = reason => new Error(`The library could not be read safely: ${reason}. Its files have not been replaced.`);
const tooLarge = () => new Error('The library exceeds the 50 MB storage limit. Export your text before continuing.');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validPosition = value => isObject(value) && ['anchor', 'caret', 'view']
  .every(key => Number.isSafeInteger(value[key]) && value[key] >= 0);
const SNAPSHOT_PREFIX = Buffer.from('{"version":1,"values":{');
const SNAPSHOT_SUFFIX = Buffer.from('}}');
const COMMA = Buffer.from(',');

function parseJSON(value, name) {
  try { return JSON.parse(value); } catch { throw invalid(`invalid ${name}`); }
}

function validDrawerItem(item) {
  if (!isObject(item) || typeof item.id !== 'string' || typeof item.text !== 'string') return false;
  if (item.position !== undefined && !validPosition(item.position)) return false;
  if (item.title !== undefined && typeof item.title !== 'string') return false;
  for (const key of ['at', 'gone']) {
    if (item[key] !== undefined && (!Number.isFinite(item[key]) || item[key] < 0)) return false;
  }
  for (const key of ['fx', 'fy']) {
    if (item[key] !== undefined && !Number.isFinite(item[key])) return false;
  }
  if (item.side !== undefined && !['left', 'right'].includes(item.side)) return false;
  if (item.spin !== undefined && (!isObject(item.spin) ||
      !['ax', 'ay', 'angle'].every(key => Number.isFinite(item.spin[key])))) return false;
  return true;
}

function ownValues(values) {
  if (!isObject(values) || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) {
    throw invalid('unsupported value types');
  }
  const result = {};
  for (const key of Reflect.ownKeys(values)) {
    if (!ALLOWED_KEYS.has(key)) throw invalid('unknown storage keys');
    const property = Object.getOwnPropertyDescriptor(values, key);
    if (!property.enumerable || typeof property.value !== 'string') throw invalid('unsupported value types');
    result[key] = property.value;
  }
  return result;
}

function validate(values, previous = {}, encoded = new Map()) {
  let bytes = 0;
  for (const [key, value] of Object.entries(values)) {
    const cached = encoded.get(key);
    bytes += cached?.value === value ? cached.bytes : Buffer.byteLength(key) + Buffer.byteLength(value);
  }
  if (bytes > MAXIMUM_BYTES) throw tooLarge();
  const changed = key => values[key] !== undefined && values[key] !== previous[key];
  if (changed('typelight.document')) {
    const document = parseJSON(values['typelight.document'], 'document position');
    if (!validPosition(document) || typeof document.id !== 'string' || !document.id) throw invalid('invalid document position');
  }
  const edited = values['typelight.edited'];
  if (changed('typelight.edited') && (!edited.trim() || !Number.isFinite(Number(edited)) || Number(edited) < 0)) {
    throw invalid('invalid document timestamp');
  }
  if (changed('typelight.drawer')) {
    const drawer = parseJSON(values['typelight.drawer'], 'drawer contents');
    if (!isObject(drawer) || drawer.v !== 1 || !Array.isArray(drawer.pile) || !Array.isArray(drawer.bin)) {
      throw invalid('invalid drawer contents');
    }
    const items = [...drawer.pile, ...drawer.bin];
    if (!items.every(validDrawerItem)) throw invalid('invalid drawer document metadata');
    if (new Set(items.map(item => item.id)).size !== items.length) throw invalid('duplicate drawer document identifiers');
  }
  if (changed('typelight.prefs') && !isObject(parseJSON(values['typelight.prefs'], 'preferences'))) {
    throw invalid('invalid preferences');
  }
}

function encodeSnapshot(values, previous) {
  const chunks = [SNAPSHOT_PREFIX], entries = [];
  let length = SNAPSHOT_PREFIX.length;
  for (const [key, value] of Object.entries(values)) {
    if (entries.length) { chunks.push(COMMA); length++; }
    const cached = previous.get(key);
    const entry = cached?.value === value ? cached : {
      value, bytes: Buffer.byteLength(key) + Buffer.byteLength(value),
      chunk: Buffer.from(JSON.stringify(key) + ':' + JSON.stringify(value)),
    };
    entries.push({ key, entry, offset: length });
    chunks.push(entry.chunk);
    length += entry.chunk.length;
    if (length + SNAPSHOT_SUFFIX.length > MAXIMUM_BYTES) throw tooLarge();
  }
  chunks.push(SNAPSHOT_SUFFIX);
  const data = Buffer.concat(chunks, length + SNAPSHOT_SUFFIX.length);
  // Slices share only this new snapshot, so cached fields cannot retain older full libraries.
  const encoded = new Map(entries.map(({ key, entry, offset }) => [key, {
    value: entry.value, bytes: entry.bytes, chunk: data.subarray(offset, offset + entry.chunk.length),
  }]));
  return { data, encoded };
}

function readSnapshot(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw invalid('the library is not a regular file');
    if (stat.size > MAXIMUM_BYTES) throw tooLarge();
    const data = fs.readFileSync(file);
    if (data.length > MAXIMUM_BYTES) throw tooLarge();
    return data;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

// The temporary file shares the destination filesystem; a failed rename leaves the old file intact.
function atomicWrite(file, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  if (bytes.length > MAXIMUM_BYTES) throw tooLarge();
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}-${randomUUID()}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* preserve the write error */ }
    }
    try { fs.unlinkSync(temporary); } catch { /* removed by rename, or cleanup could not complete */ }
  }
}

class LibraryStore {
  #values = {};
  #encoded = new Map();
  #persistedData = null;
  #lastBackupTime = null;
  #clock;
  #backupInterval;

  // The main process owns this synchronous store and must acquire Electron's single-instance lock first.
  constructor(directory, { clock = Date.now, backupInterval = 300_000 } = {}) {
    this.directory = path.resolve(directory);
    this.backupsDirectory = path.join(this.directory, 'Backups');
    this.filePath = path.join(this.directory, 'library.json');
    this.#clock = clock;
    this.#backupInterval = Math.max(0, backupInterval);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.#persistedData = readSnapshot(this.filePath);
    if (this.#persistedData !== null) this.#values = LibraryStore.decodeSnapshot(this.#persistedData);
  }

  get values() { return { ...this.#values }; }

  static decodeSnapshot(data) {
    if (!Buffer.isBuffer(data) && typeof data !== 'string') throw invalid('unsupported snapshot input');
    if (Buffer.byteLength(data) > MAXIMUM_BYTES) throw tooLarge();
    if (Buffer.isBuffer(data)) {
      try { data = new TextDecoder('utf-8', { fatal: true }).decode(data); }
      catch { throw invalid('invalid UTF-8'); }
    }
    const envelope = parseJSON(data, 'JSON');
    if (!isObject(envelope) || Object.keys(envelope).sort().join(',') !== 'values,version' || envelope.version !== 1) {
      throw invalid('unsupported format or value types');
    }
    const values = ownValues(envelope.values);
    validate(values);
    return values;
  }

  patch(changes) {
    this.replace({ ...this.#values, ...ownValues(changes) });
  }

  replace(replacement) {
    const values = Object.fromEntries(Object.entries(ownValues(replacement)).sort(([a], [b]) => a.localeCompare(b)));
    validate(values, this.#values, this.#encoded);
    this.#assertUnchanged();
    const sameValues = Object.keys(values).length === Object.keys(this.#values).length &&
      Object.entries(values).every(([key, value]) => this.#values[key] === value);
    if (sameValues && this.#persistedData !== null) return;
    const { data, encoded } = encodeSnapshot(values, this.#encoded);

    const now = this.#clock();
    if (this.#persistedData !== null &&
        (this.#lastBackupTime === null || now - this.#lastBackupTime >= this.#backupInterval)) {
      fs.mkdirSync(this.backupsDirectory, { recursive: true, mode: 0o700 });
      const name = `library-${Math.trunc(now)}-${randomUUID()}.json`;
      atomicWrite(path.join(this.backupsDirectory, name), this.#persistedData);
      this.#lastBackupTime = now;
    }
    atomicWrite(this.filePath, data);
    this.#values = values;
    this.#encoded = encoded;
    this.#persistedData = data;
    try { this.#pruneBackups(); } catch { /* An already completed save must remain successful. */ }
  }

  checkpoint() {
    this.#assertUnchanged();
    if (this.#persistedData === null) return false;
    fs.mkdirSync(this.backupsDirectory, { recursive: true, mode: 0o700 });
    const snapshots = this.#snapshotNames();
    const latest = snapshots[0];
    if (latest && readSnapshot(path.join(this.backupsDirectory, latest))?.equals(this.#persistedData)) {
      this.#pruneBackups();
      return false;
    }
    // Keep the completed session newest even if the clock moves back or two saves share a millisecond.
    const now = this.#clock();
    const timestamp = Math.max(Math.trunc(now), latest ? Number(latest.split('-')[1]) + 1 : 0);
    atomicWrite(path.join(this.backupsDirectory, `library-${timestamp}-${randomUUID()}.json`), this.#persistedData);
    this.#lastBackupTime = now;
    this.#pruneBackups();
    return true;
  }

  #assertUnchanged() {
    const current = readSnapshot(this.filePath);
    if (current === null ? this.#persistedData !== null : !this.#persistedData?.equals(current)) {
      throw new Error('The library changed outside this application. Keep a copy of your text before reopening Typelight.');
    }
  }

  #snapshotNames() {
    return fs.readdirSync(this.backupsDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^library-\d+-[\w-]+\.json$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]) || b.localeCompare(a));
  }

  #pruneBackups() {
    for (const name of this.#snapshotNames().slice(30)) fs.unlinkSync(path.join(this.backupsDirectory, name));
  }
}

module.exports = { LibraryStore, MAXIMUM_BYTES, atomicWrite };
