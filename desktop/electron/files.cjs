const fs = require('node:fs');
const path = require('node:path');
const { dialog, shell } = require('electron');
const { LibraryStore, MAXIMUM_BYTES, atomicWrite } = require('./library-store.cjs');

function readLimited(file, limit) {
  if (fs.statSync(file).size > limit) throw new Error(`${path.basename(file)} exceeds the file size limit.`);
  const data = fs.readFileSync(file);
  if (data.length > limit) throw new Error('File grew beyond the size limit.');
  return data;
}

async function openFiles(window) {
  const result = await dialog.showOpenDialog(window, { title: 'Bring a text to your desk',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Texts and backups', extensions: ['txt', 'md', 'json'] },
      { name: 'All files', extensions: ['*'] }] });
  if (result.canceled) return [];
  return result.filePaths.map(file => ({ name: path.basename(file),
    data: readLimited(file, 8_000_000).toString('base64'), modified: fs.statSync(file).mtimeMs,
    type: path.extname(file) === '.json' ? 'application/json' : 'text/plain' }));
}

async function exportFile(window, message) {
  if (Buffer.byteLength(message.content) > MAXIMUM_BYTES) throw new Error('Export exceeds the 50 MB limit.');
  const name = path.basename(message.name.replaceAll('\\', '/'));
  const result = await dialog.showSaveDialog(window, { title: 'Save a copy', defaultPath: name,
    filters: [{ name: name.endsWith('.json') ? 'Typelight backup' : 'Plain text',
      extensions: [name.endsWith('.json') ? 'json' : 'txt'] }] });
  if (result.canceled || !result.filePath) return { saved: false };
  atomicWrite(result.filePath, message.content);
  return { saved: true, name: path.basename(result.filePath) };
}

async function recoverSnapshot(window, library) {
  const result = await dialog.showOpenDialog(window, { title: 'Recover texts from a snapshot',
    defaultPath: library.backupsDirectory, properties: ['openFile'],
    filters: [{ name: 'Library snapshot', extensions: ['json'] }] });
  if (result.canceled || !result.filePaths.length) return;
  const values = LibraryStore.decodeSnapshot(readLimited(result.filePaths[0], MAXIMUM_BYTES));
  const drawer = JSON.parse(values['typelight.drawer'] || '{"pile":[]}');
  const backup = { typelight: 1,
    machine: { text: values['typelight.text'] || '', title: values['typelight.title'] || '',
      at: Number(values['typelight.edited'] || 0) }, drawer: drawer.pile };
  await window.webContents.executeJavaScript(`window.typelightDesktop.recover(${JSON.stringify(backup)})`);
}

async function showBackups(library) {
  fs.mkdirSync(library.backupsDirectory, { recursive: true, mode: 0o700 });
  const error = await shell.openPath(library.backupsDirectory);
  if (error) throw new Error(error);
}

async function printDocument(window) {
  await window.webContents.executeJavaScript('window.typelightDesktop.preparePrint()');
  try {
    await new Promise((resolve, reject) => window.webContents.print({ silent: false, printBackground: true },
      (success, reason) => success || reason === 'Print job canceled' || reason === 'cancelled'
        ? resolve() : reject(new Error(reason))));
  } finally {
    if (!window.isDestroyed()) await window.webContents.executeJavaScript('window.typelightDesktop.finishPrint()');
  }
}

module.exports = { openFiles, exportFile, recoverSnapshot, showBackups, printDocument };
