const PREFIX = 'studio1037-phaze-';
const CACHE = PREFIX + 'v0.1.2';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.webmanifest', './icon-192.svg', './icon-512.svg'];
const assetURLs = new Set(ASSETS.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key !== CACHE && (key.startsWith(PREFIX) || key === 'phaze-v0.1.0'))
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
