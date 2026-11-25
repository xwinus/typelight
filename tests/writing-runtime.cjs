'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { app, dialog } = require('electron');
const { start } = require('../desktop/electron/main.cjs');
const { checkFind } = require('./find-runtime.cjs');
const { checkHistory } = require('./history-runtime.cjs');
const { checkWritingControls } = require('./writing-controls-runtime.cjs');
const { checkDocumentSession } = require('./document-session-runtime.cjs');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'typelight-writing-'));
let finished = false;
app.on('before-quit', event => { if (!finished) event.preventDefault(); });
dialog.showErrorBox = (title, message) => finish(new Error(`${title}: ${message}`));
const deadline = setTimeout(() => finish(new Error('Writing runtime timed out')), 60000);

function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(deadline);
  if (error) console.error(error);
  fs.rmSync(directory, { recursive: true, force: true });
  app.exit(error ? 1 : 0);
}

async function run() {
  const runtime = await start({ dataDirectory: directory, show: false });
  assert.ok(runtime);
  const window = runtime.getWindow();
  const errors = [];
  window.webContents.on('preload-error', (_event, _path, error) => errors.push(String(error)));
  window.webContents.on('console-message', ({ level, message }) => {
    if (level === 'error') errors.push(message);
  });
  if (window.webContents.isLoadingMainFrame()) await once(window.webContents, 'did-finish-load');
  await checkDocumentSession(window, runtime);
  await checkFind(window, runtime.command);
  await checkWritingControls(window, runtime);
  await checkHistory(window, runtime);
  const closed = once(window, 'closed');
  window.close();
  await closed;
  assert.deepEqual(errors, [], 'Writing features must not produce renderer errors');
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'library.json'), 'utf8'));
  assert.ok(saved.values['typelight.document'], 'Closing persists document identity and position');
  console.log('Writing runtime: document switching, separate undo/redo, reading positions, find/replace, rename, volume, restart persistence, ' +
    'history preview, invalid snapshots and independent restored copies passed.');
  finish();
}

run().catch(finish);
