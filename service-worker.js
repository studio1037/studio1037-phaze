const PREFIX = 'studio1037-phaze:' + self.registration.scope + ':';
const CACHE = PREFIX + 'v0.2-dev-20261125-clock-pwa-r2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './sync-config.js', './sync.js', './manifest.webmanifest', './icon-192.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key !== CACHE && key.startsWith(PREFIX))
    .map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  url.search = '';
  if (!assetURLs.has(url.href)) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const response = await cache.match(url.href);
    return response || fetch(event.request);
  }));
});
