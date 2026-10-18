// ネット優先キャッシュ：つながる時は必ず最新版を取りに行き、オフラインの時だけキャッシュで遊べる。
// そのため更新のたびにここを書き換える必要はない（ファイルを増やした時だけ ASSETS に足す）。

const CACHE = 'block-otoshi-v1';
const ASSETS = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/main.js', 'js/logic.js', 'js/textures.js', 'js/icons.js', 'js/audio.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
const TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(req.url, { cache: 'no-cache', signal: ctrl.signal });
    if (res.ok) await cache.put(req.url, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req.url, { ignoreSearch: true })
      || (req.mode === 'navigate' && await cache.match('./'));
    if (hit) return hit;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
