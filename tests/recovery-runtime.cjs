'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, dialog } = require('electron');
const root = process.env.TYPELIGHT_TEST_APP || path.resolve(__dirname, '..');
const { start } = require(path.join(root, 'desktop/electron/main.cjs'));
const { LibraryStore } = require(path.join(root, 'desktop/electron/library-store.cjs'));

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-recovery-runtime-'));
const primary = path.join(directory, 'library.json');
const backups = path.join(directory, 'Backups');
fs.mkdirSync(backups);
const snapshot = path.join(backups, 'library-1700000000000-fixture.json');
const recovered = 'Recovered writing: Příliš žluťoučký kůň.\n';
fs.writeFileSync(primary, '{damaged');
fs.writeFileSync(snapshot, JSON.stringify({ version: 1, values: { 'typelight.text': recovered } }));
let finished = false, prompts = 0;
const errors = [];
app.on('before-quit', event => { if (!finished) event.preventDefault(); });
dialog.showMessageBox = async options => {
  assert.match(options.title, /Recover your writing/);
  prompts++;
  return { response: 0 };
};
dialog.showOpenDialog = async options => {
  assert.equal(options.defaultPath, backups);
  return { canceled: false, filePaths: [snapshot] };
};
dialog.showErrorBox = (title, message) => errors.push({ title, message });
const deadline = setTimeout(() => finish(new Error('Recovery runtime test timed out')), 30000);

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

async function run() {
  const runtime = await start({ dataDirectory: directory, show: false });
  assert.ok(runtime);
  assert.equal(prompts, 2);
  const window = runtime.getWindow();
  if (window.webContents.isLoadingMainFrame()) await once(window.webContents, 'did-finish-load');
  const evaluate = script => window.webContents.executeJavaScript(script);
  await waitFor(() => evaluate('Boolean(window.typelightDesktop && document.getElementById("ta"))'),
    'Recovered editor did not initialize');
  assert.equal(await evaluate('document.getElementById("ta").value'), recovered);
  const originals = path.join(directory, 'Recovered Originals');
  assert.equal(fs.readFileSync(path.join(originals, fs.readdirSync(originals)[0]), 'utf8'), '{damaged');

  const final = recovered + 'The final sentence before closing.';
  await evaluate(`{
    const input = document.getElementById('ta');
    input.value = ${JSON.stringify(final)};
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }`);
  await waitFor(() => runtime.library.values['typelight.text'] === final, 'Recovered library did not save edits');
  assert.equal(errors.length, 0);

  const held = path.join(directory, 'Held Backups');
  fs.renameSync(backups, held);
  fs.writeFileSync(backups, 'Simulated unavailable backup directory');
  window.close();
  await waitFor(() => errors.length === 1, 'Failed close checkpoint did not report an error');
  assert.match(errors[0].message, /automatic backup could not be completed/);
  assert.equal(window.isDestroyed(), false, 'A failed checkpoint must keep the editor open');
  await waitFor(() => evaluate('!document.getElementById("ta").disabled'), 'Failed close left editing locked');
  assert.equal(await evaluate('document.getElementById("ta").value'), final);
  assert.equal(new LibraryStore(directory).values['typelight.text'], final);

  fs.unlinkSync(backups);
  fs.renameSync(held, backups);
  const closed = once(window, 'closed');
  window.close();
  await closed;
  const latest = fs.readdirSync(backups)
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))[0];
  assert.equal(LibraryStore.decodeSnapshot(fs.readFileSync(path.join(backups, latest)))['typelight.text'], final);
  assert.equal(new LibraryStore(directory).values['typelight.text'], final);
  console.log('Recovery runtime: damaged startup, original preservation, recovered editing, ' +
    'failed close checkpoint, unlocked retry, and final snapshot passed.');
  finish();
}

run().catch(finish);
