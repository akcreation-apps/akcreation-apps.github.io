import { COL } from '../firebase-config.js';
import { loadCustomers, searchCustomers, openCustomerModal } from './customers.js';
import {
  collection, query, onSnapshot, doc, updateDoc, setDoc, getDoc, getDocs, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, toDateSafe, chartPalette, whenChartReady, isDelivered, fmtINR,
  wireStatsBlockResize, startOfLastMonth, netRevenue,
} from '../analytics.js';

const orderCharts = new Map();
function mountOrderChart(id, config) {
  const old = orderCharts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  const c = new Chart(el.getContext('2d'), config);
  orderCharts.set(id, c);
  return c;
}

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
    <details class="stats-block">
      <summary class="stats-block-head"><i class="fas fa-chart-simple"></i> Today snapshot</summary>
      <div class="stats-block-body">
        <div id="ordersKpis" class="kpi-grid kpi-grid--compact"></div>
        <div class="chart-grid">
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-clock"></i> Orders by hour (today)</div>
            <div class="chart-card-body"><canvas id="ordersByHour"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-circle-half-stroke"></i> Status mix (filter)</div>
            <div class="chart-card-body"><canvas id="ordersStatusMix"></canvas></div>
          </div>
        </div>
      </div>
    </details>

    <div class="section-header section-header--compact section-header--end section-header--sticky">
      <select id="orderFilter" class="form-control form-control-sm" style="width:auto;min-width:140px;max-width:200px">
        <option value="active">Active</option>
        <option value="new">New only</option>
        <option value="assigned">Assigned</option>
        <option value="delivered">Delivered</option>
        <option value="all">All</option>
      </select>
    </div>
    <div id="ordersList" class="card-list grid-2"><div class="bb-loader-block">Listening for orders…</div></div>
  `;

  try { await whenChartReady(); } catch (e) { console.warn('[orders] Chart.js unavailable:', e.message); }
  wireStatsBlockResize(root.querySelector('.stats-block'));
  const feeRules = await loadFeeRules(db);

  // Pre-load staff for the dropdown
  const staffSnap = await getDocs(collection(db, COL.STAFF));
  const staff = [];
  staffSnap.forEach(d => staff.push({ uid: d.id, ...d.data() }));

  // Pre-load customers for the picker. Held in a Map<phone, customer> and
  // mutated in-place when the admin creates/edits a customer from a card.
  const customers = await loadCustomers(db);

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
    } else {
      listEl.innerHTML = '';
      filtered.forEach(o => listEl.appendChild(renderOrderCard(db, o, staff, customers, feeRules)));
    }
    renderOrdersStats(allOrders, filtered);
  }
  filter.addEventListener('change', render);

  // Only fetch orders from the first day of the previous calendar month onward
  // so admin never pulls years of history into memory. Single-field range query
  // → no composite index needed.
  const sinceTs = Timestamp.fromDate(startOfLastMonth());
  const q = query(collection(db, COL.ORDERS), where('created_at', '>=', sinceTs));
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

function renderOrdersStats(all, filtered) {
  const p = chartPalette();
  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const todays = all.filter(o => {
    const t = toDateSafe(o.created_at);
    return t && t.getTime() >= startOfToday.getTime();
  });
  const todaysRevenue = todays.filter(isDelivered).reduce((s, o) => s + netRevenue(o), 0);

  // ETA delay (mins) for delivered orders today, when both delivered_at and eta exist.
  let delaySum = 0, delayN = 0;
  for (const o of todays) {
    if (!isDelivered(o)) continue;
    const dl = toDateSafe(o.delivered_at);
    const eta = toDateSafe(o.eta);
    if (dl && eta) { delaySum += (dl.getTime() - eta.getTime()) / 60000; delayN++; }
  }
  const avgDelay = delayN ? Math.round(delaySum / delayN) : null;

  const kpis = document.getElementById('ordersKpis');
  if (kpis) {
    kpis.innerHTML = `
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Today orders</div><div class="kpi-value">${todays.length}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Today revenue</div><div class="kpi-value">${fmtINR(todaysRevenue)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Avg ETA delay</div><div class="kpi-value">${avgDelay == null ? '—' : (avgDelay >= 0 ? '+' : '') + avgDelay + ' min'}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Showing</div><div class="kpi-value">${filtered.length}</div></div>
    `;
  }

  // Orders by hour (today).
  const hours = Array.from({ length: 24 }, () => 0);
  for (const o of todays) {
    const t = toDateSafe(o.created_at);
    if (t) hours[t.getHours()]++;
  }
  mountOrderChart('ordersByHour', {
    type: 'bar',
    data: {
      labels: hours.map((_, h) => `${String(h).padStart(2,'0')}h`),
      datasets: [{ label: 'Orders', data: hours, backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  // Status mix of currently-filtered list.
  const statusKeys = ['new', 'assigned', 'out_for_delivery', 'delivered', 'cancelled'];
  const counts = statusKeys.map(s => filtered.filter(o => (o.status || 'new') === s).length);
  mountOrderChart('ordersStatusMix', {
    type: 'doughnut',
    data: {
      labels: statusKeys.map(s => s.replace(/_/g, ' ')),
      datasets: [{ data: counts, backgroundColor: statusKeys.map(s => p.status[s]), borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderOrderCard(db, o, staff, customers, feeRules) {
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
  // narrow screens, so abbreviate it for the summary chip. Status dropdown
  // (below) keeps the longer, more descriptive form.
  const STATUS_LABEL = {
    new: 'new',
    assigned: 'assigned',
    out_for_delivery: 'on the way',
    delivered: 'delivered',
    cancelled: 'cancelled',
  };
  const STATUS_DROPDOWN_LABEL = {
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
      <div class="customer-picker">
        <div class="customer-picker-search">
          <input class="form-control form-control-sm" data-f="custSearch"
                 placeholder="Search by name or phone…"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                 name="bb-custsearch-${o.id}">
          <button type="button" class="btn btn-sm btn-outline-primary" data-act="newCustomer">
            <i class="fas fa-plus"></i> New
          </button>
        </div>
        <div class="customer-picker-results" data-el="results" hidden></div>
        <div class="customer-chip" data-el="chip" hidden>
          <i class="fas fa-user-check"></i>
          <span data-el="chipText"></span>
          <button type="button" class="icon-btn icon-btn--secondary" data-act="editCustomer" title="Edit customer">
            <i class="fas fa-pen"></i>
          </button>
          <button type="button" class="icon-btn icon-btn--secondary" data-act="clearCustomer" title="Change customer">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="customer-fields">
          <input class="form-control form-control-sm" placeholder="Customer name" data-f="name" value="${escapeAttr(cust.name||'')}" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="bb-cname-${o.id}">
          <input class="form-control form-control-sm" placeholder="Phone (10 digits)" data-f="phone" value="${escapeAttr(cust.phone||'')}" inputmode="tel" maxlength="15" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="bb-cphone-${o.id}">
          <textarea class="form-control form-control-sm" placeholder="Delivery address" data-f="address" rows="2" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" name="bb-caddr-${o.id}">${escapeHtml(prefilledAddress)}</textarea>
          <div class="customer-gps" data-el="gpsLine" hidden>
            <i class="fas fa-location-dot"></i>
            <a data-el="mapLink" target="_blank" rel="noopener">Open in Google Maps</a>
          </div>
        </div>
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
            ${STATUSES.map(s => `<option value="${s}" ${s===status?'selected':''}>${STATUS_DROPDOWN_LABEL[s] || s.replace(/_/g,' ')}</option>`).join('')}
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
          <strong class="toggle-on">Fully paid</strong>
          <strong class="toggle-off">Collect on delivery</strong>
        </span>
      </label>
      ${(() => {
        // Read-only history strip — shown when an order is fully paid but had
        // discount or prepayment recorded. Lets the admin see the financial
        // breakdown at a glance without flipping the toggle.
        const d = Number.isFinite(+o.discount)     ? +o.discount     : 0;
        const p = Number.isFinite(+o.paid_already) ? +o.paid_already : 0;
        if (!paymentCollected || (d <= 0 && p <= 0)) return '';
        const parts = [];
        if (d > 0) parts.push(`Discount ₹${d}`);
        if (p > 0) parts.push(`Prepaid ₹${p}${o.paid_method ? ' via ' + String(o.paid_method).toUpperCase() : ''}`);
        return `<div class="paid-history"><i class="fas fa-receipt"></i> <span>${escapeHtml(parts.join(' · '))}</span></div>`;
      })()}
      <div class="billing-block" data-el="billingBlock" ${paymentCollected ? 'hidden' : ''}>
        <div class="billing-row">
          <span class="billing-label">Cart total</span>
          <span class="billing-value" data-el="billingTotal">₹${Number.isFinite(+o.total) ? +o.total : '?'}</span>
        </div>
        <div class="billing-row">
          <label class="billing-label" for="discount-${o.id}">Discount</label>
          <div class="billing-input">
            <span class="billing-sign">−</span>
            <span class="rupee">₹</span>
            <input class="form-control form-control-sm" id="discount-${o.id}" data-f="discount"
                   type="number" min="0" step="1" inputmode="numeric"
                   value="${Number.isFinite(+o.discount) ? +o.discount : ''}" placeholder="0">
          </div>
        </div>
        <div class="billing-row">
          <label class="billing-label" for="prepaid-${o.id}">Already paid</label>
          <div class="billing-input">
            <span class="billing-sign">−</span>
            <span class="rupee">₹</span>
            <input class="form-control form-control-sm" id="prepaid-${o.id}" data-f="paidAlready"
                   type="number" min="0" step="1" inputmode="numeric"
                   value="${Number.isFinite(+o.paid_already) ? +o.paid_already : ''}" placeholder="0">
            <select class="form-control form-control-sm billing-method" data-f="paidMethod" aria-label="Prepayment method">
              ${['', 'upi', 'online', 'cash'].map(m => `<option value="${m}" ${(o.paid_method || '') === m ? 'selected' : ''}>${m ? m.toUpperCase() : 'method'}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="billing-row billing-row--total">
          <label class="billing-label" for="collect-${o.id}">To collect</label>
          <div class="billing-input">
            <span class="rupee">₹</span>
            <input class="form-control form-control-sm" id="collect-${o.id}" data-f="collectAmount"
                   type="number" min="0" step="1" inputmode="numeric"
                   value="${(o.collect_amount != null && Number.isFinite(+o.collect_amount)) ? +o.collect_amount : (Number.isFinite(+o.total) ? +o.total : '')}">
          </div>
        </div>
        <small class="text-muted" data-el="collectHelp">Auto-computed as cart total minus discount and any prepayment. Editable if the partner is collecting a different amount.</small>
        <div class="fully-paid-hint" data-el="fullyPaidHint" hidden>
          <i class="fas fa-circle-check"></i>
          <span>Nothing to collect at the door — this order will be saved as <strong>Fully paid</strong>. Discount &amp; prepayment stay on record.</span>
        </div>
      </div>
    </div>

    <div class="ec-actions order-actions">
      <button class="btn btn-sm btn-primary" data-act="save"><i class="fas fa-save mr-1"></i> Save</button>
    </div>
  `;

  // ── Billing block: live recompute "To collect" from total − discount − prepaid ──
  // Admin can manually override the auto-computed value; once they do, the
  // auto-recompute stops touching that field for this session (sticky override).
  const paymentToggle = card.querySelector('[data-f="payment"]');
  const billingBox    = card.querySelector('[data-el="billingBlock"]');
  const discountInput = card.querySelector('[data-f="discount"]');
  const prepaidInput  = card.querySelector('[data-f="paidAlready"]');
  const methodSelect  = card.querySelector('[data-f="paidMethod"]');
  const collectInput  = card.querySelector('[data-f="collectAmount"]');

  const orderTotal = Number.isFinite(+o.total) ? +o.total : 0;
  // Treat the initial collect_amount as "user override" only if it doesn't
  // match the computed value — otherwise let the live recompute drive it.
  function computeCollect() {
    const d = parseFloat(discountInput.value) || 0;
    const p = parseFloat(prepaidInput.value)  || 0;
    return Math.max(0, orderTotal - d - p);
  }
  let collectOverridden = (() => {
    // Strict null check: a stored `collect_amount: null` (from a prior "Fully paid"
     // save) must NOT be treated as the admin having overridden the value — it's
     // an absence of override, so live recompute should drive the field.
    if (o.collect_amount == null || !Number.isFinite(+o.collect_amount)) return false;
    return Math.abs((+o.collect_amount) - computeCollect()) > 0.001;
  })();
  const fullyPaidHint = card.querySelector('[data-el="fullyPaidHint"]');
  const collectHelp   = card.querySelector('[data-el="collectHelp"]');
  function reflectFullyPaidHint() {
    const n = parseFloat(collectInput.value);
    const isZero = Number.isFinite(n) && n === 0;
    if (fullyPaidHint) fullyPaidHint.hidden = !isZero;
    if (collectHelp)   collectHelp.hidden   = isZero;
  }
  function recomputeCollect() {
    if (!collectOverridden) collectInput.value = computeCollect();
    reflectFullyPaidHint();
  }
  discountInput.addEventListener('input', recomputeCollect);
  prepaidInput .addEventListener('input', recomputeCollect);
  collectInput .addEventListener('input', () => { collectOverridden = true; reflectFullyPaidHint(); });
  // Initial paint of the hint state.
  reflectFullyPaidHint();

  paymentToggle.addEventListener('change', () => {
    const collected = paymentToggle.checked;
    billingBox.hidden = collected;
    if (!collected) {
      // Re-entering collect-on-delivery: re-derive from current discount/prepaid
      // unless the admin has set their own override during this edit session.
      if (!collectOverridden) collectInput.value = computeCollect();
    }
  });

  // Auto-normalise phone on blur so the visible value matches what's saved.
  const phoneInput = card.querySelector('[data-f="phone"]');
  phoneInput.addEventListener('blur', () => {
    const n = normalisePhone(phoneInput.value);
    if (n) phoneInput.value = n;
  });

  // ── Customer picker wiring ────────────────────────────────────────────
  const nameInput = card.querySelector('[data-f="name"]');
  const addrInput = card.querySelector('[data-f="address"]');
  const searchInput = card.querySelector('[data-f="custSearch"]');
  const resultsEl = card.querySelector('[data-el="results"]');
  const chipEl = card.querySelector('[data-el="chip"]');
  const chipTextEl = card.querySelector('[data-el="chipText"]');
  const gpsLineEl = card.querySelector('[data-el="gpsLine"]');
  const mapLinkEl = card.querySelector('[data-el="mapLink"]');
  // Track the currently-selected customer's GPS (separate from the form
  // inputs, which only hold name/phone/address). Updated when the admin
  // picks an existing customer or creates a new one with GPS.
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

  // If the order already has a phone and that customer exists in our map,
  // hydrate the chip + GPS so the admin sees who's attached. Fall back to
  // GPS embedded on the order doc itself (denormalised) if the customer
  // record hasn't been loaded for some reason.
  if (cust.phone && customers.has(cust.phone)) {
    showGps(customers.get(cust.phone).gps || cust.gps);
    chipTextEl.textContent = chipLabel(cust.name || customers.get(cust.phone).name, cust.phone);
    chipEl.hidden = false;
  } else if (cust.gps) {
    showGps(cust.gps);
  }

  searchInput.addEventListener('input', () => {
    const matches = searchCustomers(customers, searchInput.value);
    if (!matches.length) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = '';
      return;
    }
    resultsEl.innerHTML = matches.map(c => `
      <button type="button" class="customer-result" data-phone="${escapeAttr(c.phone)}">
        <strong>${escapeHtml(c.name || '—')}</strong>
        <span class="text-muted">· ${escapeHtml(c.phone)}</span>
        <div class="text-muted small">${escapeHtml((c.address || '').slice(0, 60))}</div>
      </button>
    `).join('');
    resultsEl.hidden = false;
  });

  resultsEl.addEventListener('click', e => {
    const btn = e.target.closest('.customer-result');
    if (!btn) return;
    const c = customers.get(btn.dataset.phone);
    if (c) applyCustomer(c);
  });

  document.addEventListener('click', e => {
    if (!card.contains(e.target)) { resultsEl.hidden = true; }
  });

  card.querySelector('[data-act="newCustomer"]').addEventListener('click', async () => {
    const saved = await openCustomerModal(db, null);
    if (saved) {
      customers.set(saved.phone, saved);
      applyCustomer(saved);
    }
  });

  card.querySelector('[data-act="editCustomer"]').addEventListener('click', async () => {
    const phone = normalisePhone(phoneInput.value);
    const existing = customers.get(phone) || { name: nameInput.value, phone, address: addrInput.value };
    const saved = await openCustomerModal(db, existing);
    if (saved) {
      customers.set(saved.phone, saved);
      applyCustomer(saved);
    }
  });

  card.querySelector('[data-act="clearCustomer"]').addEventListener('click', () => {
    nameInput.value = '';
    phoneInput.value = '';
    addrInput.value = '';
    clearChip();
    searchInput.focus();
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

    // Persist the billing breakdown only when the toggle says collect-on-delivery.
    // When the admin flips to "fully paid", clear everything so future reads
    // fall back to the order total.
    if (!paymentCollectedNow) {
      const discount = parseFloat(discountInput.value) || 0;
      const prepaid  = parseFloat(prepaidInput.value)  || 0;
      const method   = methodSelect.value || null;
      const collect  = parseFloat(collectInput.value);
      if (!Number.isFinite(collect) || collect < 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Collect amount required',
          text: 'Enter the amount the delivery partner should collect (₹0 if fully prepaid), or flip the toggle to "Fully paid".',
        });
        return;
      }
      if (discount < 0 || prepaid < 0) {
        Swal.fire({ icon: 'warning', title: 'Negative values not allowed', text: 'Discount and prepayment must be ₹0 or more.' });
        return;
      }
      if (prepaid > 0 && !method) {
        Swal.fire({ icon: 'warning', title: 'Pick a payment method', text: 'Select how the prepayment was made (UPI / Online / Cash).' });
        return;
      }
      patch.discount      = discount;
      patch.paid_already  = prepaid;
      patch.paid_method   = prepaid > 0 ? method : null;
      patch.collect_amount = collect;
      // Auto-flip to "Fully paid" when discount + prepayment already covers the
      // full cart, while keeping the discount/prepaid record so revenue charts
      // (netRevenue = total − discount) and reconciliation stay accurate.
      if (collect === 0) patch.payment_collected = true;
    } else {
      patch.discount       = null;
      patch.paid_already   = null;
      patch.paid_method    = null;
      patch.collect_amount = null;
    }
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
    // Snapshot the courier payout fee at the moment the order is marked delivered
    // so historical earnings stay stable even if fee_rules change later.
    if (newStatus === 'delivered' && !Number.isFinite(o.payout_amount)) {
      patch.payout_amount = feeForOrder({ ...o, ...patch }, feeRules);
      if (o.payout_paid !== true) patch.payout_paid = false;
    }

    try {
      window.bbBusy('Saving order…');
      // Attach GPS to the order itself (denormalised) so the delivery partner
      // view can show a Maps link without a second Firestore read.
      if (selectedGps) patch.customer.gps = selectedGps;

      await updateDoc(doc(db, COL.ORDERS, o.id), patch);
      if (phone) {
        const custRef = doc(db, COL.CUSTOMERS, phone);
        const custData = { name, phone, address, last_seen: Timestamp.now() };
        if (selectedGps) custData.gps = selectedGps;
        // Set created_at only on first insert so we don't overwrite the
        // original signup time on every order save.
        const existing = await getDoc(custRef);
        if (!existing.exists()) custData.created_at = Timestamp.now();
        await setDoc(custRef, custData, { merge: true });
        customers.set(phone, { phone, ...custData });
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
      window.bbDone();
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1200, showConfirmButton: false });
    } catch (e) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Save failed', text: e.message });
    }
  });

  return card;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// Name shown inside the customer chip is hard-truncated so it never breaks
// the card layout on narrow screens. The full name remains visible in the
// "Customer name" input directly below the chip, so nothing is lost.
const CHIP_NAME_MAX = 14;
function chipLabel(name, phone) {
  const n = String(name || '').trim() || '—';
  const trimmed = n.length > CHIP_NAME_MAX ? n.slice(0, CHIP_NAME_MAX - 1).trimEnd() + '…' : n;
  return phone ? `${trimmed} · ${phone}` : trimmed;
}
