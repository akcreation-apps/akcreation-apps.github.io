import { COL } from '../firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, updateDoc, setDoc, serverTimestamp, writeBatch, increment, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { fmtDate, fmtDateTime, fmtTimeLabel, toDateSafe, wirePhoneInput, wirePlaceAutocomplete } from './analytics.js';

// Shared place registry — a single doc at anvisha_meta/places with a `list`
// array. Both admin and driver write to it (arrayUnion) when saving a trip or
// booking; both read from it. This way a place typed by the admin appears in
// the driver's autocomplete (and vice-versa) without giving anyone broad read
// access to the full trips/bookings collections.
let _placeCache = null;
let _placeCachePromise = null;
async function loadKnownPlaces(db) {
  if (_placeCache) return _placeCache;
  if (_placeCachePromise) return _placeCachePromise;
  _placeCachePromise = (async () => {
    const set = new Set();
    const norm = s => String(s || '').trim();
    try {
      const meta = await getDoc(doc(db, COL.META, 'places'));
      if (meta.exists()) {
        const list = meta.data().list || [];
        list.forEach(p => { const n = norm(p); if (n) set.add(n); });
      }
    } catch (_) { /* swallow — meta doc may not exist yet */ }
    // Best-effort fall-back: scan own data (admin sees everything, driver
    // sees only their own trips + allocated bookings) so even if the meta
    // doc is empty, the user still gets some suggestions on day one.
    try {
      const snap = await getDocs(collection(db, COL.TRIPS));
      snap.forEach(d => {
        const r = (d.data() || {}).route || {};
        const s = norm(r.source);  if (s) set.add(s);
        const dst = norm(r.destination); if (dst) set.add(dst);
      });
    } catch (_) { /* fine */ }
    try {
      const snap = await getDocs(collection(db, COL.BOOKINGS));
      snap.forEach(d => {
        const dst = norm((d.data() || {}).destination); if (dst) set.add(dst);
      });
    } catch (_) { /* fine */ }
    _placeCache = Array.from(set).sort((a, b) => a.localeCompare(b));
    return _placeCache;
  })();
  return _placeCachePromise;
}
function bustPlaceCache() { _placeCache = null; _placeCachePromise = null; }

