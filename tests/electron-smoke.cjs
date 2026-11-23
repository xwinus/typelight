const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, dialog } = require('electron');
const { checkToolbarStability } = require('./toolbar-layout.cjs');
const { start } = require(process.env.TYPELIGHT_TEST_APP ?
  path.join(process.env.TYPELIGHT_TEST_APP, 'desktop/electron/main.cjs') : '../desktop/electron/main.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-electron-smoke-'));
const seedText = 'Příliš žluťoučký kůň.\n';
fs.writeFileSync(path.join(directory, 'library.json'), JSON.stringify({ version: 1, values: {
  'typelight.text': seedText,
  'typelight.title': 'Native migration fixture',
  'typelight.prefs': JSON.stringify({ sound: true }),
  'typelight.drawer': JSON.stringify({ v: 1, pile: [{ id: 'smoke-drawer',
    text: 'A saved text in the drawer.', title: 'Rename fixture', at: 1 }], bin: [] }),
} }));
let finished = false;
app.on('before-quit', event => { if (!finished) event.preventDefault(); });
dialog.showErrorBox = (title, message) => finish(new Error(`${title}: ${message}`));
const deadline = setTimeout(() => finish(new Error('Electron smoke test timed out')), 45000);

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  if (error) console.error(error);
  fs.rmSync(directory, { recursive: true, force: true });
  app.exit(error ? 1 : 0);
}

async function waitFor(check, message) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

async function loaded(window) {
  if (window.webContents.isLoadingMainFrame()) await once(window.webContents, 'did-finish-load');
  await waitFor(() => window.webContents.executeJavaScript(
    'Boolean(window.typelightDesktop && document.getElementById("ta"))'), 'Editor did not initialize');
}

