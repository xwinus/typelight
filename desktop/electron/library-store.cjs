'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAXIMUM_BYTES = 50 * 1024 * 1024;
const ALLOWED_KEYS = new Set(['typelight.text', 'typelight.edited', 'typelight.title',
  'typelight.drawer', 'typelight.prefs']);
const invalid = reason => new Error(`The library could not be read safely: ${reason}. Its files have not been replaced.`);
const tooLarge = () => new Error('The library exceeds the 50 MB storage limit. Export your text before continuing.');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function parseJSON(value, name) {
  try { return JSON.parse(value); } catch { throw invalid(`invalid ${name}`); }
}

function validate(values) {
  if (!isObject(values) || ![Object.prototype, null].includes(Object.getPrototypeOf(values))) {
    throw invalid('unsupported value types');
  }
  let bytes = 0;
  for (const [key, value] of Object.entries(values)) {
    if (!ALLOWED_KEYS.has(key)) throw invalid('unknown storage keys');
    if (typeof value !== 'string') throw invalid('unsupported value types');
    bytes += Buffer.byteLength(key) + Buffer.byteLength(value);
  }
  if (bytes > MAXIMUM_BYTES) throw tooLarge();
  const edited = values['typelight.edited'];
  if (edited !== undefined && (!edited.trim() || !Number.isFinite(Number(edited)) || Number(edited) < 0)) {
    throw invalid('invalid document timestamp');
  }
  if (values['typelight.drawer'] !== undefined) {
    const drawer = parseJSON(values['typelight.drawer'], 'drawer contents');
    if (!isObject(drawer) || drawer.v !== 1 || !Array.isArray(drawer.pile) || !Array.isArray(drawer.bin) ||
        ![...drawer.pile, ...drawer.bin].every(item => isObject(item) &&
          typeof item.id === 'string' && typeof item.text === 'string')) {
      throw invalid('invalid drawer contents');
    }
  }
  if (values['typelight.prefs'] !== undefined && !isObject(parseJSON(values['typelight.prefs'], 'preferences'))) {
    throw invalid('invalid preferences');
  }
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
    validate(envelope.values);
    return { ...envelope.values };
  }

  replace(replacement) {
    validate(replacement);
    const values = Object.fromEntries(Object.entries(replacement).sort(([a], [b]) => a.localeCompare(b)));
    const data = Buffer.from(JSON.stringify({ version: 1, values }));
    if (data.length > MAXIMUM_BYTES) throw tooLarge();
    const current = readSnapshot(this.filePath);
    if (current === null ? this.#persistedData !== null : !this.#persistedData?.equals(current)) {
      throw new Error('The library changed outside this application. Keep a copy of your text before reopening Typelight.');
    }
    const sameValues = Object.keys(values).length === Object.keys(this.#values).length &&
      Object.entries(values).every(([key, value]) => this.#values[key] === value);
    if (sameValues && this.#persistedData !== null) return;

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
    this.#persistedData = data;
    try { this.#pruneBackups(); } catch { /* An already completed save must remain successful. */ }
  }

  #pruneBackups() {
    const snapshots = fs.readdirSync(this.backupsDirectory, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^library-\d+-[\w-]+\.json$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]) || b.localeCompare(a));
    for (const name of snapshots.slice(30)) fs.unlinkSync(path.join(this.backupsDirectory, name));
  }
}

module.exports = { LibraryStore, MAXIMUM_BYTES, atomicWrite };
