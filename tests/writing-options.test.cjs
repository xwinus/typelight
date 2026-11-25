'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { volumePreference, gainFor, titleValue, TITLE_LIMIT } = require('../editor/writing-options.js');

test('volume scales the shared sound gain without changing the chosen mute level', () => {
  assert.equal(volumePreference(.35), .35);
  assert.equal(gainFor(.35), .315);
  assert.equal(gainFor(.35, false), 0);
  assert.equal(gainFor(.35, true), .315);
});

test('volume accepts silence and maximum volume and clamps out-of-range settings', () => {
  assert.equal(gainFor(0), 0);
  assert.equal(gainFor(1), .9);
  assert.equal(volumePreference(-1), 0);
  assert.equal(volumePreference(2), 1);
});

test('invalid and legacy volume preferences use the existing full-volume default', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, '0.2', {}, []]) {
    assert.equal(volumePreference(value), 1);
    assert.equal(gainFor(value, false), 0);
  }
});

test('current document titles preserve Unicode and normalize surrounding whitespace', () => {
  assert.equal(titleValue('  Příběh   na\nvečer 🐎  '), 'Příběh na večer 🐎');
});

test('empty and maximum-length titles remain valid', () => {
  assert.equal(titleValue(' \n\t '), '');
  assert.equal(titleValue('x'.repeat(TITLE_LIMIT)).length, TITLE_LIMIT);
});

test('invalid title inputs fail explicitly without silent truncation', () => {
  for (const value of [undefined, null, 42, {}, []]) assert.throws(() => titleValue(value), /Enter a text name/);
  assert.throws(() => titleValue('x'.repeat(TITLE_LIMIT + 1)), /120 characters/);
  assert.throws(() => titleValue('Name\u0000suffix'), /control characters/);
});
