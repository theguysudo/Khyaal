/*
 * Khayaal dashboard service worker — the thinnest possible web-push hook.
 * It exists only so the browser has a worker to attach a VAPID subscription
 * to and to *display* the urgent-alert notification. It stores nothing,
 * proxies nothing, caches nothing: no app code, no data, no offline shell.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Khayaal — urgent alert', body: 'Open the dashboard for details.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    /* plain-text push; keep the defaults */
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: 'khayaal-alert',
      requireInteraction: true,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if ('focus' in client) return client.focus();
      return self.clients.openWindow('/');
    }),
  );
});
