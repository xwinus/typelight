// Typelight without a connection. Everything the page loads is kept here the first time it
// is opened. The page itself, and the list of sounds, are asked of the network first, so a
// new version shows as soon as there is one, and come from here only when there is no
// network. Everything else does not change under its name (a rebuilt set of sounds gets a
// new version in its address), so it comes from here first.
//
// Change CACHE when the list below changes: the old cache is then thrown away.
const CACHE = 'typelight-4';
const SHELL = [
  './',
  'editor/selection.js',
  'editor/accessibility.js',
  'editor/accessibility.css',
  'editor/tooltips.js',
  'manifest.webmanifest',
  'logo.svg',
  'apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'textures/desk.jpg',
  'textures/desk-normal.jpg',
  ...['400', '700', '400italic'].flatMap(w => ['latin', 'latin-ext'].map(s => `fonts/courier-prime-${w}-${s}.woff2`)),
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // the sounds, by the addresses the page asks for them at (see snd.load in index.html)
    try {
      const r = await fetch('sounds/manifest.json', { cache: 'no-cache' });
      const m = await r.clone().json();
      await cache.put('sounds/manifest.json', r);
      const v = m.version ? '?v=' + m.version : '';
      const dr = m.drawer || {};
      const names = [...m.key, ...m.space, ...m.bell, ...m.feed, ...m.return.map(x => x.file), ...(m.crumple || []),
        ...[dr.open, dr.close].filter(Boolean).map(d => d.file)];
      for (let i = 0; i < names.length; i += 6) {      // a few at a time: small servers drop a crowd
        await cache.addAll(names.slice(i, i + 6).map(n => 'sounds/' + n + v));
      }
    } catch { /* then they are kept as the page loads them */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('/sounds/manifest.json');
  e.respondWith(fresh ? networkFirst(req) : cacheFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const r = await fetch(req);
    if (r.ok) await cache.put(req.mode === 'navigate' ? './' : req, r.clone());
    return r;
  } catch (err) {
    const kept = await cache.match(req.mode === 'navigate' ? './' : req, { ignoreSearch: true });
    if (kept) return kept;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const kept = await cache.match(req);
  if (kept) return kept;
  const r = await fetch(req);
  if (r.ok && r.type === 'basic') await cache.put(req, r.clone());
  return r;
}
