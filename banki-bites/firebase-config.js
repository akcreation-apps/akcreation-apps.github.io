// Shared Firebase bootstrap for all BankiBites pages (public, admin, delivery).
// Reuses the same Firebase project as TCD — credentials live in /TCD/credentials.json
// and are decrypted with the same key. Security comes from Firestore rules + Auth,
// not from hiding this config (Firebase configs are inherently public).

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { getAuth, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';

const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');

function decrypt(value) {
  return CryptoJS.AES.decrypt(value, ENC_KEY).toString(CryptoJS.enc.Utf8);
}

let _appPromise = null;

export function getBankiBitesApp() {
  if (_appPromise) return _appPromise;
  _appPromise = (async () => {
    if (getApps().length) return getApp();
    const res = await fetch(`https://akcreation-apps.com/TCD/credentials.json?v=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load Firebase credentials');
    const c = await res.json();
    const firebaseConfig = {
      apiKey:            decrypt(c.API_KEY),
      authDomain:        decrypt(c.AUTH_DOMAIN),
      projectId:         decrypt(c.ID),
      storageBucket:     decrypt(c.STORAGE_BUCKET),
      messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
      appId:             decrypt(c.APP_ID),
      measurementId:     decrypt(c.MEASUREMENT_ID),
    };
    return initializeApp(firebaseConfig);
  })();
  return _appPromise;
}

export async function getDb() {
  return getFirestore(await getBankiBitesApp());
}

let _authPromise = null;
export async function getAuthInstance() {
  if (_authPromise) return _authPromise;
  _authPromise = (async () => {
    const auth = getAuth(await getBankiBitesApp());
    // Try the most persistent option first; fall back gracefully if the browser
    // blocks the storage (incognito, partitioned storage, etc.) so sign-in still
    // works for the current tab session.
    const tries = [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence];
    for (const p of tries) {
      try {
        await setPersistence(auth, p);
        console.log('[bankibites] auth persistence set to', p.type || p);
        break;
      } catch (e) {
        console.warn('[bankibites] persistence option failed, trying next:', e.message);
      }
    }
    return auth;
  })();
  return _authPromise;
}

// Collection names — change in one place if you rename later.
export const COL = {
  PARTNERS: 'bankibites_partners',
  ORDERS:   'bankibites_orders',
  STAFF:    'bankibites_delivery_staff',
  CUSTOMERS:'bankibites_customers',
  META:     'bankibites_meta',
};
