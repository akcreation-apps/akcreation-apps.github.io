import { COL, cachedGetDocs } from '../firebase-config.js';
import {
  collection, getDocs,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  toDateSafe, fmtINR, chartPalette, whenChartReady, netRevenue, isDelivered,
} from '../analytics.js';
import { loadCustomers, openCustomerModal } from './customers.js';

const charts = new Map();

// Cached loadAll result. Tab switches within the TTL reuse the last snapshot
// instead of re-fetching the entire orders + customers collections. Anything
// that mutates a customer/order calls loadAll with { force: true } to bust it.
const LOAD_ALL_TTL_MS = 2 * 60 * 1000;
let _loadAllCache = null;
export function invalidateCustomersCache() { _loadAllCache = null; }

// An offer is "active" when amount > 0 AND valid_until is today or later.
// Expired offers are hidden from KPI counts and the table cell.
function isOfferActive(r) {
  if (!(r.active_offer_amount > 0)) return false;
  const u = String(r.active_offer_valid_until || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u)) return false;
  const t = new Date(); t.setHours(0,0,0,0);
  const todayStr = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  return u >= todayStr;
}

function mountChart(id, config) {
  const old = charts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el) return null;
  const c = new Chart(el.getContext('2d'), config);
  charts.set(id, c);
  return c;
}

export async function renderCustomers(root, db) {
  root.innerHTML = `
    <div class="section-header section-header--compact">
      <h3 class="m-0"><i class="fas fa-users mr-1" style="color:var(--brand)"></i> Customers</h3>
      <div class="d-flex" style="gap:6px;flex-wrap:wrap">
        <button id="custAdd" class="btn btn-sm btn-primary" aria-label="Add customer">
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span class="d-none d-sm-inline ml-1">Add</span>
        </button>
        <button id="custRefresh" class="btn btn-sm btn-outline-primary" aria-label="Refresh customers">
          <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
          <span class="d-none d-sm-inline ml-1">Refresh</span>
        </button>
      </div>
    </div>

    <div id="custKpis" class="kpi-grid"></div>

    <details class="stats-block" open>
      <summary class="stats-block-head">
        <i class="fas fa-chart-pie"></i> Customer insights
        <span class="text-muted ml-1" style="font-weight:400">(tap to collapse)</span>
      </summary>
      <div class="chart-grid">
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-user-plus"></i> New customers (last 6 months)</div>
          <div class="chart-card-body"><canvas id="custNewPerMonth"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-repeat"></i> Order-frequency mix</div>
          <div class="chart-card-body"><canvas id="custFrequency"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-crown"></i> Top 10 by orders (lifetime)</div>
          <div class="chart-card-body"><canvas id="custTopByOrders"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Top 10 by spend (lifetime)</div>
          <div class="chart-card-body"><canvas id="custTopBySpend"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-location-dot"></i> Customers by area</div>
          <div class="chart-card-body"><canvas id="custByArea"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-clock"></i> Activity recency</div>
          <div class="chart-card-body"><canvas id="custRecency"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-chart-column"></i> Lifetime spend distribution</div>
          <div class="chart-card-body"><canvas id="custLtvDist"></canvas></div>
        </div>
        <div class="chart-card chart-card--wide">
          <div class="chart-card-head"><i class="fas fa-table"></i> Retention cohorts</div>
          <div class="chart-card-body"><div id="custCohorts" class="cohort-wrap" aria-label="Retention cohorts"></div></div>
        </div>
      </div>
    </details>

    <div class="cust-details-head">
      <h4 class="cust-details-title">
        <i class="fas fa-address-book mr-1" style="color:var(--brand)"></i> Customer details
      </h4>
      <div class="cust-details-search">
        <input id="custSearch" class="form-control form-control-sm" placeholder="Search by name, phone or address…" autocomplete="off">
        <span id="custCount" class="text-muted small"></span>
      </div>
    </div>

    <div id="custTableWrap"></div>
  `;

  try { await whenChartReady(); } catch (e) { console.warn('[customers] Chart.js unavailable:', e.message); }

  let state = await loadAll(db);
  paint(root, state);

  document.getElementById('custRefresh').addEventListener('click', async () => {
    const btn = document.getElementById('custRefresh');
    btn.disabled = true; btn.classList.add('is-loading');
    try { state = await loadAll(db, { force: true }); paint(root, state); }
    finally { btn.disabled = false; btn.classList.remove('is-loading'); }
  });
  document.getElementById('custAdd').addEventListener('click', async () => {
    const saved = await openCustomerModal(db, null);
    if (saved) { state = await loadAll(db, { force: true }); paint(root, state); }
  });
  document.getElementById('custSearch').addEventListener('input', (e) => {
    renderTable(root, state, e.target.value);
  });
  // Delegate edit clicks on table rows.
  root.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit-phone]');
    if (editBtn) {
      const phone = editBtn.getAttribute('data-edit-phone');
      const existing = state.customers.get(phone) || { phone };
      const saved = await openCustomerModal(db, existing);
      if (saved) { state = await loadAll(db, { force: true }); paint(root, state); }
      return;
    }
    const viewCell = e.target.closest('[data-view-phone]');
    if (viewCell) {
      const phone = viewCell.getAttribute('data-view-phone');
      openCustomerDetails(state, phone);
    }
  });
}

