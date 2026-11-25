'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const html = readFileSync('index.html', 'utf8');

function section(start, end, offset = 0) {
  const from = html.indexOf(start, offset), to = html.indexOf(end, from);
  assert.ok(from >= 0 && to > from, 'The production drawer code must be present');
  return html.slice(from, to);
}

function node() {
  const classes = new Set(), attributes = new Map(), parts = new Map();
  return {
    dataset: {}, style: { setProperty() {} }, children: [],
    classList: { contains: value => classes.has(value),
      toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); } },
    setAttribute: (name, value) => attributes.set(name, value), getAttribute: name => attributes.get(name),
    set innerHTML(value) {
      for (const part of ['note', 'body', 'slip']) parts.set('.' + part, node());
      parts.get('.note').textContent = value.match(/<span class="note">([^<]*)<\/span>/)?.[1] || '';
    },
    set textContent(value) { this.content = value; this.children = []; },
    get textContent() { return this.content || ''; },
    querySelector: selector => parts.get(selector),
    appendChild(child) { this.children.push(child); child.parent = this; },
    replaceWith(replacement) {
      this.parent.children[this.parent.children.indexOf(this)] = replacement;
      replacement.parent = this.parent;
    },
  };
}

function drawer(sheets) {
  const pile = node(), notes = [], pages = [];
  let lightSizes = 0;
  const context = { sheets, pile, bin: [], binEl: node(), root: node(), open: false, sought: false,
    S: { dl: 100, vw: 1000, dw: 700, drop: 400, vh: 800, hud: 50 },
    document: { createElement: node }, seedOf: () => 1, hash: () => .5, esc: value => value,
    TypelightAccessibility: { documentName: sheet => sheet.title || sheet.text },
    sheetsOf: sheet => { pages.push(sheet.id); return sheet.pages || 1; },
    noteOf: sheet => { notes.push(sheet.id); return sheet.text; },
    drawerLight: { size() { lightSizes++; } }, marks() {}, paintHint() {}, paintCount() {},
  };
  vm.runInNewContext(section('  const CLIP = ', '  /* ---- taking a sheet out'), context);
  return { context, pile, notes, pages, get lightSizes() { return lightSizes; } };
}

test('drawer rendering computes each leaf note once and keeps accessibility descriptions intact', () => {
  const h = drawer([{ id: 'one', text: 'First', title: 'Named' }, { id: 'two', text: 'Second', pages: 2 }]);
  h.context.render();
  assert.deepEqual(h.notes, ['one', 'two']);
  assert.deepEqual(h.pages, ['one', 'two']);
  assert.equal(h.pile.children.length, 3);
  const leaf = h.pile.children[1], note = leaf.querySelector('.note');
  assert.equal(leaf.getAttribute('aria-label'), 'Named');
  assert.equal(leaf.getAttribute('aria-describedby'), note.id);
  assert.equal(leaf.querySelector('.body').getAttribute('aria-hidden'), 'true');
  assert.equal(h.pile.children[2].classList.contains('thick'), true);
  assert.equal(h.lightSizes, 1);
});

test('standalone drawer arrangement still refreshes changed notes and thickness', () => {
  const sheets = [{ id: 'one', text: 'First' }, { id: 'two', text: 'Second' }];
  const h = drawer(sheets);
  h.context.render();
  const first = h.pile.children[1], second = h.pile.children[2];
  sheets[0].text = 'Updated'; sheets[1].pages = 2;
  h.context.arrange();
  assert.equal(first.querySelector('.note').textContent, 'Updated');
  assert.equal(h.pile.children[1], first);
  assert.notEqual(h.pile.children[2], second);
  assert.equal(h.pile.children[2].classList.contains('thick'), true);
});

test('arrangement skips stale IDs and preserves first-match behavior for duplicate stored IDs without linear searches', () => {
  const sheets = [{ id: 'one', text: 'First' }, { id: 'one', text: 'Duplicate' }];
  const h = drawer(sheets);
  h.context.render();
  h.pile.children[2].dataset.id = 'missing';
  sheets.find = () => { throw new Error('Repeated linear searches are not allowed'); };
  h.notes.length = 0;
  h.context.arrange();
  assert.deepEqual(h.notes, ['one']);
  assert.equal(h.pile.children[1].querySelector('.note').textContent, 'First');
  assert.equal(h.pile.children[2].querySelector('.note').textContent, 'Duplicate');
});

test('date labels reuse formatters and preserve current-year, older-year and invalid-date output', () => {
  let constructions = 0;
  const context = { Intl: { DateTimeFormat: function (...args) {
    constructions++; return new Intl.DateTimeFormat(...args);
  } } };
  vm.runInNewContext(section('  const dayFormat = ', '\n  function load()'), context);
  const year = new Date().getFullYear();
  for (const selectedYear of [year, year - 1, year + 1]) {
    const date = new Date(selectedYear, 5, 12, 12), options = { day: 'numeric', month: 'short' };
    if (selectedYear !== year) options.year = 'numeric';
    assert.equal(context.day(date.getTime()), date.toLocaleDateString('en-GB', options));
    context.day(date.getTime());
  }
  assert.equal(context.day(undefined), 'Invalid Date');
  assert.equal(context.day('not a date'), 'Invalid Date');
  assert.equal(constructions, 2);
});

function light() {
  const calls = { writes: 0, viewports: [], wakes: 0 };
  let width = 0, height = 0;
  const canvas = {
    get width() { return width; }, set width(value) { width = value; calls.writes++; },
    get height() { return height; }, set height(value) { height = value; calls.writes++; },
  };
  const context = { cv: canvas, el: { offsetWidth: 400, offsetHeight: 300 },
    gl: { viewport: (...args) => calls.viewports.push(args) }, window: { devicePixelRatio: 1 },
    wake: () => calls.wakes++, w: 0, h: 0 };
  vm.runInNewContext(section('  function size() {', '  // Where the sheets are right now',
    html.indexOf('const drawerLight =')), context);
  return { context, calls, canvas };
}

test('unchanged drawer light dimensions preserve the canvas while still scheduling repaint', () => {
  const h = light();
  h.context.size(); h.context.size();
  assert.equal(h.calls.writes, 2);
  assert.deepEqual(h.calls.viewports, [[0, 0, 400, 300]]);
  assert.equal(h.calls.wakes, 2);
});

test('drawer light resizes on dimensions and density changes with the existing density cap', () => {
  const h = light();
  h.context.size();
  h.context.el.offsetWidth = 500; h.context.size();
  h.context.window.devicePixelRatio = 3; h.context.size();
  assert.deepEqual(h.calls.viewports, [[0, 0, 400, 300], [0, 0, 500, 300], [0, 0, 1000, 600]]);
  assert.equal(h.canvas.width, 1000);
  assert.equal(h.canvas.height, 600);
});

test('missing WebGL or an invisible drawer does not allocate a canvas or schedule rendering', () => {
  const h = light();
  const gl = h.context.gl;
  h.context.gl = null; h.context.size();
  h.context.gl = gl; h.context.el.offsetHeight = 0; h.context.size();
  assert.equal(h.calls.writes, 0);
  assert.equal(h.calls.wakes, 0);
  assert.deepEqual(h.calls.viewports, []);
});
