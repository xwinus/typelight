'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore, MAXIMUM_BYTES, atomicWrite } = require('../desktop/electron/library-store.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-storage-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function snapshot(values) { return JSON.stringify({ version: 1, values }); }
function read(file) { return fs.readFileSync(file, 'utf8'); }

test('loads the existing Swift snapshot format without rewriting or losing Unicode', t => {
  const directory = fixture(t);
  const values = { 'typelight.text': 'Příliš žluťoučký kůň 🐎', 'typelight.title': 'Evening',
    'typelight.edited': '1700000000.125', 'typelight.prefs': '{"sound":true}',
    'typelight.drawer': '{"v":1,"pile":[{"id":"old","text":"Earlier"}],"bin":[]}' };
  const source = JSON.stringify({ values, version: 1 }, null, 2);
  const file = path.join(directory, 'library.json');
  fs.writeFileSync(file, source);
  const store = new LibraryStore(directory);
  assert.deepEqual(store.values, values);
  store.replace({ ...values });
  assert.equal(read(file), source);
  assert.equal(fs.existsSync(store.backupsDirectory), false);
});

test('a fresh empty library and an empty document both persist', t => {
  const store = new LibraryStore(fixture(t));
  assert.deepEqual(store.values, {});
  store.replace({});
  assert.deepEqual(LibraryStore.decodeSnapshot(read(store.filePath)), {});
  store.replace({ 'typelight.text': '' });
  assert.deepEqual(new LibraryStore(store.directory).values, { 'typelight.text': '' });
});

test('corrupt existing JSON stops startup without replacing the file', t => {
  const directory = fixture(t);
  const file = path.join(directory, 'library.json');
  fs.writeFileSync(file, '{unfinished');
  assert.throws(() => new LibraryStore(directory), /invalid JSON/);
  assert.equal(read(file), '{unfinished');
});

test('invalid UTF-8 cannot silently replace document characters during migration', t => {
  const directory = fixture(t);
  const file = path.join(directory, 'library.json');
  const damaged = Buffer.concat([Buffer.from('{"version":1,"values":{"typelight.text":"'),
    Buffer.from([0xff]), Buffer.from('"}}')]);
  fs.writeFileSync(file, damaged);
  assert.throws(() => new LibraryStore(directory), /invalid UTF-8/);
  assert.deepEqual(fs.readFileSync(file), damaged);
});

test('valid input and returned values cannot mutate the persisted state', t => {
  const store = new LibraryStore(fixture(t));
  const values = { 'typelight.text': 'Original' };
  store.replace(values);
  values['typelight.text'] = 'Changed outside';
  const returned = store.values;
  returned['typelight.text'] = 'Changed getter result';
  assert.equal(store.values['typelight.text'], 'Original');
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Original');
});

test('unknown keys and invalid envelope versions are rejected', () => {
  for (const data of ['[]', 'null', '{"version":true,"values":{}}',
    '{"version":2,"values":{}}', '{"version":1,"values":{},"extra":1}',
    snapshot({ unknown: '' }), snapshot({ 'typelight.text': 1 }), snapshot([])]) {
    assert.throws(() => LibraryStore.decodeSnapshot(data), /could not be read safely/);
  }
});

test('invalid timestamps, drawers and preference types are rejected without overwriting', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Keep this' });
  const original = read(store.filePath);
  for (const values of [null, [], { 'typelight.edited': '' }, { 'typelight.edited': 'Infinity' },
    { 'typelight.edited': '-1' }, { 'typelight.prefs': '[]' }, { 'typelight.prefs': 'null' },
    { 'typelight.prefs': '{' }, { 'typelight.drawer': '{"v":true,"pile":[],"bin":[]}' },
    { 'typelight.drawer': '{"v":1,"pile":[{"id":"a"}],"bin":[]}' }]) {
    assert.throws(() => store.replace(values), /could not be read safely/);
    assert.equal(read(store.filePath), original);
  }
});

