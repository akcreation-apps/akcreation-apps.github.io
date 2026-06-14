// Side-channel write that mirrors a placed restaurant order into the central
// BankiBites Firestore. Uses a SEPARATE named Firebase app so the host
// restaurant's existing app stays untouched. Failures here must NEVER block
// the restaurant's primary order flow — callers should swallow rejections.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const APP_NAME = 'bankibites-mirror';
const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');

async function getMirrorDb() {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return getFirestore(existing);

  const res = await fetch('https://akcreation-apps.com/TCD/credentials.json?v=' + Date.now());
  if (!res.ok) throw new Error('credentials fetch failed');
  const c = await res.json();
  const decrypt = v => CryptoJS.AES.decrypt(v, ENC_KEY).toString(CryptoJS.enc.Utf8);
  const cfg = {
    apiKey:            decrypt(c.API_KEY),
    authDomain:        decrypt(c.AUTH_DOMAIN),
    projectId:         decrypt(c.ID),
    storageBucket:     decrypt(c.STORAGE_BUCKET),
    messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
    appId:             decrypt(c.APP_ID),
    measurementId:     decrypt(c.MEASUREMENT_ID),
  };
  const app = initializeApp(cfg, APP_NAME);
  return getFirestore(app);
}

async function withRetry(fn, retries = 3, baseDelayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
}

// Call once at page load to pre-initialise the Firebase app before any order
// is placed — eliminates the credentials-fetch round-trip at order time.
export function warmMirrorConnection() {
  getMirrorDb().catch(() => {});
}

export function bankiBitesMirrorDocId(restaurantId, sourceDocId) {
  return `${String(restaurantId || '').toLowerCase()}_${sourceDocId}`;
}

export async function mirrorExists(restaurantId, sourceDocId) {
  const db = await getMirrorDb();
  const snap = await getDoc(doc(db, 'bankibites_orders', bankiBitesMirrorDocId(restaurantId, sourceDocId)));
  return snap.exists();
}

export async function mirrorToBankiBites(payload) {
  if (!payload || !payload.restaurant_id || !payload.source_doc_id) {
    throw new Error('mirrorToBankiBites requires restaurant_id and source_doc_id');
  }
  const docId = bankiBitesMirrorDocId(payload.restaurant_id, payload.source_doc_id);
  const data = {
    restaurant_id:   payload.restaurant_id,
    restaurant_name: payload.restaurant_name || '',
    items:           payload.items || [],
    subtotal:        Number(payload.subtotal) || 0,
    total:           Number(payload.total) || 0,
    delivery_charges: Number(payload.delivery_charges) || 0,
    place:           payload.place || '',
    table_no:        payload.table_no || '',
    source_doc_path: payload.source_doc_path || '',
    status:          'new',
    customer:        null,
    delivery_staff_id: null,
    created_at:      payload.created_at || Timestamp.now(),
  };
  // No pre-read here — unauthenticated customers can `create` per Firestore
  // rules but cannot `read`. Existence is guaranteed unique on the customer
  // path because docId derives from a freshly-generated restaurant docRef.id.
  // Admin-side resync calls `mirrorExists` (read-permitted) BEFORE this, so
  // it also never collides.
  return withRetry(async () => {
    const db = await getMirrorDb();
    const ref = doc(db, 'bankibites_orders', docId);
    await setDoc(ref, data);
    return { id: docId };
  });
}
