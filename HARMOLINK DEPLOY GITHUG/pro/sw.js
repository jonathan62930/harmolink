// HARMOLINK Pro — Service Worker avec cache offline complet
const VERSION = 'harmolink-pro-v3';
const CACHE_NAME = `harmolink-pro-${VERSION}`;
const AUDIO_CACHE = 'harmolink-audio-v1';

const ASSETS_TO_CACHE = [
  '/pro/',
  '/pro/index.html',
  '/pro/manifest.json',
  '/pro/icon-192.png',
  '/pro/icon-512.png',
  '/pro/favicon.ico',
];

// Domaines audio à cacher (tous les instruments samples)
const AUDIO_HOSTS = [
  'gleitz.github.io',
];

// Installation : mise en cache des assets statiques
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches (sauf audio qui est partagé)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : cache-first pour assets locaux + samples audio
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Samples audio (Salamander, Rhodes, Strings) : cache-first, réseau en fallback
  if (AUDIO_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(AUDIO_CACHE).then((cache) => {
        return cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((response) => {
            if (response.ok) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(() => {
            // Hors ligne et pas encore en cache : réponse vide (silence)
            return new Response(new ArrayBuffer(0), {
              status: 200,
              headers: { 'Content-Type': 'audio/mpeg' }
            });
          });
        });
      })
    );
    return;
  }

  // Assets locaux : cache-first, réseau en fallback
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((response) => {
        if (response.ok && url.pathname.startsWith('/pro/')) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, response.clone());
          });
        }
        return response;
      }).catch(() => {
        return caches.match('/pro/index.html');
      });
    })
  );
});
