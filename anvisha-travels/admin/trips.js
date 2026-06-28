import { COL } from '../firebase-config.js';
import {
  collection, addDoc, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot, updateDoc, serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { fmtDate, fmtDateTime, fmtTimeLabel, toDateSafe } from './analytics.js';

const FUEL_TYPES = ['CNG', 'Petrol', 'Diesel'];

// ── Admin tab: list all trips, filter tied/untied, tie-to-booking modal ──
export async function renderTrips(ctx, role) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-road"></i> Trips</h2>
    <div class="filter-bar" id="tr-filters"></div>
    <div class="card-an mb-12">
      <div class="card-head" style="margin-bottom:0;">
        <div class="card-sub" id="tr-count">Loading…</div>
        <button id="tr-new" class="btn-an btn-an-sm"><i class="fas fa-plus"></i> Log trip</button>
      </div>
    </div>
    <div id="tr-list" class="row-list"></div>
  `;
  const filters = [
    { key: 'untied', label: 'Untied', match: t => !t.bookingId },
    { key: 'tied',   label: 'Tied',   match: t => !!t.bookingId },
    { key: 'all',    label: 'All',    match: () => true },
  ];
  let active = 'untied';
  let trips = [];

  const filterBar = panel.querySelector('#tr-filters');
  filters.forEach(f => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (f.key === active ? ' active' : '');
    b.textContent = f.label;
    b.addEventListener('click', () => {
      active = f.key;
      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === b));
      render();
    });
    filterBar.appendChild(b);
  });

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
    count.textContent = `${rows.length} trip${rows.length === 1 ? '' : 's'}`;
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
  renderDriverForm(panel.querySelector('#dt-form'), db, ctx);

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

function renderDriverForm(host, db, ctx) {
  const today = new Date().toISOString().slice(0, 10);
  host.innerHTML = `
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label">Date</label>
        <input id="dt-date" type="date" class="f-input" value="${today}">
      </div>
      <div class="f-group">
        <label class="f-label">Distance (km)</label>
        <input id="dt-km" type="number" class="f-input" min="0" step="0.5" placeholder="e.g. 42">
      </div>
    </div>
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label">Source</label>
        <input id="dt-src" type="text" class="f-input" placeholder="e.g. Banki">
      </div>
      <div class="f-group">
        <label class="f-label">Destination</label>
        <input id="dt-dst" type="text" class="f-input" placeholder="e.g. Cuttack Rly Station">
      </div>
    </div>
    <div class="f-row cols-3">
      <div class="f-group">
        <label class="f-label">Fuel type</label>
        <select id="dt-ftype" class="f-select">
          ${FUEL_TYPES.map(f => `<option value="${f}">${f}</option>`).join('')}
        </select>
      </div>
      <div class="f-group">
        <label class="f-label">Fuel qty (L / kg)</label>
        <input id="dt-fqty" type="number" class="f-input" min="0" step="0.1" placeholder="e.g. 4.5">
      </div>
      <div class="f-group">
        <label class="f-label">Fuel cost (₹)</label>
        <input id="dt-fcost" type="number" class="f-input" min="0" step="1" placeholder="e.g. 480">
      </div>
    </div>
    <div class="f-row cols-2">
      <div class="f-group">
        <label class="f-label">Misc (toll/parking ₹)</label>
        <input id="dt-misc" type="number" class="f-input" min="0" step="1" placeholder="0">
      </div>
      <div class="f-group">
        <label class="f-label">Notes (optional)</label>
        <input id="dt-notes" type="text" class="f-input" placeholder="anything to flag for admin">
      </div>
    </div>
    <button id="dt-save" class="btn-an btn-an-block mt-12"><i class="fas fa-check"></i> Save trip</button>
  `;
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
      Swal.fire({ icon: 'success', title: 'Trip logged', timer: 1400, showConfirmButton: false });
      // Reset numeric inputs but keep date.
      ['dt-km','dt-src','dt-dst','dt-fqty','dt-fcost','dt-misc','dt-notes'].forEach(id => host.querySelector('#' + id).value = '');
    } catch (e) {
      window.avDone();
      Swal.fire('Save failed', e.message || String(e), 'error');
    }
  });
}

function collectDriverForm(host) {
  const date  = host.querySelector('#dt-date').value;
  const km    = parseFloat(host.querySelector('#dt-km').value);
  const src   = host.querySelector('#dt-src').value.trim();
  const dst   = host.querySelector('#dt-dst').value.trim();
  const ftype = host.querySelector('#dt-ftype').value;
  const fqty  = parseFloat(host.querySelector('#dt-fqty').value);
  const fcost = parseFloat(host.querySelector('#dt-fcost').value);
  const misc  = parseFloat(host.querySelector('#dt-misc').value) || 0;
  const notes = host.querySelector('#dt-notes').value.trim();

  if (!date || isNaN(km) || km <= 0 || !src || !dst || !ftype || isNaN(fqty) || isNaN(fcost)) {
    Swal.fire('Missing fields', 'Please fill date, km, route, fuel type/qty/cost.', 'warning');
    return null;
  }
  return {
    date, km,
    route: { source: src, destination: dst },
    fuel: { type: ftype, qty: fqty, cost: fcost },
    miscCost: misc,
    notes: notes || null,
  };
}

function renderRow(t) {
  const fuel = t.fuel || {};
  const route = t.route || {};
  const tied = t.bookingId
    ? `<span class="chip in_progress"><i class="fas fa-link"></i> Tied</span>`
    : `<span class="chip untied"><i class="fas fa-link-slash"></i> Untied</span>`;
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
      <div><b>Fuel</b> ${escapeHtml(fuel.type || '—')} · ${escapeHtml(String(fuel.qty ?? 0))} · ₹${escapeHtml(String(fuel.cost ?? 0))}</div>
      <div><b>Misc</b> ₹${escapeHtml(String(t.miscCost ?? 0))}</div>
      ${t.notes ? `<div><b>Notes</b> ${escapeHtml(t.notes)}</div>` : ''}
    </div>
    <div class="row-actions">
      ${!t.bookingId ? `<button class="btn-an btn-an-sm" data-action="tie" data-id="${t.id}"><i class="fas fa-link"></i> Tie to booking</button>` : ''}
      ${t.bookingId ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="open-booking" data-id="${t.bookingId}"><i class="fas fa-up-right-from-square"></i> Open booking</button>` : ''}
      ${t.bookingId ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="untie" data-id="${t.id}"><i class="fas fa-link-slash"></i> Untie</button>` : ''}
    </div>
  </div>
  `;
}

