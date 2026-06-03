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

// --- Web Push -----------------------------------------------------------
// Полезная нагрузка приходит как JSON: { title, body, icon, badge, data, tag, url }.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'Репетитори', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Репетитори';
  const url = payload.url || (payload.data && payload.data.url) || '/';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/favicon.ico',
    badge: payload.badge || '/favicon.ico',
    tag: payload.tag,
    data: Object.assign({ url }, payload.data || {}),
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) {
          try { c.navigate(targetUrl); } catch (_) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    })
  );
});
