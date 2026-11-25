'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture, writing, summary } = require('./performance-fixtures.cjs');
const { LibraryStore } = require('../desktop/electron/library-store.cjs');

test('performance fixtures are deterministic valid libraries with independent document identities', () => {
  const data = fixture('small');
  const decoded = LibraryStore.decodeSnapshot(JSON.stringify({ version: 1, values: data.values }));
  assert.equal(decoded['typelight.text'].length, 10000);
  const pile = JSON.parse(decoded['typelight.drawer']).pile;
  assert.equal(pile.length, 10);
  assert.equal(new Set(pile.map(item => item.id)).size, 10);
  assert.deepEqual(fixture('small'), data);
});

test('empty fixtures and one timing sample are supported without mutating the samples', () => {
  assert.equal(writing(0), '');
  assert.deepEqual(summary([12]), { count: 1, p50: 12, p95: 12, max: 12 });
  const samples = [30, 10, 20];
  assert.deepEqual(summary(samples), { count: 3, p50: 20, p95: 30, max: 30 });
  assert.deepEqual(samples, [30, 10, 20]);
});

test('invalid fixture sizes, case names and timing samples fail explicitly', () => {
  assert.throws(() => fixture('missing'), /Unknown performance case/);
  for (const length of [-1, 1.5, NaN]) assert.throws(() => writing(length), /Invalid fixture length/);
  for (const values of [[], [-1], [NaN], [Infinity], null]) assert.throws(() => summary(values), /timing samples/);
});
