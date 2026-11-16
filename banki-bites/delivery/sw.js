/* ===========================================================================
   BankiBites — Delivery PWA service worker
   ---------------------------------------------------------------------------
   Two jobs:

   1. Make the delivery page installable as an Android PWA, and route
      notification clicks to focus (or open) the running app.
   2. Receive FCM Web Push messages even when the PWA is backgrounded, swiped
      away, or Samsung's background killer has put the app to sleep. FCM
      wakes the SW through Google Play Services → the raw `push` event fires
      here → we render a notification immediately (no async init, no Firebase
      SDK dependency in the SW).

   Deliberately NOT importing firebase-messaging-compat here. We only need
   Firebase on the CLIENT side to call getToken(). The SW just handles the
   standard Web Push protocol payload that FCM emits — which is a JSON blob
   with our `data` field at the top level. No async init race, no risk of
   importScripts failing the SW install, no cold-start push losses.
   =========================================================================== */

const APP_SCOPE = '/banki-bites/delivery/';
const ICON  = '/banki-bites/delivery/notif-icon.png';
const BADGE = '/banki-bites/delivery/notif-badge.png';
const VIBRATE_PATTERN = [250, 150, 250, 800];

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Push: FCM data message delivered via the Web Push standard.
// Payload shape: { data: { type, orderId, customer_name, restaurant_name }, ... }
// Treat every push as a "new delivery assigned" alert — the Python sender only
// fires FCM for that event (see fcm_manager.push_to_partner).
// ---------------------------------------------------------------------------
self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch {
      try { payload = { data: { body: event.data && event.data.text() } }; } catch {}
    }
    const d = payload.data || {};
    const title = 'New delivery assigned';
    const body = d.customer_name
      ? `${d.customer_name} — ${d.restaurant_name || 'Order'} #${String(d.orderId || '').slice(0, 6)}`
      : 'Open BankiBites Delivery to view the order.';
    await self.registration.showNotification(title, {
      body,
      tag: 'bb-new-delivery',
      renotify: true,                                    // play OS sound + vibrate even if a prior notification is still open
      requireInteraction: true,                          // stays until tapped
      vibrate: VIBRATE_PATTERN,
      icon: ICON,
      badge: BADGE,
      data: { orderId: d.orderId || '' },
    });
  })());
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
