const test = require('node:test');
const assert = require('node:assert/strict');
const { surfaceSize, createRenderer } = require('../editor/metal.js');

test('metal surface uses a crisp Retina buffer for the narrow rail', () => {
  assert.deepEqual(surfaceSize(1000, 10, 2, 8192), { width: 2000, height: 20 });
});
test('metal surface respects GPU limits and keeps tiny buffers usable', () => {
  assert.deepEqual(surfaceSize(2000, 10, 4, 1024), { width: 1024, height: 5 });
  assert.deepEqual(surfaceSize(.1, .1, 1, 1024), { width: 1, height: 1 });
});
test('invalid metal dimensions fail before allocating GPU storage', () => {
  for (const input of [[0, 10, 2, 4096], [100, -1, 2, 4096], [100, 10, NaN, 4096], [100, 10, 2, 0]]) {
    assert.throws(() => surfaceSize(...input), /Invalid metal surface/);
  }
});
test('unavailable WebGL reports a recoverable rendering failure', () => {
  assert.throws(() => createRenderer({ getContext: () => null }), /unavailable/);
});
test('shader failure releases allocated GPU objects for the CSS fallback', () => {
  const deleted = [];
  const gl = {
    createProgram: () => 'program', createShader: () => 'shader',
    shaderSource() {}, compileShader() {}, getShaderParameter: () => false,
    deleteShader: value => deleted.push(value), deleteProgram: value => deleted.push(value),
  };
  assert.throws(() => createRenderer({ getContext: () => gl }), /compile/);
  assert.deepEqual(deleted, ['shader', 'program']);
});
test('GPU allocation failure releases the program without attempting to draw', () => {
  let deleted = false;
  const gl = { createProgram: () => 'program', createShader: () => null,
    deleteProgram: () => { deleted = true; } };
  assert.throws(() => createRenderer({ getContext: () => gl }), /allocate a metal shader/);
  assert.equal(deleted, true);
});
