'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const importer = require('../editor/import.js');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const file = (content, name = 'backup.json', type = '') => new File([content], name, { type, lastModified: 123 });
const backup = (machine, drawer = []) => JSON.stringify({ typelight: 1, machine, drawer });

function editor(options = {}) {
  let sequence = 0;
  const context = vm.createContext({ TypelightImport: importer,
    S: { text: 'Current writing', at: 123, title: 'Current title' },
    sheets: [{ id: 'existing', text: 'Existing drawer text', at: 122 }], bin: [], desktop: null,
    TEXT_KEY: 'typelight.text', TITLE_KEY: 'typelight.title', AT_KEY: 'typelight.edited', PILE_KEY: 'typelight.drawer',
    open: true, uid: () => 'new-' + ++sequence, tell() {}, say() {}, letGo() {},
    save() {}, persist() {}, render() {}, well: {}, snd: { tick() {} }, ta: { focus() {} }, ...options });
  context.setText = text => { context.S.text = text; };
  context.set = value => { context.open = value; };
  const swap = html.slice(html.indexOf('  function swap(id,'), html.indexOf('  function set(v)'));
  const bring = html.slice(html.indexOf('  function bring(items,'), html.indexOf('  // said in the drawer'));
  const open = html.slice(html.indexOf('async function openFiles(files)'), html.indexOf("window.addEventListener('dragover'"));
  vm.runInContext(swap + bring + '\nconst drawer = { bring };\n' + open, context);
  return context;
}

test('shared editor imports large Unicode backups without replacing existing writing or duplicating texts', async () => {
  const context = editor();
  const large = 'x'.repeat(8_000_001);
  const input = file(backup({ text: 'Příliš žluťoučký 🐎', title: 'Unicode', at: 123 }, [
    { id: 'long', text: large }, { id: 'duplicate', text: 'Existing drawer text' },
  ]));
  await context.openFiles([input]);
  assert.equal(context.S.text, 'Current writing');
  assert.deepEqual(Array.from(context.sheets, item => item.text), ['Příliš žluťoučký 🐎', large, 'Existing drawer text']);
  await context.openFiles([input]);
  assert.equal(context.sheets.length, 3);
});

test('empty and BOM-prefixed backups remain valid and do not remove existing writing', async () => {
  const context = editor();
  await context.openFiles([file('\uFEFF' + backup({ text: '' }))]);
  assert.equal(context.S.text, 'Current writing');
  assert.equal(context.sheets.length, 1);
  assert.deepEqual(importer.backupItems(backup({ text: '' })), [{ text: '' }]);
});

test('a backup with many small documents does not exceed the function argument limit', async () => {
  const context = editor();
  const drawer = Array.from({ length: 130_000 }, (_, index) => ({ text: 'Document ' + index }));
  await context.openFiles([file(backup({ text: '' }, drawer))]);
  assert.equal(context.sheets.length, drawer.length + 1);
  assert.equal(context.sheets[0].text, 'Document 0');
  assert.equal(context.sheets.at(-1).text, 'Existing drawer text');
});

test('malformed nested items and truncated backups never import a partial library', async () => {
  const context = editor();
  for (const content of [backup({ text: 'Valid machine' }, [{ text: 'Valid drawer' }, null]),
    backup({ text: 'Valid machine' }, [{ text: 12 }]), backup({ text: 'Valid', title: [] }),
    backup({ text: 'Valid', at: -1 }), backup({ text: 'Valid' }, [{ text: 'Bad', id: {} }]),
    '{"typelight":1,"machine":{"text":"Partial"},"drawer":[',
    '{"typelight":1,"drawer":[]}', '{"typelight":2,"machine":{"text":"Future"},"drawer":[]}']) {
    await context.openFiles([file(content)]);
    assert.equal(context.S.text, 'Current writing');
    assert.equal(context.sheets.length, 1);
    assert.equal(context.sheets[0].text, 'Existing drawer text');
  }
});

test('backups reject invalid UTF-8 instead of silently changing document characters', async () => {
  const input = file(Buffer.concat([Buffer.from('{"typelight":1,"machine":{"text":"'),
    Buffer.from([0xff]), Buffer.from('"},"drawer":[]}')]));
  const result = await importer.readFiles([input]);
  assert.deepEqual(result.items, []);
  assert.deepEqual(result.not, ['backup.json']);
});

test('plain text retains Czech legacy encoding and normalizes line endings and tabs', async () => {
  const result = await importer.readFiles([file(Buffer.from([0xe8, 0x0d, 0x0a, 0x09, 0x61]), 'Czech.txt')]);
  assert.deepEqual(result.items, [{ text: 'č\n    a', at: 123, title: 'Czech' }]);
  assert.equal(result.backup, false);
});

