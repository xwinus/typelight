'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { position, metadata, createHistory } = require('../editor/document-session.js');

test('document metadata preserves identity, backward selection and reading position', () => {
  const saved = { id: 'story', anchor: 8, caret: 3, view: 0 };
  assert.deepEqual(metadata('A long story', JSON.stringify(saved)), saved);
});

test('legacy documents default to their end and stale positions clamp to grapheme boundaries', () => {
  assert.deepEqual(position('', null), { anchor: 0, caret: 0, view: 0 });
  assert.deepEqual(position('a😀b', { anchor: 2, caret: 99, view: 2 }), { anchor: 3, caret: 4, view: 3 });
  assert.equal(position('ae\u0301b', { caret: 2 }).caret, 3);
  assert.notEqual(metadata('text').id, metadata('text').id);
});

test('invalid or corrupted position data never damages text or creates invalid offsets', () => {
  for (const input of ['{bad', 'null', '[]', '{"id":12,"anchor":-1,"caret":0.5,"view":"bad"}']) {
    const result = metadata('Keep me', input);
    assert.equal(typeof result.id, 'string');
    assert.deepEqual(position('Keep me', result), { anchor: 7, caret: 7, view: 7 });
  }
});

function harness(options) {
  let state = { text: '', caret: 0, anchor: 0 }, fail = false;
  const history = createHistory(() => ({ ...state }), next => {
    if (fail) throw new Error('Editor unavailable');
    state = { ...next };
  }, options);
  return { history, get state() { return state; },
    select(id, text) { state = { text, caret: text.length, anchor: text.length }; history.select(id, text); },
    edit(text) { history.note(state.text, state.caret, text, text.length, state.anchor);
      state = { text, caret: text.length, anchor: text.length }; },
    fail(value) { fail = value; } };
}

test('switching between documents preserves separate undo and redo stacks', () => {
  const h = harness();
  h.select('first', 'One'); h.edit('One more');
  h.select('second', 'Two'); h.edit('Two words');
  h.select('first', 'One more');
  assert.equal(h.history.undo(), true);
  assert.equal(h.state.text, 'One');
  h.select('second', 'Two words'); h.history.undo();
  assert.equal(h.state.text, 'Two');
  h.select('first', 'One'); h.history.redo();
  assert.equal(h.state.text, 'One more');
});

test('identical text in different documents does not share undo and externally changed text invalidates it', () => {
  const h = harness();
  h.select('one', 'Same'); h.edit('Same text');
  h.select('two', 'Same text');
  assert.equal(h.history.undo(), false);
  h.select('one', 'External edit');
  assert.equal(h.history.undo(), false);
  assert.equal(h.state.text, 'External edit');
});

test('grouped typing and backward selections are restored within the active document', () => {
  const h = harness();
  h.select('first', ''); h.edit('a'); h.edit('ab'); h.edit('abc');
  h.history.undo(); assert.equal(h.state.text, '');
  const history = createHistory(() => ({ text: 'changed', caret: 7, anchor: 7 }), value => {
    assert.deepEqual(value, { text: 'original', caret: 1, anchor: 5 });
  });
  history.select('backward', 'original');
  history.note('original', 1, 'changed', 7, 5);
  history.undo();
});

test('undo errors retain the step for retry and clear discards all session history', () => {
  const h = harness();
  h.select('first', 'Original'); h.edit('Updated'); h.fail(true);
  assert.throws(() => h.history.undo(), /Editor unavailable/);
  h.fail(false); h.history.undo(); assert.equal(h.state.text, 'Original');
  h.history.clear(); h.select('first', 'Original');
  assert.equal(h.history.redo(), false);
  assert.throws(() => h.history.select('', 'text'), /Invalid document identity/);
});

test('undo memory and document bounds evict old history without altering current writing', () => {
  const h = harness({ maxDocuments: 1, maxCharacters: 10 });
  h.select('one', 'First'); h.edit('First edit');
  assert.equal(h.history.undo(), false);
  assert.equal(h.state.text, 'First edit');
  h.select('two', ''); h.edit('Second');
  h.select('one', 'First edit');
  assert.equal(h.history.undo(), false);
});
