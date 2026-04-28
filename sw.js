const CACHE_NAME = 'cartografia-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/universe.css',
  '/js/app.js',
  '/js/addiction.js',
  '/js/audio.js',
  '/js/collection.js',
  '/js/crafting.js',
  '/js/effects.js',
  '/js/encounters.js',
  '/js/gameplay.js',
  '/js/planets.js',
  '/js/ruins.js',
  '/js/scene.js',
  '/js/ship.js',
  '/js/terrain.js',
  '/js/ui.js',
  '/manifest.json'
];

// Instalar el Service Worker y guardar en caché el set de assets inicial.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Interceptar las peticiones fetch
self.addEventListener('fetch', event => {
  // Ignorar peticiones a la API del backend para que el server siga teniendo tráfico vivo
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Si no está en caché, buscar en red, e intentar agregarlo a caché
        return fetch(event.request).then(
          function(response) {
            // Check if we received a valid response
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});

// Limpiar cachés antiguos si hay una nueva versión (v2, v3, etc)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});
