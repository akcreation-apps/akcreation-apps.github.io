import { COL } from '../firebase-config.js';
import {
  collection, addDoc, query, orderBy, onSnapshot, doc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, increment,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtDate, fmtDateTime, fmtTimeLabel, normalisePhone, buildWaUrl, toDateSafe, displayName, wirePhoneInput,
} from './analytics.js';

// Filter dropdown. Each option matches against the booking's status (+ paid for
// the payment-specific options). Default is "New" — that's the inbox-style
// view admin needs first thing every day.
const STATUS_FILTERS = [
  { key: 'new',         label: 'New',                match: b => (b.status || 'new') === 'new' || b.status === 'confirmed' },
  { key: 'allocated',   label: 'Allocated',          match: b => b.status === 'allocated' },
  { key: 'trip_done',   label: 'Trip Completed',     match: b => b.status === 'completed' },
  { key: 'paid',        label: 'Payment Completed',  match: b => b.status === 'completed' && !!b.paid },
  { key: 'unpaid',      label: 'Payment Pending',    match: b => b.status === 'completed' && !b.paid },
  { key: 'all',         label: 'All',                match: () => true },
];

export async function renderBookings(ctx) {
  const { panel, db } = ctx;

  panel.innerHTML = `
    <div class="av-toolbar">
      <div class="av-toolbar__left">
        <button id="bk-new" class="btn-an btn-an-sm av-toolbar__btn">
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span class="av-toolbar__btn-text">Add booking</span>
          <span class="av-toolbar__count" id="bk-count" aria-live="polite" aria-atomic="true"></span>
        </button>
      </div>
      <div class="av-toolbar__right">
        <label for="bk-filter" class="sr-only">Filter by status</label>
        <select id="bk-filter" class="f-select av-toolbar__select">
          ${STATUS_FILTERS.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="bk-list" class="row-list"></div>
  `;

  const filterSelect = panel.querySelector('#bk-filter');
  const list = panel.querySelector('#bk-list');
  const count = panel.querySelector('#bk-count');
  let activeFilter = 'new';
  let bookings = [];

  filterSelect.value = activeFilter;
  filterSelect.addEventListener('change', () => {
    activeFilter = filterSelect.value;
    render();
  });

  list.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading bookings…</div>`;
  const qRef = query(collection(db, COL.BOOKINGS), orderBy('createdAt', 'desc'));
  onSnapshot(qRef, snap => {
    bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
  });

  panel.querySelector('#bk-new').addEventListener('click', () => openBookingModal(db, null));

  function render() {
    const f = STATUS_FILTERS.find(x => x.key === activeFilter) || STATUS_FILTERS[0];
    const rows = bookings.filter(b => f.match(b));
    count.textContent = rows.length ? `· ${rows.length}` : '';
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><i class="far fa-calendar"></i> No bookings in this view.</div>`;
      return;
    }
    list.innerHTML = rows.map(renderRow).join('');
    list.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handleAction(db, el.dataset.action, el.dataset.id, bookings));
    });
  }
}