// Append place name(s) to the shared registry. Best-effort — never blocks
// the main save flow. Trims, de-duplicates, ignores empties.
async function addPlacesToRegistry(db, names) {
  const cleaned = (names || [])
    .map(s => String(s || '').trim())
    .filter(Boolean);
  if (!cleaned.length) return;
  try {
    await setDoc(doc(db, COL.META, 'places'), {
      list: arrayUnion(...cleaned),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    bustPlaceCache();
  } catch (_) { /* swallow — autocomplete still works from local scan */ }
}

const FUEL_TYPES = ['CNG', 'Petrol', 'Diesel'];

// ── Admin tab: list all trips, filter tied/untied, tie-to-booking modal ──
export async function renderTrips(ctx, role) {
  const { panel, db } = ctx;
  const filters = [
    { key: 'untied', label: 'Untied', match: t => !t.bookingId },
    { key: 'tied',   label: 'Tied',   match: t => !!t.bookingId },
    { key: 'all',    label: 'All',    match: () => true },
  ];

  panel.innerHTML = `
    <div class="av-toolbar">
      <div class="av-toolbar__left">
        <button id="tr-new" class="btn-an btn-an-sm av-toolbar__btn">
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span class="av-toolbar__btn-text">Log trip</span>
          <span class="av-toolbar__count" id="tr-count" aria-live="polite" aria-atomic="true"></span>
        </button>
      </div>
      <div class="av-toolbar__right">
        <label for="tr-filter" class="sr-only">Filter trips</label>
        <select id="tr-filter" class="f-select av-toolbar__select">
          ${filters.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="tr-list" class="row-list"></div>
  `;

  let active = 'untied';
  let trips = [];

  const filterSelect = panel.querySelector('#tr-filter');
  filterSelect.value = active;
  filterSelect.addEventListener('change', () => { active = filterSelect.value; render(); });

  const list = panel.querySelector('#tr-list');
  const count = panel.querySelector('#tr-count');

  onSnapshot(query(collection(db, COL.TRIPS), orderBy('createdAt', 'desc')), snap => {
    trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
  });

  panel.querySelector('#tr-new').addEventListener('click', () => openTripLogModal(db, ctx, /*admin*/ true));

  function render() {
    const f = filters.find(x => x.key === active);
    const rows = trips.filter(f.match);
    count.textContent = rows.length ? `· ${rows.length}` : '';
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><i class="far fa-flag"></i> No trips yet.</div>`;
      return;
    }
    list.innerHTML = rows.map(renderRow).join('');
    list.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handle(db, ctx, el.dataset.action, el.dataset.id, trips));
    });
  }
}

// ── Driver-only panel: log new trip + show their recent trips ──
export async function renderDriverTripPanel(ctx) {
  const { panel, db, driver } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-road"></i> ${escapeHtml(driver.name || 'Driver')} — Trip Log</h2>
    <div class="card-an">
      <h3 class="card-title mb-12">Log a new trip</h3>
      <div id="dt-form"></div>
    </div>
    <h3 class="section-title" style="font-size:14px; margin-top:18px;"><i class="fas fa-clock-rotate-left"></i> Recent trips</h3>
    <div id="dt-list" class="row-list"></div>
  `;
  await renderDriverForm(panel.querySelector('#dt-form'), db, ctx);

  const list = panel.querySelector('#dt-list');
  onSnapshot(
    query(collection(db, COL.TRIPS), where('driver.uid', '==', driver.uid), orderBy('createdAt', 'desc'), limit(20)),
    snap => {
      const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!trips.length) {
        list.innerHTML = `<div class="empty"><i class="far fa-flag"></i> No trips logged yet.</div>`;
        return;
      }
      list.innerHTML = trips.map(renderRow).join('');
    },
    err => {
      list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
    }
  );
}

async function renderDriverForm(host, db, ctx) {
  const today = new Date().toISOString().slice(0, 10);
  const places = await loadKnownPlaces(db).catch(() => []);
  host.innerHTML = `
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label" for="dt-date">Date <span aria-hidden="true">*</span><span class="sr-only"> (required)</span></label>
        <input id="dt-date" type="date" class="f-input" value="${today}" required>
      </div>
      <div class="f-group">
        <label class="f-label" for="dt-km">Distance (km) <span aria-hidden="true">*</span><span class="sr-only"> (required)</span></label>
        <input id="dt-km" type="number" class="f-input" min="0" step="0.5" inputmode="decimal" placeholder="e.g. 42" required>
      </div>
    </div>
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label" for="dt-src">Source <span aria-hidden="true">*</span><span class="sr-only"> (required)</span></label>
        <input id="dt-src" type="text" class="f-input" placeholder="e.g. Banki" required>
      </div>
      <div class="f-group">
        <label class="f-label" for="dt-dst">Destination <span aria-hidden="true">*</span><span class="sr-only"> (required)</span></label>
        <input id="dt-dst" type="text" class="f-input" placeholder="e.g. Cuttack Rly Station" required>
      </div>
    </div>
    <div class="f-row cols-3">
      <div class="f-group">
        <label class="f-label" for="dt-ftype">Fuel type <span class="text-muted-an" style="font-weight:400; letter-spacing:0;">— optional</span></label>
        <select id="dt-ftype" class="f-select">
          <option value="">—</option>
          ${FUEL_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>
      <div class="f-group">
        <label class="f-label" for="dt-fcost">Fuel cost (₹) <span class="text-muted-an" style="font-weight:400; letter-spacing:0;">— optional</span></label>
        <input id="dt-fcost" type="number" class="f-input" min="0" step="1" inputmode="numeric" placeholder="e.g. 480">
      </div>
      <div class="f-group">
        <label class="f-label" for="dt-fqty">Fuel qty (L / kg) <span class="text-muted-an" style="font-weight:400; letter-spacing:0;">— optional</span></label>
        <input id="dt-fqty" type="number" class="f-input" min="0" step="0.1" inputmode="decimal" placeholder="e.g. 4.5">
      </div>
    </div>
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label" for="dt-misc">Misc (toll/parking ₹)</label>
        <input id="dt-misc" type="number" class="f-input" min="0" step="1" inputmode="numeric" placeholder="0">
      </div>
      <div class="f-group">
        <label class="f-label" for="dt-notes">Notes (optional)</label>
        <input id="dt-notes" type="text" class="f-input" placeholder="anything to flag for admin">
      </div>
    </div>
    <button id="dt-save" class="btn-an btn-an-block mt-12"><i class="fas fa-check"></i> Save trip</button>
  `;
  // Source / destination autocomplete from known places.
  wirePlaceAutocomplete(host.querySelector('#dt-src'), places);
  wirePlaceAutocomplete(host.querySelector('#dt-dst'), places);

  host.querySelector('#dt-save').addEventListener('click', async () => {
    const payload = collectDriverForm(host);
    if (!payload) return;
    try {
      window.avBusy('Saving trip…');
      await addDoc(collection(db, COL.TRIPS), {
        ...payload,
        driver: ctx.driver,
        bookingId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      window.avDone();
      // Register both endpoints so they appear in the autocomplete for
      // everyone (admin + drivers) on the next form open.
      addPlacesToRegistry(db, [payload.route.source, payload.route.destination]);
      Swal.fire({ icon: 'success', title: 'Trip logged', timer: 1400, showConfirmButton: false });
      // Reset trip-specific fields but keep date AND source (drivers usually
      // depart from the same town all day — re-typing it is friction).
      ['dt-km','dt-dst','dt-fqty','dt-fcost','dt-misc','dt-notes'].forEach(id => host.querySelector('#' + id).value = '');
    } catch (e) {
      window.avDone();
      Swal.fire('Save failed', e.message || String(e), 'error');
    }
  });
}

function collectDriverForm(host) {
  const date     = host.querySelector('#dt-date').value;
  const km       = parseFloat(host.querySelector('#dt-km').value);
  const src      = host.querySelector('#dt-src').value.trim();
  const dst      = host.querySelector('#dt-dst').value.trim();
  const ftype    = host.querySelector('#dt-ftype').value;
  const fqtyRaw  = host.querySelector('#dt-fqty').value;
  const fqty     = fqtyRaw === '' ? null : parseFloat(fqtyRaw);
  const fcostRaw = host.querySelector('#dt-fcost').value;
  const fcost    = fcostRaw === '' ? null : parseFloat(fcostRaw);
  const misc     = parseFloat(host.querySelector('#dt-misc').value) || 0;
  const notes    = host.querySelector('#dt-notes').value.trim();

  if (!date || isNaN(km) || km <= 0 || !src || !dst) {
    Swal.fire('Missing fields', 'Please fill date, km and route.', 'warning');
    return null;
  }
  if (fqty != null && isNaN(fqty)) {
    Swal.fire('Bad fuel qty', 'Fuel qty must be a number (or leave it empty).', 'warning');
    return null;
  }
  if (fcost != null && isNaN(fcost)) {
    Swal.fire('Bad fuel cost', 'Fuel cost must be a number (or leave it empty).', 'warning');
    return null;
  }
  // If no fuel cost was entered, drop the entire fuel object — type without a
  // cost adds nothing useful and skews the P&L "fuel by type" charts.
  const fuel = (fcost == null) ? null : { type: ftype || null, qty: fqty, cost: fcost };
  return {
    date, km,
    route: { source: src, destination: dst },
    fuel,
    miscCost: misc,
    notes: notes || null,
  };
}

function renderRow(t) {
  const fuel = t.fuel || null;
  const route = t.route || {};
  const tied = t.bookingId
    ? `<span class="chip in_progress"><i class="fas fa-link"></i> Tied</span>`
    : `<span class="chip untied"><i class="fas fa-link-slash"></i> Untied</span>`;
  const fuelLine = fuel
    ? `<div><b>Fuel</b> ${escapeHtml(fuel.type || '—')} · ${fuel.qty != null ? escapeHtml(String(fuel.qty)) + ' · ' : ''}₹${escapeHtml(String(fuel.cost ?? 0))}</div>`
    : '';
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(fmtDate(t.date))}</strong>
        <span class="text-muted-an">${escapeHtml(route.source || '?')} → ${escapeHtml(route.destination || '?')}</span>
      </div>
      ${tied}
    </div>
    <div class="row-meta">
      <div><b>Driver</b> ${escapeHtml((t.driver && t.driver.name) || '—')}</div>
      <div><b>Distance</b> ${escapeHtml(String(t.km ?? 0))} km</div>
      ${fuelLine}
      <div><b>Misc</b> ₹${escapeHtml(String(t.miscCost ?? 0))}</div>
      ${t.notes ? `<div><b>Notes</b> ${escapeHtml(t.notes)}</div>` : ''}
    </div>
    <div class="row-actions">
      ${!t.bookingId ? `<button class="btn-an btn-an-sm" data-action="tie" data-id="${t.id}"><i class="fas fa-link"></i> Tie to booking</button>` : ''}
      ${t.bookingId ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="open-booking" data-id="${t.bookingId}"><i class="fas fa-up-right-from-square"></i> Open booking</button>` : ''}
      ${t.bookingId ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="untie" data-id="${t.id}"><i class="fas fa-link-slash"></i> Untie</button>` : ''}
      <button class="btn-an btn-an-outline btn-an-sm" data-action="delete-trip" data-id="${t.id}" style="margin-left:auto;" aria-label="Delete trip" title="Delete trip"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  </div>
  `;
}

async function handle(db, ctx, action, id, trips) {
  const t = trips.find(x => x.id === id);
  try {
    if (action === 'tie' && t)         return openTieModal(db, t);
    if (action === 'untie' && t)       return untieTrip(db, t);
    if (action === 'delete-trip' && t) return deleteTrip(db, t);
    if (action === 'open-booking') {
      ctx.invalidate && ctx.invalidate('bookings');
      ctx.activateTab && ctx.activateTab('bookings');
      return;
    }
    if (action === 'log')              return openTripLogModal(db, ctx, true);
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

// Delete a trip. If it's tied to a booking, first clear booking.tripId and
// revert that booking from 'completed' back to 'allocated' (or 'confirmed' if
// no driver was allocated) so the workflow isn't stuck in a misleading state.
async function deleteTrip(db, t) {
  const warn = t.bookingId
    ? 'This trip is tied to a booking. The booking will be reverted to "allocated" and unlinked from this trip.'
    : 'This trip will be permanently deleted.';
  const r = await Swal.fire({
    title: 'Delete trip?',
    text: warn,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#ef4444',
  });
  if (!r.isConfirmed) return;
  window.avBusy('Deleting…');
  try {
    if (t.bookingId) {
      // Look up booking to choose the right revert status.
      let revertTo = 'allocated';
      try {
        const bDoc = await getDoc(doc(db, COL.BOOKINGS, t.bookingId));
        if (bDoc.exists()) {
          const b = bDoc.data();
          if (b.allocatedDriver && b.allocatedDriver.uid) revertTo = 'allocated';
          else if (b.confirmedAt) revertTo = 'confirmed';
          else revertTo = 'new';
        }
      } catch (_) { /* fall back to 'allocated' */ }

      const batch = writeBatch(db);
      batch.update(doc(db, COL.BOOKINGS, t.bookingId), {
        status: revertTo,
        tripId: null,
        completedAt: null,
        updatedAt: serverTimestamp(),
      });
      batch.delete(doc(db, COL.TRIPS, t.id));
      await batch.commit();
    } else {
      await deleteDoc(doc(db, COL.TRIPS, t.id));
    }
    window.avDone();
    Swal.fire({ icon: 'success', title: 'Trip deleted', timer: 1200, showConfirmButton: false });
  } catch (e) {
    window.avDone();
    Swal.fire('Delete failed', e.message || String(e), 'error');
  }
}

async function openTripLogModal(db, ctx, isAdmin) {
  // Admin trip-log uses the same form but lets admin specify the driver UID.
  // To keep first version simple, default to the signed-in admin as the driver.
  const driver = ctx.driver || { uid: ctx.user.uid, name: ctx.user.displayName || ctx.user.email, phone: '' };
  const today = new Date().toISOString().slice(0, 10);
  const places = await loadKnownPlaces(db).catch(() => []);
  const r = await Swal.fire({
    title: 'Log trip',
    width: 640,
    showCancelButton: true,
    confirmButtonText: 'Save',
    didOpen: () => {
      wirePlaceAutocomplete(document.getElementById('tlm-src'), places);
      wirePlaceAutocomplete(document.getElementById('tlm-dst'), places);
    },
    html: `
      <div style="text-align:left;">
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label" for="tlm-date">Date</label><input id="tlm-date" type="date" class="f-input" value="${today}"></div>
          <div class="f-group"><label class="f-label" for="tlm-km">Distance (km)</label><input id="tlm-km" type="number" class="f-input" min="0" step="0.5" inputmode="decimal"></div>
        </div>
        <div class="f-row cols-2">
          <div class="f-group" style="position:relative;"><label class="f-label" for="tlm-src">Source</label><input id="tlm-src" type="text" class="f-input" autocomplete="off"></div>
          <div class="f-group" style="position:relative;"><label class="f-label" for="tlm-dst">Destination</label><input id="tlm-dst" type="text" class="f-input" autocomplete="off"></div>
        </div>
        <div class="f-row cols-3">
          <div class="f-group"><label class="f-label" for="tlm-ftype">Fuel type (optional)</label>
            <select id="tlm-ftype" class="f-select">
              <option value="">—</option>
              ${FUEL_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
            </select>
          </div>
          <div class="f-group"><label class="f-label" for="tlm-fcost">Fuel ₹ (optional)</label><input id="tlm-fcost" type="number" class="f-input" min="0" inputmode="numeric"></div>
          <div class="f-group"><label class="f-label" for="tlm-fqty">Qty (optional)</label><input id="tlm-fqty" type="number" class="f-input" min="0" step="0.1" inputmode="decimal"></div>
        </div>
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label" for="tlm-misc">Misc ₹</label><input id="tlm-misc" type="number" class="f-input" min="0" inputmode="numeric"></div>
          <div class="f-group"><label class="f-label" for="tlm-notes">Notes</label><input id="tlm-notes" type="text" class="f-input"></div>
        </div>
      </div>
    `,
    preConfirm: () => {
      const date = document.getElementById('tlm-date').value;
      const km   = parseFloat(document.getElementById('tlm-km').value);
      const src  = document.getElementById('tlm-src').value.trim();
      const dst  = document.getElementById('tlm-dst').value.trim();
      const ft     = document.getElementById('tlm-ftype').value;
      const fqRaw  = document.getElementById('tlm-fqty').value;
      const fq     = fqRaw === '' ? null : parseFloat(fqRaw);
      const fcRaw  = document.getElementById('tlm-fcost').value;
      const fc     = fcRaw === '' ? null : parseFloat(fcRaw);
      if (!date || isNaN(km) || !src || !dst) {
        Swal.showValidationMessage('Fill date, km and route');
        return false;
      }
      if (fq != null && isNaN(fq)) {
        Swal.showValidationMessage('Fuel qty must be a number (or leave it empty)');
        return false;
      }
      if (fc != null && isNaN(fc)) {
        Swal.showValidationMessage('Fuel cost must be a number (or leave it empty)');
        return false;
      }
      // No cost → no fuel record at all (drop type + qty too).
      const fuel = (fc == null) ? null : { type: ft || null, qty: fq, cost: fc };
      return {
        date, km,
        route: { source: src, destination: dst },
        fuel,
        miscCost: parseFloat(document.getElementById('tlm-misc').value) || 0,
        notes: document.getElementById('tlm-notes').value.trim() || null,
      };
    },
  });
  if (!r.isConfirmed) return;
  window.avBusy('Saving…');
  await addDoc(collection(db, COL.TRIPS), {
    ...r.value, driver, bookingId: null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  addPlacesToRegistry(db, [r.value.route && r.value.route.source, r.value.route && r.value.route.destination]);
  window.avDone();
}

async function untieTrip(db, t) {
  const r = await Swal.fire({ title: 'Untie trip?', text: 'Booking will remain but the link will be removed.', icon: 'warning', showCancelButton: true });
  if (!r.isConfirmed) return;
  window.avBusy('Saving…');
  const batch = writeBatch(db);
  batch.update(doc(db, COL.TRIPS, t.id), { bookingId: null, updatedAt: serverTimestamp() });
  if (t.bookingId) {
    batch.update(doc(db, COL.BOOKINGS, t.bookingId), { tripId: null, updatedAt: serverTimestamp() });
  }
  await batch.commit();
  window.avDone();
}

async function openTieModal(db, trip) {
  // Pre-fetch candidate bookings: status active, date within ±2 days of trip date.
  const tripDate = trip.date;
  let candidates = [];
  try {
    const snap = await getDocs(query(
      collection(db, COL.BOOKINGS),
      where('status', 'in', ['new', 'confirmed', 'allocated', 'in_progress']),
      orderBy('date', 'desc'),
      limit(30),
    ));
    const within = d => {
      if (!d.date || !tripDate) return true;
      const a = new Date(d.date), b = new Date(tripDate);
      return Math.abs((a - b) / 86400000) <= 2;
    };
    candidates = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(within);
  } catch (e) {
    // index may not exist on a fresh project — fall back to a simple list
    const snap = await getDocs(query(collection(db, COL.BOOKINGS), orderBy('createdAt', 'desc'), limit(50)));
    candidates = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => ['new','confirmed','allocated','in_progress'].includes(b.status || 'new'));
  }

  const candHtml = candidates.length
    ? candidates.map(b => `
        <label class="tie-cand">
          <input type="radio" name="tie-pick" value="${b.id}">
          <span>
            <strong>${escapeHtml(fmtDate(b.date))}</strong> · ${escapeHtml(fmtTimeLabel(b.time))} · ${escapeHtml(b.passengers || '?')} pax
            ${b.destination ? ' · → ' + escapeHtml(b.destination) : ''}
            <br><small class="text-muted-an">${escapeHtml((b.customer && b.customer.name) || 'unidentified')}${b.customer && b.customer.phone ? ' · ' + escapeHtml(b.customer.phone) : ''}</small>
          </span>
        </label>
      `).join('')
    : '<p class="text-muted-an"><i class="fas fa-info-circle"></i> No active bookings nearby. Create one below.</p>';

  const html = `
    <style>
      .tie-tabs { display:flex; gap:6px; margin-bottom:12px; }
      .tie-tabs button { flex:1; padding:8px; border:1px solid var(--border-hi); background:var(--surface); color:var(--text-2); border-radius:8px; font-weight:600; cursor:pointer; }
      .tie-tabs button.active { background:var(--gold-dim); border-color:rgba(245,166,35,0.40); color:var(--gold); }
      .tie-pane { display:none; }
      .tie-pane.active { display:block; }
      .tie-cand { display:flex; gap:10px; padding:10px; border:1px solid var(--border-hi); border-radius:8px; margin-bottom:6px; cursor:pointer; align-items:flex-start; text-align:left; }
      .tie-cand input { margin-top:3px; }
      .tie-cand span { flex:1; font-size:13px; }
    </style>
    <div class="tie-tabs">
      <button type="button" data-pane="pick" class="active">Pick existing</button>
      <button type="button" data-pane="create">Create + tie</button>
    </div>
    <div class="tie-pane active" data-pane="pick" style="max-height:320px; overflow:auto; text-align:left;">
      ${candHtml}
    </div>
    <div class="tie-pane" data-pane="create" style="text-align:left;">
      <div class="f-row cols-2">
        <div class="f-group"><label class="f-label" for="ct-date">Date</label><input id="ct-date" type="date" class="f-input" value="${trip.date || ''}"></div>
        <div class="f-group"><label class="f-label" for="ct-time">Time</label><input id="ct-time" type="time" class="f-input"></div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group"><label class="f-label" for="ct-pax">Passengers</label><input id="ct-pax" type="text" class="f-input" placeholder="e.g. 4"></div>
        <div class="f-group"><label class="f-label" for="ct-dest">Destination</label><input id="ct-dest" type="text" class="f-input" value="${escapeAttr((trip.route && trip.route.destination) || '')}"></div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group"><label class="f-label" for="ct-name">Customer name</label><input id="ct-name" type="text" class="f-input"></div>
        <div class="f-group"><label class="f-label" for="ct-phone">Customer phone</label><input id="ct-phone" type="tel" class="f-input" inputmode="numeric"></div>
      </div>
    </div>
  `;
  const r = await Swal.fire({
    title: 'Tie trip to booking',
    html,
    width: 680,
    showCancelButton: true,
    confirmButtonText: 'Tie',
    didOpen: async () => {
      document.querySelectorAll('.tie-tabs button').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.tie-tabs button').forEach(x => x.classList.toggle('active', x === b));
          document.querySelectorAll('.tie-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.pane));
        });
      });
      const phoneEl = document.getElementById('ct-phone');
      if (phoneEl) wirePhoneInput(phoneEl);
      const destEl = document.getElementById('ct-dest');
      if (destEl) {
        const places = await loadKnownPlaces(db).catch(() => []);
        const dg = destEl.closest('.f-group'); if (dg) dg.style.position = 'relative';
        wirePlaceAutocomplete(destEl, places);
      }
    },
    preConfirm: () => {
      const activePane = document.querySelector('.tie-tabs button.active').dataset.pane;
      if (activePane === 'pick') {
        const picked = document.querySelector('input[name="tie-pick"]:checked');
        if (!picked) { Swal.showValidationMessage('Pick a booking or switch to "Create + tie".'); return false; }
        return { mode: 'pick', bookingId: picked.value };
      }
      const date = document.getElementById('ct-date').value;
      const time = document.getElementById('ct-time').value;
      const pax  = document.getElementById('ct-pax').value.trim();
      if (!date || !time || !pax) { Swal.showValidationMessage('Date, time and passengers required'); return false; }
      return {
        mode: 'create',
        booking: {
          date, time, passengers: pax,
          destination: document.getElementById('ct-dest').value.trim() || null,
          customer: {
            name:  document.getElementById('ct-name').value.trim() || null,
            phone: document.getElementById('ct-phone').value.trim() || null,
          },
          status: 'in_progress',
          source: 'admin',
        },
      };
    },
  });
  if (!r.isConfirmed) return;
  const v = r.value;
  window.avBusy('Tying…');
  try {
    const batch = writeBatch(db);
    let bookingId;
    let customerPhone = null;
    if (v.mode === 'pick') {
      bookingId = v.bookingId;
      // Pull the booking customer phone for the customer-stat update below.
      try {
        const bDoc = await getDoc(doc(db, COL.BOOKINGS, bookingId));
        if (bDoc.exists()) {
          const c = bDoc.data().customer;
          if (c && c.phone) customerPhone = c.phone;
        }
      } catch (_) { /* swallow */ }
      // Tie = trip complete = booking complete.
      batch.update(doc(db, COL.BOOKINGS, bookingId), {
        status: 'completed',
        tripId: trip.id,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const newRef = doc(collection(db, COL.BOOKINGS));
      bookingId = newRef.id;
      if (v.booking.customer && v.booking.customer.phone) customerPhone = v.booking.customer.phone;
      batch.set(newRef, {
        ...v.booking,
        status: 'completed',
        tripId: trip.id,
        completedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.update(doc(db, COL.TRIPS, trip.id), { bookingId, updatedAt: serverTimestamp() });
    await batch.commit();

    // Newly-created booking from the tie modal may have a destination —
    // register it for autocomplete.
    if (v.mode === 'create' && v.booking && v.booking.destination) {
      addPlacesToRegistry(db, [v.booking.destination]);
    }

    // Bump the customer's lastTripAt + tripCount (best-effort, non-blocking).
    if (customerPhone) {
      try {
        const phone = String(customerPhone).replace(/\D/g, '');
        if (phone.length === 10) {
          const ref = doc(db, COL.CUSTOMERS, phone);
          await updateDoc(ref, {
            lastTripAt: serverTimestamp(),
            tripCount: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (_) { /* customer doc may not exist — non-fatal */ }
    }

    window.avDone();
    Swal.fire({ icon: 'success', title: 'Tied — booking marked completed', timer: 1400, showConfirmButton: false });
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
