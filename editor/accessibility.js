(() => {
  const ZOOM_STEPS = [.75, 1, 1.25, 1.5, 1.75, 2];
  function preferences(value) {
    const p = value && typeof value === 'object' ? value : {};
    return { reading: p.reading === true, zoom: ZOOM_STEPS.includes(p.zoom) ? p.zoom : 1 };
  }
  function nextZoom(current, action) {
    if (!['zoomIn', 'zoomOut', 'zoomReset'].includes(action)) throw new Error('Unknown zoom action.');
    if (action === 'zoomReset') return 1;
    const index = ZOOM_STEPS.indexOf(preferences({ zoom: current }).zoom);
    return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + (action === 'zoomIn' ? 1 : -1)))];
  }
  function documentName(sheet) {
    const clean = text => typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
    const name = clean(sheet?.title) || clean(sheet?.text) || 'Untitled text';
    return name.length > 64 ? name.slice(0, 61).trimEnd() + '…' : name;
  }
  function saveAnnouncements() {
    let lastError = '', recovering = false;
    return (error, saving) => {
      error = typeof error === 'string' ? error : '';
      let alert = '', status = '';
      if (error && error !== lastError) alert = 'Your text could not be saved. Export a copy. ' + error;
      if (error) recovering = true;
      else if (recovering && !saving) { status = 'Your writing is saved again.'; recovering = false; }
      lastError = error;
      return { alert, status };
    };
  }

  function install({ state, save, measure, desktop, demo = false, focusWriting, changed = () => {} }) {
    const root = document.documentElement;
    const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
    const mod = mac ? '⌘' : 'Ctrl';
    const button = document.createElement('button');
    button.id = 'bHelp'; button.className = 'reading-help-button'; button.type = 'button';
    button.textContent = '?';
    button.setAttribute('aria-label', 'Reading & keyboard help');
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'readingHelp');
    button.dataset.help = 'Reading options and keyboard shortcuts (F1)';
    const dialog = document.createElement('dialog');
    dialog.id = 'readingHelp'; dialog.className = 'reading-help';
    dialog.setAttribute('aria-labelledby', 'readingHelpTitle');
    dialog.innerHTML = `
      <div class="reading-help-heading"><h1 id="readingHelpTitle">Make yourself comfortable</h1>
        <button type="button" id="closeHelp" aria-label="Close reading and keyboard help" autofocus>Close</button></div>
      <p class="reading-help-intro">A few ways to make Typelight easier to read and use.</p>
      <section aria-labelledby="readingOptionsTitle"><h2 id="readingOptionsTitle">Reading</h2>
        <label class="reading-option"><input type="checkbox" id="readingMode"> Even reading light</label>
        <p>Light the whole sheet evenly, with crisp ink and a clear selection. Keep the desk and paper.</p>
        <div class="reading-zoom"><span id="zoomLabel">${desktop ? 'Interface size' : 'Text size'}</span>
          <div role="group" aria-labelledby="zoomLabel">
            <button type="button" id="zoomOut" aria-label="Decrease size">−</button>
            <output id="zoomValue" aria-live="polite">100%</output>
            <button type="button" id="zoomIn" aria-label="Increase size">+</button>
            <button type="button" id="zoomReset">Reset</button>
          </div></div>
        <p id="readingFeedback" role="status"></p>
      </section>
      <section aria-labelledby="writingKeysTitle"><h2 id="writingKeysTitle">Writing & selection</h2>
        <dl><dt>Select text</dt><dd>Drag, double-click a word, or hold Shift with the arrow keys. Shift-click extends a selection.</dd>
          <dt>Copy / cut / paste</dt><dd>${mod}+C / X / V</dd>
          <dt>Select all / undo</dt><dd>${mod}+A / ${mod}+Z</dd>
          <dt>Indent with four spaces</dt><dd>${mod}+]</dd>
          <dt>Move between controls</dt><dd>Tab / Shift+Tab. Enter or Space activates a button. F6 switches between writing and tools.</dd></dl>
      </section>
      <section aria-labelledby="drawerKeysTitle"><h2 id="drawerKeysTitle">Your texts</h2>
        <p>New text puts your current draft in the drawer. Open the drawer to return to another draft.</p>
        <dl><dt>Browse / open</dt><dd>Up and Down / Enter</dd>
          <dt>Rename</dt><dd>F2 on a saved text, or click its name slip.</dd>
          <dt>Move to the floor / reorder</dt><dd>Delete / Alt+Up or Alt+Down. A crumpled text can be restored from the floor.</dd>
          <dt>Return to writing</dt><dd>Escape</dd></dl>
        <p>${demo ? 'This demo does not save your drafts.' : desktop ? 'Your drafts save automatically on this device.' : 'Your drafts save automatically in this browser.'} Export text… creates a separate .txt file; Back up library exports all your drafts.</p>
      </section>`;
    document.body.append(button, dialog);
    let returnFocus = null, zooming = Promise.resolve();
    const get = id => dialog.querySelector('#' + id);
    function sync() {
      root.classList.toggle('reading-mode', state.reading);
      get('readingMode').checked = state.reading;
      get('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
      get('zoomOut').disabled = state.zoom <= ZOOM_STEPS[0];
      get('zoomIn').disabled = state.zoom >= ZOOM_STEPS.at(-1);
      if (!desktop) root.style.setProperty('--text-scale', state.zoom);
      else root.style.setProperty('--ui-zoom', state.zoom);   // window chrome keeps its native size
      changed();
    }
    async function zoom(action, initial = false) {
      const value = initial ? state.zoom : nextZoom(state.zoom, action);
      try {
        if (desktop) await desktop.zoom(value);
        state.zoom = value;
        sync(); measure();
        if (!initial) save();
        get('readingFeedback').textContent = '';
      } catch {
        get('readingFeedback').textContent = 'Could not change the size. Your text is unchanged.';
      }
    }
    function command(action) {
      if (action === 'help') {
        if (!dialog.open) { returnFocus = document.activeElement; dialog.showModal(); }
        return true;
      }
      if (action === 'readingMode') {
        state.reading = !state.reading; sync(); save(); return true;
      }
      if (['zoomIn', 'zoomOut', 'zoomReset'].includes(action)) {
        zooming = zooming.then(() => zoom(action)); return zooming;
      }
      return false;
    }
    button.addEventListener('click', () => command('help'));
    get('closeHelp').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected && !returnFocus.closest('[inert]') && !returnFocus.disabled) returnFocus.focus({ preventScroll: true });
      else focusWriting();
    });
    get('readingMode').addEventListener('change', () => command('readingMode'));
    for (const action of ['zoomIn', 'zoomOut', 'zoomReset']) get(action).addEventListener('click', () => command(action));
    window.addEventListener('keydown', event => {
      if (event.key === 'F1') { event.preventDefault(); event.stopImmediatePropagation(); command('help'); return; }
      const modKey = mac ? event.metaKey : event.ctrlKey;
      const action = modKey && !event.altKey && ({ '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', '0': 'zoomReset' })[event.key];
      if (action) { event.preventDefault(); event.stopImmediatePropagation(); command(action); }
    }, true);
    sync();
    return { command, refresh: sync, initialize: () => zoom(null, true) };
  }

  const api = { preferences, nextZoom, documentName, saveAnnouncements, install };
  if (typeof module !== 'undefined') module.exports = api;
  else window.TypelightAccessibility = api;
})();
