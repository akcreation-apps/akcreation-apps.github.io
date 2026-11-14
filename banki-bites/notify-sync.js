// Thin client for the local notification server (local_machine/app.py).
//
// Jobs:
//   1. POST /bankibites/order-sync on every order save/delete (admin + partner)
//   2. Cache the notification server URL + token for other consumers
//      (top-bar indicator, settings panel polling)
//
// Config lives in Firestore at `bankibites_meta/notification_config`.
// We cache it in **localStorage** so subsequent page loads read 0 Firebase
// reads for the config — Firestore is only consulted once per session for
// the onSnapshot subscription, which then also pushes any admin-side edits
// made on OTHER devices into our cache in near-real-time.
//
// Firebase read cost per admin login:
//   • First-ever login on this browser:  1 read (onSnapshot initial)
//   • Subsequent reloads on this browser: 1 read (onSnapshot initial — the
//     page starts with localStorage cache, so notifications are usable
//     before that read returns)
//   • Cross-device config edit while this tab is open: 1 read per change

import { doc, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from './firebase-config.js';

const LS_KEY = 'bb_notification_config_v1';

let _db   = null;
let _cfg  = _loadCache();   // hydrate synchronously from localStorage
let _unsub = null;
_publishCfg();              // make cached values available immediately

function _loadCache() {
  try {
    if (typeof localStorage === 'undefined') return { server_url: '', notify_token: '' };
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { server_url: '', notify_token: '' };
    const parsed = JSON.parse(raw);
    return sanitiseCfg(parsed || {});
  } catch {
    return { server_url: '', notify_token: '' };
  }
}

function _saveCache(cfg) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(LS_KEY, JSON.stringify(cfg));
  } catch { /* quota, private mode — ignore */ }
}

/** Called once per page that wants notifications. Idempotent across callers. */
export function initNotifySync(db) {
  if (_db) return;
  _db = db;
  // Single onSnapshot subscription. The first invocation returns the current
  // doc (1 Firebase read) and every subsequent edit re-fires. We don't call
  // getDoc separately because that would double the read cost for no gain —
  // onSnapshot's initial firing is the same data.
  _unsub = onSnapshot(doc(db, COL.META, 'notification_config'), snap => {
    if (!snap.exists()) return;
    const next = sanitiseCfg(snap.data());
    // Skip the no-op update when the cache matches the server (common case
    // on the first fire if localStorage was warm).
    if (next.server_url === _cfg.server_url && next.notify_token === _cfg.notify_token) {
      return;
    }
    _cfg = next;
    _saveCache(_cfg);
    _publishCfg();
  }, () => { /* permission / network error — keep whatever we have cached */ });
}

function sanitiseCfg(d) {
  return {
    server_url:   String(d?.server_url   || '').trim().replace(/\/+$/, ''),
    notify_token: String(d?.notify_token || '').trim(),
  };
}

function _publishCfg() {
  // Expose the live config on `window` so the top-bar server-status indicator
  // (and any other read-only consumer) can ping without importing this module
  // and duplicating the Firestore subscription.
  if (typeof window !== 'undefined') window.__bbNotifyCfg = { ..._cfg };
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
