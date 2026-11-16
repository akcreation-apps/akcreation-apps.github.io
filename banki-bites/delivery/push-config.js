/* ===========================================================================
   BankiBites — Delivery FCM Web Push
   ---------------------------------------------------------------------------
   Wakes a terminated PWA on Android via Firebase Cloud Messaging so a partner
   receives a loud OS ring even when they've swiped the app away or the phone
   has been asleep for hours. Chrome / Samsung Internet route FCM messages
   through Google Play Services, which can wake the service worker even when
   Samsung's aggressive background killer has put the PWA to sleep.

   One-time setup (you — not me — have to do this):
   -------------------------------------------------
   1. Firebase Console → Project Settings → Cloud Messaging → **Web Push
      certificates** → "Generate key pair". Copy the public key.
   2. Paste it below as VAPID_PUBLIC_KEY.
   3. Deploy server-side send logic (see server snippet at the bottom of this
      file — Python Flask version to drop into your existing notification
      server, since that's where `notify-sync.js` already POSTs to).
   4. Firestore rule: extend the self-write allowance on
      bankibites_delivery_staff/{uid} to include the fcm_token fields —
      see rule snippet further below.
   =========================================================================== */

// Fill this in once you generate the VAPID key pair in Firebase Console.
// Safe to commit — VAPID public keys are not secrets.
export const VAPID_PUBLIC_KEY = 'BFYKsQXpOrZUTm6ASGQVHZMavmQxk4axAHfxeSIBJ0K2wFGY-5L-Jnw6VLfkoN9EXYrQPPX0MNa7t84PGd-fyOo';

import { doc, updateDoc, deleteField, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { getMessaging, getToken, onMessage, isSupported }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-messaging.js';
import { COL } from '../firebase-config.js';

let _enabled = false;
let _onForegroundPush = null;

/**
 * Register for FCM push, store the token in the partner's staff doc, and
 * wire foreground messages to the provided callback (which should trigger
 * our normal ring UX via ring.js). Idempotent — safe to call every login.
 *
 * Silently no-ops if:
 *   • VAPID_PUBLIC_KEY is empty (you haven't pasted it yet),
 *   • The browser doesn't support FCM (iOS Safari, old browsers),
 *   • Notification permission is denied.
 */
export async function enablePush({ firebaseApp, db, uid, onForegroundMessage }) {
  if (_enabled) return;
  if (!VAPID_PUBLIC_KEY) {
    console.info('[push] VAPID_PUBLIC_KEY not set — skipping FCM registration');
    return;
  }
  try {
    const supported = await isSupported();
    if (!supported) {
      console.info('[push] FCM not supported in this browser — skipping');
      return;
    }
  } catch { return; }

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    console.info('[push] notification permission not granted — skipping FCM');
    return;
  }

  // The service worker must be registered BEFORE getToken so FCM can hand
  // the registration to Firebase's internal machinery.
  let swReg;
  try {
    swReg = await navigator.serviceWorker.getRegistration('/banki-bites/delivery/');
    if (!swReg) swReg = await navigator.serviceWorker.register('/banki-bites/delivery/sw.js', { scope: '/banki-bites/delivery/' });
  } catch (err) {
    console.warn('[push] SW registration failed:', err);
    return;
  }

  let token;
  try {
    const messaging = getMessaging(firebaseApp);
    token = await getToken(messaging, {
      vapidKey: VAPID_PUBLIC_KEY,
      serviceWorkerRegistration: swReg,
    });
    // Foreground push: when the tab is in focus, FCM delivers to onMessage
    // instead of firing the SW's onBackgroundMessage. Route it through the
    // same ring UX so the partner still hears the siren.
    _onForegroundPush = onForegroundMessage;
    onMessage(messaging, payload => {
      try {
        if (_onForegroundPush) _onForegroundPush(payload.data || {});
      } catch (err) { console.warn('[push] foreground handler threw:', err); }
    });
  } catch (err) {
    console.warn('[push] getToken failed:', err);
    return;
  }

  if (!token) {
    console.warn('[push] FCM returned no token');
    return;
  }

  // Persist the token on the partner's staff doc so the server can target
  // this device when assigning them an order. Firestore rule allows the
  // partner to self-write this field (see rule snippet below).
  //
  // Tokens live as entries inside `fcm_tokens` — a map keyed by token string
  // — so a partner signed in on multiple devices receives pushes on all of
  // them. Only write when the token actually changed vs the last one we
  // saved locally, otherwise every PWA launch triggers every admin's live
  // staff listener and burns read quota needlessly.
  const prev = (() => { try { return localStorage.getItem(LAST_TOKEN_LS_KEY); } catch { return null; } })();
  if (prev === token) {
    _enabled = true;
    _activeToken = token;
    console.info('[push] FCM token unchanged — skipping Firestore write');
    return;
  }
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent.slice(0, 200) : '';
    // Dotted-key update adds (or overwrites) just this one entry inside the
    // `fcm_tokens` map. Other devices' entries are untouched.
    await updateDoc(doc(db, COL.STAFF, uid), {
      [`fcm_tokens.${token}`]: { addedAt: serverTimestamp(), ua },
    });
    try { localStorage.setItem(LAST_TOKEN_LS_KEY, token); } catch {}
    _enabled = true;
    _activeToken = token;
    console.info('[push] FCM token registered');
  } catch (err) {
    console.warn('[push] failed to save FCM token:', err);
  }
}

