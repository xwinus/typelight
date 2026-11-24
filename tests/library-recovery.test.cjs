'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openLibrary, restoreLibrary, readRecovery, identity } = require('../desktop/electron/library-recovery.cjs');
const { MAXIMUM_BYTES } = require('../desktop/electron/library-store.cjs');

const snapshot = text => Buffer.from(JSON.stringify({ version: 1, values: { 'typelight.text': text } }));

function fixture(t, { original = '{unfinished', responses = [0, 0] } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-recovery-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'library.json');
  if (original !== null) fs.writeFileSync(file, original);
  const backups = path.join(directory, 'Backups');
  fs.mkdirSync(backups);
  const selected = path.join(backups, 'library-1700000000000-fixture.json');
  fs.writeFileSync(selected, snapshot('Recovered Czech text: příběh 🐎'));
  const calls = [], errors = [], queue = [...responses];
  const ports = {
    dialog: {
      async showMessageBox(options) {
        calls.push(options);
        assert.ok(queue.length, 'Unexpected recovery prompt');
        return { response: queue.shift() };
      },
      async showOpenDialog() { return { canceled: false, filePaths: [selected] }; },
      showErrorBox(title, message) { errors.push({ title, message }); },
    },
    shell: { async openPath(folder) { assert.equal(folder, directory); return ''; } },
  };
  return { directory, file, selected, calls, errors, ports };
}

test('startup recovers a validated snapshot and preserves the damaged original byte for byte', async t => {
  const h = fixture(t);
  const bytes = fs.readFileSync(h.file);
  const source = fs.readFileSync(h.selected);
  const library = await openLibrary(h.directory, h.ports);
  assert.equal(library.values['typelight.text'], 'Recovered Czech text: příběh 🐎');
  const originals = path.join(h.directory, 'Recovered Originals');
  assert.deepEqual(fs.readFileSync(path.join(originals, fs.readdirSync(originals)[0])), bytes);
  assert.deepEqual(fs.readFileSync(h.selected), source);
  assert.equal(h.calls[0].cancelId, 2);
  assert.equal(h.calls[1].defaultId, 1);
  assert.deepEqual(h.errors, []);
});

test('a healthy library opens without recovery prompts or rewriting', async t => {
  const h = fixture(t, { original: snapshot('Healthy'), responses: [] });
  const original = fs.readFileSync(h.file);
  assert.equal((await openLibrary(h.directory, h.ports)).values['typelight.text'], 'Healthy');
  assert.deepEqual(fs.readFileSync(h.file), original);
  assert.equal(h.calls.length, 0);
});

test('missing primary data with snapshots offers recovery instead of starting an empty library', async t => {
  const h = fixture(t, { original: null });
  assert.equal((await openLibrary(h.directory, h.ports)).values['typelight.text'], 'Recovered Czech text: příběh 🐎');
  assert.match(h.calls[0].detail, /main library is missing/);
  assert.equal(fs.existsSync(path.join(h.directory, 'Recovered Originals')), false);
});

test('a first launch with no primary or snapshots starts empty without prompts', async t => {
  const h = fixture(t, { original: null, responses: [] });
  fs.rmSync(path.dirname(h.selected), { recursive: true });
  assert.deepEqual((await openLibrary(h.directory, h.ports)).values, {});
  assert.equal(fs.existsSync(h.file), false);
});

test('quitting, canceling the picker and declining confirmation leave the original untouched', async t => {
  for (const mode of ['quit', 'picker', 'confirmation']) {
    const h = fixture(t, { responses: mode === 'quit' ? [2] : mode === 'picker' ? [0, 2] : [0, 1, 2] });
    if (mode === 'picker') h.ports.dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    assert.equal(await openLibrary(h.directory, h.ports), null);
    assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
    assert.equal(fs.existsSync(path.join(h.directory, 'Recovered Originals')), false);
  }
});

test('invalid or oversized snapshots report an error without replacing the primary', async t => {
  for (const mode of ['invalid', 'oversized']) {
    const h = fixture(t, { responses: [0, 2] });
    fs.writeFileSync(h.selected, '{broken');
    if (mode === 'oversized') fs.truncateSync(h.selected, MAXIMUM_BYTES + 1);
    assert.equal(await openLibrary(h.directory, h.ports), null);
    assert.equal(h.errors.length, 1);
    assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
    assert.equal(fs.existsSync(path.join(h.directory, 'Recovered Originals')), false);
  }
});

test('recovery refuses to overwrite a library changed while dialogs were open', t => {
  const h = fixture(t);
  const initial = identity(h.file);
  fs.writeFileSync(h.file, snapshot('Written elsewhere'));
  assert.throws(() => restoreLibrary(h.directory, readRecovery(h.selected), initial), /changed during recovery/);
  assert.deepEqual(fs.readFileSync(h.file), snapshot('Written elsewhere'));
});

test('failure to preserve the original prevents any replacement', t => {
  const h = fixture(t);
  t.mock.method(fs, 'copyFileSync', () => { throw new Error('Disk full'); });
  assert.throws(() => restoreLibrary(h.directory, readRecovery(h.selected), identity(h.file)), /Disk full/);
  assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
});

test('failed replacement retains both the original primary and its preserved copy', t => {
  const h = fixture(t);
  t.mock.method(fs, 'renameSync', () => { throw new Error('Read-only volume'); });
  assert.throws(() => restoreLibrary(h.directory, readRecovery(h.selected), identity(h.file)), /Read-only volume/);
  assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
  const originals = path.join(h.directory, 'Recovered Originals');
  assert.equal(fs.readFileSync(path.join(originals, fs.readdirSync(originals)[0]), 'utf8'), '{unfinished');
});

test('opening the library folder keeps recovery available and shell failures are reported', async t => {
  const h = fixture(t, { responses: [1, 1, 2] });
  let opened = 0;
  h.ports.shell.openPath = async () => ++opened === 1 ? '' : 'File manager unavailable';
  assert.equal(await openLibrary(h.directory, h.ports), null);
  assert.equal(opened, 2);
  assert.match(h.errors[0].message, /File manager unavailable/);
  assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
});

test('a nonregular primary offers its folder without replacing or deleting it', async t => {
  const h = fixture(t, { original: null, responses: [0, 1] });
  fs.mkdirSync(h.file);
  fs.writeFileSync(path.join(h.file, 'keep.txt'), 'Keep this file');
  assert.equal(await openLibrary(h.directory, h.ports), null);
  assert.match(h.calls[0].message, /cannot safely access/);
  assert.equal(fs.readFileSync(path.join(h.file, 'keep.txt'), 'utf8'), 'Keep this file');
  assert.equal(fs.existsSync(path.join(h.directory, 'Recovered Originals')), false);
});

test('unreadable primary metadata reports a safe exit without offering replacement', async t => {
  const h = fixture(t, { responses: [1] });
  const lstat = fs.lstatSync;
  t.mock.method(fs, 'lstatSync', (file, options) => {
    if (file === h.file) throw Object.assign(new Error('Permission denied'), { code: 'EACCES' });
    return lstat(file, options);
  });
  assert.equal(await openLibrary(h.directory, h.ports), null);
  assert.match(h.calls[0].detail, /Permission denied/);
  assert.equal(fs.readFileSync(h.file, 'utf8'), '{unfinished');
});