function renderRow(b) {
  const status = b.status || 'new';
  const customer = b.customer || {};
  const dest = b.destination ? `→ ${escapeHtml(b.destination)}` : '';
  const allocated = b.allocatedDriver && b.allocatedDriver.name
    ? `<div><b>Driver</b> ${escapeHtml(b.allocatedDriver.name)}${b.allocatedDriver.phone ? ' · ' + escapeHtml(b.allocatedDriver.phone) : ''}</div>` : '';

  // Customer-gated actions: Confirm + Allocate only appear once a phone is on file.
  const hasCustomer = !!(customer.phone);
  const isActive = status !== 'completed' && status !== 'cancelled';
  const showConfirm  = hasCustomer && isActive && status === 'new';
  const showAllocate = hasCustomer && isActive && (status === 'new' || status === 'confirmed' || status === 'allocated');
  const allocLabel   = status === 'allocated' ? 'Re-allocate' : 'Allocate';
  const allocIcon    = status === 'allocated' ? 'fa-rotate'   : 'fa-id-card';

  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(fmtDate(b.date))}</strong>
        <span class="text-muted-an">${escapeHtml(fmtTimeLabel(b.time))}</span>
        <span class="text-muted-an">· ${escapeHtml(b.passengers || '?')} pax</span>
      </div>
      <div class="flex-row" style="gap:6px;">
        <span class="chip ${status}">${labelFor(status)}</span>
        ${status === 'completed' ? (b.paid
          ? `<span class="chip completed" title="Payment received"><i class="fas fa-circle-check" aria-hidden="true"></i> Paid</span>`
          : `<span class="chip cancelled" title="Payment pending"><i class="fas fa-hourglass-half" aria-hidden="true"></i> Pending</span>`) : ''}
      </div>
    </div>
    <div class="row-meta">
      ${dest ? `<div><b>Route</b> ${dest}</div>` : ''}
      <div><b>Customer</b> ${customer.name ? escapeHtml(customer.name) : '<i class="text-muted-an">unidentified</i>'}${customer.phone ? ' · ' + escapeHtml(customer.phone) : ''}</div>
      ${allocated}
      ${b.fare ? `<div><b>Fare</b> ₹${escapeHtml(String(b.fare))}${b.paid ? ' · paid' : ''}</div>` : ''}
      <div><b>Source</b> ${escapeHtml(b.source || 'web')}</div>
      <div><b>Received</b> ${escapeHtml(fmtDateTime(b.createdAt))}</div>
    </div>
    <div class="row-actions">
      <button class="btn-an btn-an-outline btn-an-sm" data-action="edit" data-id="${b.id}"><i class="fas fa-pen"></i> Edit</button>
      ${!hasCustomer && isActive ? `<button class="btn-an btn-an-sm" data-action="edit" data-id="${b.id}"><i class="fas fa-user-plus"></i> Assign customer</button>` : ''}
      ${showConfirm  ? `<button class="btn-an btn-an-sm"          data-action="confirm"  data-id="${b.id}"><i class="fab fa-whatsapp"></i> Confirm</button>` : ''}
      ${showAllocate ? `<button class="btn-an btn-an-sm"          data-action="allocate" data-id="${b.id}"><i class="fas ${allocIcon}"></i> ${allocLabel}</button>` : ''}
      ${status === 'allocated'   ? `<button class="btn-an btn-an-sm" data-action="share" data-id="${b.id}"><i class="fab fa-whatsapp"></i> Share</button>` : ''}
      ${status === 'completed'  ? `<button class="btn-an btn-an-sm" data-action="thankyou" data-id="${b.id}"><i class="fab fa-whatsapp"></i> Send Thank You</button>` : ''}
      ${isActive ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="cancel" data-id="${b.id}"><i class="fas fa-ban"></i> Cancel</button>` : ''}
      <button class="btn-an btn-an-outline btn-an-sm" data-action="delete" data-id="${b.id}" style="margin-left:auto;" aria-label="Delete booking" title="Delete booking"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  </div>
  `;
}

function labelFor(s) {
  return ({
    new: 'New', confirmed: 'Confirmed', allocated: 'Allocated',
    in_progress: 'On trip', completed: 'Completed', cancelled: 'Cancelled',
  })[s] || s;
}

