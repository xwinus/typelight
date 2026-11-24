'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { LibraryStore, MAXIMUM_BYTES, atomicWrite } = require('./library-store.cjs');

function identity(file) {
  try {
    const stat = fs.lstatSync(file, { bigint: true });
    if (!stat.isFile()) throw new Error('The library is not a regular file. Move it to a safe location before recovery.');
    return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function readRecovery(file) {
  if (!fs.statSync(file).isFile()) throw new Error('Choose a snapshot file.');
  if (fs.statSync(file).size > MAXIMUM_BYTES) throw new Error('The snapshot exceeds the 50 MiB limit.');
  const data = fs.readFileSync(file);
  LibraryStore.decodeSnapshot(data);
  return data;
}

function hasBackups(directory) {
  try {
    return fs.readdirSync(path.join(directory, 'Backups'))
      .some(name => /^library-\d+-[\w-]+\.json$/.test(name));
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

// Keep the original outside automatic snapshot rotation, even if the replacement fails.
function restoreLibrary(directory, data, expectedIdentity) {
  LibraryStore.decodeSnapshot(data);
  const file = path.join(directory, 'library.json');
  const unchanged = () => {
    if (identity(file) !== expectedIdentity) {
      throw new Error('The library changed during recovery. Quit and reopen Typelight before trying again.');
    }
  };
  unchanged();
  let preserved = null;
  if (expectedIdentity !== null) {
    const originals = path.join(directory, 'Recovered Originals');
    fs.mkdirSync(originals, { recursive: true, mode: 0o700 });
    preserved = path.join(originals, `library-${Date.now()}-${randomUUID()}.json`);
    fs.copyFileSync(file, preserved, fs.constants.COPYFILE_EXCL);
    const descriptor = fs.openSync(preserved, 'r');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    unchanged();
  }
  atomicWrite(file, data);
  return { library: new LibraryStore(directory), preserved };
}

async function openLibrary(directory, { dialog, shell }) {
  const file = path.join(directory, 'library.json');
  let expectedIdentity;
  try { expectedIdentity = identity(file); }
  catch (error) {
    for (;;) {
      const choice = await dialog.showMessageBox({ type: 'warning', title: 'Your library is unavailable',
        message: 'Typelight cannot safely access your library.',
        detail: `${error.message}\n\nCheck the library folder and its permissions, then reopen Typelight. Your files have not been changed.`,
        buttons: ['Show Library Folder', 'Quit'], defaultId: 1, cancelId: 1, noLink: true });
      if (choice.response !== 0) return null;
      try {
        const failure = await shell.openPath(directory);
        if (failure) throw new Error(failure);
      } catch (failure) { dialog.showErrorBox('Could not open library folder', failure.message); }
    }
  }
  let reason;
  try {
    const library = new LibraryStore(directory);
    if (expectedIdentity !== null || !hasBackups(directory)) return library;
    reason = 'The main library is missing, but automatic backups are available.';
  } catch (error) { reason = error.message; }

  for (;;) {
    const choice = await dialog.showMessageBox({ type: 'warning', title: 'Recover your writing',
      message: 'Typelight could not open your library.',
      detail: `${reason}\n\nChoose an automatic snapshot to recover your writing. The existing library will be kept in Recovered Originals. Nothing changes if you quit.`,
      buttons: ['Choose Snapshot…', 'Show Library Folder', 'Quit'], defaultId: 0, cancelId: 2, noLink: true });
    if (choice.response === 2) return null;
    try {
      if (choice.response === 1) {
        const error = await shell.openPath(directory);
        if (error) throw new Error(error);
        continue;
      }
      const selected = await dialog.showOpenDialog({ title: 'Recover your writing from a snapshot',
        defaultPath: path.join(directory, 'Backups'), properties: ['openFile'],
        filters: [{ name: 'Library snapshot', extensions: ['json'] }] });
      if (selected.canceled || !selected.filePaths.length) continue;
      const source = selected.filePaths[0];
      const data = readRecovery(source);
      const confirmed = await dialog.showMessageBox({ type: 'question', title: 'Recover your writing',
        message: 'Open this saved version of your library?',
        detail: `${path.basename(source)}\nSaved: ${fs.statSync(source).mtime.toLocaleString()}\n\nYour original library will be preserved. Edits newer than this snapshot may be missing.`,
        buttons: ['Recover', 'Cancel'], defaultId: 1, cancelId: 1, noLink: true });
      if (confirmed.response !== 0) continue;
      return restoreLibrary(directory, data, expectedIdentity).library;
    } catch (error) {
      dialog.showErrorBox('Recovery did not complete', error.message || String(error));
    }
  }
}

module.exports = { openLibrary, restoreLibrary, readRecovery, identity };