test('oversized stored snapshots and replacements fail before writing', t => {
  const directory = fixture(t);
  const store = new LibraryStore(directory);
  store.replace({ 'typelight.text': 'Keep this' });
  const original = read(store.filePath);
  assert.throws(() => store.replace({ 'typelight.text': 'a'.repeat(MAXIMUM_BYTES) }), /50 MB/);
  assert.equal(read(store.filePath), original);
  const largeFile = path.join(fixture(t), 'library.json');
  fs.writeFileSync(largeFile, '');
  fs.truncateSync(largeFile, MAXIMUM_BYTES + 1);
  assert.throws(() => new LibraryStore(path.dirname(largeFile)), /50 MB/);
});

test('backups contain the previous state, respect the interval and restart checkpoint', t => {
  const directory = fixture(t);
  let now = 1_700_000_000_000;
  const store = new LibraryStore(directory, { clock: () => now });
  store.replace({ 'typelight.text': 'First' });
  store.replace({ 'typelight.text': 'Second' });
  const backups = () => fs.readdirSync(store.backupsDirectory).sort();
  assert.equal(backups().length, 1);
  assert.equal(LibraryStore.decodeSnapshot(read(path.join(store.backupsDirectory, backups()[0])))['typelight.text'], 'First');
  now += 299_999;
  store.replace({ 'typelight.text': 'Third' });
  assert.equal(backups().length, 1);
  now++;
  store.replace({ 'typelight.text': 'Fourth' });
  assert.equal(backups().length, 2);
  const reopened = new LibraryStore(directory, { clock: () => ++now });
  reopened.replace({ 'typelight.text': 'Fifth' });
  assert.equal(backups().length, 3);
  assert.equal(LibraryStore.decodeSnapshot(read(path.join(store.backupsDirectory, backups()[2])))['typelight.text'], 'Fourth');
});

test('retention keeps the latest 30 snapshots and leaves unrelated files alone', t => {
  let now = 1_700_000_000_000;
  const store = new LibraryStore(fixture(t), { clock: () => ++now, backupInterval: 0 });
  fs.mkdirSync(store.backupsDirectory);
  fs.writeFileSync(path.join(store.backupsDirectory, 'notes.txt'), 'Keep');
  fs.mkdirSync(path.join(store.backupsDirectory, 'library-1-directory.json'));
  for (let i = 0; i < 34; i++) store.replace({ 'typelight.text': String(i) });
  const names = fs.readdirSync(store.backupsDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.startsWith('library-')).map(entry => entry.name).sort();
  assert.equal(names.length, 30);
  assert.equal(LibraryStore.decodeSnapshot(read(path.join(store.backupsDirectory, names[0])))['typelight.text'], '3');
  assert.equal(LibraryStore.decodeSnapshot(read(path.join(store.backupsDirectory, names.at(-1))))['typelight.text'], '32');
  assert.equal(read(path.join(store.backupsDirectory, 'notes.txt')), 'Keep');
  assert.equal(fs.statSync(path.join(store.backupsDirectory, 'library-1-directory.json')).isDirectory(), true);
});

test('a failed backup prevents replacing the original library', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Original' });
  fs.writeFileSync(store.backupsDirectory, 'Blocked directory');
  assert.throws(() => store.replace({ 'typelight.text': 'Unsaved' }));
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Original');
  assert.equal(store.values['typelight.text'], 'Original');
});

test('atomicWrite replaces existing content, supports Unicode and creates new empty files', t => {
  const file = path.join(fixture(t), 'Writing with spaces.txt');
  atomicWrite(file, '');
  assert.equal(read(file), '');
  atomicWrite(file, 'Příliš žluťoučký 🐎');
  assert.equal(read(file), 'Příliš žluťoučký 🐎');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)]);
});

test('a failed atomic rename preserves the old document and cleans up the temporary file', t => {
  const file = path.join(fixture(t), 'document.txt');
  fs.writeFileSync(file, 'Original');
  const failure = Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
  t.mock.method(fs, 'renameSync', () => { throw failure; });
  assert.throws(() => atomicWrite(file, 'Replacement'), failure);
  assert.equal(read(file), 'Original');
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['document.txt']);
});

test('a failed library write keeps in-memory state and can be retried', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Original' });
  const originalRename = fs.renameSync;
  const mocked = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === store.filePath) throw new Error('Storage unavailable');
    return originalRename(from, to);
  });
  assert.throws(() => store.replace({ 'typelight.text': 'Retry me' }), /Storage unavailable/);
  assert.equal(store.values['typelight.text'], 'Original');
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Original');
  mocked.mock.restore();
  store.replace({ 'typelight.text': 'Retry me' });
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Retry me');
});

