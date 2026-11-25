/* Document positions persist; undo history stays bounded in memory for this session. */
(() => {
  'use strict';
  const selection = typeof module !== 'undefined' && module.exports ? require('./selection.js') : globalThis.TypelightSelection;

  function newId() {
    return globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  function position(text, saved) {
    const offset = (value, fallback) => Number.isSafeInteger(value) && value >= 0
      ? selection.boundary(text, Math.min(value, text.length)) : fallback;
    const caret = offset(saved?.caret, text.length);
    return { anchor: offset(saved?.anchor, caret), caret, view: offset(saved?.view, caret) };
  }

  function metadata(text, saved) {
    let data;
    try { data = typeof saved === 'string' ? JSON.parse(saved) : saved; } catch { /* recover positions independently of text */ }
    return { id: typeof data?.id === 'string' && data.id ? data.id : newId(), ...position(text, data) };
  }

  function createHistory(read, apply, { maxSteps = 500, maxCharacters = 20_000_000, maxDocuments = 32 } = {}) {
    const documents = new Map();
    let active = null, replaying = false;
    const current = () => {
      if (!active) select(newId(), read().text);
      return documents.get(active);
    };
    function select(id, text) {
      if (typeof id !== 'string' || !id || typeof text !== 'string') throw new TypeError('Invalid document identity.');
      let history = documents.get(id);
      if (!history || history.text !== text) history = { text, back: [], fwd: [], run: null };
      history.run = null;
      documents.delete(id);
      documents.set(id, history);
      active = id;
      prune();
    }
    function prune() {
      while (documents.size > Math.max(1, maxDocuments)) documents.delete(documents.keys().next().value);
      let characters = 0;
      for (const history of documents.values()) {
        while (history.back.length > maxSteps) history.back.shift();
        while (history.fwd.length > maxSteps) history.fwd.shift();
        characters += history.text.length + [...history.back, ...history.fwd].reduce((n, item) => n + item.text.length, 0);
      }
      for (const [id, history] of documents) {
        if (characters <= maxCharacters) break;
        for (const stack of [history.back, history.fwd]) {
          while (stack.length && characters > maxCharacters) characters -= stack.shift().text.length;
        }
        if (id !== active && characters > maxCharacters) {
          characters -= history.text.length;
          documents.delete(id);
        }
      }
    }
    function note(before, caret, after, at, anchor = caret) {
      if (replaying || before === after) return;
      const history = current();
      const least = Math.min(before.length, after.length);
      let p = 0, q = 0;
      while (p < least && before.charCodeAt(p) === after.charCodeAt(p)) p++;
      while (q < least - p && before.charCodeAt(before.length - 1 - q) === after.charCodeAt(after.length - 1 - q)) q++;
      const del = before.length - p - q, add = after.length - p - q;
      const kind = add && !del ? 'type' : del && !add ? 'rub' : 'other';
      const run = history.run;
      const continues = anchor === caret && run && kind === run.kind && (
        kind === 'type' ? at - add === run.at && after[at - add] !== '\n' :
        kind === 'rub' ? at + del === run.at || at === run.at : false);
      if (!continues) history.back.push({ text: before, caret, anchor });
      history.text = after;
      history.fwd = [];
      history.run = anchor === caret ? { kind, at } : null;
      prune();
    }
    function step(fromKey, toKey) {
      const history = current(), from = history[fromKey], to = history[toKey];
      if (!from.length) return false;
      const next = from[from.length - 1], before = read();
      history.run = null;
      replaying = true;
      try { apply(next); }
      finally { replaying = false; }
      from.pop();
      to.push({ text: before.text, caret: before.caret, anchor: before.anchor });
      history.text = next.text;
      prune();
      return true;
    }
    return {
      select, note,
      break() { current().run = null; },
      undo: () => step('back', 'fwd'), redo: () => step('fwd', 'back'),
      reset() { if (active) documents.delete(active); active = null; },
      clear() { documents.clear(); active = null; },
    };
  }

  const api = { newId, position, metadata, createHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.TypelightDocuments = api;
})();
