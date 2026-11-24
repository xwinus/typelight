'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { LibraryStore } = require('../desktop/electron/library-store.cjs');

for (const stage of ['partial-write', 'before-rename', 'after-rename']) {
  test(`forced process termination at ${stage} preserves a complete library and previous snapshot`, t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-crash-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const store = new LibraryStore(directory);
    store.replace({ 'typelight.text': 'Original before interrupted save' });
    const child = spawnSync(process.execPath, [path.join(__dirname, 'fixtures/interrupted-save.cjs'), directory, stage],
      { encoding: 'utf8', timeout: 10_000 });
    assert.ifError(child.error);
    assert.notEqual(child.status, 0);
    assert.equal(child.stdout, `Interrupted at ${stage}`);
    assert.equal(child.stderr, '');
    const reopened = new LibraryStore(directory);
    assert.equal(reopened.values['typelight.text'], stage === 'after-rename'
      ? 'Replacement after interrupted save 🐎' : 'Original before interrupted save');
    const snapshots = fs.readdirSync(reopened.backupsDirectory);
    assert.equal(snapshots.length, 1);
    assert.equal(LibraryStore.decodeSnapshot(fs.readFileSync(path.join(reopened.backupsDirectory, snapshots[0])))['typelight.text'],
      'Original before interrupted save');
    reopened.replace({ 'typelight.text': 'Writing continues after reopening' });
    assert.equal(new LibraryStore(directory).values['typelight.text'], 'Writing continues after reopening');
  });
}
