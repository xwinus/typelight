const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const source = readFileSync('desktop/web/bridge.js', 'utf8');

function harness(t, { seed = {}, send = async () => true, electron = false, importFiles } = {}) {
  const calls = [], notices = [], imported = [], locks = [], timers = new Set();
  const context = {
    window: { __typelightSeed: seed, webkit: { messageHandlers: { typelight: {
      postMessage(message) { calls.push(message); return send(message); },
    } } } },
    document: { getElementById: () => null, documentElement: {} },
    MutationObserver: class { observe() {} },
    File, Uint8Array, atob, TextEncoder,
    setTimeout(fn, ms) {
      const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms);
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) { timers.delete(timer); clearTimeout(timer); },
  };
  if (electron) {
    context.window.typelightHost = { seed, postMessage: context.window.webkit.messageHandlers.typelight.postMessage };
    delete context.window.webkit;
    delete context.window.__typelightSeed;
  }
  t.after(() => { for (const timer of timers) clearTimeout(timer); });
  vm.runInNewContext(source, context);
  const bridge = context.window.typelightDesktop;
  bridge.attach({ persist() {}, command() {}, notice: text => notices.push(text),
    lock: value => locks.push(value), importFiles: importFiles || (files => imported.push(...files)) });
  return { bridge, calls, notices, imported, locks };
}

test('saves a complete snapshot including hydrated documents and Unicode', async t => {
  const { bridge, calls } = harness(t, { seed: { 'typelight.drawer': '{"v":1,"pile":[],"bin":[]}' } });
  bridge.set('typelight.text', 'Příliš žluťoučký kůň');
  bridge.set('typelight.title', 'Night writing');
  await bridge.flush();
  const saves = calls.filter(x => x.type === 'save');
  assert.equal(saves.length, 1);
  assert.equal(saves[0].values['typelight.text'], 'Příliš žluťoučký kůň');
  assert.equal(saves[0].values['typelight.drawer'], '{"v":1,"pile":[],"bin":[]}');
});

test('empty documents survive and unchanged values do not write again', async t => {
  const { bridge, calls } = harness(t, { seed: { 'typelight.text': 'Old' } });
  bridge.set('typelight.text', '');
  await bridge.flush();
  bridge.set('typelight.text', '');
  await bridge.flush();
  assert.equal(calls.filter(x => x.type === 'save').length, 1);
  assert.equal(bridge.get('typelight.text'), '');
});

test('rejects unsupported keys and invalid types', async t => {
  const { bridge, calls } = harness(t);
  assert.equal(bridge.set('password', 'secret'), false);
  assert.equal(bridge.set('typelight.text', 12), false);
  assert.equal(bridge.get('password'), null);
  await bridge.flush();
  assert.equal(calls.filter(x => x.type === 'save').length, 0);
});

test('a failed disk save rejects close flush and retains the text for retry', async t => {
  let fail = true;
  const { bridge, calls } = harness(t, { send: async message => {
    if (message.type === 'save' && fail) throw new Error('Disk full');
    return true;
  } });
  bridge.set('typelight.text', 'Keep this sentence');
  await assert.rejects(bridge.flush(), /Disk full/);
  assert.equal(bridge.get('typelight.text'), 'Keep this sentence');
  fail = false;
  await bridge.flush();
  assert.equal(calls.filter(x => x.type === 'save').length, 2);
});

test('edits made during an in-flight save are flushed in order', async t => {
  let acknowledge;
  const { bridge, calls } = harness(t, { send: message => {
    if (message.type === 'save' && !acknowledge) return new Promise(resolve => { acknowledge = resolve; });
    return Promise.resolve(true);
  } });
  bridge.set('typelight.text', 'First');
  const flushing = bridge.flush();
  await Promise.resolve();
  bridge.set('typelight.text', 'Second');
  acknowledge(true);
  await flushing;
  assert.deepEqual(calls.filter(x => x.type === 'save').map(x => x.values['typelight.text']), ['First', 'Second']);
});

test('file import preserves raw bytes for the editor encoding detection', async t => {
  const bytes = Buffer.from('Český text', 'utf8');
  const { bridge, imported } = harness(t, { send: async message => message.type === 'open'
    ? [{ name: 'writing.txt', data: bytes.toString('base64'), type: 'text/plain', modified: 1234 }] : true });
  await bridge.openFiles();
  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, 'writing.txt');
  assert.deepEqual(Buffer.from(await imported[0].arrayBuffer()), bytes);
});

test('canceling the open panel leaves the current editor alone', async t => {
  const { bridge, imported, notices } = harness(t, { send: async message => message.type === 'open' ? [] : true });
  await bridge.openFiles();
  assert.equal(imported.length, 0);
  assert.equal(notices.length, 0);
});

test('unreadable import reports the failure without importing anything', async t => {
  const { bridge, imported, notices } = harness(t, { send: async message => {
    if (message.type === 'open') throw new Error('Permission denied');
    return true;
  } });
  await bridge.openFiles();
  assert.equal(imported.length, 0);
  assert.match(notices[0], /Permission denied/);
});

test('export acknowledges the name returned by the native save panel', async t => {
  const { bridge, notices } = harness(t, { send: async message => message.type === 'export'
    ? { saved: true, name: 'Renamed.txt' } : true });
  await bridge.download('Draft.txt', 'Words', 'text/plain');
  assert.equal(notices[0], 'Saved Renamed.txt.');
});

