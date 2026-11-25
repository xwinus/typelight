'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LibraryStore, MAXIMUM_BYTES } = require('../desktop/electron/library-store.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-storage-patch-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return new LibraryStore(directory);
}

const drawer = text => JSON.stringify({ v: 1, pile: [{ id: 'parked', text }], bin: [] });
const read = store => fs.readFileSync(store.filePath, 'utf8');
const canonical = values => JSON.stringify({ version: 1,
  values: Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))) });

test('patch updates only supplied fields and preserves the exact version-one JSON encoding', t => {
  const store = fixture(t);
  store.replace({ 'typelight.text': 'Original', 'typelight.drawer': drawer('Other writing'),
    'typelight.title': 'Before', 'typelight.prefs': '{"sound":false}' });
  store.patch({ 'typelight.text': 'Příběh 🐎\n"quoted"\\backslash\u0000\ud800', 'typelight.title': '' });
  assert.equal(store.values['typelight.drawer'], drawer('Other writing'));
  assert.equal(store.values['typelight.prefs'], '{"sound":false}');
  assert.equal(read(store), canonical(store.values));
  assert.deepEqual(new LibraryStore(store.directory).values, store.values);
});

test('empty and null-prototype patches are accepted without erasing omitted fields', t => {
  const store = fixture(t);
  store.patch({});
  assert.equal(read(store), canonical({}));
  store.patch(Object.assign(Object.create(null), { 'typelight.title': 'A title' }));
  const original = read(store);
  store.patch({});
  assert.equal(read(store), original);
  assert.equal(store.values['typelight.title'], 'A title');
});

test('patch rejects unsupported keys, inherited prototypes, accessors and nonstring values before writing', t => {
  const store = fixture(t);
  store.replace({ 'typelight.text': 'Keep this' });
  const original = read(store);
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, 'typelight.text', {
    enumerable: true, get() { getterCalls++; return 'Unexpected'; },
  });
  const hidden = Object.defineProperty({}, 'typelight.text', { value: 'Hidden' });
  for (const changes of [null, [], 'text', { unknown: '' }, { 'typelight.text': null },
    { 'typelight.title': 3 }, { [Symbol('hidden')]: '' }, accessor, hidden,
    Object.create({ 'typelight.text': 'Inherited' })]) {
    assert.throws(() => store.patch(changes), /could not be read safely/);
    assert.equal(read(store), original);
  }
  assert.equal(getterCalls, 0);
});

test('unchanged committed drawer contents are not parsed or escaped again during text edits', t => {
  const store = fixture(t);
  const parked = drawer('Long writing\n'.repeat(10000));
  store.replace({ 'typelight.drawer': parked, 'typelight.text': 'First' });
  const parse = JSON.parse, stringify = JSON.stringify;
  let drawerParses = 0, drawerEncodings = 0;
  t.mock.method(JSON, 'parse', (...args) => {
    if (args[0] === parked) drawerParses++;
    return parse(...args);
  });
  t.mock.method(JSON, 'stringify', (...args) => {
    if (args[0] === parked) drawerEncodings++;
    return stringify(...args);
  });
  store.patch({ 'typelight.text': 'Second' });
  store.patch({ 'typelight.text': 'Third' });
  store.patch({});
  assert.equal(drawerParses, 0);
  assert.equal(drawerEncodings, 0);
  assert.equal(parse(read(store)).values['typelight.drawer'], parked);
});

test('no-op patches still refuse externally changed, deleted or newly appeared library files', t => {
  const store = fixture(t);
  store.replace({ 'typelight.text': 'Original' });
  const external = canonical({ 'typelight.text': 'External' });
  fs.writeFileSync(store.filePath, external);
  assert.throws(() => store.patch({}), /changed outside/);
  assert.equal(read(store), external);
  fs.unlinkSync(store.filePath);
  assert.throws(() => store.patch({ 'typelight.text': 'Original' }), /changed outside/);
  assert.equal(fs.existsSync(store.filePath), false);
  const fresh = fixture(t);
  fs.writeFileSync(fresh.filePath, external);
  assert.throws(() => fresh.patch({}), /changed outside/);
  assert.equal(read(fresh), external);
});

test('failed writes cannot commit patch values or poison cached encoding for later saves', t => {
  const store = fixture(t);
  store.replace({ 'typelight.text': 'Original', 'typelight.drawer': drawer('Committed') });
  const original = read(store);
  const rename = fs.renameSync;
  const failure = t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === store.filePath) throw new Error('Storage unavailable');
    return rename(from, to);
  });
  assert.throws(() => store.patch({ 'typelight.text': 'Uncommitted',
    'typelight.drawer': drawer('Uncommitted drawer') }), /Storage unavailable/);
  assert.equal(read(store), original);
  assert.equal(store.values['typelight.text'], 'Original');
  failure.mock.restore();
  store.patch({ 'typelight.title': 'Retry succeeds' });
  assert.equal(read(store), canonical({ 'typelight.text': 'Original',
    'typelight.drawer': drawer('Committed'), 'typelight.title': 'Retry succeeds' }));
  store.patch({ 'typelight.drawer': drawer('Uncommitted drawer') });
  assert.equal(new LibraryStore(store.directory).values['typelight.drawer'], drawer('Uncommitted drawer'));
});

test('invalid changed metadata is checked on every retry and never changes committed state', t => {
  const store = fixture(t);
  store.replace({ 'typelight.drawer': drawer('Committed'), 'typelight.text': 'Original' });
  const original = read(store);
  for (let i = 0; i < 2; i++) {
    assert.throws(() => store.patch({ 'typelight.drawer': '{broken' }), /invalid drawer contents/);
    assert.equal(read(store), original);
  }
  store.patch({ 'typelight.text': 'Still writing' });
  assert.equal(new LibraryStore(store.directory).values['typelight.drawer'], drawer('Committed'));
});

test('replacement removes cached fields and removed values must be validated when reintroduced', t => {
  const store = fixture(t);
  store.replace({ 'typelight.drawer': drawer('Old'), 'typelight.title': 'Old title', 'typelight.text': 'Original' });
  store.replace({ 'typelight.text': 'Remaining' });
  assert.equal(read(store), canonical({ 'typelight.text': 'Remaining' }));
  assert.throws(() => store.patch({ 'typelight.drawer': '{broken' }), /invalid drawer contents/);
  store.patch({ 'typelight.title': 'New title' });
  assert.deepEqual(new LibraryStore(store.directory).values,
    { 'typelight.text': 'Remaining', 'typelight.title': 'New title' });
});

test('the exact 50 MiB encoded limit includes escaping and envelope bytes', t => {
  const store = fixture(t);
  const overhead = Buffer.byteLength(canonical({ 'typelight.text': '' }));
  const available = MAXIMUM_BYTES - overhead;
  const text = '\n'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
  store.patch({ 'typelight.text': text });
  assert.equal(fs.statSync(store.filePath).size, MAXIMUM_BYTES);
  assert.equal(new LibraryStore(store.directory).values['typelight.text'], text);
  assert.throws(() => store.patch({ 'typelight.title': 'x' }), /50 MB/);
  assert.equal(store.values['typelight.title'], undefined);
  assert.equal(fs.statSync(store.filePath).size, MAXIMUM_BYTES);
  store.replace({ 'typelight.text': 'Small again' });
  assert.equal(read(store), canonical({ 'typelight.text': 'Small again' }));
});
