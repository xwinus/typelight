const fs = require('node:fs/promises');
const path = require('node:path');

const FILES = new Set(['index.html', 'logo.svg', 'logo-mark.svg', 'apple-touch-icon.png',
  'manifest.webmanifest', 'LICENSE']);
const DIRECTORIES = ['sounds/', 'fonts/', 'textures/', 'icons/', 'desktop/web/', 'editor/'];
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', woff2: 'font/woff2',
  flac: 'audio/flac', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg' };
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; " +
  "base-uri 'none'; frame-ancestors 'none'; form-action 'none'";

async function assetResponse(request, root) {
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'typelight:' || url.host !== 'app' || request.method !== 'GET') {
      return new Response('Unsupported request', { status: 403 });
    }
    const name = decodeURIComponent(url.pathname).slice(1) || 'index.html';
    if (name.includes('\\') || name.split('/').includes('..') ||
        (!FILES.has(name) && !DIRECTORIES.some(prefix => name.startsWith(prefix)))) {
      return new Response('Forbidden', { status: 403 });
    }
    const base = await fs.realpath(root);
    const file = await fs.realpath(path.join(base, name));
    if (!file.startsWith(base + path.sep)) return new Response('Forbidden', { status: 403 });
    let data = await fs.readFile(file);
    if (name === 'index.html') {
      data = Buffer.from(data.toString('utf8').replace('<head>', `<head>
        <script>document.documentElement.classList.add('electron');</script>
        <link rel="stylesheet" href="desktop/web/electron.css">
        <script src="desktop/web/counts.js"></script>
        <script src="desktop/web/bridge.js"></script>
        <script defer src="desktop/web/chrome.js"></script>`));
    }
    return new Response(data, { status: 200, headers: {
      'Content-Type': MIME[path.extname(name).slice(1)] || 'application/octet-stream',
      'Content-Length': String(data.length), 'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return new Response('Asset unavailable', { status: error.code === 'ENOENT' ? 404 : 400 });
  }
}

module.exports = { assetResponse };
