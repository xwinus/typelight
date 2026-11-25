'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listSnapshots, snapshotContents, snapshotDocument } = require('../desktop/electron/history.cjs');
const { LibraryStore, MAXIMUM_BYTES } = require('../desktop/electron/library-store.cjs');
const { validateMessage } = require('../desktop/electron/policy.cjs');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-history-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const library = new LibraryStore(directory);
  const write = (id, values) => {
    fs.mkdirSync(library.backupsDirectory, { recursive: true });
    const file = path.join(library.backupsDirectory, id);
    fs.writeFileSync(file, JSON.stringify({ version: 1, values }));
    return file;
  };
  return { library, write };
}

const ID = 'library-1700000000000-test.json';
const data = () => ({ 'typelight.text': 'Current version 🐎', 'typelight.title': 'Story', 'typelight.edited': '1234',
  'typelight.drawer': JSON.stringify({ v: 1, pile: [{ id: 'draft', text: 'Older draft', title: 'Draft', at: 123 }],
    bin: [{ id: 'bin', text: 'Discarded text', at: 45 }] }) });

test('history lists dated snapshots and previews desk, drawer and discarded texts without changing files', t => {
  const h = fixture(t);
  const file = h.write(ID, data());
  const original = fs.readFileSync(file);
  const entries = listSnapshots(h.library);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, ID);
  assert.ok(entries[0].at > 0);
  const contents = snapshotContents(h.library, ID);
  assert.deepEqual(contents.documents.map(item => item.location), ['Writing desk', 'Drawer', 'Discarded']);
  assert.equal(contents.documents[0].title, 'Story');
  assert.equal(Object.hasOwn(contents.documents[0], 'text'), false);
  assert.deepEqual(snapshotDocument(h.library, ID, 0, contents.revision),
    { text: 'Current version 🐎', title: 'Story', at: 1234 });
  assert.equal(snapshotDocument(h.library, ID, 2, contents.revision).text, 'Discarded text');
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(fs.existsSync(h.library.filePath), false);
});

test('empty history and empty snapshots work without creating directories or fictional documents', t => {
  const h = fixture(t);
  assert.deepEqual(listSnapshots(h.library), []);
  assert.equal(fs.existsSync(h.library.backupsDirectory), false);
  h.write(ID, {});
  assert.deepEqual(snapshotContents(h.library, ID).documents, []);
  fs.writeFileSync(path.join(h.library.backupsDirectory, 'notes.txt'), 'Leave alone');
  fs.mkdirSync(path.join(h.library.backupsDirectory, 'library-1-directory.json'));
  assert.equal(listSnapshots(h.library).length, 1);
});

test('history rejects traversal, malformed indices and snapshot changes after preview', t => {
  const h = fixture(t);
  const file = h.write(ID, data());
  const contents = snapshotContents(h.library, ID);
  for (const id of ['../library.json', '/library-1-test.json', '..\\library.json', null]) {
    assert.throws(() => snapshotContents(h.library, id), /Invalid snapshot identifier/);
  }
  for (const index of [-1, 1.5, '0', NaN]) {
    assert.throws(() => snapshotDocument(h.library, ID, index, contents.revision), /Invalid snapshot document/);
  }
  assert.throws(() => snapshotDocument(h.library, ID, 99, contents.revision), /no longer available/);
  fs.writeFileSync(file, JSON.stringify({ version: 1, values: { 'typelight.text': 'Changed externally' } }));
  assert.throws(() => snapshotDocument(h.library, ID, 0, contents.revision), /snapshot changed/);
});

test('invalid and oversized snapshots never become recoverable documents', t => {
  const h = fixture(t);
  const file = h.write(ID, data());
  fs.writeFileSync(file, '{incomplete');
  assert.throws(() => snapshotContents(h.library, ID), /could not be read safely/);
  fs.truncateSync(file, MAXIMUM_BYTES + 1);
  assert.throws(() => snapshotContents(h.library, ID), /50 MiB/);
  assert.equal(fs.existsSync(h.library.filePath), false);
});

test('history channels allow validated selections and reject arbitrary paths or revisions', () => {
  assert.equal(validateMessage({ type: 'history-list' }).type, 'history-list');
  assert.equal(validateMessage({ type: 'history-contents', id: ID }).id, ID);
  assert.equal(validateMessage({ type: 'history-document', id: ID, index: 0, revision: 'a'.repeat(64) }).index, 0);
  for (const message of [{ type: 'history-contents', id: '../library.json' },
    { type: 'history-document', id: ID, index: -1, revision: 'a'.repeat(64) },
    { type: 'history-document', id: ID, index: 0, revision: 'unknown' }]) {
    assert.throws(() => validateMessage(message), /Invalid snapshot/);
  }
});

test('snapshot symlinks cannot expose files outside the backup directory', { skip: process.platform === 'win32' }, t => {
  const h = fixture(t);
  const file = h.write(ID, data());
  const target = path.join(h.library.directory, 'outside.json');
  fs.renameSync(file, target);
  fs.symlinkSync(target, file);
  assert.deepEqual(listSnapshots(h.library), []);
  assert.throws(() => snapshotContents(h.library, ID), /regular file/);
});
