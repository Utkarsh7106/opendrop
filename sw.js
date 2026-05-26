// ─── OpenDrop Service Worker ───
// Caches app shell for offline use. Network-first strategy for dynamic content.

const CACHE_NAME = 'opendrop-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.html',
  '/css/styles.css',
  '/js/utils.js',
  '/js/config.js',
  '/js/state.js',
  '/js/webrtc.js',
  '/js/stream.js',
  '/js/ui.js',
  '/assets/favicon.svg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Fira+Code:wght@400;500&display=swap',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(() => {
      // Some CDN resources may fail in offline environment or dev - ignore
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for HTML, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip PeerJS/WebRTC signaling or socket calls
  if (url.pathname.includes('peerjs') || url.protocol === 'wss:') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // If not in cache and offline, return offline page for HTML
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/app.html');
          }
          throw new Error('Network and cache miss');
        });
      })
  );
});
