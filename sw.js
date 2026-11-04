/* Mir & Brothers — offline cache */
const CACHE = 'mmb-dryfruits-v2';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/config.js',
  './js/utils.js',
  './js/i18n.js',
  './js/db.js',
  './js/ui.js',
  './js/updater.js',
  './js/views/dashboard.js',
  './js/views/accounts.js',
  './js/views/stock.js',
  './js/views/settings.js',
  './js/app.js',
  './assets/fonts/manrope-latin.woff2',
  './assets/fonts/fraunces-latin.woff2',
  './assets/fonts/noto-naskh-arabic.woff2',
  './assets/fonts/noto-nastaliq-urdu-arabic.woff2',
  './assets/icon.svg',
  './assets/logo.svg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS).catch(function (err) { console.warn('Cache install failed', err); });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  // Never serve the update feed or update zips from the cache.
  if (url.pathname.endsWith('/update.json') || url.pathname.indexOf('/updates/') !== -1) return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
