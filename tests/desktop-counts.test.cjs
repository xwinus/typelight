const assert = require('node:assert/strict');
const test = require('node:test');
const { countLabel, summarize } = require('../desktop/web/counts.js');

test('the editor shows words and the drawer shows texts, with an exact library summary', () => {
  const stats = { words: 21, texts: 12, libraryWords: 8420 };
  assert.deepEqual(summarize(stats), { label: '21 words', title: '21 words', librarySummary: '12 texts · 8,420 words' });
  assert.deepEqual(summarize({ ...stats, drawer: true }), {
    label: '12 texts', title: '12 texts · 8,420 words', librarySummary: '12 texts · 8,420 words',
  });
});

test('empty and singular counts stay explicit without sentences or ellipses', () => {
  assert.equal(countLabel(0, 'text'), '0 texts');
  assert.equal(countLabel(1, 'text'), '1 text');
  assert.equal(countLabel(1, 'word'), '1 word');
  assert.equal(summarize({ words: 0, texts: 0, libraryWords: 0 }).label, '0 words');
});

test('large counts are compact while hover text keeps the exact number', () => {
  const display = summarize({ words: 12401, texts: 1, libraryWords: 12401 });
  assert.equal(display.label, '12.4k words');
  assert.equal(display.title, '12,401 words');
  assert.equal(countLabel(999, 'word', true), '999 words');
  assert.equal(countLabel(1000, 'word', true), '1k words');
  assert.equal(countLabel(999999, 'word', true), '1m words');
});

test('invalid statistics fail explicitly rather than displaying a misleading zero', () => {
  for (const value of [-1, 1.5, NaN, Infinity, '21', undefined, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => countLabel(value, 'word', true), RangeError);
  }
  assert.throws(() => summarize({ words: 10, texts: 1, libraryWords: -1 }), RangeError);
});
