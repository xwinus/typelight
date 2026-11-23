/* Selection offsets use the textarea's UTF-16 indices, including backward ranges. */
(() => {
  const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const words = new Intl.Segmenter(undefined, { granularity: 'word' });

  function range(anchor, focus, length) {
    if (![anchor, focus, length].every(Number.isSafeInteger) || length < 0) {
      throw new RangeError('Selection offsets must be finite integers and length must be non-negative.');
    }
    anchor = Math.max(0, Math.min(length, anchor));
    focus = Math.max(0, Math.min(length, focus));
    return { anchor, focus, start: Math.min(anchor, focus), end: Math.max(anchor, focus),
      direction: focus < anchor ? 'backward' : 'forward' };
  }

  function step(text, at, direction, byWord = false) {
    at = range(at, at, text.length).focus;
    if (direction !== -1 && direction !== 1) throw new RangeError('Direction must be -1 or 1.');
    const segments = byWord ? words.segment(text) : graphemes.segment(text);
    while (direction < 0 ? at > 0 : at < text.length) {
      const part = segments.containing(direction < 0 ? at - 1 : at);
      at = direction < 0 ? part.index : part.index + part.segment.length;
      if (!byWord || part.isWordLike) return at;
    }
    return at;
  }

  function boundary(text, at) {
    at = range(at, at, text.length).focus;
    const part = graphemes.segment(text).containing(at);
    if (!part || part.index === at) return at;
    const end = part.index + part.segment.length;
    return at - part.index < end - at ? part.index : end;
  }

  function wordAt(text, at) {
    at = range(at, at, text.length).focus;
    const part = words.segment(text).containing(Math.min(at, Math.max(0, text.length - 1)));
    return part ? range(part.index, part.index + part.segment.length, text.length) : range(0, 0, 0);
  }

  function copy(event, text, anchor, focus, replace, notice) {
    event.preventDefault();
    const selected = range(anchor, focus, text.length);
    if (selected.start === selected.end) return;
    try {
      if (!event.clipboardData) throw new Error('Clipboard unavailable');
      event.clipboardData.setData('text/plain', text.slice(selected.start, selected.end));
    } catch {
      notice('Could not copy — your text is unchanged');
      return;
    }
    if (event.type === 'cut') replace('');
  }

  function install({ state: S, input, room, goTo, pointAt, render, scroll, scrollCaret,
    breakUndo, composing, blocked, wake }) {
    let drag = null, frame = 0, lastPress = null;
    const current = () => range(S.anchor, S.caret, S.text.length);

    function sync() {
      if (composing()) return;
      const r = current();
      if (input.selectionStart !== r.start || input.selectionEnd !== r.end ||
          (r.start !== r.end && input.selectionDirection !== r.direction)) {
        input.setSelectionRange(r.start, r.end, r.direction);
      }
    }

    function nativeSelection() {
      if (composing() || input.value !== S.text || drag) return;
      const backward = input.selectionDirection === 'backward';
      const anchor = backward ? input.selectionEnd : input.selectionStart;
      const focus = backward ? input.selectionStart : input.selectionEnd;
      if (anchor === S.anchor && focus === S.caret) return;
      S.anchor = anchor;
      goTo(focus, false, true);
    }
    input.addEventListener('select', nativeSelection);
    input.addEventListener('focus', sync);

    function key(event, mac) {
      if (composing() || event.isComposing || event.keyCode === 229) return false;
      const { key, shiftKey: extend } = event;
      const mod = mac ? event.metaKey : event.ctrlKey;
      const word = mac ? event.altKey : event.ctrlKey;
      const line = S.lines[S.row];
      const move = (at, keepGoal = false) => { event.preventDefault(); goTo(at, keepGoal, extend); };
      if (mod && !event.altKey && key.toLowerCase() === 'a') {
        event.preventDefault(); S.anchor = 0; goTo(S.text.length, false, true); return true;
      }
      if (key.startsWith('Arrow') && S.scroll && !extend && !mod && !word && S.anchor === S.caret) {
        move(scrollCaret(), true); return true;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const direction = key === 'ArrowLeft' ? -1 : 1, r = current();
        move(!extend && r.start !== r.end ? (direction < 0 ? r.start : r.end) :
          mac && mod ? (direction < 0 ? line.s : line.e) : step(S.text, S.caret, direction, word));
      } else if (key === 'Home' || key === 'End') {
        move(key === 'Home' ? (mod ? 0 : line.s) : (mod ? S.text.length : line.e));
      } else if (key === 'ArrowUp' || key === 'ArrowDown' ||
                 (extend && (key === 'PageUp' || key === 'PageDown'))) {
        const direction = key === 'ArrowUp' || key === 'PageUp' ? -1 : 1;
        const distance = key.startsWith('Page') ? Math.max(1, Math.floor(S.vh / S.lh) - 2) : 1;
        const row = Math.max(0, Math.min(S.lines.length - 1, S.row + direction * distance));
        const target = S.lines[row];
        move(mod ? (direction < 0 ? 0 : S.text.length) :
          row === S.row ? (direction < 0 ? target.s : target.e) : Math.min(target.e, target.s + S.goal), true);
      } else if (key === 'Escape' && S.anchor !== S.caret) move(S.caret);
      else return false;
      return true;
    }

    function paint(element, line) {
      const r = current();
      const start = Math.max(line.s, r.start), end = Math.min(line.e, r.end);
      const newline = r.start <= line.e && r.end > line.e && S.text[line.e] === '\n';
      const width = Math.max(0, end - start) + (newline ? .55 : 0);
      element.classList.toggle('selected', width > 0);
      element.style.setProperty('--selection-left', Math.max(0, start - line.s) * S.chw + 'px');
      element.style.setProperty('--selection-width', width * S.chw + 'px');
    }

    function update(x, y) {
      const at = pointAt(x, y, true);
      if (at === null) return;
      if (drag.word) {
        const word = wordAt(S.text, at);
        S.anchor = at < drag.word.start ? drag.word.end : drag.word.start;
        S.caret = at < drag.word.start ? word.start : word.end;
      } else S.caret = at;
      sync(); render(); wake();
    }
    function tick() {
      if (!drag) return;
      const direction = drag.y < 55 ? 1 : drag.y > S.vh - 80 ? -1 : 0;
      const now = performance.now();
      if (direction && now - drag.scrolled > 70) {
        scroll(S.scroll + direction * S.lh);
        drag.scrolled = now;
        update(drag.x, drag.y);
      }
      frame = requestAnimationFrame(tick);
    }
    room.addEventListener('pointerdown', event => {
      if (event.button || event.pointerType === 'touch' || blocked() || composing() ||
          !event.target.closest('#desk')) return;
      const repeated = lastPress && performance.now() - lastPress.time < 500 &&
        Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) < 6;
      const at = repeated ? lastPress.at : pointAt(event.clientX, event.clientY);
      if (at === null) return;
      event.preventDefault();
      input.focus({ preventScroll: true });
      breakUndo();
      if (!event.shiftKey) S.anchor = at;
      S.caret = at;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, scrolled: 0 };
      if (repeated) {
        drag.word = wordAt(S.text, at);
        S.anchor = drag.word.start; S.caret = drag.word.end;
      }
      lastPress = repeated ? null : { at, x: event.clientX, y: event.clientY, time: performance.now() };
      room.setPointerCapture(event.pointerId);
      sync(); render(); wake();
      frame = requestAnimationFrame(tick);
    });
    room.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      if (lastPress && Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) > 3) lastPress = null;
      drag.x = event.clientX; drag.y = event.clientY;
      update(drag.x, drag.y);
    });
    function finish(event) {
      if (!drag || drag.id !== event.pointerId) return;
      drag = null;
      cancelAnimationFrame(frame);
      if (room.hasPointerCapture(event.pointerId)) room.releasePointerCapture(event.pointerId);
      goTo(S.caret, false, true);
    }
    room.addEventListener('pointerup', finish);
    room.addEventListener('pointercancel', finish);
    room.addEventListener('lostpointercapture', finish);
    return { sync, key, paint, nativeSelection };
  }

  const api = { range, step, boundary, wordAt, copy, install };
  if (typeof module !== 'undefined') module.exports = api;
  else window.TypelightSelection = api;
})();
