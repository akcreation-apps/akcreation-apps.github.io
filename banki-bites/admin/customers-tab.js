import { COL } from '../firebase-config.js';
import {
  collection, getDocs,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  toDateSafe, fmtINR, chartPalette, whenChartReady, netRevenue, isDelivered,
} from '../analytics.js';
import { loadCustomers, openCustomerModal } from './customers.js';

const charts = new Map();

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
    try { state = await loadAll(db); paint(root, state); }
    finally { btn.disabled = false; btn.classList.remove('is-loading'); }
  });
  document.getElementById('custAdd').addEventListener('click', async () => {
    const saved = await openCustomerModal(db, null);
    if (saved) { state = await loadAll(db); paint(root, state); }
  });
  document.getElementById('custSearch').addEventListener('input', (e) => {
    renderTable(root, state, e.target.value);
  });
  // Delegate edit clicks on table rows.
  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-edit-phone]');
    if (!btn) return;
    const phone = btn.getAttribute('data-edit-phone');
    const existing = state.customers.get(phone) || { phone };
    const saved = await openCustomerModal(db, existing);
    if (saved) { state = await loadAll(db); paint(root, state); }
  });
}

async function loadAll(db) {
  window.bbBusy('Loading customers…');
  try {
    const [customersMap, ordersSnap] = await Promise.all([
      loadCustomers(db),
      getDocs(collection(db, COL.ORDERS)),
    ]);
    const orders = [];
    ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));

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
    return { customers: customersMap, orders, rows };
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
      <td data-label="Customer">
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
