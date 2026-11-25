'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const TypelightDocuments = require('../editor/document-session.js');

const source = readFileSync('index.html', 'utf8');
const start = source.indexOf('let behind = false;');
const end = source.indexOf('// (before anything else the key or the click would do)', start);
assert.ok(start !== -1 && end > start, 'The production cross-tab handler must be present');

function harness() {
  const values = new Map([
    ['typelight.text', 'Saved text'], ['typelight.edited', '100'], ['typelight.title', 'Story'],
    ['typelight.document', JSON.stringify({ id: 'first', caret: 10, anchor: 10, view: 0 })],
  ]);
  const listeners = new Map(), timers = new Map();
  const state = { text: 'Saved text with pending writing', documentId: 'first', title: 'Story', at: 200 };
  let historyCleared = 0, drawerReloaded = 0, timerId = 1;
  const store = { get: key => values.get(key) };
  const persist = () => values.set('typelight.text', state.text);
  timers.set(1, persist);
  const context = {
    S: state, store, localStorage: store, DEMO: false, TypelightDocuments,
    TEXT_KEY: 'typelight.text', AT_KEY: 'typelight.edited', TITLE_KEY: 'typelight.title',
    PILE_KEY: 'typelight.drawer', DOCUMENT_KEY: 'typelight.document', PREF_KEY: 'typelight.prefs',
    window: { addEventListener: (type, callback) => listeners.set(type, callback) },
    clearTimeout: id => timers.delete(id), setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    saveTimer: 1, persist, countEl: {}, paintCount() {},
    drawer: { reload() { drawerReloaded++; } }, spread: { sync() {} },
    edits: { clear() { historyCleared++; } },
    setText(text, position) { state.text = text; state.position = position; },
    readPrefs() {}, paintPrefs() {}, accessibility: { refresh() {}, initialize() {} },
  };
  vm.runInNewContext(source.slice(start, end) + '\nglobalThis.sync = { catchUp, isBehind: () => behind };', context);
  return { state, values, timers, context,
    get historyCleared() { return historyCleared; }, get drawerReloaded() { return drawerReloaded; },
    event(key, storageArea = store) { listeners.get('storage')({ key, storageArea }); },
    catchUp: context.sync.catchUp, isBehind: context.sync.isBehind };
}

test('another tab moving its cursor preserves pending local writing and its save timer', () => {
  const h = harness();
  h.values.set('typelight.document', JSON.stringify({ id: 'first', caret: 2, anchor: 2, view: 0 }));
  h.event('typelight.document');
  assert.equal(h.isBehind(), false);
  h.catchUp();
  assert.equal(h.state.text, 'Saved text with pending writing');
  assert.equal(h.historyCleared, 0);
  assert.equal(h.timers.has(1), true);
  h.timers.get(1)();
  assert.equal(h.values.get('typelight.text'), 'Saved text with pending writing');
});

test('real external text changes invalidate stale pending saves and undo history', () => {
  const h = harness();
  h.values.set('typelight.text', 'Newer text from another tab');
  h.event('typelight.text');
  assert.equal(h.isBehind(), true);
  h.catchUp();
  assert.equal(h.state.text, 'Newer text from another tab');
  assert.equal(h.historyCleared, 1);
  assert.equal(h.timers.has(1), false);
  assert.equal(h.drawerReloaded, 1);
});

test('switching to a different document with identical text still updates identity and position', () => {
  const h = harness();
  h.state.text = 'Saved text';
  h.values.set('typelight.document', JSON.stringify({ id: 'second', caret: 2, anchor: 5, view: 0 }));
  h.event('typelight.document');
  h.event('typelight.drawer');
  h.catchUp();
  assert.equal(h.state.documentId, 'second');
  assert.equal(h.state.text, 'Saved text');
  assert.equal(h.state.position.caret, 2);
  assert.equal(h.state.position.anchor, 5);
  assert.equal(h.historyCleared, 1);
});

test('unrelated storage areas and unknown keys cannot discard pending writing', () => {
  const h = harness();
  h.event('typelight.text', {});
  h.event('unrelated.preference');
  h.catchUp();
  assert.equal(h.state.text, 'Saved text with pending writing');
  assert.equal(h.timers.has(1), true);
  assert.equal(h.historyCleared, 0);
});

test('clearing shared storage is treated as a real external library change', () => {
  const h = harness();
  h.values.clear();
  h.event(null);
  h.catchUp();
  assert.equal(h.state.text, '');
  assert.notEqual(h.state.documentId, 'first');
  assert.equal(h.historyCleared, 1);
  assert.equal(h.timers.has(1), false);
});
