'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, dialog } = require('electron');
const { start } = require('../desktop/electron/main.cjs');
const { fixture, summary } = require('./performance-fixtures.cjs');

const name = process.env.TYPELIGHT_PERF_CASE || 'small';
const data = fixture(name);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-performance-'));
const envelope = JSON.stringify({ version: 1, values: data.values });
fs.writeFileSync(path.join(directory, 'library.json'), envelope);
fs.mkdirSync(path.join(directory, 'Backups'));
for (let i = 0; i < 30; i++) {
  fs.writeFileSync(path.join(directory, 'Backups', `library-${1700000000000 + i}-performance.json`), envelope);
}
let finished = false, sampler;
const timings = {}, memory = [], errors = [];
const report = { name, spec: data.spec, libraryBytes: Buffer.byteLength(envelope), timings, memory,
  environment: { platform: process.platform, arch: process.arch, os: os.release(), cpu: os.cpus()[0].model,
    ramGiB: +(os.totalmem() / 1024 ** 3).toFixed(1), electron: process.versions.electron,
    chrome: process.versions.chrome, viewport: '1180x820', sound: 'enabled, volume 0' } };
app.on('before-quit', event => { if (!finished) event.preventDefault(); });
dialog.showErrorBox = (title, message) => finish(new Error(`${title}: ${message}`));
const deadline = setTimeout(() => finish(new Error('Performance case exceeded 180 seconds')), 180000);

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline); clearInterval(sampler);
  report.ok = !error;
  if (error) report.error = String(error.stack || error);
  if (process.env.TYPELIGHT_PERF_REPORT) fs.writeFileSync(process.env.TYPELIGHT_PERF_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ case: name, ok: report.ok, timings, error: report.error }));
  fs.rmSync(directory, { recursive: true, force: true });
  app.exit(error ? 1 : 0);
}