async function loadAll(db, { force = false } = {}) {
  if (!force && _loadAllCache && (Date.now() - _loadAllCache.t) < LOAD_ALL_TTL_MS) {
    return _loadAllCache.state;
  }
  window.bbBusy('Loading customers…');
  try {
    const [customersMap, ordersSnap, staffList] = await Promise.all([
      loadCustomers(db),
      getDocs(collection(db, COL.ORDERS)),
      cachedGetDocs('staff:all', () => collection(db, COL.STAFF), { ttlMs: 10 * 60_000 }),
    ]);
    const orders = [];
    ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    const staffById = new Map(staffList.map(s => [s.id, s]));

    // Aggregate per-customer (by phone). Spend only counts delivered orders.
    const agg = new Map();
    for (const o of orders) {
      const phone = o.customer?.phone;
      if (!phone) continue;
      let a = agg.get(phone);
      if (!a) {
        a = { phone, orders: 0, delivered: 0, cancelled: 0, spend: 0, lastOrder: null, places: new Map() };
        agg.set(phone, a);
      }
      a.orders++;
      if (o.status === 'cancelled') a.cancelled++;
      if (isDelivered(o)) {
        a.delivered++;
        a.spend += netRevenue(o);
      }
      const d = toDateSafe(o.created_at);
      if (d && (!a.lastOrder || d > a.lastOrder)) a.lastOrder = d;
      const place = (o.place || '').trim();
      if (place) a.places.set(place, (a.places.get(place) || 0) + 1);
    }

    // Merge customer profile with aggregates. Every customer (even those
    // without any order yet) gets a row.
    const rows = [];
    for (const c of customersMap.values()) {
      const a = agg.get(c.phone) || { orders: 0, delivered: 0, cancelled: 0, spend: 0, lastOrder: null, places: new Map() };
      rows.push({
        phone: c.phone,
        name: c.name || '',
        address: c.address || '',
        created_at: toDateSafe(c.created_at),
        last_seen: toDateSafe(c.last_seen),
        not_interested: !!c.not_interested,
        active_offer_amount: Number(c.active_offer_amount) || 0,
        active_offer_valid_until: c.active_offer_valid_until || '',
        gps: c.gps || null,
        orders: a.orders,
        delivered: a.delivered,
        cancelled: a.cancelled,
        spend: a.spend,
        lastOrder: a.lastOrder,
        topPlace: pickTopPlace(a.places),
      });
    }
    // Also include any phone that appeared in orders but isn't in customers
    // (legacy / unsaved phones) so admins can see and add them.
    for (const a of agg.values()) {
      if (customersMap.has(a.phone)) continue;
      rows.push({
        phone: a.phone, name: '', address: '', created_at: null, last_seen: null,
        not_interested: false, active_offer_amount: 0, active_offer_valid_until: '', gps: null,
        orders: a.orders, delivered: a.delivered, cancelled: a.cancelled, spend: a.spend,
        lastOrder: a.lastOrder, topPlace: pickTopPlace(a.places), orphan: true,
      });
    }

    rows.sort((x, y) => (y.lastOrder?.getTime() || 0) - (x.lastOrder?.getTime() || 0));
    const state = { customers: customersMap, orders, rows, staffById };
    _loadAllCache = { state, t: Date.now() };
    return state;
  } finally {
    window.bbDone();
  }
}

function pickTopPlace(map) {
  if (!map || !map.size) return '';
  let best = '', n = -1;
  for (const [k, v] of map) if (v > n) { best = k; n = v; }
  return best;
}

