'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fold, matches, replacement } = require('../editor/find.js');

test('search ignores case and Czech accents while retaining source ranges', () => {
  assert.equal(fold('ŽIVOT příběh'), 'zivot pribeh');
  assert.deepEqual(matches('Život a ŽIVOT', 'zivot'), [{ s: 0, e: 5 }, { s: 8, e: 13 }]);
});

test('decomposed accents and emoji keep exact ranges and complete graphemes', () => {
  const text = '💡 e\u0301 and É';
  assert.deepEqual(matches(text, 'e'), [{ s: 3, e: 5 }, { s: 10, e: 11 }]);
  assert.deepEqual(matches('👨‍👩‍👧‍👦 family', '👩'), []);
  assert.deepEqual(matches('👨‍👩‍👧‍👦 family', 'family'), [{ s: 12, e: 18 }]);
  assert.deepEqual(matches('a\u0301e\u0301', 'ae'), [{ s: 0, e: 4 }]);
});

test('empty and combining-only queries have no matches and nonoverlapping hits are bounded', () => {
  assert.deepEqual(matches('Text', ''), []);
  assert.deepEqual(matches('Text', '\u0301'), []);
  assert.deepEqual(matches('aaaaa', 'aa'), [{ s: 0, e: 2 }, { s: 2, e: 4 }]);
  assert.equal(matches('a '.repeat(5), 'a', 2).length, 2);
});

test('invalid search inputs fail explicitly', () => {
  assert.throws(() => matches(null, 'x'), TypeError);
  assert.throws(() => matches('text', undefined), TypeError);
});

test('contextual lowercase forms match the same word in uppercase and lowercase', () => {
  assert.deepEqual(matches('ΟΣ ος', 'ΟΣ'), [{ s: 0, e: 2 }, { s: 3, e: 5 }]);
});

test('replace one changes only the selected occurrence with a literal replacement', () => {
  const result = replacement('cat cat cat', 'cat', '$&', { index: 1 });
  assert.deepEqual(result, { text: 'cat $& cat', count: 1, caret: 6 });
});

test('replace all uses literal dollar sequences and replaces complete decomposed characters', () => {
  assert.deepEqual(replacement('e\u0301 and É', 'e', "$1$&$`", { all: true }), {
    text: "$1$&$` and $1$&$`", count: 2, caret: 6,
  });
  assert.equal(replacement('word word', 'word', '', { all: true }).text, ' ');
});

test('replace all includes matches beyond the display limit and handles no matches', () => {
  const result = replacement('a '.repeat(20001), 'a', 'b', { all: true });
  assert.equal(result.count, 20001);
  assert.equal(result.text, 'b '.repeat(20001));
  assert.deepEqual(replacement('Text', 'missing', 'new'), { text: 'Text', count: 0, caret: 0 });
  assert.deepEqual(replacement('Text', '', 'new', { all: true }), { text: 'Text', count: 0, caret: 0 });
});

test('stale selections and invalid replacement values fail before producing a changed document', () => {
  assert.throws(() => replacement('text', 'text', null), TypeError);
  for (const index of [-1, 1, NaN, 0.5]) {
    assert.throws(() => replacement('text', 'text', 'new', { index }), RangeError);
  }
});
