// Shared Firebase bootstrap for all BankiBites pages (public, admin, delivery).
// Reuses the same Firebase project as TCD — credentials live in /TCD/credentials.json
// and are decrypted with the same key. Security comes from Firestore rules + Auth,
// not from hiding this config (Firebase configs are inherently public).
//
// Each caller can supply an app name so admin and delivery portals get
// independent auth sessions in the same browser.

import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { getAuth, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';

const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');

function decrypt(value) {
  return CryptoJS.AES.decrypt(value, ENC_KEY).toString(CryptoJS.enc.Utf8);
}

let _rawCredsPromise = null;
function loadRawCredentials() {
  if (_rawCredsPromise) return _rawCredsPromise;
  _rawCredsPromise = fetch(`https://akcreation-apps.com/TCD/credentials.json?v=${Date.now()}`)
    .then(r => { if (!r.ok) throw new Error('Failed to load Firebase credentials'); return r.json(); });
  return _rawCredsPromise;
}

let _configPromise = null;
async function loadConfig() {
  if (_configPromise) return _configPromise;
  _configPromise = (async () => {
    const c = await loadRawCredentials();
    return {
      apiKey:            decrypt(c.API_KEY),
      authDomain:        decrypt(c.AUTH_DOMAIN),
      projectId:         decrypt(c.ID),
      storageBucket:     decrypt(c.STORAGE_BUCKET),
      messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
      appId:             decrypt(c.APP_ID),
      measurementId:     decrypt(c.MEASUREMENT_ID),
    };
  })();
  return _configPromise;
}

export async function getTcdDbName() {
  const c = await loadRawCredentials();
  return decrypt(c.DB_NAME);
}

const _appPromises = new Map();
const _authPromises = new Map();

export function getBankiBitesApp(name) {
  const key = name || '__default__';
  if (_appPromises.has(key)) return _appPromises.get(key);
  const p = (async () => {
    const cfg = await loadConfig();
    const existing = name
      ? getApps().find(a => a.name === name)
      : (getApps().find(a => a.name === '[DEFAULT]'));
    if (existing) return existing;
    return name ? initializeApp(cfg, name) : initializeApp(cfg);
  })();
  _appPromises.set(key, p);
  return p;
}

export async function getDb(name) {
  return getFirestore(await getBankiBitesApp(name));
}

export async function getAuthInstance(name) {
  const key = name || '__default__';
  if (_authPromises.has(key)) return _authPromises.get(key);
  const p = (async () => {
    const auth = getAuth(await getBankiBitesApp(name));
    // Try the most persistent option first; fall back gracefully if the browser
    // blocks the storage (incognito, partitioned storage, etc.) so sign-in still
    // works for the current tab session.
    const tries = [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence];
    for (const opt of tries) {
      try {
        await setPersistence(auth, opt);
        console.log('[bankibites]', name || 'default', 'persistence set to', opt.type || opt);
        break;
      } catch (e) {
        console.warn('[bankibites]', name || 'default', 'persistence option failed, trying next:', e.message);
      }
    }
    return auth;
  })();
  _authPromises.set(key, p);
  return p;
}

// Collection names — change in one place if you rename later.
export const COL = {
  PARTNERS: 'bankibites_partners',
  ORDERS:   'bankibites_orders',
  STAFF:    'bankibites_delivery_staff',
  CUSTOMERS:'bankibites_customers',
  META:     'bankibites_meta',
};
