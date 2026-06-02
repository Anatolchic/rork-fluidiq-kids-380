// Минимальный Service Worker для PWA — кэширует статику, API всегда network
const CACHE = 'repetitory-v1';
const STATIC = ['/', '/manifest.webmanifest', '/favicon.ico'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.includes('supabase.repetitory-app.ru')) return;
  if (url.pathname.startsWith('/_expo/static/') || url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(req, clone));
        return resp;
      }))
    );
    return;
  }
  e.respondWith(fetch(req).catch(() => caches.match(req).then(hit => hit || caches.match('/'))));
});
