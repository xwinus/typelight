/* Read-only previews of local automatic snapshots; restoration always creates a copy. */
(() => {
  'use strict';
  const desktop = window.typelightDesktop;
  if (!desktop) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'versionHistory';
  dialog.className = 'version-history';
  dialog.setAttribute('aria-labelledby', 'historyTitle');
  dialog.innerHTML = `
    <header><h1 id="historyTitle">Version history</h1><button type="button" id="historyClose" autofocus>Close</button></header>
    <p id="historyDescription">Browse automatic backups from this device. Restore a text as a new copy in the drawer; your current writing stays intact.</p>
    <div class="history-choices">
      <label>Saved version<select id="historySnapshots" aria-describedby="historyStatus"></select></label>
      <label>Text<select id="historyDocuments"></select></label>
    </div>
    <p id="historyDetails"></p>
    <pre id="historyPreview" tabindex="0" aria-label="Preview of the selected text"></pre>
    <p id="historyStatus" role="status" aria-live="polite"></p>
    <p id="historyError" role="alert"></p>
    <footer><button type="button" id="historyRefresh">Refresh versions</button><button type="button" id="historyRestore" disabled>Restore as a new copy</button></footer>`;
  document.body.appendChild(dialog);
  const el = id => dialog.querySelector('#' + id);
  const versions = el('historySnapshots'), documents = el('historyDocuments');
  const preview = el('historyPreview'), details = el('historyDetails');
  const restore = el('historyRestore'), refresh = el('historyRefresh');
  let generation = 0, revision = '', restoring = false, returnFocus = null;
  let rows = [], restored = false;
  const formatDate = value => Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString() : 'Date unknown';
  const option = (value, text) => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = text;
    return node;
  };
  function fill(select, entries, make) {
    const fragment = document.createDocumentFragment();
    for (const entry of entries) fragment.appendChild(make(entry));
    select.replaceChildren(fragment);
  }
  function report(message = '', error = '') {
    el('historyStatus').textContent = message;
    el('historyError').textContent = error;
  }
  function clearPreview() {
    preview.textContent = '';
    details.textContent = '';
    restore.disabled = true;
    restore.textContent = 'Restore as a new copy';
    restored = false;
  }
  async function selectDocument() {
    const turn = ++generation;
    clearPreview();
    const row = rows.find(item => String(item.index) === documents.value);
    if (!row) return;
    report('Loading preview…');
    try {
      const document = await desktop.historyDocument(versions.value, row.index, revision);
      if (turn !== generation || !dialog.open) return;
      const truncated = document.text.length > 50000;
      preview.textContent = document.text.slice(0, 50000) || '(Empty text)';
      details.textContent = `${row.location} · ${row.characters.toLocaleString()} characters · Edited: ${formatDate(row.at)}`;
      report(truncated ? 'Preview shows the first 50,000 characters. Restoration includes the entire text.' : 'Ready to restore a new copy.');
      restore.disabled = false;
    } catch (error) {
      if (turn === generation && dialog.open) report('', error.message || String(error));
    }
  }
  async function selectSnapshot() {
    const turn = ++generation;
    clearPreview();
    rows = [];
    documents.replaceChildren();
    documents.disabled = true;
    revision = '';
    if (!versions.value) return;
    report('Loading saved texts…');
    try {
      const result = await desktop.historyContents(versions.value);
      if (turn !== generation || !dialog.open) return;
      revision = result.revision;
      rows = result.documents;
      fill(documents, rows, row => option(row.index, `${row.title || 'Untitled'} · ${row.location}`));
      documents.disabled = !rows.length;
      if (!rows.length) { report('This version contains no texts. Choose another saved version.'); return; }
      await selectDocument();
    } catch (error) {
      if (turn === generation && dialog.open) report('', error.message || String(error));
    }
  }
  async function load() {
    const turn = ++generation;
    clearPreview();
    versions.replaceChildren();
    documents.replaceChildren();
    versions.disabled = documents.disabled = true;
    refresh.disabled = true;
    report('Loading saved versions…');
    try {
      const snapshots = await desktop.historyList();
      if (turn !== generation || !dialog.open) return;
      fill(versions, snapshots, snapshot => option(snapshot.id, formatDate(snapshot.at)));
      versions.disabled = !snapshots.length;
      if (!snapshots.length) { report('No automatic backups yet. Backups are kept as you write and when you close Typelight.'); return; }
      await selectSnapshot();
    } catch (error) {
      if (turn === generation && dialog.open) report('', error.message || String(error));
    } finally { if (dialog.open && !restoring) refresh.disabled = false; }
  }
  function close() {
    if (restoring) { report('Finishing the restored copy…'); return; }
    dialog.close();
  }
  versions.addEventListener('change', selectSnapshot);
  documents.addEventListener('change', selectDocument);
  refresh.addEventListener('click', load);
  el('historyClose').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    generation++;
    if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) returnFocus.focus({ preventScroll: true });
    else document.getElementById('ta')?.focus({ preventScroll: true });
  });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  restore.addEventListener('click', async () => {
    if (restore.disabled || restoring || restored) return;
    restoring = true;
    restore.disabled = versions.disabled = documents.disabled = refresh.disabled = true;
    report('Restoring a new copy…');
    try {
      const result = await desktop.historyRestore(versions.value, Number(documents.value), revision);
      restored = result.restored;
      restore.textContent = 'Copy restored';
      if (result.saved) report('A new copy is saved in the drawer. Your current writing has not been replaced.');
      else report('', 'The copy is in the drawer but could not be saved. Close this window and export a library backup. ' + result.error);
    } catch (error) { report('', error.message || String(error)); }
    finally {
      restoring = false;
      versions.disabled = documents.disabled = refresh.disabled = false;
      restore.disabled = restored;
    }
  });
  window.typelightHistory = Object.freeze({
    async open() {
      if (dialog.open) { el('historyClose').focus(); return; }
      returnFocus = document.activeElement;
      dialog.showModal();
      await load();
    },
  });
})();