// Module-level: the token minted for THIS device in the current session.
// disablePushForThisDevice() needs it to know which map entry to delete.
let _activeToken = null;
const LAST_TOKEN_LS_KEY = 'bb_delivery_fcm_token_v1';

/**
 * Called on sign-out. Removes THIS device's FCM token from the partner's
 * staff doc (other devices stay registered and keep receiving pushes) and
 * clears the local cache so a subsequent sign-in re-registers.
 */
export async function disablePushForThisDevice({ db, uid }) {
  const token = _activeToken || (() => { try { return localStorage.getItem(LAST_TOKEN_LS_KEY); } catch { return null; } })();
  try { localStorage.removeItem(LAST_TOKEN_LS_KEY); } catch {}
  _activeToken = null;
  _enabled = false;
  if (!token || !db || !uid) return;
  try {
    await updateDoc(doc(db, COL.STAFF, uid), {
      [`fcm_tokens.${token}`]: deleteField(),
    });
    console.info('[push] FCM token removed for this device');
  } catch (err) {
    console.warn('[push] failed to remove FCM token:', err);
  }
}

/*
=============================================================================
   Firestore rule addendum — add `fcm_token`, `fcm_token_updated_at` to the
   self-writable field list on the delivery staff doc:
=============================================================================

match /bankibites_delivery_staff/{uid} {
  allow read: if isAdmin() || (request.auth != null && request.auth.uid == uid);
  allow create, delete: if isAdmin();
  allow update: if isAdmin()
    || (
      request.auth != null
      && request.auth.uid == uid
      && request.resource.data.diff(resource.data).affectedKeys()
           .hasOnly(['is_online', 'fcm_token', 'fcm_token_updated_at', 'fcm_tokens'])
    );
}


=============================================================================
   Server-side send (Python — drop into your Flask notification server next
   to the existing /bankibites/order-sync handler). Requires:
     pip install firebase-admin
   and a Firebase service-account JSON file for the project.
=============================================================================

   import firebase_admin
   from firebase_admin import credentials, messaging, firestore

   cred = credentials.Certificate('path/to/service-account.json')
   firebase_admin.initialize_app(cred)
   db = firestore.client()

   def push_to_partner(staff_uid, order_summary):
       # Look up the partner's current FCM token from their staff doc.
       snap = db.collection('bankibites_delivery_staff').document(staff_uid).get()
       if not snap.exists:
           return
       token = snap.to_dict().get('fcm_token')
       if not token:
           return
       # Send as a DATA message (not a notification message) so our service
       # worker controls how it's displayed — same rich notification as the
       # foreground chime + banner.
       message = messaging.Message(
           token=token,
           data={
               'type': 'new-order',
               'orderId': order_summary.get('id', ''),
               'customer_name': order_summary.get('customer_name', ''),
               'restaurant_name': order_summary.get('restaurant_name', ''),
           },
           android=messaging.AndroidConfig(
               priority='high',                 # wake the device
               ttl=300,                         # drop if 5 min old
           ),
           webpush=messaging.WebpushConfig(
               headers={'Urgency': 'high', 'TTL': '300'},
           ),
       )
       try:
           messaging.send(message)
       except messaging.UnregisteredError:
           # Token expired or app uninstalled — clear it so we don't retry.
           db.collection('bankibites_delivery_staff').document(staff_uid).update({'fcm_token': None})

   Call push_to_partner(assigned_staff_uid, order) from the admin-side order
   assignment handler (same spot that already triggers order-sync).

=============================================================================
*/
