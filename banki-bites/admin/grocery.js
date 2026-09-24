// Admin — BankiMart Grocery tab.
// Mirrors the food-order flow: each order card carries a customer picker
// + name/phone/address fields + payment-received toggle + Save button.
// No separate "Approve" action — hitting Save while Payment Received is on
// bumps the order into the batching-eligible state.
//
// Runs sub-view: admin multi-selects payment-received orders for a date,
// reorders them (sequence in which the delivery boy should visit), assigns
// a partner + total earning, and creates a delivery run.

import { COL, invalidateCache } from '../firebase-config.js';
import {
  collection, query, where, onSnapshot, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  Timestamp, writeBatch, orderBy,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { startOfLastMonth, fmtINR } from '../analytics.js';
import { loadCustomers, searchCustomers, openCustomerModal, upsertCustomer } from './customers.js';

let _ordersUnsub = null;
let _runsUnsub = null;
let _staffCache = [];
let _customers = new Map();

const STATUSES = ['new', 'order_confirmed', 'assigned', 'out_for_delivery', 'delivered', 'cancelled', 'fake'];
const STATUS_LABEL = {
  new: 'New',
  order_confirmed: 'Order confirmed',
  assigned: 'Assigned',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  fake: 'Fake',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
function toDate(ts) { return ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null); }
function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}
function isValidPhone(raw) { return /^\d{10}$/.test(normalisePhone(raw)); }

