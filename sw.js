/* ============================================================
   EXNA Music — Service Worker
   - App shell (HTML, CSS, JS, ícones, jsmediatags): cache-first
   - Archive.org (streaming online): network-only, nunca cacheia
   - Fallback offline: serve index.html do cache
   ============================================================ */

const CACHE_NAME = 'exna-music-v5';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js'
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        CORE_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: 'no-cache' });
            if (res.ok) await cache.put(url, res.clone());
          } catch (err) {
            console.warn('[EXNA SW] Falhou ao cachear:', url, err.message);
          }
        })
      );
      await self.skipWaiting();
      console.log('[EXNA SW] Instalado.');
    })()
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      console.log('[EXNA SW] Ativo.');
    })()
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca cacheia blob/data/archive.org
  if (
    url.protocol === 'blob:' ||
    url.protocol === 'data:' ||
    url.hostname.includes('archive.org')
  ) {
    event.respondWith(
      fetch(req).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Ignora extensões de áudio (deixa streamar direto)
  if (/\.(mp3|wav|flac|m4a|aac|ogg|opus|wma)(\?|$)/i.test(url.pathname)) return;

  // Cache-first + stale-while-revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(req);

      if (hit) {
        event.waitUntil(
          fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()); })
            .catch(() => {})
        );
        return hit;
      }

      try {
        const res = await fetch(req);
        if (res.ok && url.origin === self.location.origin) {
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        if (req.mode === 'navigate') {
          const fb = await cache.match('./index.html');
          if (fb) return fb;
        }
        return new Response('Offline', { status: 503 });
      }
    })()
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
