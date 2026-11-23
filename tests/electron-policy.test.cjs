const assert = require('node:assert/strict');
const test = require('node:test');
const { trustedFrame, validateMessage } = require('../desktop/electron/policy.cjs');

function fixture(url = 'typelight://app/index.html') {
  const frame = { url };
  const webContents = { mainFrame: frame };
  return { window: { isDestroyed: () => false, webContents }, event: { sender: webContents, senderFrame: frame } };
}

test('the writing window can hydrate and save through the approved channel', () => {
  const { window, event } = fixture();
  assert.equal(trustedFrame(event, window), true);
  assert.equal(validateMessage({ type: 'save', values: {} }).type, 'save');
  assert.equal(validateMessage({ type: 'export', name: 'Český text.txt', content: '' }).content, '');
});

test('blank main frames can only request the initial seed', () => {
  const { window, event } = fixture('');
  assert.equal(trustedFrame(event, window, true), true);
  assert.equal(trustedFrame(event, window), false);
  assert.equal(trustedFrame({ ...event, senderFrame: null }, window, true), false);
});

test('other origins, child frames, destroyed windows and malformed requests are rejected', () => {
  const { window, event } = fixture('https://example.com/');
  assert.equal(trustedFrame(event, window), false);
  assert.equal(trustedFrame({ ...event, senderFrame: { url: 'typelight://app/index.html' } }, window), false);
  assert.equal(trustedFrame(event, { ...window, isDestroyed: () => true }), false);
  assert.equal(trustedFrame(event, null), false);
  for (const message of [null, [], {}, { type: 'exec' }, { type: 'export', name: '../x', content: 2 },
    { type: 'export', name: '', content: '' }, { type: 'export', name: '\0', content: '' }]) {
    assert.throws(() => validateMessage(message));
  }
});
