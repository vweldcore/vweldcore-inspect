// Bump VERSION on each release. Assets also refresh in the background (stale-while-revalidate).
const VERSION = 'vweldcore-v6';
const CORE = [
  './', './index.html', './app.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'
];
const timeout = ms => new Promise((_, rej) => setTimeout(rej, ms));

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Pages: network first (3.5s), fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      Promise.race([fetch(req), timeout(3500)])
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put('./index.html', copy)).catch(() => {}); }
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }).then(r => r || Response.error()))
    );
    return;
  }

  // Assets: serve cache instantly, refresh in the background.
  e.respondWith(
    caches.open(VERSION).then(async c => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then(res => { if (res.status === 200) c.put(req, res.clone()).catch(() => {}); return res; })
        .catch(() => hit || Response.error());
      return hit || net;
    })
  );
});
