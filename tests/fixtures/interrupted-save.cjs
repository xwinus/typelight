'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { LibraryStore } = require('../../desktop/electron/library-store.cjs');

const [directory, stage] = process.argv.slice(2);
const store = new LibraryStore(directory);
const open = fs.openSync, write = fs.writeFileSync, rename = fs.renameSync;
let primaryDescriptor;

function terminate() {
  fs.writeSync(1, `Interrupted at ${stage}`);
  process.kill(process.pid, 'SIGKILL');
}

fs.openSync = (file, ...args) => {
  const descriptor = open(file, ...args);
  if (path.basename(String(file)).startsWith('.library.json-')) primaryDescriptor = descriptor;
  return descriptor;
};
fs.writeFileSync = (file, data, ...args) => {
  if (stage === 'partial-write' && file === primaryDescriptor) {
    write(file, data.subarray(0, Math.floor(data.length / 2)), ...args);
    terminate();
  }
  return write(file, data, ...args);
};
fs.renameSync = (from, to) => {
  if (to === store.filePath && stage === 'before-rename') terminate();
  const result = rename(from, to);
  if (to === store.filePath && stage === 'after-rename') terminate();
  return result;
};

store.replace({ 'typelight.text': 'Replacement after interrupted save 🐎' });
throw new Error('The interruption checkpoint was not reached.');