async function handleAction(db, action, id, bookings) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  try {
    if (action === 'edit') return openBookingModal(db, b);

    if (action === 'confirm')  return confirmBooking(db, b);
    if (action === 'allocate') return allocateBooking(db, b);
    if (action === 'share')    return shareDriverDetails(b);
    if (action === 'thankyou') return sendThankYou(b);

    if (action === 'cancel') {
      const r = await Swal.fire({ title: 'Cancel booking?', text: 'This sets status to cancelled.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, cancel' });
      if (r.isConfirmed) return setStatus(db, id, 'cancelled');
      return;
    }
    if (action === 'delete') {
      const r = await Swal.fire({ title: 'Delete booking?', text: 'This cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' });
      if (!r.isConfirmed) return;
      window.avBusy('Deleting…');
      await deleteDoc(doc(db, COL.BOOKINGS, id));
      window.avDone();
      return;
    }
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

async function setStatus(db, id, status) {
  window.avBusy('Updating…');
  await updateDoc(doc(db, COL.BOOKINGS, id), { status, updatedAt: serverTimestamp() });
  window.avDone();
}

// ── Confirm booking: flip status + open WhatsApp to customer with confirmation ──
async function confirmBooking(db, b) {
  const phone = normalisePhone(b.customer && b.customer.phone);
  if (!phone) { Swal.fire('No phone', 'Add the customer phone first (Edit), then Confirm.', 'info'); return; }
  const dest = b.destination ? `\nDestination: ${b.destination}` : '';
  const fare = b.fare ? `\nFare: ₹${b.fare}` : '';
  const friendly = displayName(b.customer && b.customer.name);
  const text =
`Hi${friendly ? ' ' + friendly : ''}! 🚖

Your Anvisha Travels booking is confirmed:
Date: ${fmtDate(b.date)}
Time: ${fmtTimeLabel(b.time)}
Passengers: ${b.passengers}${dest}${fare}

We'll share driver details once allocated. Thank you for choosing Anvisha Travels.`;
  const r = await Swal.fire({
    title: 'Send booking confirmation?',
    html: `WhatsApp to <code>+91${phone}</code><br><br><pre style="text-align:left;white-space:pre-wrap;font-size:12px;">${escapeHtml(text)}</pre>`,
    showCancelButton: true,
    confirmButtonText: 'Confirm & WhatsApp',
  });
  if (!r.isConfirmed) return;
  window.avBusy('Confirming…');
  await updateDoc(doc(db, COL.BOOKINGS, b.id), {
    status: 'confirmed',
    confirmedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  window.avDone();
  window.location.href = buildWaUrl('91' + phone, text);
}

// ── Allocate booking: pick driver → save → open WhatsApp to driver with details ──
async function allocateBooking(db, b) {
  // Fetch drivers list
  let drivers = [];
  try {
    const meta = await getDoc(doc(db, COL.META, 'drivers'));
    if (meta.exists()) {
      const data = meta.data();
      const uids = data.uids || [];
      const profile = data.profile || {};
      drivers = uids.map(uid => ({ uid, ...(profile[uid] || {}) }));
    }
  } catch (_) { /* swallow */ }

  if (!drivers.length) {
    Swal.fire('No drivers', 'Add drivers in the Drivers tab first.', 'info');
    return;
  }

  const optionsHtml = drivers.map(d =>
    `<option value="${escapeAttr(d.uid)}">${escapeHtml(d.name || d.uid.slice(0,8))}${d.phone ? ' · ' + escapeHtml(d.phone) : ''}</option>`
  ).join('');

  const r = await Swal.fire({
    title: 'Allocate to driver',
    html: `
      <div style="text-align:left;">
        <p class="text-muted-an" style="font-size:13px;">Pick a driver. They'll receive the booking details on WhatsApp.</p>
        <label class="f-label" for="al-driver">Driver</label>
        <select id="al-driver" class="f-select">${optionsHtml}</select>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'Allocate & WhatsApp',
    preConfirm: () => {
      const uid = document.getElementById('al-driver').value;
      const d = drivers.find(x => x.uid === uid);
      if (!d) { Swal.showValidationMessage('Pick a driver'); return false; }
      return d;
    },
  });
  if (!r.isConfirmed) return;
  const driver = r.value;
  const driverPhone = normalisePhone(driver.phone);

  window.avBusy('Allocating…');
  await updateDoc(doc(db, COL.BOOKINGS, b.id), {
    status: 'allocated',
    allocatedDriver: { uid: driver.uid, name: driver.name || '', phone: driver.phone || '' },
    allocatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  window.avDone();

  if (!driverPhone) {
    Swal.fire('Allocated', 'Driver has no phone — message not sent.', 'info');
    return;
  }
  const dest = b.destination ? `\nDestination: ${b.destination}` : '';
  const fare = b.fare ? `\nFare: ₹${b.fare}` : '';
  const custFriendly = displayName(b.customer && b.customer.name);
  const cust = custFriendly ? `\nCustomer: ${custFriendly}` : '';
  const phone = (b.customer && b.customer.phone) ? `\nCustomer phone: +91${normalisePhone(b.customer.phone)}` : '';
  const text =
`🚖 New trip allocated — Anvisha Travels

Date: ${fmtDate(b.date)}
Time: ${fmtTimeLabel(b.time)}
Passengers: ${b.passengers}${dest}${fare}${cust}${phone}

Please confirm pickup with the customer. Drive safe.`;
  window.location.href = buildWaUrl('91' + driverPhone, text);
}

// ── Share driver details with the customer (post-allocation) ──
// Cab number is hardcoded for v1 — switch to per-trip / per-driver lookup
// once Anvisha runs more than one vehicle.
const CAB_NUMBER = 'OD 02 DQ 7999';

async function shareDriverDetails(b) {
  if (!b.allocatedDriver || !b.allocatedDriver.uid) {
    Swal.fire('Not allocated', 'Allocate a driver first, then share their details.', 'info');
    return;
  }
  const phone = normalisePhone(b.customer && b.customer.phone);
  if (!phone) { Swal.fire('No phone', 'Customer phone is not set.', 'info'); return; }
  const friendly = displayName(b.customer && b.customer.name);
  const driverName  = b.allocatedDriver.name  || 'Your driver';
  const driverPhone = b.allocatedDriver.phone ? `+91 ${normalisePhone(b.allocatedDriver.phone)}` : '—';
  const text =
`Hi${friendly ? ' ' + friendly : ''}! 🚖

Your driver for ${fmtDate(b.date)} at ${fmtTimeLabel(b.time)}:

👤 *Driver:* ${driverName}
📞 *Phone:* ${driverPhone}
🚘 *Cab no:* ${CAB_NUMBER}

You can call the driver directly for any pickup-time questions. Safe travels — Team Anvisha Travels.`;
  const r = await Swal.fire({
    title: 'Share driver details?',
    html: `WhatsApp to <code>+91${phone}</code><br><br><pre style="text-align:left;white-space:pre-wrap;font-size:12px;">${escapeHtml(text)}</pre>`,
    showCancelButton: true,
    confirmButtonText: 'Send',
  });
  if (r.isConfirmed) window.location.href = buildWaUrl('91' + phone, text);
}

// ── Thank you message ──
async function sendThankYou(b) {
  const phone = normalisePhone(b.customer && b.customer.phone);
  if (!phone) { Swal.fire('No phone', 'Customer phone is not set.', 'info'); return; }
  const friendly = displayName(b.customer && b.customer.name);
  const text =
`Hi${friendly ? ' ' + friendly : ''}! 🙏

Thank you for travelling with Anvisha Travels today. We hope you had a smooth ride.

If you ever need a cab around Banki, Cuttack or Bhubaneswar, we're a WhatsApp away. Safe travels!`;
  const r = await Swal.fire({
    title: 'Send thank-you?',
    html: `WhatsApp to <code>+91${phone}</code><br><br><pre style="text-align:left;white-space:pre-wrap;font-size:12px;">${escapeHtml(text)}</pre>`,
    showCancelButton: true,
    confirmButtonText: 'Send',
  });
  if (r.isConfirmed) window.location.href = buildWaUrl('91' + phone, text);
}

// ── Customer auto-upsert on booking save ──
async function upsertCustomerFromBooking(db, customer, bookingId) {
  if (!customer || !customer.phone) return;
  const phone = normalisePhone(customer.phone);
  if (phone.length < 10) return;
  const ref = doc(db, COL.CUSTOMERS, phone);
  const existing = await getDoc(ref);
  const data = {
    phone,
    name:    customer.name    || (existing.exists() ? existing.data().name    : null),
    address: customer.address || (existing.exists() ? existing.data().address : null),
    updatedAt: serverTimestamp(),
    lastBookingId: bookingId,
    lastBookingAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    data.createdAt = serverTimestamp();
    data.bookingCount = 1;
  } else {
    data.bookingCount = increment(1);
  }
  await setDoc(ref, data, { merge: true });
}

// ── Suggest 'AT N' default name when admin creates a booking with no customer ──
async function suggestAtName(customers) {
  const re = /^AT\s*(\d+)/i;
  let next = 1;
  for (const c of customers) {
    const m = (c.name || '').match(re);
    if (m) { const n = parseInt(m[1], 10); if (n >= next) next = n + 1; }
  }
  return `AT ${next}`;
}

// ── Customer search (matches BankiBites pattern). Ranks: name prefix > phone prefix > any. ──
function searchCustomers(customers, term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return [];
  const out = [];
  for (const c of customers) {
    const name = (c.name || '').toLowerCase();
    const phone = String(c.phone || c.id || '').toLowerCase();
    const addr = (c.address || '').toLowerCase();
    if (name.includes(t) || phone.includes(t) || addr.includes(t)) {
      let rank = 3;
      if (name.startsWith(t)) rank = 0;
      else if (phone.startsWith(t)) rank = 1;
      else if (name.includes(t)) rank = 2;
      out.push({ c, rank });
    }
  }
  out.sort((a, b) => a.rank - b.rank || (a.c.name || '').localeCompare(b.c.name || ''));
  return out.map(x => x.c).slice(0, 8);
}

async function loadAllCustomers(db) {
  try {
    const snap = await getDocs(collection(db, COL.CUSTOMERS));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    return [];
  }
}

export async function openBookingModal(db, existing) {
  const isEdit = !!existing;
  const b = existing || {};
  const cust = b.customer || {};
  const customers = await loadAllCustomers(db);
  // Suggest "AT N" whenever the booking has no customer name yet — covers both
  // admin-created bookings AND web-submitted bookings (which arrive nameless).
  const suggestedName = cust.name ? cust.name : await suggestAtName(customers);
  const html = `
    <form id="bm-form" autocomplete="off" style="text-align:left;">
      <!-- decoys that absorb Chrome autofill so AT N suggestion survives -->
      <input type="text" name="bm-decoy-user" autocomplete="username" style="display:none" tabindex="-1" aria-hidden="true">
      <input type="password" name="bm-decoy-pass" autocomplete="new-password" style="display:none" tabindex="-1" aria-hidden="true">

      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label" for="bm-date">Date</label>
          <input id="bm-date" type="date" class="f-input" value="${b.date || ''}" autocomplete="off">
        </div>
        <div class="f-group">
          <label class="f-label" for="bm-time">Time (HH:MM)</label>
          <input id="bm-time" type="time" class="f-input" value="${b.time || ''}" autocomplete="off">
        </div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label" for="bm-pax">Passengers</label>
          <input id="bm-pax" type="text" class="f-input" value="${escapeAttr(b.passengers || '')}" placeholder="e.g. 4" autocomplete="off">
        </div>
        <div class="f-group">
          <label class="f-label" for="bm-status">Status</label>
          <select id="bm-status" class="f-select">
            ${['new','confirmed','allocated','completed','cancelled'].map(s => `<option value="${s}" ${s === (b.status||'new') ? 'selected' : ''}>${labelFor(s)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="f-group mb-12">
        <label class="f-label" for="bm-dest">Destination</label>
        <input id="bm-dest" type="text" class="f-input" value="${escapeAttr(b.destination || '')}" placeholder="e.g. Cuttack Railway Station" autocomplete="off">
      </div>

      <!-- Customer search/pick block -->
      <div class="f-group" style="position:relative;">
        <label class="f-label" for="bm-search">Search existing customer</label>
        <input id="bm-search" type="text" class="f-input" placeholder="Type a name or phone…" autocomplete="off">
        <div id="bm-search-results" class="cust-results" hidden></div>
      </div>
      <div class="flex-row mb-12" style="gap:8px; font-size:12px;">
        <span class="text-muted-an">Not found?</span>
        <button type="button" id="bm-new-cust" class="btn-an btn-an-outline btn-an-sm"><i class="fas fa-user-plus"></i> Use suggested "${escapeHtml(suggestedName)}"</button>
      </div>

      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label" for="bm-name">Customer name</label>
          <input id="bm-name" type="text" class="f-input" value="${escapeAttr(suggestedName)}" autocomplete="off">
        </div>
        <div class="f-group">
          <label class="f-label" for="bm-phone">Customer phone</label>
          <input id="bm-phone" type="tel" class="f-input" value="${escapeAttr(cust.phone || '')}" placeholder="10 digits" inputmode="numeric" autocomplete="off">
        </div>
      </div>
      <div class="f-group mb-12">
        <label class="f-label" for="bm-addr">Address (optional)</label>
        <input id="bm-addr" type="text" class="f-input" value="${escapeAttr(cust.address || '')}" autocomplete="off">
      </div>
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label" for="bm-fare">Fare (₹, optional)</label>
          <input id="bm-fare" type="number" class="f-input" value="${b.fare ?? ''}" min="0" step="50" inputmode="numeric" autocomplete="off">
        </div>
        <div class="f-group">
          <label class="f-label" for="bm-paid">Paid?</label>
          <select id="bm-paid" class="f-select">
            <option value="false" ${!b.paid ? 'selected' : ''}>No</option>
            <option value="true"  ${b.paid ? 'selected' : ''}>Yes</option>
          </select>
        </div>
      </div>
    </form>
  `;
  const r = await Swal.fire({
    title: isEdit ? 'Edit booking' : 'New booking',
    html,
    width: 640,
    showCancelButton: true,
    confirmButtonText: isEdit ? 'Save changes' : 'Create',
    focusConfirm: false,
    didOpen: () => {
      const searchEl  = document.getElementById('bm-search');
      const resultsEl = document.getElementById('bm-search-results');
      const nameEl    = document.getElementById('bm-name');
      const phoneEl   = document.getElementById('bm-phone');
      const addrEl    = document.getElementById('bm-addr');
      const newBtn    = document.getElementById('bm-new-cust');
      wirePhoneInput(phoneEl);

      function applyCustomer(c) {
        nameEl.value  = c.name    || '';
        phoneEl.value = c.phone   || c.id || '';
        addrEl.value  = c.address || '';
        resultsEl.hidden = true;
        resultsEl.innerHTML = '';
        searchEl.value = '';
      }

      searchEl && searchEl.addEventListener('input', () => {
        const matches = searchCustomers(customers, searchEl.value);
        if (!matches.length) {
          resultsEl.hidden = true;
          resultsEl.innerHTML = '';
          return;
        }
        resultsEl.innerHTML = matches.map(c => `
          <button type="button" class="cust-result" data-phone="${escapeAttr(c.phone || c.id)}">
            <strong>${escapeHtml(c.name || '—')}</strong>
            <span class="text-muted-an">· +91 ${escapeHtml(c.phone || c.id)}</span>
            ${c.address ? `<div class="text-muted-an" style="font-size:11px;">${escapeHtml(c.address.slice(0, 60))}</div>` : ''}
          </button>
        `).join('');
        resultsEl.hidden = false;
      });

      resultsEl && resultsEl.addEventListener('click', e => {
        const btn = e.target.closest('.cust-result');
        if (!btn) return;
        const phone = btn.dataset.phone;
        const c = customers.find(x => (x.phone || x.id) === phone);
        if (c) applyCustomer(c);
      });

      // "Use suggested AT N" — restores the suggestion if user wiped it.
      newBtn && newBtn.addEventListener('click', () => {
        nameEl.value  = suggestedName;
        phoneEl.value = '';
        addrEl.value  = '';
        searchEl.value = '';
        resultsEl.hidden = true;
      });
    },
    preConfirm: () => {
      const date = document.getElementById('bm-date').value;
      const time = document.getElementById('bm-time').value;
      const pax  = document.getElementById('bm-pax').value.trim();
      if (!date || !time || !pax) {
        Swal.showValidationMessage('Date, time and passengers are required');
        return false;
      }
      const fareRaw = document.getElementById('bm-fare').value;
      const fare    = fareRaw === '' ? null : Number(fareRaw);
      const paid    = document.getElementById('bm-paid').value === 'true';
      // Paid bookings must have a fare — otherwise the P&L / payments KPIs
      // record a "paid" doc with no amount, which silently corrupts revenue.
      if (paid && (!Number.isFinite(fare) || fare <= 0)) {
        Swal.showValidationMessage('Set a fare amount before marking the booking as paid.');
        return false;
      }
      const phoneRaw = document.getElementById('bm-phone').value.trim();
      const phone    = phoneRaw ? normalisePhone(phoneRaw) : '';
      return {
        date, time, passengers: pax,
        destination: document.getElementById('bm-dest').value.trim() || null,
        status: document.getElementById('bm-status').value,
        customer: {
          name:    document.getElementById('bm-name').value.trim() || null,
          phone:   phone || null,
          address: document.getElementById('bm-addr').value.trim() || null,
        },
        fare,
        paid,
      };
    },
  });
  if (!r.isConfirmed) return null;
  window.avBusy('Saving…');
  try {
    let savedId;
    if (isEdit) {
      await updateDoc(doc(db, COL.BOOKINGS, existing.id), { ...r.value, updatedAt: serverTimestamp() });
      savedId = existing.id;
    } else {
      const ref = await addDoc(collection(db, COL.BOOKINGS), {
        ...r.value, source: 'admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      savedId = ref.id;
    }
    // Auto-upsert customer
    try { await upsertCustomerFromBooking(db, r.value.customer, savedId); } catch (_) { /* non-blocking */ }
    window.avDone();
    return { id: savedId, ...r.value };
  } catch (e) {
    window.avDone();
    Swal.fire('Save failed', e.message || String(e), 'error');
    return null;
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
