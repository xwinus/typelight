'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { LibraryStore, MAXIMUM_BYTES } = require('./library-store.cjs');

const SNAPSHOT_ID = /^library-\d+-[\w-]+\.json$/;

function backupDirectory(library) {
  const directory = library.backupsDirectory;
  try {
    if (!fs.lstatSync(directory).isDirectory()) throw new Error('The backup folder is unavailable.');
    return directory;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function listSnapshots(library) {
  const directory = backupDirectory(library);
  if (!directory) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && SNAPSHOT_ID.test(entry.name))
    .map(entry => {
      const stat = fs.statSync(path.join(directory, entry.name));
      return { id: entry.name, at: stat.mtimeMs, bytes: stat.size };
    })
    .sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
}

function readSnapshot(library, id) {
  if (typeof id !== 'string' || !SNAPSHOT_ID.test(id)) throw new Error('Invalid snapshot identifier.');
  const directory = backupDirectory(library);
  if (!directory) throw new Error('The snapshot is no longer available.');
  const file = path.join(directory, id);
  if (!fs.lstatSync(file).isFile()) throw new Error('The snapshot must be a regular file.');
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let data;
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAXIMUM_BYTES) throw new Error('The snapshot is unavailable or exceeds the 50 MiB limit.');
    data = fs.readFileSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  const values = LibraryStore.decodeSnapshot(data);
  const drawer = JSON.parse(values['typelight.drawer'] || '{"pile":[],"bin":[]}');
  const machine = { text: values['typelight.text'] || '', title: values['typelight.title'] || '',
    at: Number(values['typelight.edited'] || 0) };
  const documents = [
    ...(machine.text || machine.title ? [{ ...machine, location: 'Writing desk' }] : []),
    ...drawer.pile.map(item => ({ ...item, location: 'Drawer' })),
    ...drawer.bin.map(item => ({ ...item, location: 'Discarded' })),
  ].map(item => ({ text: item.text, title: item.title || '', at: item.at || 0, location: item.location }));
  return { revision: createHash('sha256').update(data).digest('hex'), documents };
}

function snapshotContents(library, id) {
  const snapshot = readSnapshot(library, id);
  return { revision: snapshot.revision, documents: snapshot.documents.map((item, index) => ({
    index, title: item.title, at: item.at, location: item.location, characters: item.text.length,
  })) };
}

function snapshotDocument(library, id, index, revision) {
  if (!Number.isSafeInteger(index) || index < 0 || typeof revision !== 'string' || !/^[a-f0-9]{64}$/.test(revision)) {
    throw new Error('Invalid snapshot document.');
  }
  const snapshot = readSnapshot(library, id);
  if (snapshot.revision !== revision) throw new Error('This snapshot changed. Select it again before restoring a copy.');
  const item = snapshot.documents[index];
  if (!item) throw new Error('The selected document is no longer available.');
  return { text: item.text, title: item.title, at: item.at };
}

module.exports = { SNAPSHOT_ID, listSnapshots, snapshotContents, snapshotDocument };