async function handle(db, ctx, action, id, trips) {
  const t = trips.find(x => x.id === id);
  try {
    if (action === 'tie' && t)        return openTieModal(db, t);
    if (action === 'untie' && t)      return untieTrip(db, t);
    if (action === 'open-booking') {
      ctx.invalidate && ctx.invalidate('bookings');
      ctx.activateTab && ctx.activateTab('bookings');
      return;
    }
    if (action === 'log')             return openTripLogModal(db, ctx, true);
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

async function openTripLogModal(db, ctx, isAdmin) {
  // Admin trip-log uses the same form but lets admin specify the driver UID.
  // To keep first version simple, default to the signed-in admin as the driver.
  const driver = ctx.driver || { uid: ctx.user.uid, name: ctx.user.displayName || ctx.user.email, phone: '' };
  const today = new Date().toISOString().slice(0, 10);
  const r = await Swal.fire({
    title: 'Log trip',
    width: 640,
    showCancelButton: true,
    confirmButtonText: 'Save',
    html: `
      <div style="text-align:left;">
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label">Date</label><input id="tlm-date" type="date" class="f-input" value="${today}"></div>
          <div class="f-group"><label class="f-label">Distance (km)</label><input id="tlm-km" type="number" class="f-input" min="0" step="0.5"></div>
        </div>
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label">Source</label><input id="tlm-src" type="text" class="f-input"></div>
          <div class="f-group"><label class="f-label">Destination</label><input id="tlm-dst" type="text" class="f-input"></div>
        </div>
        <div class="f-row cols-3">
          <div class="f-group"><label class="f-label">Fuel</label>
            <select id="tlm-ftype" class="f-select">${FUEL_TYPES.map(f => `<option>${f}</option>`).join('')}</select>
          </div>
          <div class="f-group"><label class="f-label">Qty</label><input id="tlm-fqty" type="number" class="f-input" min="0" step="0.1"></div>
          <div class="f-group"><label class="f-label">Fuel ₹</label><input id="tlm-fcost" type="number" class="f-input" min="0"></div>
        </div>
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label">Misc ₹</label><input id="tlm-misc" type="number" class="f-input" min="0"></div>
          <div class="f-group"><label class="f-label">Notes</label><input id="tlm-notes" type="text" class="f-input"></div>
        </div>
      </div>
    `,
    preConfirm: () => {
      const date = document.getElementById('tlm-date').value;
      const km   = parseFloat(document.getElementById('tlm-km').value);
      const src  = document.getElementById('tlm-src').value.trim();
      const dst  = document.getElementById('tlm-dst').value.trim();
      const ft   = document.getElementById('tlm-ftype').value;
      const fq   = parseFloat(document.getElementById('tlm-fqty').value);
      const fc   = parseFloat(document.getElementById('tlm-fcost').value);
      if (!date || isNaN(km) || !src || !dst || !ft || isNaN(fq) || isNaN(fc)) {
        Swal.showValidationMessage('Fill all required fields');
        return false;
      }
      return {
        date, km,
        route: { source: src, destination: dst },
        fuel: { type: ft, qty: fq, cost: fc },
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
      where('status', 'in', ['new', 'confirmed', 'in_progress']),
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
    candidates = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => ['new','confirmed','in_progress'].includes(b.status || 'new'));
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
        <div class="f-group"><label class="f-label">Date</label><input id="ct-date" type="date" class="f-input" value="${trip.date || ''}"></div>
        <div class="f-group"><label class="f-label">Time</label><input id="ct-time" type="time" class="f-input"></div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group"><label class="f-label">Passengers</label><input id="ct-pax" type="text" class="f-input" placeholder="e.g. 4"></div>
        <div class="f-group"><label class="f-label">Destination</label><input id="ct-dest" type="text" class="f-input" value="${escapeAttr((trip.route && trip.route.destination) || '')}"></div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group"><label class="f-label">Customer name</label><input id="ct-name" type="text" class="f-input"></div>
        <div class="f-group"><label class="f-label">Customer phone</label><input id="ct-phone" type="tel" class="f-input"></div>
      </div>
    </div>
  `;
  const r = await Swal.fire({
    title: 'Tie trip to booking',
    html,
    width: 680,
    showCancelButton: true,
    confirmButtonText: 'Tie',
    didOpen: () => {
      document.querySelectorAll('.tie-tabs button').forEach(b => {
        b.addEventListener('click', () => {
          document.querySelectorAll('.tie-tabs button').forEach(x => x.classList.toggle('active', x === b));
          document.querySelectorAll('.tie-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === b.dataset.pane));
        });
      });
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
    if (v.mode === 'pick') {
      bookingId = v.bookingId;
      batch.update(doc(db, COL.BOOKINGS, bookingId), {
        status: 'in_progress',
        tripId: trip.id,
        updatedAt: serverTimestamp(),
      });
    } else {
      const newRef = doc(collection(db, COL.BOOKINGS));
      bookingId = newRef.id;
      batch.set(newRef, {
        ...v.booking,
        tripId: trip.id,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    batch.update(doc(db, COL.TRIPS, trip.id), { bookingId, updatedAt: serverTimestamp() });
    await batch.commit();
    window.avDone();
    Swal.fire({ icon: 'success', title: 'Tied', timer: 1200, showConfirmButton: false });
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
