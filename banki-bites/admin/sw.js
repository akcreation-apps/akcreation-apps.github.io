// bankibites-admin SW v2 — adds notificationclick handling
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* network only */ });

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const scopeHref = new URL('/banki-bites/admin/', self.location.origin).href;
  const target = new URL(data.url || '/banki-bites/admin/', self.location.origin).href;

  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      if (client.url.startsWith(scopeHref)) {
        try { await client.focus(); } catch (_) {}
        if ('navigate' in client && data.url) {
          try { await client.navigate(target); } catch (_) {}
        }
        return;
      }
    }
    try { await self.clients.openWindow(target); } catch (_) {}
  })());
});