test('size checks cover exact limits, oversized files and data that grows during reading', async () => {
  assert.equal(importer.limitFor({ name: 'BACKUP.JSON' }), importer.BACKUP_BYTES);
  assert.equal(importer.limitFor({ name: 'download', type: 'application/json' }), importer.BACKUP_BYTES);
  assert.equal(importer.limitFor({ name: 'large.txt' }), importer.TEXT_BYTES);
  const exact = await importer.readFiles([file('x'.repeat(importer.TEXT_BYTES), 'exact.txt')]);
  assert.equal(exact.items[0].text.length, importer.TEXT_BYTES);
  let read = false;
  const tooLarge = await importer.readFiles([{ name: 'large.json', size: importer.BACKUP_BYTES + 1,
    async arrayBuffer() { read = true; return new ArrayBuffer(0); } }]);
  assert.equal(read, false);
  assert.deepEqual(tooLarge.not, ['large.json']);
  const growing = await importer.readFiles([{ name: 'growing.txt', size: 0,
    async arrayBuffer() { return new ArrayBuffer(importer.TEXT_BYTES + 1); } }]);
  assert.deepEqual(growing.items, []);
  assert.deepEqual(growing.not, ['growing.txt']);
});

test('unreadable and binary files leave successful independent imports intact', async () => {
  const result = await importer.readFiles([file('Good text', 'good.txt'), file('\0', 'binary.txt'),
    { name: 'unreadable.txt', size: 1, async arrayBuffer() { throw new Error('Read failed'); } }]);
  assert.deepEqual(result.items, [{ text: 'Good text', at: 123, title: 'good' }]);
  assert.deepEqual(result.not, ['binary.txt', 'unreadable.txt']);
});

test('browser deployment exposes the same importer and includes it in the offline shell', () => {
  const source = fs.readFileSync(path.join(__dirname, '../editor/import.js'), 'utf8');
  const context = vm.createContext({ TextDecoder });
  vm.runInContext(source, context);
  assert.equal(context.TypelightImport.BACKUP_BYTES, importer.BACKUP_BYTES);
  assert.equal(context.TypelightImport.backupItems(backup({ text: 'Browser' }))[0].text, 'Browser');
  assert.match(html, /<script src="editor\/import.js"><\/script>/);
  assert.match(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), /'editor\/import.js'/);
});

test('desktop snapshot merges preflight current writing, metadata and discarded texts before mutation', async () => {
  let checked;
  const bin = [{ id: 'discarded', text: 'Kept on the floor', at: 1, gone: 2 }];
  const context = editor({ bin, desktop: { canStore(values) { checked = values; return true; } } });
  await context.openFiles([file(backup({ text: 'Recovered', title: 'Earlier draft', at: 99 }))]);
  assert.equal(checked['typelight.text'], context.S.text);
  assert.equal(checked['typelight.title'], context.S.title);
  assert.equal(checked['typelight.edited'], String(context.S.at));
  assert.equal(checked['typelight.drawer'], JSON.stringify({ v: 1, pile: context.sheets, bin }));
  assert.equal(context.sheets[0].text, 'Recovered');
});

test('desktop single text open preflights the exact resulting swap including the parked current draft', async () => {
  let checked;
  const context = editor({ desktop: { canStore(values) { checked = values; return true; } } });
  await context.openFiles([file('Imported draft', 'Imported.txt')]);
  assert.equal(context.S.text, 'Imported draft');
  assert.equal(checked['typelight.text'], context.S.text);
  assert.equal(checked['typelight.title'], context.S.title);
  assert.equal(checked['typelight.edited'], String(context.S.at));
  assert.equal(checked['typelight.drawer'], JSON.stringify({ v: 1, pile: context.sheets, bin: context.bin }));
  assert.equal(context.sheets[0].text, 'Current writing');
  assert.equal(context.sheets[0].title, 'Current title');
});

test('opening an existing drawer text preflights the move without counting a duplicate', async () => {
  let checked;
  const context = editor({ desktop: { canStore(values) { checked = values; return true; } } });
  await context.openFiles([file('Existing drawer text', 'Existing.txt')]);
  const pile = JSON.parse(checked['typelight.drawer']).pile;
  assert.equal(pile.length, 1);
  assert.equal(pile[0].text, 'Current writing');
  assert.equal(checked['typelight.drawer'], JSON.stringify({ v: 1, pile: context.sheets, bin: context.bin }));
  assert.equal(context.S.text, 'Existing drawer text');
});

test('imported document IDs cannot collide with discarded documents kept for recovery', async () => {
  const context = editor({ bin: [{ id: 'discarded-id', text: 'Still recoverable', at: 1, gone: 2 }] });
  await context.openFiles([file(backup({ text: '' }, [{ id: 'discarded-id', text: 'Imported' }]))]);
  assert.notEqual(context.sheets[0].id, 'discarded-id');
  assert.equal(context.bin[0].id, 'discarded-id');
  assert.equal(new Set([...context.sheets, ...context.bin].map(item => item.id)).size, 3);
});

test('oversized backup and text imports preserve all document state and leave the current view open', async () => {
  for (const input of [file(backup({ text: 'Too much' })), file('Too much', 'large.txt')]) {
    const notices = [];
    let saved = false;
    const context = editor({ open: false, bin: [{ id: 'bin', text: 'Discarded', gone: 1 }],
      desktop: { canStore() { return false; } }, tell: message => notices.push(message),
      save() { saved = true; }, persist() { saved = true; } });
    const before = JSON.stringify({ current: context.S, sheets: context.sheets, bin: context.bin });
    await context.openFiles([input]);
    assert.equal(JSON.stringify({ current: context.S, sheets: context.sheets, bin: context.bin }), before);
    assert.equal(context.open, false);
    assert.equal(saved, false);
    assert.match(notices[0], /Nothing was imported.*50 MiB/);
  }
});