test('a backup pruning failure does not report a completed save as failed', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Original' });
  t.mock.method(fs, 'readdirSync', () => { throw new Error('Directory temporarily unavailable'); });
  assert.doesNotThrow(() => store.replace({ 'typelight.text': 'Saved' }));
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Saved');
});

test('an external writer or deleted library is detected before a stale overwrite', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Initial' });
  fs.writeFileSync(store.filePath, snapshot({ 'typelight.text': 'External' }));
  assert.throws(() => store.replace({ 'typelight.text': 'Stale' }), /changed outside/);
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'External');
  fs.unlinkSync(store.filePath);
  assert.throws(() => store.replace({ 'typelight.text': 'Stale' }), /changed outside/);
  assert.equal(fs.existsSync(store.filePath), false);
});

test('a file appearing after initial load is preserved', t => {
  const store = new LibraryStore(fixture(t));
  fs.writeFileSync(store.filePath, snapshot({ 'typelight.text': 'External' }));
  assert.throws(() => store.replace({ 'typelight.text': 'Stale' }), /changed outside/);
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'External');
});

test('a closing checkpoint backs up the latest saved text including the first document', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'The completed session 🐎' });
  const primary = read(store.filePath);
  assert.equal(store.checkpoint(), true);
  const names = fs.readdirSync(store.backupsDirectory);
  assert.equal(names.length, 1);
  assert.equal(read(path.join(store.backupsDirectory, names[0])), primary);
  assert.equal(read(store.filePath), primary);
});

test('checkpoints skip absent data and avoid duplicate snapshots across reopening', t => {
  const store = new LibraryStore(fixture(t));
  assert.equal(store.checkpoint(), false);
  assert.equal(fs.existsSync(store.backupsDirectory), false);
  store.replace({ 'typelight.text': '' });
  assert.equal(store.checkpoint(), true);
  const names = fs.readdirSync(store.backupsDirectory);
  assert.equal(store.checkpoint(), false);
  assert.equal(new LibraryStore(store.directory).checkpoint(), false);
  assert.deepEqual(fs.readdirSync(store.backupsDirectory), names);
});

test('a checkpoint failure leaves the primary intact and a later retry completes the backup', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Keep the final edit' });
  const primary = read(store.filePath);
  const rename = t.mock.method(fs, 'renameSync', () => {
    throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
  });
  assert.throws(() => store.checkpoint(), /Disk full/);
  assert.equal(read(store.filePath), primary);
  assert.deepEqual(fs.readdirSync(store.backupsDirectory), []);
  rename.mock.restore();
  assert.equal(store.checkpoint(), true);
  assert.equal(fs.readdirSync(store.backupsDirectory).length, 1);
});

test('checkpoints detect changed or missing primary data even when already backed up', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Original' });
  store.checkpoint();
  const names = fs.readdirSync(store.backupsDirectory);
  fs.writeFileSync(store.filePath, snapshot({ 'typelight.text': 'Changed externally' }));
  assert.throws(() => store.checkpoint(), /changed outside/);
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Changed externally');
  fs.unlinkSync(store.filePath);
  assert.throws(() => store.checkpoint(), /changed outside/);
  assert.deepEqual(fs.readdirSync(store.backupsDirectory), names);
});

test('checkpoint retention keeps the latest completed session after a clock rollback', t => {
  let now = 1_700_000_000_000;
  const store = new LibraryStore(fixture(t), { clock: () => now++ });
  for (let i = 0; i < 35; i++) {
    store.replace({ 'typelight.text': String(i) });
    store.checkpoint();
  }
  now -= 60_000;
  store.replace({ 'typelight.text': 'Final after clock rollback' });
  store.checkpoint();
  const names = fs.readdirSync(store.backupsDirectory)
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  assert.equal(names.length, 30);
  assert.equal(LibraryStore.decodeSnapshot(read(path.join(store.backupsDirectory, names[0])))['typelight.text'],
    'Final after clock rollback');
  assert.equal(new LibraryStore(store.directory).checkpoint(), false);
});

