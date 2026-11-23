'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { LibraryStore, MAXIMUM_BYTES } = require('../desktop/electron/library-store.cjs');

const sourcePath = path.resolve(__dirname, '../desktop/electron/files.cjs');
const localRequire = createRequire(sourcePath);

function harness(t, { open = { canceled: true }, save = { canceled: true }, shellError = '' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-files-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const calls = [];
  const electron = {
    dialog: {
      async showOpenDialog(window, options) { calls.push({ type: 'open', window, options }); return open; },
      async showSaveDialog(window, options) { calls.push({ type: 'save', window, options }); return save; },
    },
    shell: { async openPath(file) { calls.push({ type: 'shell', file }); return shellError; } },
  };
  const context = { Buffer, module: { exports: {} },
    require(name) { return name === 'electron' ? electron : localRequire(name); } };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  const window = { isDestroyed: () => false, webContents: {
    async executeJavaScript(script) { calls.push({ type: 'script', script }); },
    print(options, done) { calls.push({ type: 'print', options }); done(true); },
  } };
  return { files: context.module.exports, directory, calls, window, open, save };
}

test('openFiles returns original Unicode bytes, metadata and all selected files', async t => {
  const h = harness(t, { open: { canceled: false, filePaths: [] } });
  const text = path.join(h.directory, 'Český text.txt');
  const json = path.join(h.directory, 'backup.json');
  fs.writeFileSync(text, 'Příliš žluťoučký 🐎');
  fs.writeFileSync(json, '{"typelight":1}');
  h.open.filePaths.push(text, json);
  const result = await h.files.openFiles(h.window);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Český text.txt');
  assert.equal(Buffer.from(result[0].data, 'base64').toString(), 'Příliš žluťoučký 🐎');
  assert.equal(result[0].modified, fs.statSync(text).mtimeMs);
  assert.equal(result[1].type, 'application/json');
});

test('openFiles cancellation and empty selections return no documents', async t => {
  const h = harness(t, { open: { canceled: true, filePaths: ['must-not-be-read'] } });
  assert.equal((await h.files.openFiles(h.window)).length, 0);
  h.open.canceled = false;
  h.open.filePaths = [];
  assert.equal((await h.files.openFiles(h.window)).length, 0);
});

test('openFiles rejects oversized and unreadable files without changing source files', async t => {
  const h = harness(t, { open: { canceled: false, filePaths: [] } });
  const file = path.join(h.directory, 'large.txt');
  fs.writeFileSync(file, '');
  fs.truncateSync(file, 8_000_001);
  h.open.filePaths.push(file);
  await assert.rejects(h.files.openFiles(h.window), /exceeds the file size limit/);
  assert.equal(fs.statSync(file).size, 8_000_001);
  h.open.filePaths[0] = path.join(h.directory, 'missing.txt');
  await assert.rejects(h.files.openFiles(h.window), /ENOENT/);
});

test('exportFile writes Unicode atomically and strips suggested directory components', async t => {
  const h = harness(t, { save: { canceled: false } });
  h.save.filePath = path.join(h.directory, 'Chosen name.txt');
  fs.writeFileSync(h.save.filePath, 'Earlier export');
  const result = await h.files.exportFile(h.window, { name: 'C:\\private\\Příběh.txt', content: 'Příběh 🐎' });
  assert.equal(result.saved, true);
  assert.equal(result.name, 'Chosen name.txt');
  assert.equal(fs.readFileSync(h.save.filePath, 'utf8'), 'Příběh 🐎');
  assert.equal(h.calls[0].options.defaultPath, 'Příběh.txt');
});

test('exportFile cancellation preserves existing exports', async t => {
  const h = harness(t, { save: { canceled: true } });
  h.save.filePath = path.join(h.directory, 'Keep.txt');
  fs.writeFileSync(h.save.filePath, 'Keep');
  assert.equal((await h.files.exportFile(h.window, { name: 'New.txt', content: 'New' })).saved, false);
  assert.equal(fs.readFileSync(h.save.filePath, 'utf8'), 'Keep');
  h.save.canceled = false;
  delete h.save.filePath;
  assert.equal((await h.files.exportFile(h.window, { name: 'New.txt', content: 'New' })).saved, false);
});

test('exportFile propagates write failures and preserves the previous export', async t => {
  const h = harness(t, { save: { canceled: false } });
  h.save.filePath = path.join(h.directory, 'Keep.txt');
  fs.writeFileSync(h.save.filePath, 'Keep');
  t.mock.method(fs, 'renameSync', () => { throw new Error('Disk full'); });
  await assert.rejects(h.files.exportFile(h.window, { name: 'New.txt', content: 'New' }), /Disk full/);
  assert.equal(fs.readFileSync(h.save.filePath, 'utf8'), 'Keep');
});

test('exportFile rejects oversized output before opening a dialog', async t => {
  const h = harness(t);
  await assert.rejects(h.files.exportFile(h.window, {
    name: 'large.txt', content: 'x'.repeat(MAXIMUM_BYTES + 1),
  }), /50 MB/);
  assert.equal(h.calls.length, 0);
});

test('recoverSnapshot sends current and drawer texts to recovery without including discarded texts', async t => {
  const h = harness(t, { open: { canceled: false, filePaths: [] } });
  const library = new LibraryStore(h.directory);
  library.replace({ 'typelight.text': 'Keep current' });
  const original = fs.readFileSync(library.filePath);
  const file = path.join(h.directory, 'snapshot.json');
  const values = { 'typelight.text': 'Earlier "text"\nwith Unicode 🐎', 'typelight.title': 'Past',
    'typelight.edited': '1234', 'typelight.drawer': JSON.stringify({ v: 1,
      pile: [{ id: 'a', text: 'Keep drawer' }], bin: [{ id: 'b', text: 'Discarded' }] }) };
  fs.writeFileSync(file, JSON.stringify({ version: 1, values }));
  h.open.filePaths.push(file);
  let recovered;
  h.window.webContents.executeJavaScript = async script => vm.runInNewContext(script, {
    window: { typelightDesktop: { recover: backup => { recovered = backup; } } },
  });
  await h.files.recoverSnapshot(h.window, library);
  assert.equal(recovered.machine.text, values['typelight.text']);
  assert.equal(recovered.machine.title, 'Past');
  assert.equal(recovered.machine.at, 1234);
  assert.equal(recovered.drawer.length, 1);
  assert.equal(recovered.drawer[0].text, 'Keep drawer');
  assert.equal(JSON.stringify(recovered).includes('Discarded'), false);
  assert.deepEqual(fs.readFileSync(library.filePath), original);
});

test('recoverSnapshot handles an empty snapshot and cancellation', async t => {
  const h = harness(t, { open: { canceled: false, filePaths: [] } });
  const library = new LibraryStore(h.directory);
  const file = path.join(h.directory, 'empty.json');
  fs.writeFileSync(file, '{"version":1,"values":{}}');
  h.open.filePaths.push(file);
  await h.files.recoverSnapshot(h.window, library);
  assert.match(h.calls.find(call => call.type === 'script').script, /"drawer":\[\]/);
  h.calls.length = 0;
  h.open.canceled = true;
  await h.files.recoverSnapshot(h.window, library);
  assert.equal(h.calls.filter(call => call.type === 'script').length, 0);
});

test('recoverSnapshot rejects corrupt files without altering the library or renderer', async t => {
  const h = harness(t, { open: { canceled: false, filePaths: [] } });
  const library = new LibraryStore(h.directory);
  library.replace({ 'typelight.text': 'Keep current' });
  const original = fs.readFileSync(library.filePath);
  const file = path.join(h.directory, 'corrupt.json');
  fs.writeFileSync(file, '{unfinished');
  h.open.filePaths.push(file);
  await assert.rejects(h.files.recoverSnapshot(h.window, library), /invalid JSON/);
  assert.deepEqual(fs.readFileSync(library.filePath), original);
  assert.equal(h.calls.filter(call => call.type === 'script').length, 0);
});

test('printDocument prepares pages, uses the system dialog and removes temporary pages', async t => {
  const h = harness(t);
  await h.files.printDocument(h.window);
  assert.match(h.calls[0].script, /preparePrint/);
  assert.equal(h.calls[1].options.silent, false);
  assert.match(h.calls[2].script, /finishPrint/);
});

test('printDocument treats documented print cancellation as a normal result', async t => {
  const h = harness(t);
  h.window.webContents.print = (_options, done) => done(false, 'Print job canceled');
  await assert.doesNotReject(h.files.printDocument(h.window));
  assert.match(h.calls.at(-1).script, /finishPrint/);
});

test('printDocument reports printer errors and still removes temporary pages', async t => {
  const h = harness(t);
  h.window.webContents.print = (_options, done) => done(false, 'Print job failed');
  await assert.rejects(h.files.printDocument(h.window), /Print job failed/);
  assert.match(h.calls.at(-1).script, /finishPrint/);
});

test('showBackups creates and opens the snapshots directory', async t => {
  const h = harness(t);
  const library = new LibraryStore(h.directory);
  await h.files.showBackups(library);
  assert.equal(fs.statSync(library.backupsDirectory).isDirectory(), true);
  assert.equal(h.calls.at(-1).file, library.backupsDirectory);
});

test('showBackups preserves an existing directory and its snapshots', async t => {
  const h = harness(t);
  const library = new LibraryStore(h.directory);
  fs.mkdirSync(library.backupsDirectory);
  const file = path.join(library.backupsDirectory, 'keep.json');
  fs.writeFileSync(file, 'Keep');
  await h.files.showBackups(library);
  assert.equal(fs.readFileSync(file, 'utf8'), 'Keep');
});

test('showBackups reports shell failures instead of claiming the folder opened', async t => {
  const h = harness(t, { shellError: 'No file manager available' });
  await assert.rejects(h.files.showBackups(new LibraryStore(h.directory)), /No file manager available/);
});
