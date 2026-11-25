(() => {
  'use strict';

  const TITLE_LIMIT = 120;
  function volumePreference(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  }
  function gainFor(volume, sound = true) {
    return sound ? .9 * volumePreference(volume) : 0;
  }
  function titleValue(value) {
    if (typeof value !== 'string') throw new Error('Enter a text name.');
    const title = value.trim().replace(/\s+/g, ' ');
    if (title.length > TITLE_LIMIT) throw new Error(`Use ${TITLE_LIMIT} characters or fewer.`);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(title)) {
      throw new Error('The name contains unsupported control characters.');
    }
    return title;
  }

  function install({ state, savePreferences, applyVolume, rename, focusWriting }) {
    const help = document.getElementById('readingHelp');
    const section = document.createElement('section');
    section.className = 'writing-options';
    section.setAttribute('aria-labelledby', 'soundOptionsTitle');
    section.innerHTML = `
      <h2 id="soundOptionsTitle">Sound</h2>
      <label class="reading-option"><input type="checkbox" id="writingSoundEnabled"> Typewriter sounds</label>
      <div class="writing-volume">
        <label for="writingVolume">Volume</label>
        <input id="writingVolume" type="range" min="0" max="100" step="1" aria-describedby="writingVolumeHelp">
        <output id="writingVolumeValue" for="writingVolume">100%</output>
      </div>
      <p id="writingVolumeHelp">Applies to the keys, carriage, bell, paper, and drawer. Muting keeps your chosen volume.</p>`;
    help.querySelector('section').after(section);

    const current = document.createElement('section');
    current.className = 'writing-options';
    current.setAttribute('aria-labelledby', 'currentTextTitle');
    current.innerHTML = `
      <h2 id="currentTextTitle">Current text</h2>
      <p id="currentTextName" class="current-text-name"></p>
      <button type="button" id="renameCurrentText">Rename current text…</button>
      <p>Press F2 while writing to rename the current text.</p>
      <p>Opening a file imports a copy into your library; editing leaves the original file unchanged. Export text saves a copy to the location you choose.</p>`;
    section.after(current);

    const dialog = document.createElement('dialog');
    dialog.id = 'renameTextDialog';
    dialog.className = 'reading-help rename-text-dialog';
    dialog.setAttribute('aria-labelledby', 'renameTextTitle');
    dialog.innerHTML = `
      <form>
        <h1 id="renameTextTitle">Name this text</h1>
        <label for="currentTitleInput">Name</label>
        <input id="currentTitleInput" type="text" maxlength="${TITLE_LIMIT}" autocomplete="off"
          spellcheck="false" aria-describedby="renameTextHint renameTextError" autofocus>
        <p id="renameTextHint">Leave the name empty to make this text untitled.</p>
        <p id="renameTextError" role="alert"></p>
        <div class="rename-text-actions">
          <button type="button" id="cancelCurrentTitle">Cancel</button>
          <button type="submit" id="saveCurrentTitle">Save name</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    const volume = section.querySelector('#writingVolume');
    const output = section.querySelector('#writingVolumeValue');
    const enabled = section.querySelector('#writingSoundEnabled');
    const name = current.querySelector('#currentTextName');
    const input = dialog.querySelector('#currentTitleInput');
    const error = dialog.querySelector('#renameTextError');
    let returnFocus = null, writingSelection = null;

    function refresh() {
      volume.value = Math.round(volumePreference(state.volume) * 100);
      output.textContent = volume.value + '%';
      enabled.checked = state.sound;
      name.textContent = state.title || 'Untitled text';
    }
    function openRename() {
      if (dialog.open) return true;
      returnFocus = document.activeElement;
      const writing = document.getElementById('ta');
      writingSelection = writing ? { value: writing.value, start: writing.selectionStart,
        end: writing.selectionEnd, direction: writing.selectionDirection } : null;
      input.value = state.title || '';
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      dialog.showModal();
      input.focus({ preventScroll: true });
      input.select();
      return true;
    }
    volume.addEventListener('input', () => {
      state.volume = volumePreference(Number(volume.value) / 100);
      applyVolume(); refresh(); savePreferences();
    });
    enabled.addEventListener('change', () => {
      state.sound = enabled.checked;
      applyVolume(); refresh(); savePreferences();
    });
    current.querySelector('#renameCurrentText').addEventListener('click', openRename);
    dialog.querySelector('#cancelCurrentTitle').addEventListener('click', () => dialog.close());
    dialog.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      try {
        const title = titleValue(input.value);
        rename(title);
        refresh();
        dialog.close();
      } catch (failure) {
        error.textContent = failure?.message || 'The name could not be saved. Try again.';
        input.setAttribute('aria-invalid', 'true');
        input.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener('close', () => {
      if (returnFocus?.isConnected && !returnFocus.closest('[inert]') && !returnFocus.disabled) {
        returnFocus.focus({ preventScroll: true });
      } else focusWriting();
      const writing = document.getElementById('ta');
      if (writingSelection && writing?.value === writingSelection.value) {
        writing.setSelectionRange(writingSelection.start, writingSelection.end, writingSelection.direction);
        writing.dispatchEvent(new Event('select'));
      }
    });
    window.addEventListener('keydown', event => {
      if (event.key === 'F2' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
          document.activeElement === document.getElementById('ta')) {
        event.preventDefault(); event.stopImmediatePropagation(); openRename();
      }
    }, true);
    refresh();
    return { refresh, command: action => action === 'renameCurrent' && openRename() };
  }

  const api = { TITLE_LIMIT, volumePreference, gainFor, titleValue, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.TypelightWritingOptions = api;
})();
