/* Literal, accent-insensitive search with source ranges kept on grapheme boundaries. */
(() => {
  'use strict';

  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

  function indexed(text) {
    let value = '';
    const changes = [];
    for (const { segment, index } of segmenter.segment(text)) {
      const part = fold(segment), start = value.length;
      value += part;
      if (segment.length !== part.length || segment.length > 1) {
        changes.push({ s: index, e: index + segment.length, start, end: value.length });
      }
    }
    function source(position, end) {
      let low = 0, high = changes.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (end ? changes[middle].start < position : changes[middle].start <= position) low = middle + 1;
        else high = middle;
      }
      const span = changes[low - 1];
      if (!span) return position;
      if (position >= span.end) return span.e + position - span.end;
      return position === span.start ? span.s : null;
    }
    return { value, source };
  }

  function matches(text, query, limit = 20000) {
    if (typeof text !== 'string' || typeof query !== 'string') throw new TypeError('Search requires text and a query.');
    if (!(limit > 0)) return [];
    const q = fold(query);
    if (!q) return [];
    const { value, source } = indexed(text), hits = [];
    for (let at = value.indexOf(q); at !== -1 && hits.length < limit; at = value.indexOf(q, at + q.length)) {
      const s = source(at, false), e = source(at + q.length, true);
      if (s !== null && e !== null && s < e) hits.push({ s, e });
    }
    return hits;
  }

  function replacement(text, query, value, { all = false, index = 0 } = {}) {
    if (typeof value !== 'string') throw new TypeError('Replacement must be text.');
    const hits = matches(text, query, Infinity);
    if (!all && (!Number.isInteger(index) || index < 0 || index >= hits.length)) {
      if (!hits.length && index === 0) return { text, count: 0, caret: 0 };
      throw new RangeError('The selected match is no longer available.');
    }
    const chosen = all ? hits : hits.slice(index, index + 1);
    if (!chosen.length) return { text, count: 0, caret: 0 };
    const parts = [];
    let from = 0;
    for (const hit of chosen) {
      parts.push(text.slice(from, hit.s), value);
      from = hit.e;
    }
    parts.push(text.slice(from));
    return { text: parts.join(''), count: chosen.length, caret: chosen[0].s + value.length };
  }

  function install({ state, ta, drawer, spread, root, wake, repaint, goTo, apply }) {
    const el = id => document.getElementById(id);
    const box = el('find'), input = el('findIn'), nEl = el('findN'), more = el('findMore');
    const toggle = el('findReplaceToggle'), row = el('replaceRow'), value = el('replaceIn');
    const one = el('replaceOne'), all = el('replaceAll'), status = el('replaceStatus');
    let open = false, replacing = false, hits = [], cur = -1, inDrawer = 0;
    let cached = { text: null, query: null, hits: [] };
    function search() {
      if (cached.text !== state.text || cached.query !== input.value) {
        cached = { text: state.text, query: input.value, hits: matches(state.text, input.value) };
      }
      hits = cached.hits;
      inDrawer = drawer.seek(open ? fold(input.value) : null, input.value);
    }
    function paint() {
      state.found = open && hits.length ? { hits, cur } : null;
      repaint();
      nEl.textContent = !fold(input.value) ? '' : hits.length ? `${cur + 1} of ${hits.length}${hits.length === 20000 ? '+' : ''}` : 'Not in this text';
      more.hidden = !fold(input.value) || !inDrawer;
      more.textContent = `${drawer.open ? '' : 'also in '}${inDrawer === 1 ? 'one text' : inDrawer + ' texts'} in the drawer`;
      more.disabled = drawer.open;
      one.disabled = all.disabled = !hits.length || drawer.open || ta.disabled;
      row.hidden = !replacing;
      toggle.setAttribute('aria-expanded', String(replacing));
    }
    const near = () => { const i = hits.findIndex(hit => hit.s >= state.caret); return i < 0 ? 0 : i; };
    function to(index) {
      if (!hits.length) return;
      cur = (index + hits.length) % hits.length;
      paint();
      if (!drawer.open) goTo(hits[cur].s);
    }
    function start(replace = false) {
      if (spread.open) spread.set(false);
      open = true;
      replacing = replace || replacing;
      box.hidden = false;
      root.classList.add('finding');
      el('bFind').setAttribute('aria-expanded', 'true');
      search(); cur = hits.length ? near() : -1; paint();
      wake();
      input.focus({ preventScroll: true }); input.select();
    }
    function close(refocus = true) {
      if (!open) return;
      open = false;
      box.hidden = true;
      root.classList.remove('finding');
      el('bFind').setAttribute('aria-expanded', 'false');
      hits = []; cur = -1;
      drawer.seek(null);
      state.found = null; repaint();
      if (refocus) ta.focus({ preventScroll: true });
    }
    function replace(allMatches) {
      if (drawer.open || ta.disabled || !hits.length) return;
      try {
        const result = replacement(state.text, input.value, value.value.replace(/\t/g, '    '), { all: allMatches, index: Math.max(0, cur) });
        if (!result.count) return;
        const focused = document.activeElement;
        if (apply(result) === false) {
          status.textContent = 'Nothing changed: the replacement would exceed the library storage limit.';
          return;
        }
        start(true);
        if (focused?.isConnected && !focused.disabled) focused.focus({ preventScroll: true });
        status.textContent = `Replaced ${result.count === 1 ? 'one occurrence' : result.count + ' occurrences'}. Undo restores this change.`;
      } catch (error) { status.textContent = 'Could not replace: ' + error.message; }
    }
    input.addEventListener('input', () => {
      status.textContent = '';
      search(); cur = hits.length ? near() : -1; paint();
      if (hits.length && !drawer.open) goTo(hits[cur].s);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); to(cur + (event.shiftKey ? -1 : 1)); }
    });
    box.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    });
    value.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); replace(false); }
    });
    toggle.addEventListener('click', () => {
      replacing = !replacing; paint();
      if (replacing) value.focus({ preventScroll: true });
    });
    one.addEventListener('click', () => replace(false));
    all.addEventListener('click', () => replace(true));
    el('findClose').addEventListener('click', () => close());
    more.addEventListener('pointerdown', event => event.preventDefault());
    more.addEventListener('click', () => { if (!drawer.open) drawer.set(true); });
    return {
      get open() { return open; },
      has: node => box.contains(node), start, close,
      step(direction) { if (!open) start(); else to(cur + direction); },
      refresh() {
        if (!open) return;
        search(); cur = hits.length ? near() : -1; paint();
      },
      sync() { if (open) paint(); },
    };
  }

  const api = Object.freeze({ fold, matches, replacement, install });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.TypelightFind = api;
})();
