// Writes "no result" search queries to Firestore so admin can see what
// customers want that we don't stock yet. Aggregated shape — one doc per
// unique keyword, `count_total` bumped atomically on each hit.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import {
  getFirestore, doc, setDoc, increment, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const APP_NAME = 'bankimart-writer';
const COLLECTION = 'bankibites_grocery_missing_searches';
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

// Firestore doc IDs can't contain "/" and must be 1–1500 bytes. Normalise the
// query into a stable slug so the same keyword always hits the same doc.
export function slugifyQuery(q) {
  return String(q || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 120)
    || 'unknown';
}

// payload: { query, page }
export async function writeMissingSearch(payload) {
  const query = String(payload.query || '').trim().slice(0, 120);
  const slug  = slugifyQuery(query);
  const db    = await getWriterDb();
  const ref   = doc(db, COLLECTION, slug);
  await setDoc(ref, {
    vendor_id:   'bankimart',
    query,                                    // display form (first-write wins via merge)
    query_lc:    query.toLowerCase(),
    count_total: increment(1),
    last_seen:   serverTimestamp(),
    last_page:   String(payload.page || '').slice(0, 200),
  }, { merge: true });
  return { id: slug };
}
