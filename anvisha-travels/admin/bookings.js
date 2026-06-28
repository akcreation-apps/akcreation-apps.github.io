import { COL } from '../firebase-config.js';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtDate, fmtDateTime, fmtTimeLabel, normalisePhone, buildWaUrl, toDateSafe,
} from './analytics.js';

const STATUS_FILTERS = [
  { key: 'active',     label: 'Active', match: s => s === 'new' || s === 'confirmed' || s === 'in_progress' },
  { key: 'new',        label: 'New',        match: s => s === 'new' },
  { key: 'confirmed',  label: 'Confirmed',  match: s => s === 'confirmed' },
  { key: 'in_progress',label: 'On trip',    match: s => s === 'in_progress' },
  { key: 'completed',  label: 'Completed',  match: s => s === 'completed' },
  { key: 'cancelled',  label: 'Cancelled',  match: s => s === 'cancelled' },
  { key: 'all',        label: 'All',        match: () => true },
];

export async function renderBookings(ctx) {
  const { panel, db } = ctx;

  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-calendar"></i> Bookings</h2>
    <div class="filter-bar" id="bk-filters"></div>
    <div class="card-an mb-12">
      <div class="card-head" style="margin-bottom:0;">
        <div class="card-sub" id="bk-count">Loading…</div>
        <button id="bk-new" class="btn-an btn-an-sm"><i class="fas fa-plus"></i> New booking</button>
      </div>
    </div>
    <div id="bk-list" class="row-list"></div>
  `;

  const filterBar = panel.querySelector('#bk-filters');
  const list = panel.querySelector('#bk-list');
  const count = panel.querySelector('#bk-count');
  let activeFilter = 'active';
  let bookings = [];

  STATUS_FILTERS.forEach(f => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (f.key === activeFilter ? ' active' : '');
    b.textContent = f.label;
    b.addEventListener('click', () => {
      activeFilter = f.key;
      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === b));
      render();
    });
    filterBar.appendChild(b);
  });

  const qRef = query(collection(db, COL.BOOKINGS), orderBy('createdAt', 'desc'));
  onSnapshot(qRef, snap => {
    bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
  });

  panel.querySelector('#bk-new').addEventListener('click', () => openBookingModal(db, null));

  function render() {
    const f = STATUS_FILTERS.find(x => x.key === activeFilter);
    const rows = bookings.filter(b => f.match(b.status || 'new'));
    count.textContent = `${rows.length} booking${rows.length === 1 ? '' : 's'}`;
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
  const tied = b.tripId ? `<span class="chip in_progress" title="Trip ID ${b.tripId}"><i class="fas fa-link"></i> Tied</span>` : '';
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(fmtDate(b.date))}</strong>
        <span class="text-muted-an">${escapeHtml(fmtTimeLabel(b.time))}</span>
        <span class="text-muted-an">· ${escapeHtml(b.passengers || '?')} pax</span>
      </div>
      <div class="flex-row">
        <span class="chip ${status}">${labelFor(status)}</span>
        ${tied}
      </div>
    </div>
    <div class="row-meta">
      ${dest ? `<div><b>Route</b> ${dest}</div>` : ''}
      <div><b>Customer</b> ${customer.name ? escapeHtml(customer.name) : '<i class="text-muted-an">unidentified</i>'}${customer.phone ? ' · ' + escapeHtml(customer.phone) : ''}</div>
      <div><b>Source</b> ${escapeHtml(b.source || 'web')}</div>
      <div><b>Received</b> ${escapeHtml(fmtDateTime(b.createdAt))}</div>
    </div>
    <div class="row-actions">
      <button class="btn-an btn-an-outline btn-an-sm" data-action="edit" data-id="${b.id}"><i class="fas fa-pen"></i> Edit</button>
      ${status === 'new'         ? `<button class="btn-an btn-an-sm" data-action="confirm" data-id="${b.id}"><i class="fas fa-check"></i> Confirm</button>` : ''}
      ${status === 'in_progress' ? `<button class="btn-an btn-an-sm" data-action="complete" data-id="${b.id}"><i class="fas fa-flag-checkered"></i> Mark complete</button>` : ''}
      ${customer.phone ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="wa" data-id="${b.id}"><i class="fab fa-whatsapp"></i> WhatsApp</button>` : ''}
      ${status !== 'cancelled' && status !== 'completed' ? `<button class="btn-an btn-an-outline btn-an-sm" data-action="cancel" data-id="${b.id}"><i class="fas fa-ban"></i> Cancel</button>` : ''}
      <button class="btn-an btn-an-outline btn-an-sm" data-action="delete" data-id="${b.id}" style="margin-left:auto;"><i class="fas fa-trash"></i></button>
    </div>
  </div>
  `;
}

function labelFor(s) {
  return ({
    new: 'New', confirmed: 'Confirmed', in_progress: 'On trip',
    completed: 'Completed', cancelled: 'Cancelled',
  })[s] || s;
}

async function handleAction(db, action, id, bookings) {
  const b = bookings.find(x => x.id === id);
  if (!b) return;
  try {
    if (action === 'edit') return openBookingModal(db, b);
    if (action === 'confirm')  return setStatus(db, id, 'confirmed');
    if (action === 'complete') return setStatus(db, id, 'completed');
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
    if (action === 'wa') {
      const phone = normalisePhone(b.customer && b.customer.phone);
      if (!phone) { Swal.fire('No phone', 'Customer phone is not set.', 'info'); return; }
      const text =
        `Hi${b.customer.name ? ' ' + b.customer.name : ''}! This is Anvisha Travels regarding your booking on ${fmtDate(b.date)} at ${fmtTimeLabel(b.time)} for ${b.passengers} passenger(s).`;
      const r = await Swal.fire({
        title: 'Open WhatsApp?',
        html: `Send to <code>+91${phone}</code>?`,
        showCancelButton: true,
        confirmButtonText: 'Open',
      });
      if (r.isConfirmed) window.location.href = buildWaUrl('91' + phone, text);
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

export async function openBookingModal(db, existing) {
  const isEdit = !!existing;
  const b = existing || {};
  const cust = b.customer || {};
  const html = `
    <div style="text-align:left;">
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label">Date</label>
          <input id="bm-date" type="date" class="f-input" value="${b.date || ''}">
        </div>
        <div class="f-group">
          <label class="f-label">Time (HH:MM)</label>
          <input id="bm-time" type="time" class="f-input" value="${b.time || ''}">
        </div>
      </div>
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label">Passengers</label>
          <input id="bm-pax" type="text" class="f-input" value="${escapeAttr(b.passengers || '')}" placeholder="e.g. 4">
        </div>
        <div class="f-group">
          <label class="f-label">Status</label>
          <select id="bm-status" class="f-select">
            ${['new','confirmed','in_progress','completed','cancelled'].map(s => `<option value="${s}" ${s === (b.status||'new') ? 'selected' : ''}>${labelFor(s)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="f-group mb-12">
        <label class="f-label">Destination</label>
        <input id="bm-dest" type="text" class="f-input" value="${escapeAttr(b.destination || '')}" placeholder="e.g. Cuttack Railway Station">
      </div>
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label">Customer name</label>
          <input id="bm-name" type="text" class="f-input" value="${escapeAttr(cust.name || '')}">
        </div>
        <div class="f-group">
          <label class="f-label">Customer phone</label>
          <input id="bm-phone" type="tel" class="f-input" value="${escapeAttr(cust.phone || '')}" placeholder="91XXXXXXXXXX">
        </div>
      </div>
      <div class="f-group mb-12">
        <label class="f-label">Address (optional)</label>
        <input id="bm-addr" type="text" class="f-input" value="${escapeAttr(cust.address || '')}">
      </div>
      <div class="f-row cols-2">
        <div class="f-group">
          <label class="f-label">Fare (₹, optional)</label>
          <input id="bm-fare" type="number" class="f-input" value="${b.fare ?? ''}" min="0" step="50">
        </div>
        <div class="f-group">
          <label class="f-label">Paid?</label>
          <select id="bm-paid" class="f-select">
            <option value="false" ${!b.paid ? 'selected' : ''}>No</option>
            <option value="true"  ${b.paid ? 'selected' : ''}>Yes</option>
          </select>
        </div>
      </div>
    </div>
  `;
  const r = await Swal.fire({
    title: isEdit ? 'Edit booking' : 'New booking',
    html,
    width: 640,
    showCancelButton: true,
    confirmButtonText: isEdit ? 'Save changes' : 'Create',
    focusConfirm: false,
    preConfirm: () => {
      const date = document.getElementById('bm-date').value;
      const time = document.getElementById('bm-time').value;
      const pax  = document.getElementById('bm-pax').value.trim();
      if (!date || !time || !pax) {
        Swal.showValidationMessage('Date, time and passengers are required');
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
        fare: document.getElementById('bm-fare').value ? Number(document.getElementById('bm-fare').value) : null,
        paid: document.getElementById('bm-paid').value === 'true',
      };
    },
  });
  if (!r.isConfirmed) return null;
  window.avBusy('Saving…');
  try {
    if (isEdit) {
      await updateDoc(doc(db, COL.BOOKINGS, existing.id), { ...r.value, updatedAt: serverTimestamp() });
      window.avDone();
      return { id: existing.id, ...r.value };
    } else {
      const { addDoc } = await import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js');
      const ref = await addDoc(collection(db, COL.BOOKINGS), {
        ...r.value, source: 'admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      window.avDone();
      return { id: ref.id, ...r.value };
    }
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