async function run() {
  const begun = performance.now();
  const runtime = await start({ dataDirectory: directory, show: false });
  assert.ok(runtime);
  if (process.env.TYPELIGHT_PERF_PROFILE) {
    const replace = runtime.library.replace.bind(runtime.library);
    report.storageWrites = [];
    runtime.library.replace = values => {
      const start = performance.now();
      try { return replace(values); }
      finally { report.storageWrites.push(performance.now() - start); }
    };
  }
  const window = runtime.getWindow(), contents = window.webContents;
  contents.setBackgroundThrottling(false);
  contents.on('preload-error', (_event, _path, error) => errors.push(String(error)));
  contents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message); });
  const evaluate = source => contents.executeJavaScript(source, true);
  const key = () => {
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'X' });
    contents.sendInputEvent({ type: 'char', keyCode: 'x' });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'X' });
  };
  const paint = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const sampleMemory = () => {
    const processes = app.getAppMetrics().map(p => ({ type: p.type, pid: p.pid, ...p.memory }));
    return { elapsedMs: Math.round(performance.now() - begun), processes,
      workingSetMiB: +(processes.reduce((sum, p) => sum + (p.workingSetSize || 0), 0) / 1024).toFixed(1) };
  };
  sampler = setInterval(() => memory.push(sampleMemory()), 500);
  const measure = async (label, action) => {
    const before = performance.now();
    await action();
    await paint();
    (timings[label] ||= []).push(performance.now() - before);
  };
  const flush = () => evaluate('(async () => { await window.typelightDesktop.flush(); window.typelightDesktop.unlock(); })()');
  const select = async offset => evaluate(`{
    const t = document.getElementById('ta'); t.focus(); t.setSelectionRange(${offset}, ${offset});
    t.dispatchEvent(new Event('select'));
  }`);
  const switchTo = async id => {
    await runtime.command('bDrawer');
    await paint();
    await measure('switchDocument', () => evaluate(`document.querySelector('.leaf[data-id="${id}"]').click()`));
    assert.equal(await evaluate('JSON.parse(window.typelightDesktop.get("typelight.document")).id'), id);
  };
  if (contents.isLoadingMainFrame()) await once(contents, 'did-finish-load');
  await evaluate('document.fonts.ready');
  await paint();
  timings.startup = [performance.now() - begun];
  await flush();
  await new Promise(resolve => setTimeout(resolve, 800));
  contents.debugger.attach('1.3');
  const heap = async label => {
    // Explicit GC is only used between stages, never inside an action measurement.
    await contents.debugger.sendCommand('HeapProfiler.collectGarbage');
    const usage = await contents.debugger.sendCommand('Runtime.getHeapUsage');
    (report.heap ||= []).push({ label, ...usage });
  };
  await heap('loaded');
  if (process.env.TYPELIGHT_PERF_PROFILE) await contents.debugger.sendCommand('Profiler.enable');
  if (process.env.TYPELIGHT_PERF_PROFILE) await contents.debugger.sendCommand('Profiler.start');

  for (const [label, offset] of [['start', 0], ['middle', Math.floor(data.text.length / 2)], ['end', data.text.length]]) {
    await select(offset);
    for (let i = 0; i < 12; i++) await measure('typing-' + label, key);
    assert.equal(await evaluate('document.getElementById("ta").value'),
      data.text.slice(0, offset) + 'x'.repeat(12) + data.text.slice(offset));
    await measure('undo', () => runtime.command('undo'));
    assert.equal(await evaluate('document.getElementById("ta").value'), data.text);
    await select(offset);
    for (let i = 0; i < 3; i++) await measure('insertText-' + label, () => contents.insertText('x'));
    assert.equal(await evaluate('document.getElementById("ta").value'),
      data.text.slice(0, offset) + 'xxx' + data.text.slice(offset));
    await runtime.command('undo');
    assert.equal(await evaluate('document.getElementById("ta").value'), data.text);
  }
  if (process.env.TYPELIGHT_PERF_PROFILE) {
    const { profile } = await contents.debugger.sendCommand('Profiler.stop');
    fs.writeFileSync(process.env.TYPELIGHT_PERF_REPORT + '.cpuprofile', JSON.stringify(profile));
  }
  await measure('save', flush);
  if (process.env.TYPELIGHT_PERF_PROFILE) await contents.debugger.sendCommand('Profiler.start');
  for (let i = 0; i < 3; i++) {
    await measure('openDrawer', () => runtime.command('bDrawer'));
    await runtime.command('bDrawer'); await paint();
  }
  for (let i = 0; i < 5; i++) { await switchTo('fixture-' + i); await switchTo('active'); }
  await flush(); await heap('afterSwitches');
  if (process.env.TYPELIGHT_PERF_PROFILE) {
    const { profile } = await contents.debugger.sendCommand('Profiler.stop');
    fs.writeFileSync(process.env.TYPELIGHT_PERF_REPORT + '.switching.cpuprofile', JSON.stringify(profile));
  }

  for (let i = 0; i < 3; i++) {
    await runtime.command('replace');
    await evaluate(`{
      const q = document.getElementById('findIn'); q.value = '';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    }`);
    await measure('find', () => evaluate(`{
      const q = document.getElementById('findIn'); q.value = 'quiet';
      q.dispatchEvent(new Event('input', { bubbles: true }));
    }`));
    await evaluate('document.getElementById("replaceIn").value = "calm"');
    await measure('replaceAll', () => evaluate('document.getElementById("replaceAll").click()'));
    assert.equal(await evaluate('document.getElementById("ta").value'), data.text.replaceAll('quiet', 'calm'));
    await measure('undoReplace', () => runtime.command('undo'));
    assert.equal(await evaluate('document.getElementById("ta").value'), data.text);
    await evaluate('document.getElementById("findClose").click()');
  }
  await flush(); await heap('afterReplace');

  await measure('historyOpen', () => runtime.command('history'));
  assert.equal(await evaluate('document.getElementById("historyRestore").disabled'), false);
  await measure('historyPreview', async () => {
    await evaluate(`{
      const select = document.getElementById('historyDocuments'); select.selectedIndex = select.options.length - 1;
      select.dispatchEvent(new Event('change'));
    }`);
    const end = Date.now() + 15000;
    while (await evaluate('document.getElementById("historyRestore").disabled')) {
      if (Date.now() > end) throw new Error('History preview did not finish');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });
  await measure('historyRestore', async () => {
    await evaluate('document.getElementById("historyRestore").click()');
    const end = Date.now() + 15000;
    while (!(await evaluate('document.getElementById("historyStatus").textContent.includes("A new copy is saved")'))) {
      if (Date.now() > end) throw new Error('History restore did not finish');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  });
  await evaluate('document.getElementById("historyClose").click()');
  await flush();
  assert.equal(runtime.library.values['typelight.text'], data.text);
  assert.equal(JSON.parse(runtime.library.values['typelight.drawer']).pile.length, data.spec.documents + 1);
  await heap('afterHistory');
  for (let cycle = 1; cycle <= 2; cycle++) {
    for (let i = 0; i < 5; i++) {
      await switchTo('fixture-' + i); await switchTo('active');
      await select(data.text.length);
      key(); await paint();
      await runtime.command('undo');
      assert.equal(await evaluate('document.getElementById("ta").value'), data.text);
    }
    await flush(); await heap('repeatCycle' + cycle);
  }
  const closeStart = performance.now();
  const closed = once(window, 'closed'); window.close(); await closed;
  timings.closeAndCheckpoint = [performance.now() - closeStart];
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
  assert.equal(saved.values['typelight.text'], data.text);
  const originalPile = JSON.parse(data.values['typelight.drawer']).pile;
  const savedPile = JSON.parse(saved.values['typelight.drawer']).pile;
  const savedById = new Map(savedPile.map(item => [item.id, item]));
  assert.equal(savedById.size, data.spec.documents + 1);
  for (const original of originalPile) {
    assert.equal(savedById.get(original.id)?.text, original.text, 'Every original drawer text must survive');
    assert.equal(savedById.get(original.id)?.title, original.title);
  }
  assert.deepEqual(errors, []);
  for (const [label, samples] of Object.entries(timings)) timings[label] = { ...summary(samples), samples: samples.map(n => +n.toFixed(1)) };
  report.peakSampledWorkingSetMiB = Math.max(...memory.map(m => m.workingSetMiB));
  finish();
}

run().catch(finish);
