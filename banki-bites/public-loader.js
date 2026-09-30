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

// banki-bites-partners.json is the authoritative source for eta_minutes on both
// web and Android. Overlay its values onto Firestore partners (matched by name)
// so a single JSON edit updates ETA everywhere without touching Firestore.
async function overlayEtaFromJson(fsData) {
  try {
    const jsonData = await loadFromJson();
    const etaByName = new Map(
      (jsonData.partners || [])
        .filter(p => p && p.name != null && p.eta_minutes != null)
        .map(p => [p.name, Number(p.eta_minutes)])
    );
    if (etaByName.size) {
      fsData.partners = (fsData.partners || []).map(p => {
        const eta = etaByName.get(p && p.name);
        return eta != null ? { ...p, eta_minutes: eta } : p;
      });
    }
  } catch (e) {
    console.warn('ETA overlay from JSON skipped:', e.message);
  }
  return fsData;
}

window._bankiBitesImpl = async function () {
  try {
    const fsData = await loadFromFirestore();
    return await overlayEtaFromJson(fsData);
  } catch (e) {
    console.warn('Firestore partner load failed, using JSON fallback:', e.message);
    return loadFromJson();
  }
};
if (window._bankiBitesReadyResolve) window._bankiBitesReadyResolve();
