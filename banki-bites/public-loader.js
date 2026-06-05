// Exposes window.bankiBitesLoad() — returns Promise<{partners, locations}>
// in the same shape the legacy JSON used. Prefers Firestore; falls back to the
// static JSON file if Firestore is unreachable.

import { getDb, COL } from './firebase-config.js';
import { collection, getDocs, query, orderBy, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

async function loadFromFirestore() {
  const db = await getDb();
  const partnersSnap = await getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order')));
  const partners = [];
  partnersSnap.forEach(d => partners.push(d.data()));

  let locations = [];
  try {
    const locDoc = await getDoc(doc(db, COL.META, 'locations'));
    if (locDoc.exists()) locations = locDoc.data().items || [];
  } catch (_) { /* ignore — partners alone is enough to render */ }

  if (!partners.length) throw new Error('no partners in firestore');
  return { partners, locations };
}

async function loadFromJson() {
  const res = await fetch('https://akcreation-apps.com/banki-bites-partners.json?v=' + Date.now());
  if (!res.ok) throw new Error('json fallback failed');
  return res.json();
}

window._bankiBitesImpl = async function () {
  try {
    return await loadFromFirestore();
  } catch (e) {
    console.warn('Firestore partner load failed, using JSON fallback:', e.message);
    return loadFromJson();
  }
};
if (window._bankiBitesReadyResolve) window._bankiBitesReadyResolve();
