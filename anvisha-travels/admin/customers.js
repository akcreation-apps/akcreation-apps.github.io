import { COL } from '../firebase-config.js';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtDate, fmtDateTime, normalisePhone, buildWaUrl, lifecycleBucket, daysBetween, toDateSafe, displayName, wirePhoneInput,
} from './analytics.js';

export async function renderCustomers(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-users"></i> Customers</h2>
    <div class="card-an">
      <div class="card-head" style="margin-bottom:10px;">
        <div class="flex-row flex-grow" style="gap:8px;">
          <div class="search-wrap"><i class="fas fa-search"></i><input id="cu-search" type="text" class="f-input" placeholder="Search by name or phone…"></div>
        </div>
        <button id="cu-new" class="btn-an btn-an-sm"><i class="fas fa-plus"></i> Add customer</button>
      </div>
      <div class="card-sub" id="cu-count">Loading…</div>
    </div>
    <div id="cu-list" class="row-list mt-12"></div>
  `;
  const list = panel.querySelector('#cu-list');
  const count = panel.querySelector('#cu-count');
  const search = panel.querySelector('#cu-search');
  let customers = [];

  onSnapshot(query(collection(db, COL.CUSTOMERS), orderBy('updatedAt', 'desc')), snap => {
    customers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    // Fallback if updatedAt index missing — order by name client-side.
    onSnapshot(collection(db, COL.CUSTOMERS), snap2 => {
      customers = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    });
  });

  search.addEventListener('input', render);
  panel.querySelector('#cu-new').addEventListener('click', () => openCustomerModal(db, null));

  function render() {
    const q = (search.value || '').trim().toLowerCase();
    let rows = customers.slice();
    if (q) {
      const qPhone = normalisePhone(q);
      rows = rows.filter(c => {
        const name = (c.name || '').toLowerCase();
        const phone = c.phone || c.id;
        return name.includes(q) || (qPhone && String(phone || '').includes(qPhone));
      });
      rows.sort((a, b) => {
        const an = (a.name || '').toLowerCase().startsWith(q) ? 0 : 1;
        const bn = (b.name || '').toLowerCase().startsWith(q) ? 0 : 1;
        return an - bn;
      });
    }
    count.textContent = `${rows.length} customer${rows.length === 1 ? '' : 's'}`;
    if (!rows.length) {
      list.innerHTML = `<div class="empty"><i class="fas fa-user-slash"></i> No customers.</div>`;
      return;
    }
    list.innerHTML = rows.map(renderRow).join('');
    list.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', () => handle(db, el.dataset.action, el.dataset.id, customers));
    });
  }
}

function renderRow(c) {
  const last = toDateSafe(c.lastTripAt);
  const days = last ? daysBetween(last, new Date()) : null;
  const bucket = lifecycleBucket(days);
  const bucketChip = ({
    active:  { cls: 'completed', text: 'Active' },
    cooling: { cls: 'in_progress', text: 'Cooling' },
    lapsed:  { cls: 'new', text: 'Lapsed' },
    lost:    { cls: 'cancelled', text: 'Lost' },
    never:   { cls: 'untied', text: 'Never travelled' },
  })[bucket];
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(c.name || 'Unnamed')}</strong>
        <span class="text-muted-an">+91 ${escapeHtml(c.phone || c.id)}</span>
      </div>
      <span class="chip ${bucketChip.cls}">${bucketChip.text}</span>
    </div>
    <div class="row-meta">
      <div><b>Trips</b> ${escapeHtml(String(c.tripCount || 0))}</div>
      <div><b>Last</b> ${last ? escapeHtml(fmtDate(last)) : '—'}${days != null ? ` (${days}d)` : ''}</div>
      ${c.address ? `<div><b>Address</b> ${escapeHtml(c.address)}</div>` : ''}
    </div>
    <div class="row-actions">
      <button class="btn-an btn-an-outline btn-an-sm" data-action="edit" data-id="${c.id}"><i class="fas fa-pen"></i> Edit</button>
      <button class="btn-an btn-an-outline btn-an-sm" data-action="wa" data-id="${c.id}"><i class="fab fa-whatsapp"></i> WhatsApp</button>
      <button class="btn-an btn-an-outline btn-an-sm" data-action="delete" data-id="${c.id}" style="margin-left:auto;" aria-label="Delete customer" title="Delete customer"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  </div>
  `;
}

async function handle(db, action, id, customers) {
  const c = customers.find(x => x.id === id);
  if (!c) return;
  try {
    if (action === 'edit') return openCustomerModal(db, c);
    if (action === 'delete') {
      const r = await Swal.fire({ title: 'Delete customer?', text: 'This removes the contact only, not their trips/bookings.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' });
      if (!r.isConfirmed) return;
      window.avBusy('Deleting…');
      await deleteDoc(doc(db, COL.CUSTOMERS, c.id));
      window.avDone();
      return;
    }
    if (action === 'wa') {
      const phone = normalisePhone(c.phone || c.id);
      if (!phone) { Swal.fire('No phone', 'No phone on file.', 'info'); return; }
      const r = await Swal.fire({
        title: 'Open WhatsApp?',
        html: `Send to <code>+91${phone}</code>?`,
        showCancelButton: true,
        confirmButtonText: 'Open',
      });
      if (r.isConfirmed) {
        const friendly = displayName(c.name);
        window.location.href = buildWaUrl('91' + phone, `Hi${friendly ? ' ' + friendly : ''}! This is Anvisha Travels. How can we help you today?`);
      }
    }
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

async function openCustomerModal(db, existing) {
  const isEdit = !!existing;
  const c = existing || {};
  const r = await Swal.fire({
    title: isEdit ? 'Edit customer' : 'Add customer',
    width: 540,
    html: `
      <div style="text-align:left;">
        <div class="f-row cols-2">
          <div class="f-group"><label class="f-label" for="cm-name">Name</label><input id="cm-name" type="text" class="f-input" value="${escapeAttr(c.name || '')}"></div>
          <div class="f-group"><label class="f-label" for="cm-phone">Phone (10 digits)</label><input id="cm-phone" type="tel" class="f-input" inputmode="numeric" value="${escapeAttr(c.phone || c.id || '')}" ${isEdit ? 'disabled' : ''}></div>
        </div>
        <div class="f-group mb-12"><label class="f-label" for="cm-addr">Address</label><input id="cm-addr" type="text" class="f-input" value="${escapeAttr(c.address || '')}"></div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: isEdit ? 'Save' : 'Create',
    didOpen: () => {
      const el = document.getElementById('cm-phone');
      if (el && !el.disabled) wirePhoneInput(el);
    },
    preConfirm: () => {
      const phone = normalisePhone(document.getElementById('cm-phone').value);
      const name  = document.getElementById('cm-name').value.trim();
      if (!phone || phone.length < 10) { Swal.showValidationMessage('Phone must be at least 10 digits'); return false; }
      return {
        name: name || null,
        phone,
        address: document.getElementById('cm-addr').value.trim() || null,
      };
    },
  });
  if (!r.isConfirmed) return;
  window.avBusy('Saving…');
  try {
    const id = isEdit ? existing.id : r.value.phone;
    await setDoc(doc(db, COL.CUSTOMERS, id), {
      ...r.value,
      ...(isEdit ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    window.avDone();
  } catch (e) {
    window.avDone();
    Swal.fire('Save failed', e.message || String(e), 'error');
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
