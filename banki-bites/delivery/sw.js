/* ===========================================================================
   BankiBites — Delivery PWA service worker
   ---------------------------------------------------------------------------
   Minimal SW: makes the delivery page installable as an Android PWA and
   handles notification clicks so tapping the OS banner focuses (or opens)
   the delivery app in a single window — which stops the ring.

   Deliberately NOT caching responses here — the delivery app needs live
   Firestore data, and stale caches cause confusing bugs. We only install
   the SW so the "Add to Home Screen" prompt shows up and notificationclick
   / message events are routable.
   =========================================================================== */

const APP_SCOPE = '/banki-bites/delivery/';

self.addEventListener('install', () => {
  // Activate immediately on first install.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Take control of any already-open delivery tabs without a reload.
  event.waitUntil(self.clients.claim());
});

// Tapping an OS notification: focus an existing delivery window if we have
// one, otherwise open a fresh one. Either way, post a message so the page
// can call stopRinging() from the main thread.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    let target = all.find(c => c.url.includes(APP_SCOPE));
    if (target) {
      try { await target.focus(); } catch {}
    } else {
      target = await self.clients.openWindow(APP_SCOPE);
    }
    if (target) {
      try { target.postMessage({ type: 'stop-ring' }); } catch {}
    }
  })());
});
