'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { desktopMatrix } = require('../tools/desktop-matrix.cjs');

test('manual builds select only the requested platform and keep both Mac architectures', () => {
  for (const platform of ['mac', 'win', 'linux']) {
    const targets = desktopMatrix('workflow_dispatch', platform).include;
    assert.equal(targets.length, platform === 'mac' ? 2 : 1);
    assert.ok(targets.every(target => target.target === platform));
  }
  assert.deepEqual(desktopMatrix('workflow_dispatch', 'mac').include.map(target => target.arch), ['arm64', 'x64']);
});

test('tag builds always cover all platforms even if a platform input is supplied', () => {
  const targets = desktopMatrix('push', 'linux').include;
  assert.equal(targets.length, 4);
  assert.deepEqual([...new Set(targets.map(target => target.target))], ['mac', 'win', 'linux']);
  assert.deepEqual(desktopMatrix('workflow_dispatch').include, targets);
});

test('invalid events and platform inputs fail instead of creating unintended builds', () => {
  assert.throws(() => desktopMatrix('pull_request'), /Unsupported desktop build event/);
  assert.throws(() => desktopMatrix(undefined), /Unsupported desktop build event/);
  assert.throws(() => desktopMatrix('workflow_dispatch', 'windows'), /Unsupported desktop platform/);
  assert.throws(() => desktopMatrix('workflow_dispatch', ''), /Unsupported desktop platform/);
});
