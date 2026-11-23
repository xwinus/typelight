const test = require('node:test');
const assert = require('node:assert/strict');
const { range, step, boundary, wordAt, copy } = require('../editor/selection.js');

test('forward and backward selections retain their active end', () => {
  assert.deepEqual(range(7, 2, 10), { anchor: 7, focus: 2, start: 2, end: 7, direction: 'backward' });
  assert.deepEqual(range(2, 7, 10), { anchor: 2, focus: 7, start: 2, end: 7, direction: 'forward' });
});

test('empty documents and stale offsets are clamped to the document', () => {
  assert.deepEqual(range(-1, 20, 0), { anchor: 0, focus: 0, start: 0, end: 0, direction: 'forward' });
  assert.equal(range(20, -4, 5).start, 0);
  assert.equal(range(20, -4, 5).end, 5);
});

test('invalid offsets fail explicitly instead of corrupting a range', () => {
  for (const value of [NaN, Infinity, .5, '2', undefined]) {
    assert.throws(() => range(value, 0, 5), RangeError);
  }
  assert.throws(() => range(0, 0, -1), RangeError);
  assert.throws(() => step('abc', 0, 0), RangeError);
});

test('arrow movement keeps emoji and combining accents intact', () => {
  const text = 'a👨‍👩‍👧‍👦e\u0301z';
  assert.equal(step(text, 1, 1), text.indexOf('e'));
  assert.equal(step(text, text.indexOf('e'), -1), 1);
  assert.equal(step(text, text.indexOf('e'), 1), text.length - 1);
  assert.equal(step(text, 0, -1), 0);
  assert.equal(step(text, text.length, 1), text.length);
  assert.equal(boundary('a😀b', 2), 3, 'Pointer and vertical movement cannot split a surrogate pair');
  assert.equal(boundary('ae\u0301b', 2), 3, 'Combining accents stay with their letter');
});

test('word selection and movement include Czech letters and skip separators', () => {
  const text = 'Příliš žluťoučký kůň.';
  assert.equal(text.slice(wordAt(text, 9).start, wordAt(text, 9).end), 'žluťoučký');
  assert.equal(step(text, 0, 1, true), 6);
  assert.equal(step(text, 7, 1, true), 16);
  assert.equal(step(text, 15, -1, true), 7);
  assert.equal(wordAt('', 0).end, 0);
});

function clipboard(type, clipboardData) {
  return { type, clipboardData, preventDefault() { this.prevented = true; } };
}

test('copy exports only the selected plain text and cut replaces it after copying', () => {
  const writes = [], changes = [];
  const data = { setData: (...args) => writes.push(args) };
  copy(clipboard('copy', data), 'one two three', 7, 4, x => changes.push(x), assert.fail);
  assert.deepEqual(writes, [['text/plain', 'two']]);
  assert.deepEqual(changes, []);
  copy(clipboard('cut', data), 'one two three', 4, 7, x => changes.push(x), assert.fail);
  assert.deepEqual(changes, ['']);
});

test('copying or cutting an empty selection leaves the clipboard and text alone', () => {
  copy(clipboard('cut', { setData: assert.fail }), 'abc', 2, 2, assert.fail, assert.fail);
});

test('clipboard errors never delete the selected text', () => {
  for (const data of [null, { setData() { throw new Error('Permission denied'); } }]) {
    const notices = [], event = clipboard('cut', data);
    copy(event, 'Keep me', 0, 7, assert.fail, x => notices.push(x));
    assert.equal(event.prevented, true);
    assert.match(notices[0], /unchanged/);
  }
});
