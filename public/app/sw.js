// Offline shell for the staff app: the page and its static files are cached; API calls always go to the network.
const CACHE = 'immunolab-cbcf021e3a';
const SHELL = ['./', './index.html', './runtime.js', './config.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.includes('/api/')) return;
  // network first so updates arrive at once; cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (url.origin === location.origin || /cdnjs|jsdelivr|fonts\.g/.test(url.host))) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
