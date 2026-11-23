const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const shellTest = process.platform === 'win32' ? test.skip : test;
function build(...args) {
  return spawnSync('sh', ['tools/build-desktop.sh', ...args], { encoding: 'utf8' });
}

shellTest('build help describes the shared desktop without installing dependencies', () => {
  const result = build('--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Electron/);
  assert.match(result.stdout, /mac\|win\|linux/);
});

shellTest('rejects a universal architecture on Linux before invoking the package manager', () => {
  const result = build('--platform', 'linux', '--arch', 'universal');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Universal builds are only available for macOS/);
  assert.equal(result.stdout, '');
});

shellTest('reports missing and invalid build arguments without starting a build', () => {
  for (const args of [['--arch'], ['--platform', 'invalid'], ['--unknown']]) {
    const result = build(...args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing|Unsupported|Unknown/);
    assert.equal(result.stdout, '');
  }
});