test('canceled export never claims the text was saved', async t => {
  const { bridge, notices } = harness(t, { send: async message => message.type === 'export' ? { saved: false } : true });
  await bridge.download('Draft.txt', '', 'text/plain');
  assert.equal(notices.length, 0);
});

test('failed export remains visible to the writer', async t => {
  const { bridge, notices } = harness(t, { send: async message => {
    if (message.type === 'export') throw new Error('Read-only disk');
    return true;
  } });
  await bridge.download('Draft.txt', 'Do not lose this', 'text/plain');
  assert.match(notices[0], /Could not export: Read-only disk/);
});

test('the bridge leaves ordinary browser sessions untouched', () => {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  assert.equal(context.window.typelightDesktop, undefined);
});

test('close flush freezes editing until the native window is reopened', async t => {
  const { bridge, locks } = harness(t);
  bridge.set('typelight.text', 'Last sentence before closing');
  await bridge.flush();
  assert.deepEqual(locks, [true]);
  bridge.unlock();
  assert.deepEqual(locks, [true, false]);
});

test('closing an unchanged document also prevents late input', async t => {
  const { bridge, calls, locks } = harness(t, { seed: { 'typelight.text': 'Existing' } });
  await bridge.flush();
  assert.deepEqual(locks, [true]);
  assert.equal(calls.filter(x => x.type === 'save').length, 0);
});

test('failed close flush unlocks the editor for exporting or retrying', async t => {
  const { bridge, locks } = harness(t, { send: async message => {
    if (message.type === 'save') throw new Error('Unavailable volume');
    return true;
  } });
  bridge.set('typelight.text', 'Recover me');
  await assert.rejects(bridge.flush(), /Unavailable volume/);
  assert.deepEqual(locks, [true, false]);
});

test('Electron hydrates the same snapshot and saves through its isolated host', async t => {
  const { bridge, calls } = harness(t, { electron: true, seed: { 'typelight.text': 'Původní text' } });
  assert.equal(bridge.get('typelight.text'), 'Původní text');
  bridge.set('typelight.text', 'Nový text');
  await bridge.flush();
  assert.equal(calls.find(x => x.type === 'save').values['typelight.text'], 'Nový text');
});

test('close waits for an ongoing file import before persisting', async t => {
  let finish, closed = false;
  const { bridge } = harness(t, { electron: true, importFiles: () => new Promise(resolve => { finish = resolve; }) });
  const importing = bridge.importFiles([]);
  await Promise.resolve();
  const closing = bridge.flush().then(() => { closed = true; });
  await Promise.resolve();
  assert.equal(closed, false);
  finish();
  await importing;
  await closing;
  assert.equal(closed, true);
});

test('a failed ongoing import prevents closing and unlocks the editor', async t => {
  let reject;
  const { bridge, locks } = harness(t, { electron: true, importFiles: () => new Promise((_, fail) => { reject = fail; }) });
  const importing = bridge.importFiles([]);
  const imported = assert.rejects(importing, /Unreadable/);
  await Promise.resolve();
  const closing = assert.rejects(bridge.flush(), /Unreadable/);
  reject(new Error('Unreadable file'));
  await Promise.all([imported, closing]);
  assert.deepEqual(locks, [true, false]);
});

test('capacity preflight combines pending preferences and document values without saving or mutating them', t => {
  const { bridge, calls } = harness(t, { seed: { 'typelight.text': 'Keep', 'typelight.prefs': '{"sound":true}' } });
  assert.equal(bridge.canStore({ 'typelight.drawer': '{"v":1,"pile":[],"bin":[]}', 'typelight.text': 'Příběh 🐎' }), true);
  assert.equal(bridge.get('typelight.text'), 'Keep');
  assert.equal(bridge.get('typelight.drawer'), null);
  assert.equal(calls.filter(call => call.type === 'save').length, 0);
});

test('capacity preflight uses the exact UTF-8 snapshot boundary including JSON escaping and metadata', t => {
  const maximum = 50 * 1024 * 1024;
  const prefs = '{"sound":true}';
  const drawer = '{"v":1,"pile":[],"bin":[{"id":"bin","text":"Discarded"}]}';
  const seed = { 'typelight.prefs': prefs, 'typelight.drawer': drawer, 'typelight.title': 'Český 🐎',
    'typelight.edited': '123', 'typelight.text': '\n"\\🐎' };
  const overhead = Buffer.byteLength(JSON.stringify({ version: 1, values: seed }));
  const { bridge } = harness(t, { seed });
  const exact = seed['typelight.text'] + 'x'.repeat(maximum - overhead);
  assert.equal(bridge.canStore({ 'typelight.text': exact }), true);
  assert.equal(bridge.canStore({ 'typelight.text': exact + 'x' }), false);
  assert.equal(bridge.get('typelight.text'), seed['typelight.text']);
});

test('capacity preflight rejects unsupported values and accounts for pending state before saves finish', t => {
  const { bridge } = harness(t);
  for (const replacement of [null, [], { password: 'unknown' }, { 'typelight.text': 3 },
    { get 'typelight.text'() { throw new Error('Unavailable value'); } }]) {
    assert.equal(bridge.canStore(replacement), false);
  }
  bridge.set('typelight.prefs', 'x'.repeat(50 * 1024 * 1024));
  assert.equal(bridge.canStore({ 'typelight.text': 'Small import' }), false);
});