test('a checkpoint cannot report completion when backup retention fails', t => {
  let now = 1_700_000_000_000;
  const store = new LibraryStore(fixture(t), { clock: () => now++ });
  for (let i = 0; i < 30; i++) {
    store.replace({ 'typelight.text': String(i) });
    store.checkpoint();
  }
  store.replace({ 'typelight.text': 'Final' });
  const unlink = fs.unlinkSync;
  const failure = t.mock.method(fs, 'unlinkSync', file => {
    if (path.basename(file).startsWith('library-')) throw new Error('Backup retention unavailable');
    return unlink(file);
  });
  assert.throws(() => store.checkpoint(), /Backup retention unavailable/);
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], 'Final');
  failure.mock.restore();
  assert.equal(store.checkpoint(), false);
  assert.equal(fs.readdirSync(store.backupsDirectory).length, 30);
});

test('valid drawer metadata and discarded document positions survive save and reload', t => {
  const store = new LibraryStore(fixture(t));
  const drawer = { v: 1, pile: [{ id: 'draft', text: 'A story', title: 'Příběh', at: 0 }],
    bin: [{ id: 'discarded', text: 'Earlier', title: '', at: 1700000000000, gone: 1700000001000,
      side: 'left', fx: 0.5, fy: 0, spin: { ax: -1, ay: 0, angle: 4.25 } }] };
  store.replace({ 'typelight.drawer': JSON.stringify(drawer) });
  assert.deepEqual(JSON.parse(new LibraryStore(store.directory).values['typelight.drawer']), drawer);
});

test('legacy drawer documents may omit optional metadata and retain an empty unique identifier', t => {
  const values = { 'typelight.drawer': JSON.stringify({ v: 1,
    pile: [{ id: '', text: '' }], bin: [{ id: 'old-bin', text: 'Earlier' }] }) };
  const store = new LibraryStore(fixture(t));
  store.replace(values);
  assert.deepEqual(new LibraryStore(store.directory).values, values);
});

test('invalid drawer metadata is rejected during loading and saving without overwriting documents', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Keep the current writing' });
  const original = read(store.filePath);
  for (const metadata of [{ title: {} }, { title: null }, { at: '123' }, { at: -1 }, { at: null },
    { gone: 'yesterday' }, { gone: -1 }, { fx: null }, { fy: '0.5' }, { side: 'elsewhere' },
    { spin: [] }, { spin: { ax: 0, ay: 1 } }, { spin: { ax: null, ay: 1, angle: 4 } }]) {
    const values = { 'typelight.drawer': JSON.stringify({ v: 1, pile: [],
      bin: [{ id: 'broken', text: 'Preserve me', ...metadata }] }) };
    assert.throws(() => LibraryStore.decodeSnapshot(snapshot(values)), /invalid drawer document metadata/);
    assert.throws(() => store.replace(values), /invalid drawer document metadata/);
    assert.equal(read(store.filePath), original);
  }
  const corruptFile = path.join(fixture(t), 'library.json');
  const corrupt = snapshot({ 'typelight.drawer': JSON.stringify({ v: 1,
    pile: [{ id: 'title-object', text: 'Keep this text', title: {} }], bin: [] }) });
  fs.writeFileSync(corruptFile, corrupt);
  assert.throws(() => new LibraryStore(path.dirname(corruptFile)), /invalid drawer document metadata/);
  assert.equal(read(corruptFile), corrupt);
});

test('duplicate document identifiers within or across the drawer and bin are rejected', t => {
  const store = new LibraryStore(fixture(t));
  store.replace({ 'typelight.text': 'Current writing' });
  const original = read(store.filePath);
  const first = { id: 'same', text: 'First' }, second = { id: 'same', text: 'Second' };
  for (const drawer of [{ v: 1, pile: [first, second], bin: [] },
    { v: 1, pile: [first], bin: [second] }, { v: 1, pile: [], bin: [first, second] }]) {
    const values = { 'typelight.drawer': JSON.stringify(drawer) };
    assert.throws(() => LibraryStore.decodeSnapshot(snapshot(values)), /duplicate drawer document identifiers/);
    assert.throws(() => store.replace(values), /duplicate drawer document identifiers/);
    assert.equal(read(store.filePath), original);
  }
});
