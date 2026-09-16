// Writes a placed grocery order to the shared BankiBites Firestore.
// Uses a named Firebase app so this write path stays isolated from the
// bill.html subscriber (which uses its own named app in js/bill.js).
// Modeled on /banki-bites/order-mirror.js — credentials are the same
// encrypted TCD config; security lives in Firestore rules, not in hiding
// the config.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const APP_NAME = 'bankimart-writer';
const COLLECTION = 'bankibites_grocery_orders';
const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');

async function getWriterDb() {
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

// Call at page load to pre-open the Firebase connection so the checkout
// tap doesn't pay for a credentials fetch round-trip.
export function warmWriterConnection() {
  getWriterDb().catch(() => {});
}

async function withRetry(fn, retries = 3, baseDelayMs = 800) {
  for (let i = 0; i < retries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
}

function makeOrderId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// payload: {
//   items, subtotal, delivery_fee_estimated, total_estimated,
//   place, place_custom, customer:{name,phone}, eta_date, eta_window
// }
export async function writeGroceryOrder(payload) {
  const orderId = makeOrderId();
  const data = {
    vendor_id:               'bankimart',
    items:                   payload.items || [],
    subtotal:                Number(payload.subtotal) || 0,
    delivery_fee_estimated:  Number(payload.delivery_fee_estimated) || 0,
    total_estimated:         Number(payload.total_estimated) || 0,
    delivery_fee_final:      null,
    total_final:             null,
    place:                   payload.place || '',
    place_custom:            payload.place_custom === true,
    customer:                { name: payload.customer?.name || '', phone: payload.customer?.phone || '' },
    status:                  'new',
    eta_date:                payload.eta_date || '',
    eta_window:              payload.eta_window || '',
    delivery_run_id:         null,
    delivery_staff_id:       null,
    admin_adjustments:       [],
    created_at:              Timestamp.now(),
    approved_at:             null,
    dispatched_at:           null,
    delivered_at:            null,
  };
  await withRetry(async () => {
    const db = await getWriterDb();
    await setDoc(doc(db, COLLECTION, orderId), data);
  });
  return { id: orderId, data };
}