async function checkLayout(window, mode) {
  const issues = [];
  for (const width of [1180, 900]) {
    const previousIssues = issues.length;
    window.setSize(width, width === 900 ? 580 : 820);
    await waitFor(() => window.webContents.executeJavaScript(`innerWidth === ${width} &&
      Math.abs(document.getElementById('room').getBoundingClientRect().height - innerHeight) < 1`),
      `The viewport and writing surface did not resize to ${width}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    const result = await window.webContents.executeJavaScript(`(async () => {
      await document.fonts.ready;
      const rect = element => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
      };
      const hud = document.getElementById('hud');
      const stamp = document.querySelector('.desk-mark');
      const stampStyle = getComputedStyle(stamp);
      return { viewport: { width: innerWidth, height: innerHeight }, hud: rect(hud),
        stamp: { ...rect(stamp), display: stampStyle.display, pointerEvents: stampStyle.pointerEvents,
          zIndex: Number(stampStyle.zIndex), mask: getComputedStyle(stamp, '::before').maskImage,
          stageZ: Number(getComputedStyle(document.getElementById('stage')).zIndex) },
        brand: rect(hud.querySelector('.brand')), nav: rect(hud.querySelector('nav')),
        count: rect(document.getElementById('count')), status: rect(hud.querySelector('.desktop-status')),
        buttons: [...hud.querySelectorAll('nav button')].filter(x => !x.hidden)
          .map(x => ({ id: x.id, ...rect(x) })) };
    })()`);
    const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > .5 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > .5;
    const inside = (inner, outer) => inner.left >= outer.left - .5 && inner.right <= outer.right + .5 &&
      inner.top >= outer.top - .5 && inner.bottom <= outer.bottom + .5;
    const viewport = { left: 0, top: 0, right: result.viewport.width, bottom: result.viewport.height };
    const note = message => issues.push(`${width}px ${mode}: ${message}`);
    if ((result.stamp.display === 'none') !== (result.viewport.height <= 640)) note('Desk mark visibility does not match available height');
    if (result.stamp.pointerEvents !== 'none' || result.stamp.zIndex >= result.stamp.stageZ) note('Desk mark must stay below paper and let input pass through');
    if (!result.stamp.mask.includes('logo-mark.svg')) note('Desk mark does not use the existing logo');
    if (result.stamp.display !== 'none' && Math.abs(result.stamp.left + result.stamp.width / 2 - width / 2) > 1) note('Desk mark is not centered');
    if (!inside(result.hud, viewport)) note('HUD extends outside the viewport');
    if (overlap(result.brand, result.nav)) note('Word-count brand overlaps navigation');
    if (overlap(result.count, result.status)) note('Save status overlaps word count');
    if (!inside(result.status, result.hud)) note('Save status extends outside the HUD');
    result.buttons.forEach((button, index) => {
      if (!inside(button, viewport) || !inside(button, result.hud)) note(`${button.id} overflows`);
      for (const other of result.buttons.slice(index + 1)) {
        if (overlap(button, other)) note(`${button.id} overlaps ${other.id}`);
      }
    });
    if (issues.length > previousIssues) console.error('Layout bounds:', width, mode, JSON.stringify(result));
  }
  window.setSize(1180, 820);
  return issues;
}

async function run() {
  const runtime = await start({ dataDirectory: directory, show: false });
  assert.ok(runtime, 'The isolated instance must start');
  const window = runtime.getWindow();
  const pageErrors = [];
  const watchErrors = target => {
    target.webContents.on('preload-error', (_event, _path, error) => pageErrors.push(String(error)));
    target.webContents.on('console-message', ({ level, message, sourceId }) => {
      if (level === 'error' && !/\/(?:sounds\/does-not-exist\.flac|desktop\/electron\/main\.cjs)$/.test(sourceId)) {
        pageErrors.push(`${sourceId}: ${message}`);
      }
    });
  };
  watchErrors(window);
  await loaded(window);
  const evaluate = source => window.webContents.executeJavaScript(source, true);
  const initial = await evaluate(`({ text: document.getElementById('ta').value,
    title: window.typelightDesktop.get('typelight.title'),
    requireType: typeof require, processType: typeof process,
    desktop: typeof window.typelightDesktop.flush,
    electron: document.documentElement.classList.contains('electron') })`);
  assert.equal(initial.text, seedText, 'The existing native text must survive migration');
  assert.equal(initial.title, 'Native migration fixture');
  assert.equal(initial.requireType, 'undefined', 'The renderer cannot access Node require');
  assert.equal(initial.processType, 'undefined', 'The renderer cannot access Node process');
  assert.equal(initial.desktop, 'function');
  assert.equal(initial.electron, true);

  const audio = await evaluate(`(async () => {
    const response = await fetch('sounds/manifest.json');
    if (!response.ok || response.status !== 200) throw new Error('Invalid manifest response');
    const manifest = await response.json();
    const files = [...manifest.key, ...manifest.space, ...manifest.bell, ...manifest.feed,
      ...manifest.crumple, ...manifest.return.map(x => x.file),
      ...Object.values(manifest.drawer).map(x => x.file)];
    const decoder = new OfflineAudioContext(2, 1, 48000);
    for (const name of files) {
      const sample = await fetch('sounds/' + name + '?v=' + manifest.version);
      if (!sample.ok || sample.headers.get('Content-Type') !== 'audio/flac') {
        throw new Error('Invalid FLAC response: ' + name);
      }
      const buffer = await decoder.decodeAudioData(await sample.arrayBuffer());
      if (!buffer.duration || !buffer.getChannelData(0).some(x => Math.abs(x) > .001)) {
        throw new Error('Empty or silent audio sample: ' + name);
      }
    }
    const missing = await fetch('sounds/does-not-exist.flac');
    const forbidden = await fetch('desktop/electron/main.cjs');
    window.__soundStarts = [];
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...args) {
      const source = original.apply(this, args);
      const start = source.start;
      source.start = (...args) => {
        window.__soundStarts.push({ state: this.state, length: source.buffer?.length });
        return start.apply(source, args);
      };
      return source;
    };
    return { count: files.length, missing: missing.status, forbidden: forbidden.status,
      label: document.getElementById('bSound').textContent };
  })()`);
  assert.equal(audio.count, 42);
  assert.equal(audio.missing, 404);
  assert.equal(audio.forbidden, 403);
  assert.equal(audio.label, 'Sound: on');

  const toolbar = await evaluate(`(() => {
    const hud = document.getElementById('hud');
    return { width: hud.getBoundingClientRect().width,
      buttons: [...hud.querySelectorAll('nav button')].filter(b => !b.hidden).map(b => ({
        name: b.getAttribute('aria-label'), shortcut: b.getAttribute('aria-keyshortcuts'),
        icon: getComputedStyle(b, '::before').maskImage,
        tooltip: getComputedStyle(b, '::after').content,
        fontSize: getComputedStyle(b).fontSize,
      })), sound: getComputedStyle(document.getElementById('bSound'), '::before').maskImage };
  })()`);
  assert.ok(toolbar.width < 500, 'The desktop palette must remain compact');
  for (const button of toolbar.buttons) {
    assert.ok(button.name && button.shortcut, 'Icon buttons retain names and keyboard shortcuts');
    assert.notEqual(button.icon, 'none', 'Each action must have an icon');
    assert.ok(button.tooltip.includes(button.name), 'Tooltips describe the current action');
    assert.equal(button.fontSize, '0px', 'Text labels must not widen the icon palette');
  }
  await runtime.command('bSound');
  const muted = await evaluate(`({ name: document.getElementById('bSound').getAttribute('aria-label'),
    icon: getComputedStyle(document.getElementById('bSound'), '::before').maskImage })`);
  assert.equal(muted.name, 'Sound: off');
  assert.notEqual(muted.icon, toolbar.sound, 'Muting must visibly change the sound icon');
  await runtime.command('bSound');

  await checkToolbarStability(window, runtime.command);
  const layoutIssues = await checkLayout(window, 'editor');
  await runtime.command('bDrawer');
  layoutIssues.push(...await checkLayout(window, 'drawer'));
  await runtime.command('bDrawer');

  await evaluate(`{ const input = document.getElementById('ta'); input.focus();
    input.setSelectionRange(input.value.length, input.value.length); }`);
  window.webContents.focus();
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'a' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' });
  await waitFor(async () => (await evaluate('document.getElementById("ta").value')) === seedText + 'a',
    'Keyboard input did not reach the editor');
  await waitFor(() => runtime.library.values['typelight.text'] === seedText + 'a',
    'The typed text did not autosave');
  const starts = await evaluate('window.__soundStarts');
  assert.ok(starts.some(source => source.length > 0 && source.state === 'running'),
    'Typing must start a decoded sound on a running AudioContext');
  await runtime.command('undo');
  assert.equal(await evaluate('document.getElementById("ta").value'), seedText);
  await runtime.command('redo');
  assert.equal(await evaluate('document.getElementById("ta").value'), seedText + 'a');

  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'B' });
  window.webContents.sendInputEvent({ type: 'char', keyCode: 'b' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'B' });
  await waitFor(async () => (await evaluate('document.getElementById("ta").value')) === seedText + 'ab',
    'The final typed character is missing');
  const closed = once(window, 'closed');
  window.close();
  await closed;
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
  assert.equal(saved.values['typelight.text'], seedText + 'ab', 'Closing must flush pending edits');
  app.emit('activate');
  const reopened = runtime.getWindow();
  watchErrors(reopened);
  await loaded(reopened);
  assert.equal(await reopened.webContents.executeJavaScript('document.getElementById("ta").value'),
    seedText + 'ab', 'Reopening must restore the last saved text');
  await runtime.command('bDrawer');
  await reopened.webContents.executeJavaScript(`document.querySelector('.leaf[data-id="smoke-drawer"]').focus()`);
  reopened.webContents.focus();
  reopened.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F2' });
  reopened.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F2' });
  await waitFor(() => reopened.webContents.executeJavaScript('Boolean(document.querySelector(".slip-in"))'),
    'F2 did not open drawer renaming');
  await reopened.webContents.executeJavaScript(`document.querySelector('.slip-in').value = 'Renamed on close'`);
  const beforeRename = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
  assert.equal(JSON.parse(beforeRename.values['typelight.drawer']).pile[0].title, 'Rename fixture',
    'The naming field should still be uncommitted before close');
  const renamedClosed = once(reopened, 'closed');
  reopened.close();
  await renamedClosed;
  const renamed = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
  assert.equal(JSON.parse(renamed.values['typelight.drawer']).pile[0].title, 'Renamed on close',
    'Closing must commit the focused drawer name before persisting');

  app.emit('activate');
  const toolsWindow = runtime.getWindow();
  await loaded(toolsWindow);
  await toolsWindow.webContents.executeJavaScript(`{
    const input = document.getElementById('ta');
    input.value = 'A line of writing.\\n'.repeat(160);
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await waitFor(async () => !(await toolsWindow.webContents.executeJavaScript('document.getElementById("bPages").disabled')),
    'The same page button must become available for a multi-page document');
  await runtime.command('bPages');
  assert.equal(await toolsWindow.webContents.executeJavaScript('document.documentElement.classList.contains("pages-open")'), true);
  await runtime.command('bDrawer');
  let backupDialogs = 0;
  dialog.showSaveDialog = async () => { backupDialogs++; return { canceled: true }; };
  await toolsWindow.webContents.executeJavaScript('document.getElementById("bBackup").click()');
  await waitFor(() => backupDialogs === 1, 'The drawer backup action did not open the export dialog');
  await runtime.command('bNew');
  assert.equal(await toolsWindow.webContents.executeJavaScript('document.getElementById("ta").value'), '',
    'New Text must work directly from the drawer');
  await checkToolbarStability(toolsWindow, runtime.command);
  assert.deepEqual(layoutIssues, [], 'Desktop layout regressions');
  assert.deepEqual(pageErrors, [], 'Unexpected renderer errors');
  console.log('Electron smoke: native migration, renderer isolation, 42 FLAC samples, playback, ' +
    'missing/forbidden assets, typing, autosave, undo/redo, close flush, reopen, focused rename, ' +
    '1180/900px editor/drawer layouts, and renderer console checks passed.');
  finish();
}

run().catch(finish);
