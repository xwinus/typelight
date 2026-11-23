const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { assetResponse } = require('../desktop/electron/assets.cjs');

const root = path.resolve(__dirname, '..');
const get = (name, method = 'GET', directory = root) =>
  assetResponse({ url: 'typelight://app/' + name, method }, directory);

test('bundled sound manifest is a successful JSON response', async () => {
  const response = await get('sounds/manifest.json');
  assert.equal(response.status, 200);
  assert.equal(response.ok, true);
  assert.equal(response.headers.get('content-type'), 'application/json');
  const manifest = await response.json();
  assert.ok(manifest.key.length > 0);
});

test('versioned FLAC requests return the original bytes with an audio MIME', async () => {
  const manifest = await (await get('sounds/manifest.json')).json();
  const response = await get('sounds/' + manifest.key[0] + '?v=' + manifest.version);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/flac');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(path.join(root, 'sounds', manifest.key[0])));
});

test('missing files, invalid methods, traversal and private sources cannot be fetched', async () => {
  for (const [name, method, status] of [
    ['sounds/missing.flac', 'GET', 404], ['sounds/manifest.json', 'POST', 403],
    ['desktop/electron/main.cjs', 'GET', 403], ['sounds/%2e%2e%2fpackage.json', 'GET', 403],
    ['sounds/%5c..%5cpackage.json', 'GET', 403], ['sounds/%00.flac', 'GET', 400],
  ]) assert.equal((await get(name, method)).status, status, name);
  assert.equal((await assetResponse({ url: 'typelight://outside/index.html', method: 'GET' }, root)).status, 403);
});

test('symlinks cannot expose files outside the asset root', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'typelight-assets-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  await fs.mkdir(path.join(temp, 'web/sounds'), { recursive: true });
  await fs.writeFile(path.join(temp, 'secret'), 'private');
  try { await fs.symlink(path.join(temp, 'secret'), path.join(temp, 'web/sounds/escape')); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Symlink privilege unavailable'); return; } throw error; }
  assert.equal((await get('sounds/escape', 'GET', path.join(temp, 'web'))).status, 403);
});

test('desktop HTML injects the shared bridge before the editor with a restrictive policy', async () => {
  const response = await get('index.html');
  const html = await response.text();
  assert.ok(html.indexOf('src="desktop/web/bridge.js"') < html.indexOf('const desktop = window.typelightDesktop'));
  assert.match(html, /desktop\/web\/electron.css/);
  assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
  assert.doesNotMatch(html, /classList.add\('desktop'\)/);
});
