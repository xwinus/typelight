/* Loaded only by a desktop host, before the shared editor starts. */
(() => {
  'use strict';

  const host = window.typelightHost || window.webkit?.messageHandlers?.typelight;
  if (!host) return;
  const allowed = new Set(['typelight.text', 'typelight.title', 'typelight.edited',
    'typelight.drawer', 'typelight.prefs', 'typelight.document']);
  const values = { ...(host.takeSeed ? host.takeSeed() : host.seed || window.__typelightSeed) };
  let acknowledged = { ...values };
  delete window.__typelightSeed;
  let editor = null, revision = 0, written = 0, pending = null, timer = null;
  let error = '', dirty = false, stateTimer = null;
  const imports = new Set();
  const fieldSizes = new Map(), encoder = new TextEncoder();
  const envelopeBytes = encoder.encode('{"version":1,"values":{}}').byteLength;

  const request = message => Promise.resolve().then(() => host.postMessage(message));

  function canStore(replacement) {
    if (!replacement || typeof replacement !== 'object' || Array.isArray(replacement)) return false;
    try {
      if (Object.entries(replacement).some(([key, value]) => !allowed.has(key) || typeof value !== 'string')) return false;
      const entries = Object.entries({ ...values, ...replacement });
      let bytes = envelopeBytes + Math.max(0, entries.length - 1);
      for (const [key, value] of entries) {
        let cached = fieldSizes.get(key);
        if (!cached || cached.value !== value) {
          cached = { value, bytes: encoder.encode(JSON.stringify(key) + ':' + JSON.stringify(value)).byteLength };
          if (values[key] === value) fieldSizes.set(key, cached);
        }
        bytes += cached.bytes;
        if (bytes > 50 * 1024 * 1024) return false;
      }
      return true;
    } catch { return false; }
  }

  function report() {
    clearTimeout(stateTimer);
    stateTimer = setTimeout(() => {
      const el = id => document.getElementById(id);
      if (!el('count')) return;
      let prefs = {};
      try { prefs = JSON.parse(values['typelight.prefs'] || '{}'); } catch { /* defaults */ }
      const state = {
        count: el('count').textContent,
        librarySummary: el('count').dataset.librarySummary || '',
        title: values['typelight.title'] || 'Untitled',
        drawer: document.documentElement.classList.contains('drawer-open') ||
          el('room').classList.contains('drawer-open'),
        pages: document.documentElement.classList.contains('pages-open') ||
          el('room').classList.contains('pages-open'),
        hasPages: !el('bPages').hidden && !el('bPages').disabled,
        sound: prefs.sound !== false, lamp: prefs.lamp ?? 2, reading: prefs.reading === true,
        quiet: el('hud').classList.contains('quiet'),
        saving: dirty || revision !== written, error,
      };
      if (window.typelightHost) window.dispatchEvent(new CustomEvent('typelight:state', { detail: state }));
      request({ type: 'state', state }).catch(() => {});
    }, 40);
  }

  async function write() {
    clearTimeout(timer);
    timer = null;
    if (pending) {
      await pending;
      if (written !== revision) return write();
      return true;
    }
    if (written === revision) { dirty = false; report(); return true; }
    const saving = revision;
    const snapshot = { ...values };
    const changes = Object.fromEntries(Object.entries(snapshot).filter(([key, value]) => acknowledged[key] !== value));
    pending = request(host.saveChanges === true ? { type: 'save-changes', changes } : { type: 'save', values: snapshot });
    report();
    try {
      await pending;
      acknowledged = snapshot;
      written = saving;
      dirty = written !== revision;
      error = '';
    } catch (failure) {
      error = 'Not saved — ' + (failure?.message || String(failure));
      throw failure;
    } finally {
      pending = null;
      report();
    }
    if (written !== revision) return write();
    return true;
  }

  function set(key, value) {
    if (!allowed.has(key) || typeof value !== 'string') return false;
    if (values[key] !== value) {
      values[key] = value;
      if (fieldSizes.get(key)?.value !== value) fieldSizes.delete(key);
      revision++;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => write().catch(() => {}), 0);
    }
    report();
    return true;
  }

  function trackImport(action) {
    const task = Promise.resolve().then(action);
    imports.add(task);
    task.then(() => imports.delete(task), () => imports.delete(task));
    return task;
  }

  function openFiles() { return trackImport(async () => {
    try {
      const files = await request({ type: 'open' });
      if (!files?.length) return;
      const decoded = files.map(file => new File([
        Uint8Array.from(atob(file.data), c => c.charCodeAt(0)),
      ], file.name, { type: file.type, lastModified: file.modified }));
      await editor.importFiles(decoded);
    } catch (failure) {
      editor?.notice('Could not open file: ' + (failure?.message || String(failure)));
    }
  }); }

  async function download(name, content, type) {
    try {
      const result = await request({ type: 'export', name, content, mime: type });
      if (result?.saved) editor?.notice('Saved ' + result.name + '.');
    } catch (failure) {
      editor?.notice('Could not export: ' + (failure?.message || String(failure)));
    }
  }

  window.typelightDesktop = Object.freeze({
    get: key => allowed.has(key) ? values[key] ?? null : null,
    set,
    canStore,
    markDirty() { dirty = true; report(); },
    async flush() {
      if (!editor) throw new Error('The editor is not ready yet.');
      editor.lock?.(true);
      try {
        if (imports.size) await Promise.all([...imports]);
        editor.persist();
        await write();
        return true;
      } catch (failure) {
        editor.lock?.(false);
        throw failure;
      }
    },
    unlock: () => editor?.lock?.(false),
    openFiles,
    importFiles: files => trackImport(() => editor?.importFiles(files)),
    recover: backup => editor?.recover(backup),
    historyList: () => request({ type: 'history-list' }),
    historyContents: id => request({ type: 'history-contents', id }),
    historyDocument: (id, index, revision) => request({ type: 'history-document', id, index, revision }),
    historyRestore: (id, index, revision) => trackImport(async () => {
      if (!editor?.restoreCopy) throw new Error('The editor is not ready to restore a copy.');
      const document = await request({ type: 'history-document', id, index, revision });
      const result = await editor.restoreCopy(document);
      if (!result?.restored) throw new Error('The copy could not be restored. Your existing texts have not been replaced.');
      try { editor.persist(); await write(); return { restored: true, saved: true }; }
      catch (failure) { return { restored: true, saved: false, error: failure?.message || String(failure) }; }
    }),
    download,
    zoom: factor => request({ type: 'zoom', factor }),
    command: action => editor?.command(action),
    preparePrint: () => editor?.preparePrint(),
    finishPrint: () => editor?.finishPrint(),
    attach(api) {
      editor = api;
      const observer = new MutationObserver(report);
      observer.observe(document.getElementById('hud'), {
        subtree: true, childList: true, characterData: true, attributes: true,
      });
      observer.observe(document.getElementById('room'), { attributes: true, attributeFilter: ['class'] });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      request({ type: 'ready' }).catch(() => {});
      report();
    },
  });
})();