export async function renderGrocery(root, db) {
  root.innerHTML = `
    <style>
      .gr-subnav {
        display: flex;
        gap: 10px;
        padding: 6px;
        background: #f3f4f6;
        border-radius: 12px;
        margin-bottom: 12px;
        width: 100%;
      }
      .gr-subnav-btn {
        flex: 1 1 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 12px;
        border: 0;
        background: transparent;
        color: #4b5563;
        font-weight: 600;
        font-size: 0.9rem;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, box-shadow 0.15s;
        letter-spacing: 0.01em;
        white-space: nowrap;
        min-width: 0;
      }
      @media (max-width: 380px) {
        .gr-subnav-btn { padding: 10px 8px; font-size: 0.82rem; gap: 6px; }
        .gr-subnav-btn i { font-size: 0.8rem; }
      }
      .gr-subnav-btn i { font-size: 0.85rem; opacity: 0.85; }
      .gr-subnav-btn:hover { color: #111827; }
      .gr-subnav-btn.is-active {
        background: #fff;
        color: #111827;
        box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
      }
      .gr-subnav-btn.is-active i { opacity: 1; color: var(--brand, #16a34a); }
      @media (prefers-color-scheme: dark) {
        .gr-subnav { background: #14161c; }
        .gr-subnav-btn { color: #9ca3af; }
        .gr-subnav-btn:hover { color: #f3f4f6; }
        .gr-subnav-btn.is-active { background: #1c1f27; color: #f3f4f6; box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
      }

    </style>
    <div class="gr-subnav" role="tablist" aria-label="Grocery view">
      <button type="button" class="gr-subnav-btn is-active" data-sub="orders" role="tab" aria-selected="true">
        <i class="fas fa-receipt"></i> Orders
      </button>
      <button type="button" class="gr-subnav-btn" data-sub="runs" role="tab" aria-selected="false">
        <i class="fas fa-truck-fast"></i> Delivery runs
      </button>
    </div>

    <div id="groceryOrdersPane" class="grocery-pane">
      <div class="section-header section-header--compact orders-filter-bar">
        <label class="orders-filter">
          <i class="fas fa-filter orders-filter__icon" aria-hidden="true"></i>
          <select id="grStatusFilter" class="orders-filter__select" aria-label="Filter by status">
            <option value="active">Active</option>
            <option value="new">New only</option>
            <option value="order_confirmed">Order confirmed</option>
            <option value="assigned">Assigned</option>
            <option value="out_for_delivery">Out for delivery</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="fake">Fake orders</option>
            <option value="all">All</option>
          </select>
          <i class="fas fa-chevron-down orders-filter__caret" aria-hidden="true"></i>
        </label>
        <label class="orders-filter">
          <i class="fas fa-calendar-day orders-filter__icon" aria-hidden="true"></i>
          <select id="grEtaFilter" class="orders-filter__select" aria-label="Filter by delivery date">
            <option value="all">All dates</option>
          </select>
          <i class="fas fa-chevron-down orders-filter__caret" aria-hidden="true"></i>
        </label>
        <button type="button" id="grClearFilters" class="orders-filter-clear" aria-label="Clear all filters" hidden>
          <i class="fas fa-xmark" aria-hidden="true"></i> Clear
        </button>
      </div>
      <div id="grOrdersList" class="card-list grid-2"><div class="bb-loader-block">Listening for grocery orders…</div></div>
    </div>

    <div id="groceryRunsPane" class="grocery-pane" hidden>
      <div class="section-header section-header--compact orders-filter-bar">
        <label class="orders-filter">
          <i class="fas fa-filter orders-filter__icon" aria-hidden="true"></i>
          <select id="grRunsFilter" class="orders-filter__select" aria-label="Filter runs">
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
          <i class="fas fa-chevron-down orders-filter__caret" aria-hidden="true"></i>
        </label>
        <button type="button" id="grRunsClearFilter" class="orders-filter-clear" aria-label="Clear filter" hidden>
          <i class="fas fa-xmark" aria-hidden="true"></i> Clear
        </button>
        <button id="grPlanRunBtn" class="btn btn-sm btn-primary" style="margin-left:auto">
          <i class="fas fa-plus mr-1"></i> Plan a run
        </button>
      </div>
      <div id="grRunsList" class="card-list"><div class="bb-loader-block">Loading runs…</div></div>
    </div>
  `;

  // Preload delivery staff + customers.
  const staffSnap = await getDocs(collection(db, COL.STAFF));
  _staffCache = [];
  staffSnap.forEach(d => _staffCache.push({ uid: d.id, ...d.data() }));
  _customers = await loadCustomers(db);

  root.querySelectorAll('[data-sub]').forEach(btn => {
    btn.addEventListener('click', () => {
      const which = btn.dataset.sub;
      root.querySelectorAll('[data-sub]').forEach(b => {
        const active = b.dataset.sub === which;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      root.querySelector('#groceryOrdersPane').hidden = which !== 'orders';
      root.querySelector('#groceryRunsPane').hidden = which !== 'runs';
      if (which === 'runs') mountRuns(root, db);
    });
  });

  mountOrders(root, db);
  document.getElementById('grPlanRunBtn').addEventListener('click', () => openPlanRunModal(db, root));
}

// ── Orders sub-view ──────────────────────────────────────────────────────
function mountOrders(root, db) {
  const listEl = root.querySelector('#grOrdersList');
  const statusFilter = root.querySelector('#grStatusFilter');
  const etaFilter = root.querySelector('#grEtaFilter');
  const clearBtn = root.querySelector('#grClearFilters');
  let all = [];

  // Highlight the active filter wrappers and reveal the Clear button only
  // when the current selection differs from the defaults. Mirrors the food
  // orders tab's UX.
  function updateFilterActiveState() {
    const defaults = { grStatusFilter: 'active', grEtaFilter: 'all' };
    let any = false;
    for (const [id, def] of Object.entries(defaults)) {
      const sel = root.querySelector('#' + id);
      const wrap = sel && sel.closest('.orders-filter');
      const isActive = sel && sel.value !== def;
      if (wrap) wrap.classList.toggle('orders-filter--active', !!isActive);
      if (isActive) any = true;
    }
    if (clearBtn) clearBtn.hidden = !any;
  }

  function refreshEtaOptions() {
    const set = new Set();
    for (const o of all) { if (o.eta_date) set.add(o.eta_date); }
    const dates = [...set].sort();
    const prev = etaFilter.value || 'all';
    etaFilter.innerHTML = '<option value="all">All dates</option>' +
      dates.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');
    etaFilter.value = dates.includes(prev) ? prev : 'all';
  }

  function paint() {
    const st = statusFilter.value;
    const ed = etaFilter.value;
    const filtered = all.filter(o => {
      if (ed !== 'all' && o.eta_date !== ed) return false;
      if (st === 'fake') return o.status === 'fake' || o.is_fake === true;
      if (st === 'all') return true;
      if (st === 'active') return !['delivered', 'cancelled', 'fake'].includes(o.status) && o.is_fake !== true;
      return (o.status || 'new') === st;
    });
    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No grocery orders match.</p></div>';
      return;
    }
    listEl.innerHTML = '';
    // Auto-suggest "BB N" names for brand-new orders missing a customer name
    // — increments past the highest BB-prefixed name already in the customers
    // map. Stays unique across multiple unsaved new cards in this render.
    const bbRe = /^BB\s+(\d+)/i;
    let nextBb = 1;
    for (const c of _customers.values()) {
      const m = (c.name || '').match(bbRe);
      if (m) { const n = parseInt(m[1], 10); if (n >= nextBb) nextBb = n + 1; }
    }
    filtered.forEach(o => {
      // Suggest a "BB N" name for any pre-delivery order that has no saved
      // customer name yet — that's what the admin needs to accept-and-save.
      const preDelivery = !['delivered', 'cancelled'].includes(o.status);
      const noName = !o.customer?.name;
      const suggestedName = (preDelivery && noName) ? `BB ${nextBb++}` : '';
      listEl.appendChild(renderOrderCard(db, o, root, suggestedName));
    });
  }

  const onFilterChange = () => { updateFilterActiveState(); paint(); };
  statusFilter.addEventListener('change', onFilterChange);
  etaFilter.addEventListener('change', onFilterChange);
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      statusFilter.value = 'active';
      etaFilter.value = 'all';
      onFilterChange();
    });
  }
  updateFilterActiveState();

  const sinceTs = Timestamp.fromDate(startOfLastMonth());
  const q = query(collection(db, COL.GROCERY_ORDERS), where('created_at', '>=', sinceTs));
  if (_ordersUnsub) { try { _ordersUnsub(); } catch {} _ordersUnsub = null; }
  _ordersUnsub = onSnapshot(q, snap => {
    invalidateCache('grocery_orders');
    all = [];
    snap.forEach(d => all.push({ id: d.id, ...d.data() }));
    all.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));
    refreshEtaOptions();
    paint();
  }, err => {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${esc(err.message)}</p></div>`;
  });
}

function chipLabel(name, phone) {
  const bits = [];
  if (name) bits.push(name);
  if (phone) bits.push(phone);
  return bits.join(' · ') || 'Selected';
}

function renderOrderCard(db, o, root, suggestedName = '') {
  const isFake = o.status === 'fake' || o.is_fake === true;
  const card = document.createElement('details');
  card.className = `entity-card order-card${isFake ? ' order-card--fake' : ''}`;
  const status = o.status || 'new';
  const created = toDate(o.created_at);
  const items = o.items || [];
  const nItems = items.reduce((s, i) => s + (i.qty || 0), 0);
  const partner = _staffCache.find(s => s.uid === o.delivery_staff_id);
  const partnerLabel = partner ? (partner.name || partner.email || partner.uid) : '';
  const feeShown = (['assigned', 'out_for_delivery', 'delivered'].includes(status))
    ? (o.delivery_fee_final ?? o.delivery_fee_estimated ?? 0)
    : (o.delivery_fee_estimated ?? 0);
  const grand = (Number(o.subtotal) || 0) + Number(feeShown || 0);
  // Fully-paid means we've recorded either an explicit collected flag or a
  // paid_already >= total on a saved order. Brand-new customer orders come
  // in as isNewUnprocessed and default the toggle to OFF so admin actively
  // decides what was received.
  const isNewUnprocessed = o.status === 'new'
    && o.paid_already == null && o.payment_method == null;
  const paid = isNewUnprocessed ? false : (o.payment_collected === true);
  const cust = o.customer || {};
  const effectiveName = cust.name || suggestedName || '';
  const itemsHtml = items.map(i =>
    `<li>${i.qty} × ${esc(i.name)} <span class="text-muted">— ₹${i.price ?? '?'}</span></li>`
  ).join('');
  // Use the suggested BB N name so the collapsed card doesn't say "Not added"
  // when the admin has an auto-suggestion waiting to be accepted.
  const contactSummary = (effectiveName || cust.phone)
    ? `${esc(effectiveName)}${cust.phone ? ' · ' + esc(cust.phone) : ''}`
    : '<em>Not added</em>';
  const statusOpts = STATUSES.map(s =>
    `<option value="${s}" ${s === status ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`
  ).join('');
  // Default method: any card without a saved method assumes UPI so admin
  // can accept-as-is. Only respected when admin actually saved one.
  const savedMethod = o.payment_method || '';
  const defaultMethod = savedMethod || 'upi';
  const methodOpts = ['', 'cash', 'upi', 'online'].map(m =>
    `<option value="${m}" ${defaultMethod === m ? 'selected' : ''}>${m ? m.toUpperCase() : 'Method'}</option>`
  ).join('');
  const paymentBadge = paid
    ? '<span class="status-pill status-paid">PAID</span>'
    : '<span class="status-pill status-unpaid">UNPAID</span>';
  // Grocery defaults to "fully prepaid via UPI" — most customers WhatsApp
  // us a screenshot when placing the order. Admin only needs to adjust for
  // the exceptions (partial, COD). We consider a card "unset" whenever it
  // has no payment info saved yet (payment_collected not true, paid_already
  // is 0/null, no explicit method). In that case Already-paid pre-fills to
  // the full total and "To collect" starts at 0.
  const orderTotal = Number(grand) || 0;
  const hasSavedPayment = o.payment_collected === true
    || (Number.isFinite(+o.paid_already) && +o.paid_already > 0)
    || (o.payment_method && o.payment_method !== '');
  const paidAlreadyInit = hasSavedPayment
    ? (Number.isFinite(+o.paid_already) ? +o.paid_already : 0)
    : orderTotal;
  const collectInit = hasSavedPayment
    ? (o.collect_amount != null && Number.isFinite(+o.collect_amount)
        ? +o.collect_amount
        : Math.max(0, orderTotal - paidAlreadyInit))
    : 0;

  card.innerHTML = `
    <summary class="order-summary">
      <div class="order-summary-main">
        <div class="ec-title">
          <span class="restaurant-name">BankiBites Groceries · #${esc(o.id.slice(-6).toUpperCase())}</span>
          <span class="order-total">${fmtINR(grand)}</span>
        </div>
        <div class="ec-meta">${created ? created.toLocaleString('en-IN') : ''} · ${nItems} item${nItems === 1 ? '' : 's'}${cust.address ? ' · ' + esc(cust.address) : ''}</div>
        <div class="ec-meta"><i class="fas fa-truck-fast"></i> ${esc(o.eta_date || '—')} · ${esc(o.eta_window || '')}</div>
        <div class="ec-meta">${contactSummary}${partnerLabel ? ' · <i class="fas fa-motorcycle"></i> ' + esc(partnerLabel) : ''}</div>
      </div>
      <div class="order-summary-side">
        ${isFake ? '<span class="status-pill status-fake">FAKE</span>' : ''}
        <span class="status-pill status-${status}">${esc(STATUS_LABEL[status] || status)}</span>
        ${isFake ? '' : paymentBadge}
        <i class="fas fa-chevron-down order-chevron" aria-hidden="true"></i>
      </div>
    </summary>

    <div class="order-section">
      <div class="order-section-head"><i class="fas fa-list"></i> Items</div>
      <ul class="order-items">${itemsHtml}</ul>
    </div>

    <div class="order-section">
      <div class="order-section-head"><i class="fas fa-user"></i> Customer &amp; address</div>
      <div class="customer-picker">
        <div class="customer-picker-search">
          <input class="form-control form-control-sm" data-f="custSearch"
                 placeholder="Search by name or phone…"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                 name="gr-custsearch-${esc(o.id)}">
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="newCustomer">
            <i class="fas fa-plus"></i> New
          </button>
        </div>
        <div class="customer-picker-results" data-el="results" hidden></div>
        <div class="customer-chip" data-el="chip" ${cust.phone ? '' : 'hidden'}>
          <i class="fas fa-user-check"></i>
          <span data-el="chipText">${esc(chipLabel(cust.name || '', cust.phone || ''))}</span>
          <button type="button" class="icon-btn icon-btn--secondary" data-act="editCustomer" title="Edit customer">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="icon-btn icon-btn--secondary" data-act="clearCustomer" title="Change customer">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="customer-fields">
          <input class="form-control form-control-sm" placeholder="Customer name" data-f="name"
                 name="gr-cname-${esc(o.id)}" value="${escAttr(effectiveName)}"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                 data-lpignore="true" data-1p-ignore="true">
          <input class="form-control form-control-sm" placeholder="Phone (10 digits)" data-f="phone"
                 name="gr-cphone-${esc(o.id)}" value="${escAttr(cust.phone || '')}"
                 inputmode="tel" maxlength="15" autocomplete="off" autocorrect="off"
                 autocapitalize="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true">
          <textarea class="form-control form-control-sm" placeholder="Delivery address" data-f="address"
                    name="gr-caddr-${esc(o.id)}" rows="2"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    data-lpignore="true" data-1p-ignore="true">${esc(cust.address || '')}</textarea>
          <div class="customer-gps" data-el="gpsLine" ${(cust.gps || _customers.get(cust.phone)?.gps) ? '' : 'hidden'}>
            <i class="fas fa-location-dot"></i>
            <a data-el="mapLink" target="_blank" rel="noopener">Open in Google Maps</a>
          </div>
        </div>
      </div>
    </div>

    <div class="order-section payment-section">
      <div class="order-section-head"><i class="fas fa-indian-rupee-sign"></i> Bill &amp; Payment</div>
      <div class="order-items" style="list-style:none;padding:0;margin-bottom:.75rem">
        <div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${fmtINR(o.subtotal)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Delivery${o.delivery_fee_final == null ? ' (est.)' : ''}</span><span>${fmtINR(feeShown)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:700"><span>Total</span><span>${fmtINR(grand)}</span></div>
      </div>
      <label class="field">
        <span class="field-label">Status</span>
        <select class="form-control form-control-sm" data-f="status">${statusOpts}</select>
      </label>
      <label class="toggle" style="margin-top:.5rem">
        <input type="checkbox" data-f="paid" ${paid ? 'checked' : ''}>
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
        <span class="toggle-text">
          <strong class="toggle-on">Fully paid</strong>
          <strong class="toggle-off">Collect on delivery</strong>
        </span>
      </label>
      <div class="billing-block" data-el="billingBlock" ${paid ? 'hidden' : ''} style="margin-top:.5rem">
        <div class="billing-row">
          <label class="billing-label" for="prepaid-${o.id}">Already paid</label>
          <div class="billing-input">
            <span class="billing-sign">−</span>
            <span class="rupee">₹</span>
            <input class="form-control form-control-sm" id="prepaid-${o.id}" data-f="paidAlready"
                   type="number" min="0" step="1" inputmode="numeric"
                   value="${paidAlreadyInit}" placeholder="0">
            <select class="form-control form-control-sm billing-method" data-f="method" aria-label="Payment method">${methodOpts}</select>
          </div>
        </div>
        <div class="billing-row billing-row--total">
          <label class="billing-label" for="collect-${o.id}">To collect at delivery</label>
          <div class="billing-input">
            <span class="rupee">₹</span>
            <input class="form-control form-control-sm" id="collect-${o.id}" data-f="collectAmount"
                   type="number" min="0" step="1" inputmode="numeric"
                   value="${collectInit}">
          </div>
        </div>
        <small class="text-muted" data-el="collectHelp">
          Auto-computed as Total − Already paid. Editable if the boy is collecting a different amount.
        </small>
        <div class="fully-paid-hint" data-el="fullyPaidHint" hidden style="margin-top:.35rem;color:var(--success,#16a34a);font-size:.85rem">
          <i class="fas fa-circle-check"></i>
          Nothing to collect at the door — will be saved as <strong>Fully paid</strong>.
        </div>
      </div>
    </div>

    <div class="ec-actions order-actions">
      <button class="btn btn-sm btn-outline-danger" data-act="deleteOrder"><i class="fas fa-trash-alt mr-1"></i> Delete</button>
      <button class="btn btn-sm ${isFake ? 'btn-warning' : 'btn-outline-danger'}" data-act="toggleFake">
        <i class="fas fa-triangle-exclamation mr-1"></i>${isFake ? 'Unmark fake' : 'Flag as fake'}
      </button>
      <button class="btn btn-sm btn-primary" data-act="save"><i class="fas fa-save mr-1"></i> Save</button>
    </div>
  `;

  wireCustomerPicker(db, card, o, effectiveName);
  wireSave(db, card, o);
  card.querySelector('[data-act="deleteOrder"]').addEventListener('click', () => deleteOrder(db, o));
  card.querySelector('[data-act="toggleFake"]').addEventListener('click', () => toggleFake(db, o));
  return card;
}

function wireCustomerPicker(db, card, o, effectiveName = '') {
  const searchInput = card.querySelector('[data-f="custSearch"]');
  const resultsEl = card.querySelector('[data-el="results"]');
  const chipEl = card.querySelector('[data-el="chip"]');
  const chipTextEl = card.querySelector('[data-el="chipText"]');
  const nameInput = card.querySelector('[data-f="name"]');
  const phoneInput = card.querySelector('[data-f="phone"]');
  const addrInput = card.querySelector('[data-f="address"]');
  // Force-assign the suggested name after DOM insertion so browser autofill
  // / password managers can't clobber the initial value= attribute. Retried
  // via rAF and a delayed setTimeout because some extensions autofill
  // asynchronously several frames after paint.
  const stampName = () => {
    if (!effectiveName) return;
    if (!nameInput.value || nameInput.value.trim() === '') nameInput.value = effectiveName;
  };
  stampName();
  requestAnimationFrame(stampName);
  setTimeout(stampName, 200);
  const gpsLineEl = card.querySelector('[data-el="gpsLine"]');
  const mapLinkEl = card.querySelector('[data-el="mapLink"]');
  let selectedGps = null;

  function showGps(gps) {
    if (gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng)) {
      selectedGps = { lat: gps.lat, lng: gps.lng };
      mapLinkEl.href = `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
      mapLinkEl.textContent = `Open in Maps (${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)})`;
      gpsLineEl.hidden = false;
    } else {
      selectedGps = null;
      gpsLineEl.hidden = true;
    }
  }
  // Hydrate GPS from the customer record (or the order's denormalised copy).
  const startingCust = o.customer?.phone ? _customers.get(o.customer.phone) : null;
  showGps(startingCust?.gps || o.customer?.gps);
  card._getSelectedGps = () => selectedGps;

  function applyCustomer(c) {
    nameInput.value = c.name || '';
    phoneInput.value = c.phone || '';
    addrInput.value = c.address || '';
    chipTextEl.textContent = chipLabel(c.name, c.phone);
    chipEl.hidden = false;
    searchInput.value = '';
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    showGps(c.gps);
  }
  function clearChip() {
    chipEl.hidden = true;
    chipTextEl.textContent = '';
    showGps(null);
  }

  searchInput.addEventListener('input', () => {
    const matches = searchCustomers(_customers, searchInput.value);
    if (!matches.length) { resultsEl.hidden = true; resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = matches.map(c => `
      <button type="button" class="customer-result" data-phone="${escAttr(c.phone)}">
        <strong>${esc(c.name || '(no name)')}</strong>
        <span class="text-muted">${esc(c.phone)}</span>
        ${c.address ? `<div class="small text-muted">${esc(c.address)}</div>` : ''}
      </button>`).join('');
    resultsEl.hidden = false;
    resultsEl.querySelectorAll('[data-phone]').forEach(b => {
      b.addEventListener('click', () => {
        const c = _customers.get(b.dataset.phone);
        if (c) applyCustomer(c);
      });
    });
  });

  card.querySelector('[data-act="newCustomer"]').addEventListener('click', async () => {
    const draft = { name: nameInput.value.trim(), phone: phoneInput.value.trim(), address: addrInput.value.trim() };
    const saved = await openCustomerModal(db, null, draft);
    if (saved) {
      _customers.set(saved.phone, saved);
      applyCustomer(saved);
    }
  });
  card.querySelector('[data-act="editCustomer"]').addEventListener('click', async () => {
    const phone = normalisePhone(phoneInput.value);
    const existing = _customers.get(phone);
    if (!existing) return;
    const saved = await openCustomerModal(db, existing);
    if (saved) { _customers.set(saved.phone, saved); applyCustomer(saved); }
  });
  card.querySelector('[data-act="clearCustomer"]').addEventListener('click', () => {
    nameInput.value = ''; phoneInput.value = ''; addrInput.value = '';
    clearChip();
  });

  // Auto-normalise phone on blur/paste.
  const norm = () => { const n = normalisePhone(phoneInput.value); if (n !== phoneInput.value) phoneInput.value = n; };
  phoneInput.addEventListener('blur', norm);
  phoneInput.addEventListener('paste', e => {
    e.preventDefault();
    const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
    phoneInput.value = normalisePhone(raw);
  });
}

function wireSave(db, card, o) {
  // ── Billing block live math ────────────────────────────────────────────
  // Admin edits Already-paid, "To collect" auto-recomputes as Total − paid.
  // If admin manually edits To-collect, we stop overwriting it (sticky
  // override) so their number sticks. Mirrors the food-order pattern.
  const paidToggle    = card.querySelector('[data-f="paid"]');
  const billingBox    = card.querySelector('[data-el="billingBlock"]');
  const paidAlreadyIn = card.querySelector('[data-f="paidAlready"]');
  const collectIn     = card.querySelector('[data-f="collectAmount"]');
  const methodSel     = card.querySelector('[data-f="method"]');
  const fullyPaidHint = card.querySelector('[data-el="fullyPaidHint"]');
  const collectHelp   = card.querySelector('[data-el="collectHelp"]');
  const orderTotal = (Number(o.subtotal) || 0) +
    Number(o.delivery_fee_final ?? o.delivery_fee_estimated ?? 0);

  // Force-populate the prepaid + collect + method fields whenever no
  // payment has been saved yet. Some browsers / password managers wipe
  // number-input `value=""` attributes; setting `.value` programmatically
  // in a post-paint microtask beats them to it and guarantees the
  // "fully prepaid UPI" default holds.
  const hasSavedPaymentInfo = o.payment_collected === true
    || (Number.isFinite(+o.paid_already) && +o.paid_already > 0)
    || (o.payment_method && o.payment_method !== '');
  if (!hasSavedPaymentInfo) {
    const forcePrefill = () => {
      const cur = parseFloat(paidAlreadyIn.value);
      if (!Number.isFinite(cur) || cur === 0) paidAlreadyIn.value = String(orderTotal);
      const curCollect = parseFloat(collectIn.value);
      if (!Number.isFinite(curCollect) || curCollect === orderTotal) collectIn.value = '0';
      if (!methodSel.value) methodSel.value = 'upi';
    };
    forcePrefill();
    requestAnimationFrame(forcePrefill);
    setTimeout(forcePrefill, 250);
  }

  function computeCollect() {
    const p = parseFloat(paidAlreadyIn.value) || 0;
    return Math.max(0, orderTotal - p);
  }
  let collectOverridden = (() => {
    if (o.collect_amount == null || !Number.isFinite(+o.collect_amount)) return false;
    return Math.abs((+o.collect_amount) - computeCollect()) > 0.001;
  })();
  function reflectFullyPaidHint() {
    const n = parseFloat(collectIn.value);
    const isZero = Number.isFinite(n) && n === 0;
    if (fullyPaidHint) fullyPaidHint.hidden = !isZero;
    if (collectHelp)   collectHelp.hidden   = isZero;
  }
  function recomputeCollect() {
    if (!collectOverridden) collectIn.value = String(computeCollect());
    reflectFullyPaidHint();
  }
  // Listen on both `input` and `change` so we cover typing, paste, spinner
  // arrows, and mobile numeric keyboards uniformly.
  ['input', 'change'].forEach(ev => paidAlreadyIn.addEventListener(ev, recomputeCollect));
  collectIn.addEventListener('input', () => {
    // Only mark as overridden if the admin's value diverges from the
    // computed one. Typing "540" then deleting back to computed 540
    // re-enables auto-recompute.
    const cur = parseFloat(collectIn.value);
    collectOverridden = Number.isFinite(cur) && Math.abs(cur - computeCollect()) > 0.001;
    reflectFullyPaidHint();
  });
  reflectFullyPaidHint();

  paidToggle.addEventListener('change', () => {
    const on = paidToggle.checked;
    billingBox.hidden = on;
    if (!on) {
      // Returning to collect-on-delivery: refresh math from current inputs.
      if (!collectOverridden) collectIn.value = computeCollect();
    }
  });

  card.querySelector('[data-act="save"]').addEventListener('click', async () => {
    const name = card.querySelector('[data-f="name"]').value.trim();
    const phoneRaw = card.querySelector('[data-f="phone"]').value.trim();
    const address = card.querySelector('[data-f="address"]').value.trim();
    let status = card.querySelector('[data-f="status"]').value;
    const paidToggleOn = paidToggle.checked;
    const method = methodSel.value;
    const prepaid = Math.max(0, parseFloat(paidAlreadyIn.value) || 0);
    const collect = Math.max(0, parseFloat(collectIn.value) || 0);
    const gps = card._getSelectedGps ? card._getSelectedGps() : null;

    const phone = normalisePhone(phoneRaw);
    if (phoneRaw && !isValidPhone(phoneRaw)) {
      Swal.fire({ icon: 'error', title: 'Invalid phone', text: 'Enter a valid 10-digit mobile number.' });
      return;
    }

    // ── Hard validation ──────────────────────────────────────────────────
    // Any save that records a payment OR moves the order past `new` MUST
    // have a customer attached (name + valid phone + address). Prevents
    // orphan payments and mystery deliveries. "Recording payment" here
    // means: fully-paid toggle on, or any partial received, or to-collect
    // reduced below the order total (i.e., admin acknowledged some money).
    const isRecordingPayment = paidToggleOn || prepaid > 0 || collect < orderTotal;
    const isAdvancingStatus = status !== 'new';
    if (isRecordingPayment || isAdvancingStatus) {
      const missing = [];
      if (!name) missing.push('name');
      if (!isValidPhone(phoneRaw)) missing.push('valid 10-digit phone');
      if (!address) missing.push('address');
      if (missing.length) {
        Swal.fire({
          icon: 'warning',
          title: 'Customer details required',
          html: `Before recording payment or advancing this order, please add the customer's <strong>${missing.join(', ')}</strong>. Use the picker or <em>+ New</em>.`,
        });
        return;
      }
    }

    // Whether the order is now fully paid — either the explicit toggle, or
    // the billing math shows nothing left to collect. Auto-bumps status to
    // `order_confirmed` from `new` so the order becomes batchable.
    const fullyPaid = paidToggleOn || (isRecordingPayment && collect === 0);
    if ((fullyPaid || prepaid > 0) && status === 'new') status = 'order_confirmed';

    // Cancellation reason: mandatory whenever an order is being moved into
    // "cancelled" state and does not already carry a recorded reason.
    // Powers the "Cancel reasons" analytics on the dashboard — identical to
    // the food-order flow.
    let cancelReasonNext = o.cancel_reason || null;
    if (status === 'cancelled' && !cancelReasonNext) {
      const picked = await promptCancelReason();
      if (!picked) return;
      cancelReasonNext = picked;
    }

    try {
      window.bbBusy('Saving order…');
      if (phone) {
        const saved = await upsertCustomer(db, { name, phone, address, gps });
        _customers.set(saved.phone, saved);
      }
      const patch = {
        customer: { name, phone, address, ...(gps ? { gps } : {}) },
        status,
        payment_collected: fullyPaid,
        payment_method: (paidToggleOn || prepaid > 0) ? method : '',
        cancel_reason: status === 'cancelled' ? cancelReasonNext : null,
      };
      // Keep `is_fake` aligned with the chosen status so the Flag-as-Fake
      // button and the status dropdown produce identical end-state.
      if (status === 'fake') patch.is_fake = true;
      else if (o.is_fake) patch.is_fake = false;

      if (paidToggleOn) {
        patch.paid_already = orderTotal;
        patch.collect_amount = 0;
      } else {
        patch.paid_already = prepaid;
        patch.collect_amount = collect;
      }
      if (fullyPaid && !o.payment_collected) patch.paid_at = Timestamp.now();
      await updateDoc(doc(db, COL.GROCERY_ORDERS, o.id), patch);
      window.bbDone();
    } catch (err) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    }
  });
}

// Cancellation-reason picker — same six options + tile style as food orders,
// so the Dashboard's Cancel-reasons chart aggregates both flows cleanly.
async function promptCancelReason() {
  const REASONS = [
    { value: 'Out Of Stock',    icon: 'fa-box-open',           hint: 'Item ran out for this delivery date' },
    { value: 'Not Interested',  icon: 'fa-user-slash',         hint: 'Customer no longer wants the order' },
    { value: 'Extra Charges',   icon: 'fa-indian-rupee-sign',  hint: 'Customer refused additional fees' },
    { value: 'Prepay Required', icon: 'fa-money-bill-wave',    hint: 'First-time customer refused to prepay' },
    { value: 'Outer Zone',      icon: 'fa-map-location-dot',   hint: 'Delivery address is beyond the serviceable radius' },
    { value: 'Others',          icon: 'fa-ellipsis',           hint: 'Any other reason' },
  ];
  const tiles = REASONS.map(r => `
    <label class="cancel-reason-tile">
      <input type="radio" name="cancel-reason" value="${r.value}">
      <span class="crt-icon"><i class="fas ${r.icon}"></i></span>
      <span class="crt-body">
        <span class="crt-title">${r.value}</span>
        <span class="crt-hint">${r.hint}</span>
      </span>
      <span class="crt-check" aria-hidden="true"><i class="fas fa-check"></i></span>
    </label>`).join('');
  const res = await Swal.fire({
    title: 'Why is this order being cancelled?',
    html: `<div class="cancel-reason-list" role="radiogroup" aria-label="Cancellation reason">${tiles}</div>`,
    showCancelButton: true,
    confirmButtonText: 'Confirm',
    cancelButtonText: 'Go back',
    confirmButtonColor: '#dc3545',
    reverseButtons: true,
    focusConfirm: false,
    showCloseButton: true,
    customClass: {
      popup: 'cancel-reason-popup',
      htmlContainer: 'cancel-reason-html',
      confirmButton: 'cancel-reason-confirm',
    },
    didOpen: (popup) => {
      const radios = popup.querySelectorAll('input[name="cancel-reason"]');
      radios.forEach(r => r.addEventListener('change', () => {
        popup.querySelectorAll('.cancel-reason-tile').forEach(tile => {
          tile.classList.toggle('is-selected', tile.contains(r) && r.checked);
        });
      }));
      popup.querySelectorAll('.cancel-reason-tile').forEach(tile => {
        tile.addEventListener('click', () => {
          const input = tile.querySelector('input');
          if (input && !input.checked) {
            input.checked = true;
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
    },
    preConfirm: () => {
      const picked = document.querySelector('input[name="cancel-reason"]:checked');
      if (!picked) {
        Swal.showValidationMessage('Please pick a reason before cancelling this order.');
        return false;
      }
      return picked.value;
    },
  });
  return res.isConfirmed ? res.value : null;
}

async function toggleFake(db, o) {
  const isFakeNow = o.status === 'fake' || o.is_fake === true;
  const nowFake = !isFakeNow;
  const ok = await Swal.fire({
    icon: nowFake ? 'warning' : 'question',
    title: nowFake ? 'Mark as fake order?' : 'Remove fake flag?',
    text: nowFake
      ? 'This order will be flagged as fake (customer never confirmed / bot / prank).'
      : 'This order will be restored to normal.',
    showCancelButton: true,
    confirmButtonText: nowFake ? 'Yes, mark fake' : 'Yes, restore',
    confirmButtonColor: nowFake ? '#dc2626' : '#16a34a',
  });
  if (!ok.isConfirmed) return;
  try {
    window.bbBusy('Updating…');
    await updateDoc(doc(db, COL.GROCERY_ORDERS, o.id), {
      is_fake: nowFake,
      status: nowFake ? 'fake' : 'new',
    });
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
  }
}

async function deleteOrder(db, o) {
  const ok = await Swal.fire({
    title: `Delete order #${o.id.slice(-6).toUpperCase()}?`,
    text: 'This permanently removes the order from Firestore. This cannot be undone.',
    icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete',
    confirmButtonColor: '#dc3545',
  });
  if (!ok.isConfirmed) return;
  try {
    window.bbBusy('Deleting…');
    await deleteDoc(doc(db, COL.GROCERY_ORDERS, o.id));
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message });
  }
}

// ── Runs sub-view ────────────────────────────────────────────────────────
function mountRuns(root, db) {
  const listEl = root.querySelector('#grRunsList');
  const filterEl = root.querySelector('#grRunsFilter');
  const clearBtn = root.querySelector('#grRunsClearFilter');
  let allRuns = [];

  function updateRunsFilterState() {
    const isActive = filterEl.value !== 'active';
    const wrap = filterEl.closest('.orders-filter');
    if (wrap) wrap.classList.toggle('orders-filter--active', isActive);
    if (clearBtn) clearBtn.hidden = !isActive;
  }

  function paintRuns() {
    const f = filterEl.value;
    const filtered = allRuns.filter(r => {
      if (f === 'all') return true;
      if (f === 'completed') return r.status === 'completed';
      // 'active' = anything that still needs work (planned or dispatched).
      return r.status !== 'completed';
    });
    if (!filtered.length) {
      const msg = f === 'active' ? 'No active runs.' : (f === 'completed' ? 'No completed runs yet.' : 'No delivery runs planned yet.');
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-truck-fast"></i><p>${msg}</p></div>`;
      return;
    }
    listEl.innerHTML = '';
    filtered.forEach(r => listEl.appendChild(renderRunCard(db, r, root)));
  }
  const onFilterChange = () => { updateRunsFilterState(); paintRuns(); };
  filterEl.addEventListener('change', onFilterChange);
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterEl.value = 'active';
      onFilterChange();
    });
  }
  updateRunsFilterState();

  const q = query(collection(db, COL.DELIVERY_RUNS), orderBy('run_date', 'desc'));
  if (_runsUnsub) { try { _runsUnsub(); } catch {} _runsUnsub = null; }
  _runsUnsub = onSnapshot(q, snap => {
    allRuns = [];
    snap.forEach(d => allRuns.push({ id: d.id, ...d.data() }));
    paintRuns();
  }, err => {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${esc(err.message)}</p></div>`;
  });
}

function renderRunCard(db, r) {
  const partner = _staffCache.find(s => s.uid === r.partner_uid);
  const partnerLabel = partner?.name || partner?.email || r.partner_uid || '—';
  const orderCount = (r.order_ids || []).length;
  const isCompleted = r.status === 'completed';
  const payoutChip = isCompleted
    ? (r.payout_paid === true
        ? '<span class="status-pill status-paid">PAID</span>'
        : '<span class="status-pill status-unpaid">PAYOUT PENDING</span>')
    : '';
  // Completed runs render as a collapsed <details> so a busy day doesn't
  // fill the tab with historic runs. Admin can expand any card for the
  // full stop breakdown (lazy-fetched on first open).
  if (isCompleted) {
    const el = document.createElement('details');
    el.className = 'entity-card order-card';
    el.innerHTML = `
      <summary class="order-summary">
        <div class="order-summary-main">
          <div class="ec-title">${esc(r.run_date || '—')} · ${orderCount} stop${orderCount === 1 ? '' : 's'}</div>
          <div class="ec-meta"><i class="fas fa-motorcycle"></i> ${esc(partnerLabel)} · Earns <strong>${fmtINR(r.partner_earning)}</strong>${Number.isFinite(+r.total_value) ? ' · Total ' + fmtINR(r.total_value) : ''}</div>
        </div>
        <div class="order-summary-side">
          <span class="status-pill status-${r.status}">${esc(r.status || 'planned')}</span>
          ${payoutChip}
          <i class="fas fa-chevron-down order-chevron" aria-hidden="true"></i>
        </div>
      </summary>
      <div class="order-section">
        <div class="order-section-head"><i class="fas fa-list"></i> Stops</div>
        <div data-el="stops" class="text-muted small">Loading stops…</div>
      </div>
      <div class="order-section">
        <div class="order-section-head"><i class="fas fa-clipboard"></i> Details</div>
        <div class="order-items" style="list-style:none;padding:0">
          <div><strong>Rider:</strong> ${esc(partnerLabel)}</div>
          <div><strong>Partner earning:</strong> ${fmtINR(r.partner_earning)}</div>
          ${Number.isFinite(+r.total_value) ? `<div><strong>Total value:</strong> ${fmtINR(r.total_value)}</div>` : ''}
          ${r.completed_at?.toDate ? `<div><strong>Completed:</strong> ${esc(r.completed_at.toDate().toLocaleString('en-IN'))}</div>` : ''}
          ${r.notes ? `<div><strong>Notes:</strong> ${esc(r.notes)}</div>` : ''}
        </div>
      </div>
    `;
    // Lazy-fetch the stop details on first open — avoids N reads per run on
    // list mount when admin is only glancing at the runs page.
    let loaded = false;
    el.addEventListener('toggle', async () => {
      if (!el.open || loaded) return;
      loaded = true;
      const stopsEl = el.querySelector('[data-el="stops"]');
      try {
        const stops = await Promise.all(
          (r.order_ids || []).map(id =>
            getDoc(doc(db, COL.GROCERY_ORDERS, id))
              .then(s => s.exists() ? { id, ...s.data() } : null)
              .catch(() => null)
          )
        );
        const rows = stops.filter(Boolean).map((o, i) => {
          const fee = Number(o.delivery_fee_final ?? o.delivery_fee_estimated ?? 0);
          const total = (Number(o.subtotal) || 0) + fee;
          return `
            <div class="entity-card" style="padding:.5rem .65rem;margin-bottom:.35rem">
              <div class="ec-title" style="font-size:.9rem">
                <span style="display:inline-block;min-width:1.6rem;text-align:center;background:#eee;color:#333;border-radius:5px;padding:0 .3rem;margin-right:.35rem">${i + 1}</span>
                #${esc(o.id.slice(-6).toUpperCase())} · ${esc(o.customer?.name || 'Customer')}
              </div>
              <div class="ec-meta">${(o.items || []).length} items · ${fmtINR(total)}${o.customer?.address ? ' · ' + esc(o.customer.address) : ''}</div>
              ${o.customer?.phone ? `<div class="ec-meta"><i class="fas fa-phone"></i> ${esc(o.customer.phone)}</div>` : ''}
            </div>`;
        }).join('');
        stopsEl.outerHTML = `<div>${rows || '<p class="text-muted small mb-0">No stops found.</p>'}</div>`;
      } catch (err) {
        stopsEl.innerHTML = `<p class="text-danger small mb-0">${esc(err.message)}</p>`;
      }
    });
    return el;
  }

  // Active (planned / dispatched) runs stay always-expanded so admin can
  // dispatch / complete / edit without an extra click.
  const el = document.createElement('div');
  el.className = 'entity-card';
  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">${esc(r.run_date || '—')} · ${orderCount} stop${orderCount === 1 ? '' : 's'}</div>
        <div class="ec-meta"><i class="fas fa-motorcycle"></i> ${esc(partnerLabel)}</div>
        <div class="ec-meta">Partner earns: <strong>${fmtINR(r.partner_earning)}</strong></div>
        <div class="ec-meta"><span class="status-pill status-${r.status}">${esc(r.status || 'planned')}</span></div>
      </div>
    </div>
    <div class="ec-actions ec-actions--bottom" style="flex-wrap:wrap;gap:.4rem">
      <button class="btn btn-sm btn-outline-secondary" data-act="editRun"><i class="fas fa-pen"></i> Edit rider / earning</button>
      ${r.status === 'planned' ? '<button class="btn btn-sm btn-primary" data-act="dispatch"><i class="fas fa-paper-plane"></i> Dispatch</button>' : ''}
      <button class="btn btn-sm btn-outline-danger" data-act="disband"><i class="fas fa-trash"></i> Disband</button>
    </div>
  `;
  el.querySelector('[data-act="editRun"]')?.addEventListener('click', () => editRun(db, r));
  el.querySelector('[data-act="dispatch"]')?.addEventListener('click', () => dispatchRun(db, r));
  el.querySelector('[data-act="disband"]')?.addEventListener('click', () => disbandRun(db, r));
  return el;
}

async function editRun(db, r) {
  const activeStaff = _staffCache.filter(s => s.is_active !== false);
  // Also keep the currently-assigned partner in the list even if they've been
  // deactivated since — so admin can still see who's assigned and reassign.
  if (r.partner_uid && !activeStaff.some(s => s.uid === r.partner_uid)) {
    const cur = _staffCache.find(s => s.uid === r.partner_uid);
    if (cur) activeStaff.push(cur);
  }
  const opts = activeStaff.map(s =>
    `<option value="${escAttr(s.uid)}" ${s.uid === r.partner_uid ? 'selected' : ''}>${esc(s.name || s.email || s.uid)}${s.is_active === false ? ' (inactive)' : ''}</option>`
  ).join('');

  // Fetch every stop in parallel so admin can see who's in the batch while
  // editing the rider / earning. Read-only — this modal doesn't restructure
  // the run (use Disband → Plan Run for that).
  window.bbBusy('Loading stops…');
  let stops = [];
  try {
    const results = await Promise.all(
      (r.order_ids || []).map(id =>
        getDoc(doc(db, COL.GROCERY_ORDERS, id))
          .then(s => s.exists() ? { id, ...s.data() } : null)
          .catch(() => null)
      )
    );
    stops = results.filter(Boolean);
  } finally {
    window.bbDone();
  }

  const stopsHtml = stops.length ? stops.map((o, i) => {
    const fee = Number(o.delivery_fee_final ?? o.delivery_fee_estimated ?? 0);
    const total = (Number(o.subtotal) || 0) + fee;
    const shortId = String(o.id || '').slice(-6).toUpperCase();
    const name = o.customer?.name || '(no name)';
    const phone = o.customer?.phone || '';
    const addr = o.customer?.address || '';
    return `
      <div class="gr-edit-stop">
        <div class="gr-edit-stop-num">${i + 1}</div>
        <div class="gr-edit-stop-body">
          <div class="gr-edit-stop-head">
            <span class="gr-edit-stop-id">#${esc(shortId)}</span>
            <span class="gr-edit-stop-name">${esc(name)}</span>
          </div>
          ${addr ? `<div class="gr-edit-stop-meta"><i class="fas fa-location-dot"></i> ${esc(addr)}</div>` : ''}
          ${phone ? `<div class="gr-edit-stop-meta"><i class="fas fa-phone"></i> ${esc(phone)}</div>` : ''}
          <div class="gr-edit-stop-meta">${(o.items || []).length} item${(o.items || []).length === 1 ? '' : 's'} · <strong>${fmtINR(total)}</strong></div>
        </div>
      </div>`;
  }).join('') : '<div class="text-muted small">No stops in this run.</div>';

  const res = await Swal.fire({
    title: `Edit run · ${esc(r.run_date || '')}`,
    width: 620,
    html: `
      <style>
        .gr-edit-stops-wrap {
          max-height: 260px; overflow: auto;
          border: 1px solid #e5e7eb; border-radius: 10px;
          padding: 6px; background: #fafafa; margin-top: 4px;
        }
        .gr-edit-stop {
          display: grid; grid-template-columns: 28px 1fr; gap: 8px;
          align-items: start; padding: 8px; background: #fff;
          border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 6px;
        }
        .gr-edit-stop:last-child { margin-bottom: 0; }
        .gr-edit-stop-num {
          width: 28px; height: 28px; border-radius: 6px;
          background: #f3f4f6; color: #374151; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.8rem;
        }
        .gr-edit-stop-body { min-width: 0; }
        .gr-edit-stop-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .gr-edit-stop-id {
          font-family: ui-monospace, Menlo, Consolas, monospace;
          font-weight: 700; font-size: 0.78rem; color: #16a34a;
          letter-spacing: 0.04em;
        }
        .gr-edit-stop-name { font-weight: 600; font-size: 0.9rem; }
        .gr-edit-stop-meta {
          font-size: 0.78rem; color: #6b7280; margin-top: 2px;
          line-height: 1.3; word-break: break-word;
        }
        .gr-edit-stop-meta i { margin-right: 4px; opacity: 0.75; width: 12px; }
        @media (prefers-color-scheme: dark) {
          .gr-edit-stops-wrap { background: #14161c; border-color: #262a33; }
          .gr-edit-stop { background: #1c1f27; border-color: #262a33; }
          .gr-edit-stop-num { background: #262a33; color: #f3f4f6; }
        }
      </style>
      <div style="text-align:left">
        <div class="form-group">
          <label>Delivery partner (rider)</label>
          <select id="grEditPartner" class="form-control">
            ${activeStaff.length ? opts : '<option value="">— no active partners —</option>'}
          </select>
        </div>
        <div class="form-group">
          <label>Partner earning for this bulk run (₹)</label>
          <input id="grEditEarning" type="number" min="0" step="1" class="form-control" value="${Number(r.partner_earning) || 0}">
        </div>
        <div class="form-group">
          <label>Notes</label>
          <textarea id="grEditNotes" class="form-control" rows="2">${esc(r.notes || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Stops in this run · ${stops.length}${r.order_ids && r.order_ids.length !== stops.length ? ` <span class="text-muted">(${(r.order_ids || []).length - stops.length} not found)</span>` : ''}</label>
          <div class="gr-edit-stops-wrap">${stopsHtml}</div>
          <small class="text-muted">Read-only — to add / remove / reorder stops, Disband this run and plan a new one.</small>
        </div>
      </div>
    `,
    showCancelButton: true, confirmButtonText: 'Save changes',
    preConfirm: () => {
      const partner_uid = document.getElementById('grEditPartner').value;
      if (!partner_uid) { Swal.showValidationMessage('Pick a delivery partner'); return false; }
      const partner_earning = parseInt(document.getElementById('grEditEarning').value, 10) || 0;
      const notes = document.getElementById('grEditNotes').value.trim();
      return { partner_uid, partner_earning, notes };
    },
  });
  if (!res.isConfirmed) return;

  try {
    window.bbBusy('Updating run…');
    const batch = writeBatch(db);
    batch.update(doc(db, COL.DELIVERY_RUNS, r.id), {
      partner_uid: res.value.partner_uid,
      partner_earning: res.value.partner_earning,
      notes: res.value.notes,
    });
    // Reassign every stop to the new rider so the delivery PWA picks them
    // up under the correct account. Safe even if the rider is unchanged.
    (r.order_ids || []).forEach(oid => {
      batch.update(doc(db, COL.GROCERY_ORDERS, oid), {
        delivery_staff_id: res.value.partner_uid,
      });
    });
    await batch.commit();
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
  }
}

async function dispatchRun(db, r) {
  const ok = await Swal.fire({
    title: `Dispatch run for ${r.run_date}?`,
    text: `All ${r.order_ids?.length || 0} orders will be marked "out for delivery".`,
    icon: 'question', showCancelButton: true, confirmButtonText: 'Dispatch',
  });
  if (!ok.isConfirmed) return;
  try {
    window.bbBusy('Dispatching…');
    const batch = writeBatch(db);
    batch.update(doc(db, COL.DELIVERY_RUNS, r.id), { status: 'dispatched', dispatched_at: Timestamp.now() });
    for (const oid of (r.order_ids || [])) {
      batch.update(doc(db, COL.GROCERY_ORDERS, oid), {
        status: 'out_for_delivery', dispatched_at: Timestamp.now(),
      });
    }
    await batch.commit();
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Dispatch failed', text: err.message });
  }
}

async function disbandRun(db, r) {
  const ok = await Swal.fire({
    title: `Disband run for ${r.run_date}?`,
    text: 'Orders in this run will go back to "order confirmed" and can be re-batched.',
    icon: 'warning', showCancelButton: true, confirmButtonText: 'Disband',
    confirmButtonColor: '#dc3545',
  });
  if (!ok.isConfirmed) return;
  try {
    window.bbBusy('Disbanding…');
    const batch = writeBatch(db);
    for (const oid of (r.order_ids || [])) {
      batch.update(doc(db, COL.GROCERY_ORDERS, oid), {
        status: 'order_confirmed', delivery_run_id: null, delivery_staff_id: null,
        delivery_fee_final: null, total_final: null,
      });
    }
    batch.delete(doc(db, COL.DELIVERY_RUNS, r.id));
    await batch.commit();
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Disband failed', text: err.message });
  }
}

async function openPlanRunModal(db, root) {
  const t = new Date(); t.setDate(t.getDate() + 1);
  const pad = n => String(n).padStart(2, '0');
  const defDate = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;

  const step1 = await Swal.fire({
    title: 'Plan a delivery run',
    html: `
      <div style="text-align:left">
        <label style="display:block;font-weight:600;margin-bottom:.3rem">Delivery date</label>
        <input id="grPlanDate" type="date" class="form-control" value="${defDate}">
      </div>`,
    showCancelButton: true, confirmButtonText: 'Load orders',
    preConfirm: () => document.getElementById('grPlanDate').value,
  });
  if (!step1.isConfirmed || !step1.value) return;
  const runDate = step1.value;

  window.bbBusy('Loading orders…');
  let ordersSnap;
  try {
    // Single-field range query keeps this off the composite-index requirement.
    // Status + delivery_run_id are filtered client-side below.
    ordersSnap = await getDocs(query(
      collection(db, COL.GROCERY_ORDERS),
      where('eta_date', '==', runDate),
    ));
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Load failed', text: err.message });
    return;
  }
  window.bbDone();
  const forDate = [];
  ordersSnap.forEach(d => forDate.push({ id: d.id, ...d.data() }));
  const candidates = forDate.filter(o => o.status === 'order_confirmed' && !o.delivery_run_id);
  if (!candidates.length) {
    // Give the admin a clear reason nothing showed up — count what's on the
    // date and how each order is currently blocking.
    const byStatus = new Map();
    let alreadyInRun = 0;
    for (const o of forDate) {
      if (o.delivery_run_id) alreadyInRun += 1;
      const s = o.status || 'new';
      byStatus.set(s, (byStatus.get(s) || 0) + 1);
    }
    const statusLine = forDate.length
      ? [...byStatus.entries()].map(([s, n]) => `${STATUS_LABEL[s] || s}: ${n}`).join(' · ')
      : 'None';
    const runLine = alreadyInRun ? `<div class="text-muted small mt-1">${alreadyInRun} already batched into another run.</div>` : '';
    Swal.fire({
      icon: 'info', title: 'No orders available',
      html: `
        <div style="text-align:left">
          <div>Nothing eligible for <strong>${esc(runDate)}</strong>.</div>
          <div class="text-muted small mt-2">On this date · ${esc(statusLine)}</div>
          ${runLine}
          <div class="text-muted small mt-2">Eligible = <strong>Order confirmed</strong> + not already batched.</div>
        </div>`,
    });
    return;
  }

  // ── Step 2: ordered pick — checkbox + up/down ordering.
  // We maintain a `sequence` array (order ids in current order) that reflects
  // the selection state and the delivery sequence. Only selected ids stay
  // in the sequence.
  const initialSequence = candidates.map(c => c.id);
  let sequence = [...initialSequence];   // all selected by default
  const activeStaff = _staffCache.filter(s => s.is_active !== false);
  const staffOptions = activeStaff.map(s =>
    `<option value="${escAttr(s.uid)}">${esc(s.name || s.email || s.uid)}</option>`
  ).join('');

  const html = `
    <div style="text-align:left">
      <style>
        .gr-plan-hint { font-size: .8rem; color: #6b7280; margin: 0 0 .5rem; }
        .gr-plan-list { max-height: 50vh; overflow: auto; border: 1px solid #e5e7eb; border-radius: 10px; padding: 6px; background: #fafafa; }
        .gr-plan-row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          gap: 8px;
          align-items: start;
          padding: 8px;
          margin-bottom: 6px;
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .gr-plan-row:last-child { margin-bottom: 0; }
        .gr-plan-row--unsel { opacity: .55; }
        .gr-plan-check { display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 3px; }
        .gr-plan-check input[type="checkbox"] { transform: scale(1.15); }
        .gr-plan-seq { font-weight: 700; font-size: .8rem; color: #16a34a; font-variant-numeric: tabular-nums; }
        .gr-plan-body { min-width: 0; }
        .gr-plan-id { font-family: ui-monospace, Menlo, Consolas, monospace; font-weight: 700; font-size: .8rem; color: #16a34a; letter-spacing: .04em; }
        .gr-plan-name { font-weight: 600; font-size: .9rem; line-height: 1.2; margin-top: 2px; }
        .gr-plan-sub { font-size: .75rem; color: #6b7280; margin-top: 2px; line-height: 1.25; word-break: break-word; }
        .gr-plan-price { font-weight: 700; font-size: .85rem; text-align: right; white-space: nowrap; }
        .gr-plan-moves { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; align-items: flex-end; }
        .gr-plan-moves button {
          width: 26px; height: 24px; padding: 0;
          border: 1px solid #d1d5db; background: #fff; color: #374151;
          border-radius: 5px; font-size: .7rem; cursor: pointer;
        }
        .gr-plan-moves button:hover { background: #f3f4f6; }
        @media (max-width: 480px) {
          .gr-plan-row { grid-template-columns: 26px 1fr; }
          .gr-plan-right { grid-column: 2; display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
          .gr-plan-moves { flex-direction: row; margin-top: 0; }
        }
        @media (prefers-color-scheme: dark) {
          .gr-plan-list { background: #14161c; border-color: #262a33; }
          .gr-plan-row { background: #1c1f27; border-color: #262a33; }
          .gr-plan-moves button { background: #1c1f27; color: #f3f4f6; border-color: #374151; }
          .gr-plan-moves button:hover { background: #262a33; }
        }
      </style>
      <p class="gr-plan-hint">Tick to include. Use ▲ / ▼ to set delivery order — rider visits top-to-bottom.</p>
      <div id="grStopsList" class="gr-plan-list"></div>
      <div class="form-row mt-3">
        <div class="form-group col-12">
          <label>Delivery partner</label>
          <select id="grPartner" class="form-control">
            ${activeStaff.length ? staffOptions : '<option value="">— no active partners —</option>'}
          </select>
        </div>
        <div class="form-group col-12">
          <label>Partner earning for this bulk run (₹)</label>
          <input id="grEarning" type="number" min="0" step="1" class="form-control" value="0">
          <small class="text-muted">What the delivery boy earns for delivering the whole batch.</small>
        </div>
        <div class="form-group col-12">
          <label>Notes (optional)</label>
          <textarea id="grNotes" class="form-control" rows="2"></textarea>
        </div>
      </div>
    </div>
  `;

  const paint = () => {
    const wrap = document.getElementById('grStopsList');
    if (!wrap) return;
    const selectedIds = new Set(sequence);
    const unselected = candidates.filter(c => !selectedIds.has(c.id));
    const rows = [
      ...sequence.map((id, idx) => {
        const c = candidates.find(x => x.id === id);
        return renderStopRow(c, true, idx + 1);
      }),
      ...unselected.map(c => renderStopRow(c, false, null)),
    ].join('');
    wrap.innerHTML = rows;
    wireRowHandlers();
  };

  // Card-based row — flows to a stacked layout on narrow screens so the
  // planner stays usable on a phone (no horizontal-scrolling table).
  const renderStopRow = (o, selected, num) => `
    <div class="gr-plan-row${selected ? '' : ' gr-plan-row--unsel'}" data-row="${escAttr(o.id)}">
      <div class="gr-plan-check">
        <input type="checkbox" data-tick="${escAttr(o.id)}" ${selected ? 'checked' : ''} aria-label="Include stop">
        ${selected ? `<span class="gr-plan-seq">${num}</span>` : ''}
      </div>
      <div class="gr-plan-body">
        <div class="gr-plan-id">#${esc(o.id.slice(-6).toUpperCase())}</div>
        <div class="gr-plan-name">${esc(o.customer?.name || '(no name)')}</div>
        <div class="gr-plan-sub">${esc(o.customer?.address || '(no address on file)')}${o.customer?.phone ? ' · ' + esc(o.customer.phone) : ''}</div>
      </div>
      <div class="gr-plan-right">
        <div class="gr-plan-price">${fmtINR(o.subtotal)}</div>
        ${selected ? `
          <div class="gr-plan-moves">
            <button type="button" data-up="${escAttr(o.id)}" title="Move up" aria-label="Move up"><i class="fas fa-chevron-up"></i></button>
            <button type="button" data-down="${escAttr(o.id)}" title="Move down" aria-label="Move down"><i class="fas fa-chevron-down"></i></button>
          </div>` : ''}
      </div>
    </div>`;

  const wireRowHandlers = () => {
    document.querySelectorAll('[data-tick]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-tick');
        if (cb.checked) {
          if (!sequence.includes(id)) sequence.push(id);
        } else {
          sequence = sequence.filter(x => x !== id);
        }
        paint();
      });
    });
    document.querySelectorAll('[data-up]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-up');
        const i = sequence.indexOf(id);
        if (i > 0) { [sequence[i - 1], sequence[i]] = [sequence[i], sequence[i - 1]]; paint(); }
      });
    });
    document.querySelectorAll('[data-down]').forEach(b => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-down');
        const i = sequence.indexOf(id);
        if (i !== -1 && i < sequence.length - 1) { [sequence[i + 1], sequence[i]] = [sequence[i], sequence[i + 1]]; paint(); }
      });
    });
  };

  const step2 = await Swal.fire({
    title: `Plan run · ${runDate}`,
    width: 600,
    html,
    showCancelButton: true, confirmButtonText: 'Create run',
    didOpen: paint,
    preConfirm: () => {
      if (!sequence.length) { Swal.showValidationMessage('Select at least one stop'); return false; }
      const partner_uid = document.getElementById('grPartner').value;
      if (!partner_uid) { Swal.showValidationMessage('Pick a delivery partner'); return false; }
      const partner_earning = parseInt(document.getElementById('grEarning').value, 10) || 0;
      const notes = document.getElementById('grNotes').value.trim();
      return { sequence: [...sequence], partner_uid, partner_earning, notes };
    },
  });
  if (!step2.isConfirmed) return;
  const v = step2.value;

  const runRef = doc(collection(db, COL.DELIVERY_RUNS));
  try {
    window.bbBusy('Creating run…');
    const batch = writeBatch(db);
    batch.set(runRef, {
      run_date: runDate,
      partner_uid: v.partner_uid,
      order_ids: v.sequence,
      partner_earning: v.partner_earning,
      delivery_charge_total: 0,      // kept for schema compatibility; not used for per-order splits anymore
      status: 'planned',
      notes: v.notes,
      created_at: Timestamp.now(),
      dispatched_at: null,
      completed_at: null,
    });
    v.sequence.forEach((oid, idx) => {
      batch.update(doc(db, COL.GROCERY_ORDERS, oid), {
        status: 'assigned',
        delivery_run_id: runRef.id,
        delivery_staff_id: v.partner_uid,
        run_sequence: idx + 1,       // useful when a stop is queried in isolation
      });
    });
    await batch.commit();
    window.bbDone();
    Swal.fire({ icon: 'success', title: 'Run created', timer: 1600, showConfirmButton: false });
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
  }
}
