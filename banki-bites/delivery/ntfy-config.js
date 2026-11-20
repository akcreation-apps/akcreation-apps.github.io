/* ===========================================================================
   BankiBites — Delivery ntfy.sh Fallback Push
   ---------------------------------------------------------------------------
   FCM Web Push via Chrome on Android is unreliable under Doze / Samsung's
   aggressive background killer. The ntfy Android app is native, built for
   this exact use case, and supports `Priority: max` with custom loud sounds
   and persistent notifications that survive Doze.

   This module:
     1. Generates a per-partner, unguessable ntfy topic (`bb-<uuid>`) on first
        enable, writing it to the staff doc so the server can POST alerts.
     2. Renders a self-serve setup card in the delivery PWA — Play Store link,
        QR to subscribe, and "Send test ring" button.

   Security model: ntfy topics act as passwords. A random UUID segment makes
   the topic unguessable; anyone who learns it can read (and theoretically
   publish to) it. Treat the topic as mildly sensitive — fine for order
   assignment alerts, not for anything with PII you'd regret leaking.
   =========================================================================== */

import { doc, updateDoc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from '../firebase-config.js';

const LS_TOPIC_KEY = 'bb_delivery_ntfy_topic_v1';
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=io.heckel.ntfy';
const FDROID_URL     = 'https://f-droid.org/packages/io.heckel.ntfy/';
const NTFY_BASE      = 'https://ntfy.sh';

function _uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Minimal fallback for ancient browsers — 128 bits of entropy.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Read (or generate + persist) the partner's ntfy topic.
 *
 * Idempotent: a partner who already has `ntfy_topic` on their staff doc gets
 * the existing value. Only partners without a topic trigger a write.
 *
 * @param {object} args
 * @param {Firestore} args.db
 * @param {string} args.uid
 * @returns {Promise<{topic: string, subscribeUrl: string, httpsUrl: string, qrUrl: string, isNew: boolean}>}
 */
export async function ensureNtfyTopic({ db, uid }) {
  // Fast path: localStorage cache lets us render the card without a Firestore
  // read on every open. We still reconcile with Firestore the first time the
  // card is opened per session to catch topic resets from the admin side.
  let topic = null;
  try { topic = localStorage.getItem(LS_TOPIC_KEY); } catch {}

  const ref = doc(db, COL.STAFF, uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (err) {
    throw new Error(`Staff doc read failed: ${err.message}`);
  }
  if (!snap.exists()) throw new Error('Staff doc missing');

  const serverTopic = (snap.data().ntfy_topic || '').trim();
  let isNew = false;
  if (serverTopic) {
    topic = serverTopic;
  } else {
    topic = `bb-${_uuid()}`;
    try {
      await updateDoc(ref, { ntfy_topic: topic });
      isNew = true;
    } catch (err) {
      throw new Error(`Could not save topic: ${err.message}`);
    }
  }
  try { localStorage.setItem(LS_TOPIC_KEY, topic); } catch {}

  const httpsUrl     = `${NTFY_BASE}/${topic}`;
  const subscribeUrl = `ntfy://subscribe/${topic}`;
  // Google's QR API — tiny, no library needed. If it ever goes away, swap for
  // a client-side QR generator or self-host the qr endpoint on the Flask box.
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(httpsUrl)}`;

  return { topic, subscribeUrl, httpsUrl, qrUrl, isNew };
}

/**
 * Populate the #ntfySetupBody container with the setup wizard: install link,
 * QR, test button. Safe to call every time the <details> card is opened —
 * guards against re-render churn by caching the last rendered topic.
 */
let _lastRenderedTopic = null;
export async function renderNtfyCard({ db, uid, container, onTest }) {
  if (!container) return;
  container.innerHTML = '<div class="bb-ntfy-loading">Preparing your ring topic…</div>';
  let info;
  try {
    info = await ensureNtfyTopic({ db, uid });
  } catch (err) {
    container.innerHTML = `<div class="bb-ntfy-error">Could not set up ntfy: ${err.message}</div>`;
    return;
  }
  if (_lastRenderedTopic === info.topic && container.dataset.rendered === '1') return;
  _lastRenderedTopic = info.topic;

  container.dataset.rendered = '1';
  container.innerHTML = `
    <ol class="bb-ntfy-steps">
      <li>
        <strong>Install ntfy</strong> on your Android phone.
        <div class="bb-ntfy-links">
          <a class="btn btn-sm btn-primary" href="${PLAY_STORE_URL}" target="_blank" rel="noopener">
            <i class="fab fa-google-play"></i> Play Store
          </a>
          <a class="btn btn-sm btn-outline-secondary" href="${FDROID_URL}" target="_blank" rel="noopener">F-Droid</a>
        </div>
      </li>
      <li>
        <strong>Subscribe</strong> — open ntfy → + → paste this topic, or scan the QR below:
        <div class="bb-ntfy-topic">
          <code>${info.topic}</code>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-copy="${info.topic}">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <div class="bb-ntfy-qr">
          <img src="${info.qrUrl}" alt="Scan with ntfy app" width="180" height="180">
          <div class="bb-ntfy-qr-hint">
            Or tap on your phone: <a href="${info.subscribeUrl}">${info.subscribeUrl}</a>
          </div>
        </div>
      </li>
      <li>
        <strong>Make it loud</strong> — in the ntfy app, open the topic →
        Notifications → set <em>Priority</em> to <em>Max</em> and pick a loud
        ringtone sound. Also disable battery optimization for the ntfy app
        (Settings → Apps → ntfy → Battery → Unrestricted).
      </li>
      <li>
        <strong>Test it</strong> — tap Send Test Ring; your phone should ring
        loudly within a few seconds.
        <div class="bb-ntfy-test">
          <button type="button" id="ntfyTestBtn" class="btn btn-warning">
            <i class="fas fa-bell"></i> Send Test Ring
          </button>
          <span id="ntfyTestStatus" class="bb-ntfy-test-status"></span>
        </div>
      </li>
    </ol>
  `;

  const copyBtn = container.querySelector('[data-copy]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(copyBtn.getAttribute('data-copy'));
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
      setTimeout(() => { copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy'; }, 1500);
    } catch {}
  });

  const testBtn    = container.querySelector('#ntfyTestBtn');
  const testStatus = container.querySelector('#ntfyTestStatus');
  if (testBtn && typeof onTest === 'function') {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      testStatus.textContent = 'Sending…';
      testStatus.className = 'bb-ntfy-test-status';
      try {
        const res = await onTest(info.topic);
        if (res && res.success) {
          testStatus.textContent = 'Sent — check your phone';
          testStatus.classList.add('ok');
        } else {
          testStatus.textContent = (res && (res.reason || res.message)) || 'Failed';
          testStatus.classList.add('err');
        }
      } catch (err) {
        testStatus.textContent = err.message || 'Failed';
        testStatus.classList.add('err');
      } finally {
        testBtn.disabled = false;
      }
    });
  }
}

/**
 * Fire a test ntfy ring through the local notification server. Uses the live
 * server_url + notify_token exposed on `window.__bbNotifyCfg` by notify-sync.js.
 */
export async function sendTestRing({ uid, topic }) {
  const cfg = (typeof window !== 'undefined' && window.__bbNotifyCfg) || {};
  if (!cfg.server_url || !cfg.notify_token) {
    throw new Error('Notification server not configured');
  }
  const url = `${cfg.server_url}/notify/ntfy-test`;
  // Prefer sending the topic directly — the server then just POSTs to ntfy.sh
  // without needing Firestore. Falls back to staff_uid lookup if no topic.
  const payload = topic ? { topic } : { staff_uid: uid };
  let resp;
  try {
    resp = await fetch(url, {
      method:  'POST',
      mode:    'cors',
      headers: { 'Content-Type': 'application/json', 'X-Notify-Token': cfg.notify_token },
      body:    JSON.stringify(payload),
    });
  } catch (err) {
    // Network / CORS / server unreachable — fetch throws before any response.
    throw new Error(`Network error: ${err.message} (${url})`);
  }
  let body = {};
  let raw = '';
  try {
    raw = await resp.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    // Non-JSON response (HTML 404, proxy error) — surface the status code +
    // a short slice of the body so the partner's error line is actionable.
    const snippet = raw.replace(/\s+/g, ' ').slice(0, 120);
    return {
      success: false,
      reason:  `HTTP ${resp.status} — non-JSON response: ${snippet || '(empty)'}`,
    };
  }
  if (!resp.ok || body.success === false) {
    return {
      success: false,
      reason:  body.reason || body.message || `HTTP ${resp.status}`,
      ...body,
    };
  }
  return { success: true, ...body };
}
