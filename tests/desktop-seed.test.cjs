'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('desktop/electron/preload.cjs', 'utf8');

function load(seed) {
  let host;
  vm.runInNewContext(source, { process: { platform: 'test' }, require: name => {
    assert.equal(name, 'electron');
    return { contextBridge: { exposeInMainWorld(name, value) { assert.equal(name, 'typelightHost'); host = value; } },
      ipcRenderer: { sendSync: () => seed, invoke: async () => true } };
  } });
  return host;
}

test('desktop hydration transfers existing writing once without retaining a public seed copy', () => {
  const host = load({ 'typelight.text': 'Český text', 'typelight.drawer': 'Library' });
  assert.equal(host.takeSeed()['typelight.text'], 'Český text');
  assert.equal(host.takeSeed(), null);
  assert.equal(host.seed, undefined);
  assert.equal(host.saveChanges, true);
});

test('empty first-launch data remains an empty library after one-time hydration', () => {
  const host = load({});
  assert.deepEqual(host.takeSeed(), {});
  assert.equal(host.takeSeed(), null);
});

test('failure to obtain the trusted seed stops preload rather than exposing partial data', () => {
  assert.throws(() => vm.runInNewContext(source, { require: () => ({
    ipcRenderer: { sendSync() { throw new Error('Host unavailable'); } }, contextBridge: {},
  }) }), /Host unavailable/);
});
