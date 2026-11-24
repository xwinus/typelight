/* Shared file limits and decoding for the web editor and desktop file chooser. */
(() => {
  'use strict';

  const TEXT_BYTES = 8_000_000;
  const BACKUP_BYTES = 50 * 1024 * 1024;
  const isBackup = file => /\.json$/i.test(file.name) || file.type === 'application/json';
  const limitFor = file => isBackup(file) ? BACKUP_BYTES : TEXT_BYTES;
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function backupItems(text) {
    const backup = JSON.parse(text.replace(/^\uFEFF/, ''));
    const validItem = item => isObject(item) && typeof item.text === 'string' &&
      (item.title === undefined || typeof item.title === 'string') &&
      (item.id === undefined || typeof item.id === 'string') &&
      (item.at === undefined || (Number.isFinite(item.at) && item.at >= 0));
    if (!isObject(backup) || backup.typelight !== 1 || !validItem(backup.machine) ||
        !Array.isArray(backup.drawer) || !backup.drawer.every(validItem)) {
      throw new Error('The backup is incomplete or has an unsupported format.');
    }
    return [backup.machine, ...backup.drawer];
  }

  function textOf(bytes) {
    let odd = 0;
    for (const byte of bytes) {
      if (byte === 0) throw new Error('The file is not plain text.');
      if (byte < 32 && ![9, 10, 12, 13].includes(byte)) odd++;
    }
    if (odd > bytes.length / 200) throw new Error('The file is not plain text.');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { return new TextDecoder('windows-1250').decode(bytes); }
  }

  async function readFiles(files) {
    const items = [], not = [];
    let backup = false;
    for (const file of files) {
      try {
        const limit = limitFor(file);
        if (!Number.isFinite(file.size) || file.size < 0 || file.size > limit) {
          throw new Error('The file exceeds the size limit.');
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength > limit) throw new Error('The file exceeds the size limit.');
        if (isBackup(file)) {
          const imported = backupItems(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
          for (const item of imported) items.push(item);
          backup = true;
        } else {
          const base = file.name.replace(/\.[^.]*$/, '').trim();
          items.push({ text: textOf(bytes).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    '),
            at: file.lastModified || Date.now(),
            title: /^typelight-\d{4}-\d\d-\d\d/.test(base) ? '' : base });
        }
      } catch { not.push(file.name); }
    }
    return { items, backup, not };
  }

  const api = Object.freeze({ TEXT_BYTES, BACKUP_BYTES, isBackup, limitFor, backupItems, readFiles });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.TypelightImport = api;
})();