function paint(root, state) {
  renderKpis(root, state);
  renderTable(root, state, document.getElementById('custSearch')?.value || '');
  const p = chartPalette();
  renderNewPerMonth(state.rows, p);
  renderFrequency(state.rows, p);
  renderTopByOrders(state.rows, p);
  renderTopBySpend(state.rows, p);
  renderByArea(state.rows, p);
  renderRecency(state.rows, p);
  renderLtvDist(state.rows, p);
  renderCohorts(state.rows, state.orders, p);
}

function renderKpis(root, { rows }) {
  const total = rows.length;
  const withOrders = rows.filter(r => r.orders > 0).length;
  const repeat = rows.filter(r => r.delivered >= 2).length;
  const today = new Date(); today.setHours(0,0,0,0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const newThisMonth = rows.filter(r => r.created_at && r.created_at >= startOfMonth).length;
  const activeOffers = rows.filter(isOfferActive).length;
  const lifetimeSpend = rows.reduce((s, r) => s + r.spend, 0);
  const avgSpend = withOrders ? Math.round(lifetimeSpend / withOrders) : 0;

  // Churn (60d) — of customers with any orders, how many haven't ordered in
  // the last 60 days (or never — treated as churned).
  const sixtyDaysAgo = today.getTime() - 60 * 86400000;
  const churnedN = rows.filter(r => r.orders > 0 && (!r.lastOrder || r.lastOrder.getTime() < sixtyDaysAgo)).length;
  const churnPct = withOrders ? Math.round((churnedN / withOrders) * 100) : 0;

  const el = document.getElementById('custKpis');
  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-users"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Total customers</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-sub">${withOrders} have ordered</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-user-plus"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">New this month</div>
        <div class="kpi-value">${newThisMonth}</div>
        <div class="kpi-sub">${repeat} repeat (2+ deliveries)</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-indian-rupee-sign"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Avg lifetime spend</div>
        <div class="kpi-value">${fmtINR(avgSpend)}</div>
        <div class="kpi-sub">${fmtINR(lifetimeSpend)} total</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-tag"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Active offers</div>
        <div class="kpi-value">${activeOffers}</div>
        <div class="kpi-sub">unredeemed thank-you offers</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-user-clock"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Churn (60d)</div>
        <div class="kpi-value">${churnPct}%</div>
        <div class="kpi-sub">${churnedN} of ${withOrders} inactive 60d+</div>
      </div>
    </div>
  `;
}

function renderTable(root, { rows }, term) {
  const t = String(term || '').trim().toLowerCase();
  const filtered = !t ? rows : rows.filter(r =>
    (r.name || '').toLowerCase().includes(t) ||
    (r.phone || '').toLowerCase().includes(t) ||
    (r.address || '').toLowerCase().includes(t) ||
    (r.topPlace || '').toLowerCase().includes(t)
  );
  document.getElementById('custCount').textContent = `${filtered.length} of ${rows.length}`;
  const wrap = document.getElementById('custTableWrap');
  if (!filtered.length) {
    wrap.innerHTML = `<p class="text-muted small mb-0">No customers match your search.</p>`;
    return;
  }
  const fmtDate = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const rowsHtml = filtered.slice(0, 200).map(r => `
    <tr${r.orphan ? ' class="cust-row--orphan"' : ''}>
      <td data-label="Customer" data-view-phone="${escapeAttr(r.phone)}" class="cust-table__name" role="button" tabindex="0" title="Click to see analytics">
        <div><strong>${escapeHtml(r.name || '(no name)')}</strong>${r.not_interested ? ' <i class="fas fa-ban text-danger" title="Not interested"></i>' : ''}${r.orphan ? ' <span class="badge badge-warning ml-1">unsaved</span>' : ''}</div>
        <div class="small text-muted">${escapeHtml(r.phone)}</div>
      </td>
      <td data-label="Address">
        <div class="small">${escapeHtml(r.address || '—')}</div>
        ${r.topPlace ? `<div class="small text-muted"><i class="fas fa-location-dot"></i> ${escapeHtml(r.topPlace)}</div>` : ''}
      </td>
      <td class="text-right" data-label="Orders">${r.orders}<div class="small text-muted">${r.delivered} dlv${r.cancelled ? ` · ${r.cancelled} cxl` : ''}</div></td>
      <td class="text-right" data-label="Spend">${fmtINR(r.spend)}</td>
      <td class="text-right" data-label="Last order">${fmtDate(r.lastOrder)}</td>
      <td class="text-right" data-label="Offer">
        ${isOfferActive(r) ? `<span class="badge badge-success">₹${r.active_offer_amount}</span>` : '<span class="text-muted">—</span>'}
      </td>
      <td class="text-right cust-table__actions">
        <button class="btn btn-sm btn-outline-secondary" data-edit-phone="${escapeAttr(r.phone)}" aria-label="Edit customer">
          <i class="fas fa-pen"></i>
        </button>
      </td>
    </tr>
  `).join('');
  wrap.innerHTML = `
    <table class="cust-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Address</th>
          <th class="text-right">Orders</th>
          <th class="text-right">Spend</th>
          <th class="text-right">Last order</th>
          <th class="text-right">Offer</th>
          <th class="text-right"></th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    ${filtered.length > 200 ? `<p class="small text-muted">Showing 200 of ${filtered.length}. Refine search to see more.</p>` : ''}
  `;
}

function renderNewPerMonth(rows, p) {
  const buckets = [];
  const ref = new Date(); ref.setDate(1); ref.setHours(0,0,0,0);
  for (let i = 5; i >= 0; i--) {
    const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const end = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
    buckets.push({
      label: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      start, end, count: 0,
    });
  }
  for (const r of rows) {
    if (!r.created_at) continue;
    for (const b of buckets) {
      if (r.created_at >= b.start && r.created_at < b.end) { b.count++; break; }
    }
  }
  mountChart('custNewPerMonth', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ label: 'New customers', data: buckets.map(b => b.count), backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderFrequency(rows, p) {
  const bins = { '0': 0, '1': 0, '2-3': 0, '4-9': 0, '10+': 0 };
  for (const r of rows) {
    const n = r.delivered;
    if (n === 0) bins['0']++;
    else if (n === 1) bins['1']++;
    else if (n <= 3) bins['2-3']++;
    else if (n <= 9) bins['4-9']++;
    else bins['10+']++;
  }
  const labels = ['No orders', '1 order', '2-3', '4-9', '10+'];
  const data = [bins['0'], bins['1'], bins['2-3'], bins['4-9'], bins['10+']];
  mountChart('custFrequency', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: [p.muted, p.series[1], p.series[2], p.series[3], p.brand], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderTopByOrders(rows, p) {
  const top = [...rows].filter(r => r.delivered > 0).sort((a, b) => b.delivered - a.delivered).slice(0, 10);
  mountChart('custTopByOrders', {
    type: 'bar',
    data: {
      labels: top.map(r => r.name || r.phone),
      datasets: [{ label: 'Delivered', data: top.map(r => r.delivered), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTopBySpend(rows, p) {
  const top = [...rows].filter(r => r.spend > 0).sort((a, b) => b.spend - a.spend).slice(0, 10);
  mountChart('custTopBySpend', {
    type: 'bar',
    data: {
      labels: top.map(r => r.name || r.phone),
      datasets: [{ label: 'Spend', data: top.map(r => Math.round(r.spend)), backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.x) } },
      },
      scales: { x: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });
}

function renderByArea(rows, p) {
  const g = new Map();
  for (const r of rows) {
    const k = r.topPlace || 'Unknown';
    g.set(k, (g.get(k) || 0) + 1);
  }
  const entries = [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  mountChart('custByArea', {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([, v]) => v), backgroundColor: p.series.concat([p.brand, p.muted]), borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '55%' },
  });
}

function renderRecency(rows, p) {
  const now = Date.now();
  const day = 86400000;
  const bins = { '0-7d': 0, '8-30d': 0, '31-90d': 0, '90d+': 0, 'never': 0 };
  for (const r of rows) {
    if (!r.lastOrder) { bins.never++; continue; }
    const diff = (now - r.lastOrder.getTime()) / day;
    if (diff <= 7) bins['0-7d']++;
    else if (diff <= 30) bins['8-30d']++;
    else if (diff <= 90) bins['31-90d']++;
    else bins['90d+']++;
  }
  const labels = ['0-7d', '8-30d', '31-90d', '90d+', 'Never'];
  const data = [bins['0-7d'], bins['8-30d'], bins['31-90d'], bins['90d+'], bins.never];
  mountChart('custRecency', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Customers', data, backgroundColor: [p.status.delivered, p.brand, p.series[2], p.status.cancelled, p.muted], borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderLtvDist(rows, p) {
  const buckets = [
    { label: '₹0-200',    min: 0,     max: 200 },
    { label: '₹200-500',  min: 200,   max: 500 },
    { label: '₹500-1k',   min: 500,   max: 1000 },
    { label: '₹1k-2k',    min: 1000,  max: 2000 },
    { label: '₹2k-5k',    min: 2000,  max: 5000 },
    { label: '₹5k+',      min: 5000,  max: Infinity },
  ];
  const counts = buckets.map(() => 0);
  for (const r of rows) {
    if (!(r.spend > 0)) continue;
    const idx = buckets.findIndex(b => r.spend >= b.min && r.spend < b.max);
    if (idx >= 0) counts[idx]++;
  }
  mountChart('custLtvDist', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ label: 'Customers', data: counts, backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderCohorts(rows, orders, /* p */ _p) {
  // Cohort by acquisition month (customer's first delivered order). Then for
  // each subsequent month M+1..M+3, % of cohort who placed at least one
  // delivered order.
  const el = document.getElementById('custCohorts');
  if (!el) return;

  const firstDeliv = new Map(); // phone -> Date of first delivered order
  const activityByMonth = new Map(); // phone -> Set of 'YYYY-MM' keys
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const ph = o.customer?.phone;
    if (!ph) continue;
    const d = toDateSafe(o.created_at);
    if (!d) continue;
    const cur = firstDeliv.get(ph);
    if (!cur || d < cur) firstDeliv.set(ph, d);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!activityByMonth.has(ph)) activityByMonth.set(ph, new Set());
    activityByMonth.get(ph).add(key);
  }

  // Cohorts = last 6 months of acquisition (older cohorts fall off the table).
  const ref = new Date(); ref.setDate(1); ref.setHours(0, 0, 0, 0);
  const cohorts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    cohorts.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      date: d,
      phones: [],
    });
  }
  const byKey = new Map(cohorts.map(c => [c.key, c]));
  for (const [ph, d] of firstDeliv) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (byKey.has(key)) byKey.get(key).phones.push(ph);
  }

  const offsets = [0, 1, 2, 3];
  // Anchor for "future" detection — the current calendar month.
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const header = `<div class="cohort-header"><div class="cohort-cell cohort-head">Cohort</div><div class="cohort-cell cohort-head">Size</div>${offsets.map(o => `<div class="cohort-cell cohort-head">M+${o}</div>`).join('')}</div>`;
  const rowsHtml = cohorts.map(c => {
    const size = c.phones.length;
    const cells = offsets.map(o => {
      const target = new Date(c.date.getFullYear(), c.date.getMonth() + o, 1);
      const targetKey = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
      // Future months haven't happened yet — show em-dash so users don't read
      // an empty "0%" as poor retention.
      if (target > thisMonthStart) return `<div class="cohort-cell cohort-future" title="Not yet reached">—</div>`;
      if (!size) return `<div class="cohort-cell" style="background:transparent">—</div>`;
      const returned = c.phones.filter(ph => activityByMonth.get(ph)?.has(targetKey)).length;
      const pct = Math.round((returned / size) * 100);
      const alpha = Math.max(0.08, pct / 100);
      const bg = pct === 0 ? 'transparent' : `rgba(255,107,53,${alpha})`;
      // The current calendar month is partial — flag it in the tooltip so
      // users know the % will still climb.
      const inProgress = target.getTime() === thisMonthStart.getTime();
      const tooltip = `${returned} of ${size}${inProgress ? ' — month in progress' : ''}`;
      const marker = inProgress ? '*' : '';
      return `<div class="cohort-cell${inProgress ? ' cohort-partial' : ''}" style="background:${bg}" title="${tooltip}">${pct}%${marker}</div>`;
    }).join('');
    return `<div class="cohort-row"><div class="cohort-cell cohort-label">${c.label}</div><div class="cohort-cell">${size}</div>${cells}</div>`;
  }).join('');
  el.innerHTML = `<div class="cohort-grid">${header}${rowsHtml}<div class="cohort-note">* current month, still counting</div></div>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// ---------------------------------------------------------------------------
// Per-customer analytics modal
// ---------------------------------------------------------------------------
// Reads from state.orders (already in memory — zero Firestore reads) and
// summarises everything we know about one phone: profile, KPIs, spend chart,
// payment mix, restaurants, places, items, delivery partners, and a chronological
// order history. Purely presentational — no writes.
function openCustomerDetails(state, phone) {
  const profile = state.customers.get(phone) || { phone };
  const row = state.rows.find(r => r.phone === phone);
  const orders = (state.orders || []).filter(o => o?.customer?.phone === phone);
  orders.sort((a, b) => (b.created_at?.toMillis?.() || 0) - (a.created_at?.toMillis?.() || 0));

  const delivered = orders.filter(o => o.status === 'delivered');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const fake      = orders.filter(o => o.status === 'fake' || o.is_fake === true);
  const spend     = delivered.reduce((s, o) => s + Math.max(0, (+o.total || 0) - (+o.discount || 0)), 0);
  const grossTotal= delivered.reduce((s, o) => s + (+o.total || 0), 0);
  const discountReceived = delivered.reduce((s, o) => s + (+o.discount || 0), 0);
  const aov       = delivered.length ? Math.round(spend / delivered.length) : 0;
  const biggest   = delivered.reduce((mx, o) => {
    const net = Math.max(0, (+o.total || 0) - (+o.discount || 0));
    return net > (mx.net || 0) ? { net, order: o } : mx;
  }, { net: 0, order: null });

  const dates = delivered.map(o => toDateSafe(o.created_at)).filter(Boolean).sort((a, b) => a - b);
  const firstDelivered = dates[0] || null;
  const lastDelivered  = dates[dates.length - 1] || null;
  const nowMs = Date.now();
  const daysSinceLast  = lastDelivered ? Math.floor((nowMs - lastDelivered.getTime()) / 86400000) : null;
  const joined         = toDateSafe(profile.created_at) || firstDelivered;
  const daysAsCustomer = joined ? Math.floor((nowMs - joined.getTime()) / 86400000) : null;
  let avgGap = null;
  if (dates.length >= 2) {
    let sum = 0;
    for (let i = 1; i < dates.length; i++) sum += (dates[i].getTime() - dates[i-1].getTime());
    avgGap = Math.round(sum / (dates.length - 1) / 86400000);
  }
  const successRate = orders.length ? Math.round((delivered.length / orders.length) * 100) : 0;

  // Payment mix — same logic as classifyPayment in dashboard.js.
  const pay = { prepaid: 0, cod: 0 };
  for (const o of delivered) {
    const method = String(o.paid_method || '').toLowerCase();
    if (method === 'upi' || method === 'online') pay.prepaid++;
    else if (method === 'cash') pay.cod++;
    else if ((+o.paid_already || 0) > 0) pay.prepaid++;
    else pay.cod++;
  }

  // Restaurant, place, item, partner breakdowns — all limited to delivered.
  const bump = (map, key, val = 1) => { if (!key) return; map.set(key, (map.get(key) || 0) + val); };
  const restCount = new Map(), restSpend = new Map(), places = new Map(), items = new Map(), partners = new Map();
  for (const o of delivered) {
    const rest = (o.restaurant_name || o.restaurant_id || '').trim();
    bump(restCount, rest);
    bump(restSpend, rest, Math.max(0, (+o.total || 0) - (+o.discount || 0)));
    bump(places, (o.place || '').trim());
    bump(partners, o.delivery_staff_id);
    if (Array.isArray(o.items)) {
      for (const it of o.items) {
        const name = (it?.name || '').trim();
        if (name) bump(items, name, Number(it.qty) || 1);
      }
    }
  }
  const topN = (map, n) => Array.from(map.entries()).sort((a,b) => b[1]-a[1]).slice(0, n);

  // Orders-per-month bucket for the trend chart (last 12 months, delivered only).
  const monthLabels = [];
  const monthCounts = [];
  const monthSpend  = [];
  const ref = new Date(); ref.setDate(1); ref.setHours(0,0,0,0);
  for (let i = 11; i >= 0; i--) {
    const s = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    const e = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
    let c = 0, sp = 0;
    for (const o of delivered) {
      const d = toDateSafe(o.created_at);
      if (d && d >= s && d < e) { c++; sp += Math.max(0, (+o.total || 0) - (+o.discount || 0)); }
    }
    monthLabels.push(s.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
    monthCounts.push(c);
    monthSpend.push(sp);
  }

  // Hour-of-day preference (delivered), for the "usual order time" line.
  const hourCounts = new Array(24).fill(0);
  for (const o of delivered) {
    const d = toDateSafe(o.created_at);
    if (d) hourCounts[d.getHours()]++;
  }
  const peakHour = hourCounts.indexOf(Math.max(...hourCounts));
  const hoursOrdered = hourCounts.reduce((s, v) => s + (v > 0 ? 1 : 0), 0);

  const fmtDate = d => d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = d => d ? d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

  const kpi = (icon, label, value, sub = '') => `
    <div class="kpi-card kpi-card--sm">
      <div class="kpi-icon"><i class="fas ${icon}"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">${value}</div>
        ${sub ? `<div class="kpi-sub">${sub}</div>` : ''}
      </div>
    </div>`;

  const restaurantRows = topN(restCount, 5).map(([name, count]) => {
    const sp = restSpend.get(name) || 0;
    return `<tr><td>${escapeHtml(name || '—')}</td><td class="text-right">${count}</td><td class="text-right">${fmtINR(sp)}</td></tr>`;
  }).join('') || '<tr><td colspan="3" class="text-muted small">No delivered orders yet</td></tr>';

  const placeRows = topN(places, 5).map(([name, count]) =>
    `<tr><td>${escapeHtml(name || '—')}</td><td class="text-right">${count}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="text-muted small">—</td></tr>';

  const itemRows = topN(items, 8).map(([name, qty]) =>
    `<tr><td>${escapeHtml(name)}</td><td class="text-right">${qty}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="text-muted small">No items on record</td></tr>';

  const staffById = state.staffById || new Map();
  const partnerLabel = uid => {
    if (!uid) return '—';
    const s = staffById.get(uid);
    if (!s) return uid;
    const name = (s.name || s.email || uid).trim();
    return s.is_active === false ? `${name} (inactive)` : name;
  };
  const partnerRows = topN(partners, 5).map(([uid, count]) =>
    `<tr><td>${escapeHtml(partnerLabel(uid))}</td><td class="text-right">${count}</td></tr>`
  ).join('') || '<tr><td colspan="2" class="text-muted small">—</td></tr>';

  const historyRows = orders.slice(0, 25).map(o => {
    const d = toDateSafe(o.created_at);
    const net = Math.max(0, (+o.total || 0) - (+o.discount || 0));
    const rest = (o.restaurant_name || o.restaurant_id || '—').trim();
    const badge = {
      delivered: 'success', cancelled: 'danger', fake: 'dark',
      new: 'secondary', assigned: 'info', out_for_delivery: 'primary',
    }[o.status] || 'secondary';
    return `<tr>
      <td class="cust-history__when">${fmtDateTime(d)}</td>
      <td><span class="badge badge-${badge}">${escapeHtml(o.status || 'new')}</span></td>
      <td class="cust-history__rest" title="${escapeAttr(rest)}">${escapeHtml(rest)}</td>
      <td class="text-right">${fmtINR(net)}</td>
      <td class="text-right">${(o.items || []).length}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-muted small">No orders on record</td></tr>';

  const offerBadge = isOfferActive(profile)
    ? `<span class="badge badge-success ml-1">Offer ₹${profile.active_offer_amount} until ${profile.active_offer_valid_until}</span>`
    : '';
  const notInterested = profile.not_interested
    ? '<span class="badge badge-danger ml-1"><i class="fas fa-ban"></i> Not interested</span>'
    : '';
  const gpsLink = profile.gps?.lat && profile.gps?.lng
    ? `<a href="https://www.google.com/maps?q=${profile.gps.lat},${profile.gps.lng}" target="_blank" rel="noopener"><i class="fas fa-location-dot"></i> Open in Maps</a>`
    : '<span class="text-muted">No GPS pinned</span>';

  const html = `
    <div class="cust-detail">
      <div class="cust-detail__head text-left">
        <div><strong style="font-size:1.1rem">${escapeHtml(profile.name || row?.name || '(no name)')}</strong>${notInterested}${offerBadge}</div>
        <div class="text-muted small">${escapeHtml(phone)}${profile.address ? ' · ' + escapeHtml(profile.address) : ''}</div>
        <div class="text-muted small">${gpsLink} · Joined ${fmtDate(joined)}${daysAsCustomer != null ? ` (${daysAsCustomer} days)` : ''}</div>
      </div>

      <div class="kpi-grid kpi-grid--compact mt-2">
        ${kpi('fa-receipt', 'Total orders', orders.length, `${delivered.length} dlv · ${cancelled.length} cxl${fake.length ? ' · ' + fake.length + ' fake' : ''}`)}
        ${kpi('fa-indian-rupee-sign', 'Lifetime spend', fmtINR(spend), `Gross ${fmtINR(grossTotal)}`)}
        ${kpi('fa-chart-line', 'Avg order value', fmtINR(aov), `${delivered.length} delivered`)}
        ${kpi('fa-tag', 'Discount received', fmtINR(discountReceived), '')}
        ${kpi('fa-trophy', 'Biggest order', fmtINR(biggest.net), biggest.order ? fmtDate(toDateSafe(biggest.order.created_at)) : '—')}
        ${kpi('fa-circle-check', 'Success rate', successRate + '%', `${delivered.length}/${orders.length}`)}
        ${kpi('fa-calendar-day', 'Days since last', daysSinceLast == null ? '—' : daysSinceLast, lastDelivered ? fmtDate(lastDelivered) : 'Never delivered')}
        ${kpi('fa-clock-rotate-left', 'Avg gap', avgGap == null ? '—' : avgGap + 'd', dates.length >= 2 ? `${dates.length} orders` : 'Need 2+ orders')}
        ${kpi('fa-clock', 'Peak hour', hoursOrdered ? (String(peakHour).padStart(2,'0') + ':00') : '—', `${hoursOrdered} hrs seen`)}
      </div>

      <div class="chart-grid mt-3">
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-chart-column"></i> Orders per month (last 12)</div>
          <div class="chart-card-body"><canvas id="custDetailOrdersTrend"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Spend per month (₹)</div>
          <div class="chart-card-body"><canvas id="custDetailSpendTrend"></canvas></div>
        </div>
        <div class="chart-card">
          <div class="chart-card-head"><i class="fas fa-wallet"></i> Payment mix</div>
          <div class="chart-card-body"><canvas id="custDetailPayMix"></canvas></div>
        </div>
      </div>

      <div class="row mt-3">
        <div class="col-md-6 mb-3">
          <h6 class="mb-1"><i class="fas fa-store text-brand"></i> Top restaurants</h6>
          <table class="cust-table"><thead><tr><th>Restaurant</th><th class="text-right">Orders</th><th class="text-right">Spend</th></tr></thead><tbody>${restaurantRows}</tbody></table>
        </div>
        <div class="col-md-6 mb-3">
          <h6 class="mb-1"><i class="fas fa-utensils text-brand"></i> Top items</h6>
          <table class="cust-table"><thead><tr><th>Item</th><th class="text-right">Qty</th></tr></thead><tbody>${itemRows}</tbody></table>
        </div>
        <div class="col-md-6 mb-3">
          <h6 class="mb-1"><i class="fas fa-location-dot text-brand"></i> Delivery places</h6>
          <table class="cust-table"><thead><tr><th>Place</th><th class="text-right">Orders</th></tr></thead><tbody>${placeRows}</tbody></table>
        </div>
        <div class="col-md-6 mb-3">
          <h6 class="mb-1"><i class="fas fa-motorcycle text-brand"></i> Delivery partners</h6>
          <table class="cust-table"><thead><tr><th>Partner</th><th class="text-right">Orders</th></tr></thead><tbody>${partnerRows}</tbody></table>
        </div>
      </div>

      <div class="mt-2">
        <h6 class="mb-1"><i class="fas fa-clock-rotate-left text-brand"></i> Order history (latest 25)</h6>
        <div class="cust-history-wrap">
          <table class="cust-table cust-history">
            <thead><tr><th>When</th><th>Status</th><th>Restaurant</th><th class="text-right">Net</th><th class="text-right">Items</th></tr></thead>
            <tbody>${historyRows}</tbody>
          </table>
        </div>
      </div>
    </div>`;

  Swal.fire({
    title: 'Customer analytics',
    html,
    width: '92%',
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { popup: 'cust-detail-popup' },
    didOpen: () => {
      const p = chartPalette();
      const mount = (id, config) => {
        const el = document.getElementById(id);
        if (!el || !window.Chart) return;
        try { return new Chart(el.getContext('2d'), config); } catch (e) { console.warn('[cust-detail] chart', id, e); }
      };
      mount('custDetailOrdersTrend', {
        type: 'bar',
        data: { labels: monthLabels, datasets: [{ label: 'Orders', data: monthCounts, backgroundColor: p.brand, borderWidth: 0 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
      mount('custDetailSpendTrend', {
        type: 'line',
        data: { labels: monthLabels, datasets: [{ label: 'Spend', data: monthSpend, borderColor: p.brand, backgroundColor: 'rgba(255,107,53,0.15)', fill: true, tension: 0.3 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.y) } } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } } },
      });
      mount('custDetailPayMix', {
        type: 'doughnut',
        data: { labels: ['Prepaid', 'COD'], datasets: [{ data: [pay.prepaid, pay.cod], backgroundColor: [p.brand, p.muted], borderWidth: 0 }] },
        options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
      });
    },
  });
}
