import { COL } from '../firebase-config.js';
import {
  collection, query, onSnapshot, doc, updateDoc, setDoc, getDocs, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const STATUSES = ['new', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'];

export async function renderOrders(root, db) {
  root.innerHTML = `
    <div class="section-header">
      <h3><i class="fas fa-receipt text-primary mr-1"></i> Orders</h3>
      <div>
        <select id="orderFilter" class="form-control form-control-sm" style="min-width:140px">
          <option value="active">Active</option>
          <option value="new">New only</option>
          <option value="assigned">Assigned</option>
          <option value="delivered">Delivered</option>
          <option value="all">All</option>
        </select>
      </div>
    </div>
    <div id="ordersList" class="card-list grid-2"><p class="text-muted">Listening for orders…</p></div>
  `;

  // Pre-load staff for the dropdown
  const staffSnap = await getDocs(collection(db, COL.STAFF));
  const staff = [];
  staffSnap.forEach(d => staff.push({ uid: d.id, ...d.data() }));

  const listEl = document.getElementById('ordersList');
  const filter = document.getElementById('orderFilter');

  let allOrders = [];
  function render() {
    const f = filter.value;
    const filtered = allOrders.filter(o => {
      if (f === 'all') return true;
      if (f === 'active') return o.status !== 'delivered' && o.status !== 'cancelled';
      return o.status === f;
    });
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>No orders match.</p></div>`;
      return;
    }
    listEl.innerHTML = '';
    filtered.forEach(o => listEl.appendChild(renderOrderCard(db, o, staff)));
  }
  filter.addEventListener('change', render);

  const q = query(collection(db, COL.ORDERS));
  onSnapshot(q, snap => {
    allOrders = [];
    snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    allOrders.sort((a, b) => {
      const ta = a.created_at?.toMillis?.() || 0;
      const tb = b.created_at?.toMillis?.() || 0;
      return tb - ta;
    });
    render();
  }, err => {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${err.message}</p></div>`;
  });
}

function renderOrderCard(db, o, staff) {
  const card = document.createElement('div');
  card.className = 'entity-card';
  const created = o.created_at?.toDate ? o.created_at.toDate() : new Date();
  const status = o.status || 'new';
  const itemsHtml = (o.items || []).map(i =>
    `<li>${i.qty} × ${escapeHtml(i.name)} <span class="text-muted">— ₹${i.price ?? '?'}</span></li>`
  ).join('');

  const cust = o.customer || {};
  const staffOptions = staff
    .filter(s => s.is_active !== false)
    .map(s => `<option value="${s.uid}" ${o.delivery_staff_id === s.uid ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  card.innerHTML = `
    <div class="ec-row">
      <div>
        <div class="ec-title">${escapeHtml(o.restaurant_name || o.restaurant_id || '?')} · ₹${o.total ?? '?'}</div>
        <div class="ec-meta">${created.toLocaleString('en-IN')} ${o.place ? '· ' + escapeHtml(o.place) : ''}</div>
      </div>
      <span class="status-pill status-${status}">${status.replace('_', ' ')}</span>
    </div>

    <details>
      <summary class="ec-meta" style="cursor:pointer;user-select:none">${(o.items||[]).length} items</summary>
      <ul class="order-items">${itemsHtml}</ul>
    </details>

    <div class="customer-row">
      <input class="form-control form-control-sm" placeholder="Customer name" data-f="name" value="${escapeAttr(cust.name||'')}">
      <input class="form-control form-control-sm" placeholder="Phone" data-f="phone" value="${escapeAttr(cust.phone||'')}" inputmode="tel">
      <textarea class="form-control form-control-sm" placeholder="Delivery address" data-f="address" rows="2">${escapeHtml(cust.address||'')}</textarea>
    </div>

    <div class="form-row">
      <div class="form-group col-7 mb-0">
        <select class="form-control form-control-sm" data-f="staff">
          <option value="">— Assign delivery —</option>
          ${staffOptions}
        </select>
      </div>
      <div class="form-group col-5 mb-0">
        <select class="form-control form-control-sm" data-f="status">
          ${STATUSES.map(s => `<option value="${s}" ${s===status?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="ec-actions" style="justify-content:flex-end">
      <button class="btn btn-sm btn-primary" data-act="save"><i class="fas fa-save mr-1"></i> Save</button>
    </div>
  `;

  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = card.querySelector('[data-f="name"]').value.trim();
    const phone = card.querySelector('[data-f="phone"]').value.trim();
    const address = card.querySelector('[data-f="address"]').value.trim();
    const staffId = card.querySelector('[data-f="staff"]').value || null;
    let newStatus = card.querySelector('[data-f="status"]').value;
    if (staffId && newStatus === 'new') newStatus = 'assigned';

    const patch = {
      customer: { name, phone, address },
      delivery_staff_id: staffId,
      status: newStatus,
    };
    if (staffId && !o.assigned_at) patch.assigned_at = Timestamp.now();
    if (newStatus === 'delivered' && !o.delivered_at) patch.delivered_at = Timestamp.now();

    try {
      await updateDoc(doc(db, COL.ORDERS, o.id), patch);
      if (phone) {
        await setDoc(doc(db, COL.CUSTOMERS, phone), {
          name, phone, address, last_seen: Timestamp.now(),
        }, { merge: true });
      }
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Save failed', text: e.message });
    }
  });

  return card;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
