import { COL } from '../firebase-config.js';
import {
  collection, query, onSnapshot, doc, updateDoc, setDoc, getDocs, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const STATUSES = ['new', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'];
const ETA_MINUTES_FROM_ASSIGN = 45;

function formatEta(ts) {
  if (!ts?.toDate) return '';
  const d = ts.toDate();
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Normalises a user-typed phone number: strips +91/91 prefix, spaces, dashes,
// parens. Returns just the trailing 10 digits if recognisable, else null.
function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s;
}
function isValidPhone(raw) {
  const n = normalisePhone(raw);
  return /^\d{10}$/.test(n);
}

export async function renderOrders(root, db) {
  root.innerHTML = `
    <div class="section-header section-header--compact section-header--end section-header--sticky">
      <select id="orderFilter" class="form-control form-control-sm" style="width:auto;min-width:140px;max-width:200px">
        <option value="active">Active</option>
        <option value="new">New only</option>
        <option value="assigned">Assigned</option>
        <option value="delivered">Delivered</option>
        <option value="all">All</option>
      </select>
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
  const card = document.createElement('details');
  card.className = 'entity-card order-card';
  const created = o.created_at?.toDate ? o.created_at.toDate() : new Date();
  const status = o.status || 'new';
  const itemsHtml = (o.items || []).map(i =>
    `<li>${i.qty} × ${escapeHtml(i.name)} <span class="text-muted">— ₹${i.price ?? '?'}</span></li>`
  ).join('');

  const cust = o.customer || {};
  // Pre-populate delivery address from the order's "place" (where the customer
  // ordered from) when no explicit address has been entered yet.
  const prefilledAddress = cust.address || o.place || '';
  // Default: payment was collected on delivery. Admin can flip to "not collected"
  // to flag it for the delivery partner.
  const paymentCollected = o.payment_collected === false ? false : true;

  const staffOptions = staff
    .filter(s => s.is_active !== false)
    .map(s => `<option value="${s.uid}" ${o.delivery_staff_id === s.uid ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  // Contact summary line when collapsed
  const contactSummary = cust.name || cust.phone
    ? `${escapeHtml(cust.name || '')}${cust.phone ? ' · ' + escapeHtml(cust.phone) : ''}`
    : '<em>Not added</em>';

  const paymentBadge = paymentCollected
    ? '<span class="status-pill status-paid">PAID</span>'
    : '<span class="status-pill status-unpaid">UNPAID</span>';

  // Friendlier status labels — "out for delivery" overflows the pill on
  // narrow screens, so abbreviate it for the summary chip.
  const STATUS_LABEL = {
    new: 'new',
    assigned: 'assigned',
    out_for_delivery: 'out for delivery',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };

  const etaLine = o.eta
    ? `<div class="ec-meta"><i class="fas fa-clock"></i> ETA: ${formatEta(o.eta)}</div>`
    : '';

  // datetime-local needs local-ISO format `YYYY-MM-DDTHH:MM` (no seconds, no Z).
  // If we have an existing ETA, pre-fill it adjusted for the user's local TZ.
  function toLocalInputValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const etaInputValue = o.eta?.toDate ? toLocalInputValue(o.eta.toDate()) : '';

  card.innerHTML = `
    <summary class="order-summary">
      <div class="order-summary-main">
        <div class="ec-title">
          <span class="restaurant-name">${escapeHtml(o.restaurant_name || o.restaurant_id || '?')}</span>
          <span class="order-total">₹${o.total ?? '?'}</span>
        </div>
        <div class="ec-meta">${created.toLocaleString('en-IN')} · ${(o.items||[]).length} item${(o.items||[]).length === 1 ? '' : 's'}${o.place ? ' · ' + escapeHtml(o.place) : ''}</div>
        ${etaLine}
      </div>
      <div class="order-summary-side">
        <span class="status-pill status-${status}">${STATUS_LABEL[status] || status.replace('_', ' ')}</span>
        ${paymentBadge}
        <i class="fas fa-chevron-down order-chevron" aria-hidden="true"></i>
      </div>
    </summary>

    <div class="order-section">
      <div class="order-section-head"><i class="fas fa-list"></i> Items</div>
      <ul class="order-items">${itemsHtml}</ul>
    </div>

    <div class="order-section">
      <div class="order-section-head"><i class="fas fa-user"></i> Customer &amp; address</div>
      <div class="customer-row">
        <input class="form-control form-control-sm" placeholder="Customer name" data-f="name" value="${escapeAttr(cust.name||'')}">
        <input class="form-control form-control-sm" placeholder="Phone (10 digits)" data-f="phone" value="${escapeAttr(cust.phone||'')}" inputmode="tel" maxlength="15">
        <textarea class="form-control form-control-sm" placeholder="Delivery address" data-f="address" rows="2">${escapeHtml(prefilledAddress)}</textarea>
      </div>
    </div>

    <div class="order-section">
      <div class="order-section-head"><i class="fas fa-motorcycle"></i> Dispatch</div>
      <div class="dispatch-grid">
        <label class="field">
          <span class="field-label">Delivery partner</span>
          <select class="form-control form-control-sm" data-f="staff">
            <option value="">— Assign —</option>
            ${staffOptions}
          </select>
        </label>
        <label class="field">
          <span class="field-label">Status</span>
          <select class="form-control form-control-sm" data-f="status">
            ${STATUSES.map(s => `<option value="${s}" ${s===status?'selected':''}>${STATUS_LABEL[s] || s.replace('_',' ')}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field-label"><i class="fas fa-clock"></i> ETA</span>
          <input class="form-control form-control-sm" type="datetime-local" data-f="eta" value="${etaInputValue}">
          <small class="text-muted">Blank = auto +${ETA_MINUTES_FROM_ASSIGN} min after assignment.</small>
        </label>
      </div>
    </div>

    <div class="order-section payment-section">
      <label class="toggle">
        <input type="checkbox" data-f="payment" ${paymentCollected ? 'checked' : ''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
        <span class="toggle-text">
          <strong class="toggle-on">Payment collected</strong>
          <strong class="toggle-off">Collect on delivery</strong>
        </span>
      </label>
    </div>

    <div class="ec-actions order-actions">
      <button class="btn btn-sm btn-primary" data-act="save"><i class="fas fa-save mr-1"></i> Save</button>
    </div>
  `;

  // Auto-normalise phone on blur so the visible value matches what's saved.
  const phoneInput = card.querySelector('[data-f="phone"]');
  phoneInput.addEventListener('blur', () => {
    const n = normalisePhone(phoneInput.value);
    if (n) phoneInput.value = n;
  });

  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = card.querySelector('[data-f="name"]').value.trim();
    const rawPhone = card.querySelector('[data-f="phone"]').value.trim();
    const address = card.querySelector('[data-f="address"]').value.trim();
    const staffId = card.querySelector('[data-f="staff"]').value || null;
    const paymentCollectedNow = card.querySelector('[data-f="payment"]').checked;
    let newStatus = card.querySelector('[data-f="status"]').value;
    if (staffId && newStatus === 'new') newStatus = 'assigned';

    // ── Validation ─────────────────────────────────────────────────────
    if (newStatus !== 'new' && newStatus !== 'cancelled' && !isValidPhone(rawPhone)) {
      Swal.fire({
        icon: 'warning',
        title: 'Phone required',
        text: 'A valid 10-digit customer mobile number is required before moving an order beyond "new".',
      });
      phoneInput.focus();
      return;
    }
    if ((newStatus === 'assigned' || newStatus === 'out_for_delivery') && !staffId) {
      Swal.fire({
        icon: 'warning',
        title: 'Delivery partner required',
        text: 'Assign a delivery partner before marking the order as ' + newStatus.replace('_', ' ') + '.',
      });
      return;
    }

    const phone = normalisePhone(rawPhone);
    // Reflect the normalised value back into the input for the user.
    phoneInput.value = phone;

    const patch = {
      customer: { name, phone, address },
      delivery_staff_id: staffId,
      status: newStatus,
      payment_collected: paymentCollectedNow,
    };
    if (staffId && !o.assigned_at) patch.assigned_at = Timestamp.now();

    // ETA rules:
    //  1. Transitioning into 'assigned' always overwrites ETA to now + 45 min
    //     so every freshly-assigned order has a fresh delivery clock — the
    //     admin can fine-tune from the datetime input afterwards.
    //  2. Otherwise the user-typed datetime wins.
    //  3. Otherwise, if a staff is being attached for the first time and no
    //     ETA exists yet, fall back to the same now + 45 min auto-set.
    const etaInputValue = card.querySelector('[data-f="eta"]').value;
    const justAssigned = newStatus === 'assigned' && o.status !== 'assigned';
    if (justAssigned) {
      patch.eta = Timestamp.fromMillis(Date.now() + ETA_MINUTES_FROM_ASSIGN * 60 * 1000);
    } else if (etaInputValue) {
      const ms = new Date(etaInputValue).getTime();
      if (!Number.isNaN(ms)) patch.eta = Timestamp.fromMillis(ms);
    } else if (staffId && !o.eta) {
      patch.eta = Timestamp.fromMillis(Date.now() + ETA_MINUTES_FROM_ASSIGN * 60 * 1000);
    }

    if (newStatus === 'delivered' && !o.delivered_at) patch.delivered_at = Timestamp.now();

    try {
      await updateDoc(doc(db, COL.ORDERS, o.id), patch);
      if (phone) {
        await setDoc(doc(db, COL.CUSTOMERS, phone), {
          name, phone, address, last_seen: Timestamp.now(),
        }, { merge: true });
      }
      // Cascade status back to the source restaurant order so the individual
      // TCD/A1 admin sees a synchronised state:
      //   delivered  → Approved
      //   cancelled  → Rejected
      //   assigned / out_for_delivery → In Progress
      //   new        → no cascade (source keeps whatever it started as)
      const SOURCE_STATUS_MAP = {
        delivered: 'Approved',
        cancelled: 'Rejected',
        assigned: 'In Progress',
        out_for_delivery: 'In Progress',
      };
      const sourceStatus = SOURCE_STATUS_MAP[newStatus];
      if (sourceStatus) {
        if (!o.source_doc_path) {
          // Only nag for terminal states — "In Progress" mirroring is best-effort.
          if (newStatus === 'delivered' || newStatus === 'cancelled') {
            Swal.fire({
              icon: 'warning',
              title: 'Saved, but source not linked',
              html: `This order has no <code>source_doc_path</code> — likely placed before the mirror was deployed.<br>Mark it as <strong>${sourceStatus}</strong> manually in the restaurant's admin.`,
            });
            return;
          }
        } else {
          const [coll, docId] = o.source_doc_path.split('/');
          if (coll && docId) {
            try {
              await updateDoc(doc(db, coll, docId), { status: sourceStatus });
            } catch (err) {
              console.warn('Source order cascade failed:', err);
              Swal.fire({ icon: 'warning', title: 'Saved, but source not updated', text: err.message });
              return;
            }
          }
        }
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
