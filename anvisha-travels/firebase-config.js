// Anvisha Travels Firebase bootstrap — uses the akcreation-apps Firebase
// project (same as /prompt-gallery/). Plain-JSON config sits beside this file.
//
// Each caller can supply an app name so admin and driver portals get
// independent auth sessions in the same browser.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  getAuth, setPersistence,
  browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';

const CONFIG_URL = new URL('./firebase-config.json', import.meta.url).href;

let _configPromise = null;
async function loadConfig() {
  if (_configPromise) return _configPromise;
  _configPromise = fetch(`${CONFIG_URL}?v=${Date.now()}`)
    .then(r => { if (!r.ok) throw new Error('Failed to load firebase-config.json'); return r.json(); });
  return _configPromise;
}

const _appPromises = new Map();
const _authPromises = new Map();

export function getAnvishaApp(name) {
  const key = name || '__default__';
  if (_appPromises.has(key)) return _appPromises.get(key);
  const p = (async () => {
    const cfg = await loadConfig();
    const existing = name
      ? getApps().find(a => a.name === name)
      : getApps().find(a => a.name === '[DEFAULT]');
    if (existing) return existing;
    return name ? initializeApp(cfg, name) : initializeApp(cfg);
  })();
  _appPromises.set(key, p);
  return p;
}

export async function getDb(name) {
  return getFirestore(await getAnvishaApp(name));
}

export async function getAuthInstance(name) {
  const key = name || '__default__';
  if (_authPromises.has(key)) return _authPromises.get(key);
  const p = (async () => {
    const auth = getAuth(await getAnvishaApp(name));
    const tries = [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence];
    for (const opt of tries) {
      try { await setPersistence(auth, opt); break; } catch (_) { /* try next */ }
    }
    return auth;
  })();
  _authPromises.set(key, p);
  return p;
}

// Collection names — change in one place if you rename later.
export const COL = {
  BOOKINGS:  'anvisha_bookings',
  TRIPS:     'anvisha_trips',
  CUSTOMERS: 'anvisha_customers',
  DRIVERS:   'anvisha_drivers',
  EXPENSES:  'anvisha_expenses',
  META:      'anvisha_meta',
};
