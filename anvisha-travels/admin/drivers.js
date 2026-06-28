import { COL } from '../firebase-config.js';
import {
  doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { fmtNum, fmtINR, normalisePhone } from './analytics.js';

// Driver allowlist lives at META/drivers as { uids: [...], profile: { uid: { name, phone } } }.
// This view lets admin add/remove entries and shows per-driver KPIs aggregated
// from anvisha_trips.

export async function renderDrivers(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-id-card"></i> Drivers</h2>
    <div class="card-an">
      <div class="card-head">
        <h3 class="card-title">Add / edit driver</h3>
      </div>
      <p class="card-sub mb-12">
        Drivers sign in to this panel with their Google account. Get the driver's <b>Firebase UID</b> from
        the Firebase Console (Authentication → Users) after they sign in once, then add it here so they
        get the driver dashboard on next sign-in.
      </p>
      <div class="f-row cols-3">
        <div class="f-group"><label class="f-label">UID</label><input id="dr-uid" type="text" class="f-input" placeholder="Firebase UID"></div>
        <div class="f-group"><label class="f-label">Name</label><input id="dr-name" type="text" class="f-input"></div>
        <div class="f-group"><label class="f-label">Phone (10 digits)</label><input id="dr-phone" type="tel" class="f-input"></div>
      </div>
      <button id="dr-save" class="btn-an mt-8"><i class="fas fa-check"></i> Save driver</button>
    </div>

    <h3 class="section-title" style="font-size:14px; margin-top:18px;"><i class="fas fa-list"></i> Active drivers</h3>
    <div id="dr-list" class="row-list"></div>
  `;

  const list = panel.querySelector('#dr-list');
  let meta = null;
  let tripAgg = new Map();   // uid -> { trips, km, fuelCost, miscCost }

  // Pull trip aggregates once. Re-render whenever meta updates.
  await refreshTripAgg(db).then(m => (tripAgg = m));

  onSnapshot(doc(db, COL.META, 'drivers'), snap => {
    meta = snap.exists() ? snap.data() : { uids: [], profile: {} };
    render();
  });

  panel.querySelector('#dr-save').addEventListener('click', async () => {
    const uid   = panel.querySelector('#dr-uid').value.trim();
    const name  = panel.querySelector('#dr-name').value.trim();
    const phone = normalisePhone(panel.querySelector('#dr-phone').value);
    if (!uid || !name || !phone) { Swal.fire('Missing fields', 'UID, name and phone are required.', 'warning'); return; }
    try {
      window.avBusy('Saving driver…');
      const ref = doc(db, COL.META, 'drivers');
      const cur = await getDoc(ref);
      const data = cur.exists() ? cur.data() : { uids: [], profile: {} };
      const uids = Array.isArray(data.uids) ? data.uids.slice() : [];
      if (!uids.includes(uid)) uids.push(uid);
      const profile = data.profile && typeof data.profile === 'object' ? { ...data.profile } : {};
      profile[uid] = { name, phone };
      await setDoc(ref, { uids, profile, updatedAt: serverTimestamp() }, { merge: true });
      window.avDone();
      panel.querySelector('#dr-uid').value = '';
      panel.querySelector('#dr-name').value = '';
      panel.querySelector('#dr-phone').value = '';
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1000, showConfirmButton: false });
    } catch (e) {
      window.avDone();
      Swal.fire('Save failed', e.message || String(e), 'error');
    }
  });

  function render() {
    if (!meta || !meta.uids || !meta.uids.length) {
      list.innerHTML = `<div class="empty"><i class="fas fa-user-slash"></i> No drivers configured yet.</div>`;
      return;
    }
    list.innerHTML = meta.uids.map(uid => {
      const p = (meta.profile && meta.profile[uid]) || {};
      const agg = tripAgg.get(uid) || { trips: 0, km: 0, fuelCost: 0, miscCost: 0 };
      return `
      <div class="row-card">
        <div class="row-top">
          <div class="flex-row flex-grow">
            <strong>${escapeHtml(p.name || uid.slice(0,8))}</strong>
            ${p.phone ? `<span class="text-muted-an">+91 ${escapeHtml(p.phone)}</span>` : ''}
          </div>
        </div>
        <div class="row-meta">
          <div><b>UID</b> <code style="font-size:11px;">${escapeHtml(uid)}</code></div>
          <div><b>Trips</b> ${fmtNum(agg.trips)}</div>
          <div><b>Km</b> ${fmtNum(agg.km)}</div>
          <div><b>Fuel</b> ${fmtINR(agg.fuelCost)}</div>
          <div><b>Misc</b> ${fmtINR(agg.miscCost)}</div>
        </div>
        <div class="row-actions">
          <button class="btn-an btn-an-outline btn-an-sm" data-action="remove" data-uid="${escapeAttr(uid)}"><i class="fas fa-user-minus"></i> Remove</button>
        </div>
      </div>
      `;
    }).join('');
    list.querySelectorAll('[data-action="remove"]').forEach(el => {
      el.addEventListener('click', () => removeDriver(db, el.dataset.uid));
    });
  }
}

async function refreshTripAgg(db) {
  const m = new Map();
  try {
    const snap = await getDocs(collection(db, COL.TRIPS));
    snap.forEach(d => {
      const t = d.data();
      const uid = t.driver && t.driver.uid;
      if (!uid) return;
      const a = m.get(uid) || { trips: 0, km: 0, fuelCost: 0, miscCost: 0 };
      a.trips += 1;
      a.km += Number(t.km || 0);
      a.fuelCost += Number((t.fuel && t.fuel.cost) || 0);
      a.miscCost += Number(t.miscCost || 0);
      m.set(uid, a);
    });
  } catch (_) { /* swallow */ }
  return m;
}

async function removeDriver(db, uid) {
  const r = await Swal.fire({ title: 'Remove driver?', text: 'They will no longer be able to access the driver portal. Their past trips remain.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#ef4444' });
  if (!r.isConfirmed) return;
  try {
    window.avBusy('Removing…');
    const ref = doc(db, COL.META, 'drivers');
    const cur = await getDoc(ref);
    if (!cur.exists()) { window.avDone(); return; }
    const data = cur.data();
    const uids = (data.uids || []).filter(x => x !== uid);
    const profile = { ...(data.profile || {}) };
    delete profile[uid];
    await setDoc(ref, { uids, profile, updatedAt: serverTimestamp() }, { merge: true });
    window.avDone();
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
