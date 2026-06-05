// Side-channel write that mirrors a placed restaurant order into the central
// BankiBites Firestore. Uses a SEPARATE named Firebase app so the host
// restaurant's existing app stays untouched. Failures here must NEVER block
// the restaurant's primary order flow — callers should swallow rejections.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, collection, addDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

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

export async function mirrorToBankiBites(payload) {
  const db = await getMirrorDb();
  const doc = {
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
    created_at:      Timestamp.now(),
  };
  return addDoc(collection(db, 'bankibites_orders'), doc);
}
