// HARMOLINK Free — Service Worker avec cache offline complet
const VERSION = 'harmolink-free-v3';
const CACHE_NAME = `harmolink-free-${VERSION}`;
const AUDIO_CACHE = 'harmolink-audio-v1';
const FONTS_CACHE = 'harmolink-fonts-v1';

const ASSETS_TO_CACHE = [
  '/free/',
  '/free/index.html',
  '/free/manifest.json',
  '/free/icon-192.png',
  '/free/icon-512.png',
  '/free/favicon.ico',
];

// Domaines audio à cacher (Salamander — Free utilise aussi le piano)
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

// Activation : suppression des anciens caches (sauf audio et fonts)
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== AUDIO_CACHE && key !== FONTS_CACHE)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : cache-first pour assets locaux + samples audio + polices
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Polices Google : cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONTS_CACHE).then((cache) => {
        return cache.match(e.request).then((cached) => {
          if (cached) return cached;
          return fetch(e.request).then((response) => {
            cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
        });
      })
    );
    return;
  }

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
        if (response.ok && url.pathname.startsWith('/free/')) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, response.clone());
          });
        }
        return response;
      }).catch(() => {
        return caches.match('/free/index.html');
      });
    })
  );
});
