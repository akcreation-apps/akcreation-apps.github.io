// Thin client for the local notification server (local_machine/app.py).
//
// One job: POST /bankibites/order-sync with the current order + partner
// sidecar on every save. The server owns the "what to actually fire"
// decision (new-order, partner-assign, eta-urgency) and the dedup state.
//
// Config lives in Firestore at `bankibites_meta/notification_config`
// (server_url + notify_token). This module caches the config in-memory and
// also reloads lazily if Firestore updates it mid-session.

import { doc, getDoc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from './firebase-config.js';

let _db = null;
let _cfg = { server_url: '', notify_token: '' };
let _unsub = null;

/** Called once by each page that wants to sync. Idempotent. */
export function initNotifySync(db) {
  if (_db) return;
  _db = db;
  // Prime once, then keep in sync with any admin saving new values.
  getDoc(doc(db, COL.META, 'notification_config')).then(snap => {
    if (snap.exists()) _cfg = sanitiseCfg(snap.data());
  }).catch(() => {});
  _unsub = onSnapshot(doc(db, COL.META, 'notification_config'), snap => {
    if (snap.exists()) _cfg = sanitiseCfg(snap.data());
  }, () => {});
}

function sanitiseCfg(d) {
  return {
    server_url:   String(d.server_url   || '').trim().replace(/\/+$/, ''),
    notify_token: String(d.notify_token || '').trim(),
  };
}

/**
 * Fire-and-forget: tell the server an order was hard-deleted in Firestore
 * so the tracking file drops its entry and the scanner stops queuing it.
 */
export function syncOrderDelete(orderId, actor = 'admin') {
  if (!_cfg.server_url || !_cfg.notify_token) return;
  if (!orderId) return;
  fetch(`${_cfg.server_url}/bankibites/order-delete`, {
    method:  'POST',
    mode:    'cors',
    headers: { 'Content-Type': 'application/json', 'X-Notify-Token': _cfg.notify_token },
    body:    JSON.stringify({ order_id: orderId, actor }),
    keepalive: true,
  })
    .then(r => r.json().catch(() => ({})))
    .then(b => {
      if (b && b.success === false) console.warn('[notify-sync/delete]', b.message || b);
      else if (b) console.log('[notify-sync/delete]', orderId, 'removed=' + b.removed);
    })
    .catch(err => console.warn('[notify-sync/delete] failed:', err.message));
}


/**
 * Fire-and-forget sync. Never throws into the save flow. Logs to console on
 * failure so admins can diagnose without losing the actual Firestore save.
 *
 * @param {object}  order    merged bankibites_orders doc  ({...o, ...patch, id})
 * @param {object?} partner  {name, phone} — resolved from the staff list
 * @param {string}  actor    'admin' | 'partner'
 */
export function syncOrder(order, partner, actor = 'admin') {
  if (!_cfg.server_url || !_cfg.notify_token) return;
  if (!order || !order.id) return;

  const payload = { actor, order, partner: partner || null };
  fetch(`${_cfg.server_url}/bankibites/order-sync`, {
    method:  'POST',
    mode:    'cors',
    headers: { 'Content-Type': 'application/json', 'X-Notify-Token': _cfg.notify_token },
    body:    JSON.stringify(payload),
    keepalive: true,  // don't block page navigation
  })
    .then(r => r.json().catch(() => ({})))
    .then(b => {
      if (b && b.success === false) console.warn('[notify-sync]', b.message || b);
      else if (b && b.decision?.reasons?.length) console.log('[notify-sync]', b.decision.reasons, b.fired);
    })
    .catch(err => console.warn('[notify-sync] failed:', err.message));
}
