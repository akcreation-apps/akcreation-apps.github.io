import { COL } from '../firebase-config.js';
import {
  collection, getDocs, query, where, Timestamp, doc, setDoc,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, isFarPlace, isDelivered, isPayoutPaid, isPayoutPending,
  bucketByDay, groupBy, topN, toDateSafe, fmtINR, chartPalette, whenChartReady, startOfDay, startOfLastMonth, startOfCurrentMonth, netRevenue,
} from '../analytics.js';
import { refreshStaffData } from './staff.js';

const charts = new Map(); // canvas-id -> Chart instance (so we destroy on re-render)

function mountChart(id, config) {
  const old = charts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el) return null;
  const c = new Chart(el.getContext('2d'), config);
  charts.set(id, c);
  return c;
}

export async function renderDashboard(root, db) {
  root.innerHTML = `
    <div class="section-header section-header--compact">
      <h3 class="m-0"><i class="fas fa-chart-line text-primary mr-1"></i> Dashboard</h3>
      <div class="d-flex" style="gap:6px;flex-wrap:wrap">
        <button id="dashFeeRules" class="btn btn-sm btn-outline-secondary" aria-label="Edit fee rules">
          <i class="fas fa-sliders" aria-hidden="true"></i>
          <span class="d-none d-sm-inline ml-1" aria-hidden="true">Fee rules</span>
        </button>
        <button id="dashRefresh" class="btn btn-sm btn-outline-primary" aria-label="Refresh dashboard">
          <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
          <span class="d-none d-sm-inline ml-1" aria-hidden="true">Refresh</span>
        </button>
      </div>
    </div>

    <div id="dashKpis" class="kpi-grid">
      ${kpiSkeleton()}
    </div>

    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-calendar-days"></i> Orders per day (7d)</div>
        <div class="chart-card-body"><canvas id="dashOrdersPerDay"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Revenue per day (7d)</div>
        <div class="chart-card-body"><canvas id="dashRevenuePerDay"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-circle-half-stroke"></i> Orders by status</div>
        <div class="chart-card-body"><canvas id="dashStatusMix"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-calendar-alt"></i> Month over month</div>
        <div class="chart-card-body"><canvas id="dashMonthOverMonth"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-store"></i> Top restaurants</div>
        <div class="chart-card-body"><canvas id="dashTopRestaurants"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-location-dot"></i> Top areas</div>
        <div class="chart-card-body"><canvas id="dashTopAreas"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-money-check-dollar"></i> Payment collected (delivered)</div>
        <div class="chart-card-body"><canvas id="dashPaymentMix"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-motorcycle"></i> Delivery partner payouts (₹)</div>
        <div class="chart-card-body"><canvas id="dashPartnerPayouts"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-route"></i> Far vs Near orders</div>
        <div class="chart-card-body"><canvas id="dashFarNear"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-ban"></i> Cancellation rate (7d)</div>
        <div class="chart-card-body"><canvas id="dashCancelRate"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-basket-shopping"></i> Average order value (7d)</div>
        <div class="chart-card-body"><canvas id="dashAovTrend"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-user-plus"></i> New vs Repeat customers (7d)</div>
        <div class="chart-card-body"><canvas id="dashRepeatNew"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-crown"></i> Top customers</div>
        <div class="chart-card-body"><canvas id="dashTopCustomers"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-utensils"></i> Top items sold</div>
        <div class="chart-card-body"><canvas id="dashTopItems"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-tag"></i> Discounts given (7d)</div>
        <div class="chart-card-body"><canvas id="dashDiscountTrend"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-credit-card"></i> Prepaid vs COD (delivered)</div>
        <div class="chart-card-body"><canvas id="dashPrepaidCod"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-calendar-week"></i> Orders by day of week</div>
        <div class="chart-card-body"><canvas id="dashDayOfWeek"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-motorcycle"></i> Partner order count</div>
        <div class="chart-card-body"><canvas id="dashPartnerOrders"></canvas></div>
      </div>
    </div>
  `;

  try { await whenChartReady(); } catch (e) { console.warn('[dashboard] Chart.js unavailable:', e.message); }
  await refresh(root, db);
  document.getElementById('dashRefresh').addEventListener('click', async () => {
    const btn = document.getElementById('dashRefresh');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      // Refresh both this Dashboard's data AND the Staff/Earnings cache so the
      // admin doesn't have to re-open the Delivery tab to see updated payouts.
      await Promise.all([refresh(root, db), refreshStaffData(db).catch(e => console.warn('[dashboard] staff refresh skipped:', e.message))]);
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
  document.getElementById('dashFeeRules').addEventListener('click', () => openFeeRulesEditor(db, root));
}

async function openFeeRulesEditor(db, root) {
  const current = await loadFeeRules(db, { force: true, autoSeed: true });
  const html = `
    <form id="feeRulesForm" class="text-left">
      <div class="form-row">
        <div class="form-group col-6">
          <label for="frNear">Near fare (₹)</label>
          <input class="form-control" type="number" id="frNear" name="fee_near" min="0" step="1" value="${current.fee_near}" required>
          <small class="text-muted">Default delivery fee.</small>
        </div>
        <div class="form-group col-6">
          <label for="frFar">Far fare (₹)</label>
          <input class="form-control" type="number" id="frFar" name="fee_far" min="0" step="1" value="${current.fee_far}" required>
          <small class="text-muted">For outlying villages.</small>
        </div>
      </div>
      <div class="form-group">
        <label for="frPlaces">Far places</label>
        <textarea class="form-control" id="frPlaces" name="far_places" rows="4"
                  placeholder="One per line OR comma-separated">${(current.far_places || []).join(', ')}</textarea>
        <small class="text-muted">Whole-word, case-insensitive match against the order's place and customer address. Same list also drives the +15 min pickup ETA in the delivery app.</small>
      </div>
      <p class="text-muted" style="font-size:0.78rem;margin:6px 0 0">
        <i class="fas fa-info-circle"></i>
        Changes apply to <strong>new</strong> deliveries from now on. Already-delivered orders keep their snapshot fee.
      </p>
    </form>
  `;

  const res = await Swal.fire({
    title: 'Delivery fee rules',
    html,
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#FF6B35',
    width: 560,
    focusConfirm: false,
    preConfirm: () => {
      const f = document.getElementById('feeRulesForm');
      const fd = new FormData(f);
      const feeNear = parseInt(fd.get('fee_near'), 10);
      const feeFar  = parseInt(fd.get('fee_far'),  10);
      const places = String(fd.get('far_places') || '')
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(Boolean);
      if (!Number.isFinite(feeNear) || feeNear < 0) {
        Swal.showValidationMessage('Near fare must be a non-negative number.');
        return false;
      }
      if (!Number.isFinite(feeFar) || feeFar < 0) {
        Swal.showValidationMessage('Far fare must be a non-negative number.');
        return false;
      }
      // Dedup case-insensitively while preserving the typed casing of the first hit.
      const seen = new Set();
      const dedup = [];
      for (const p of places) {
        const k = p.toLowerCase();
        if (!seen.has(k)) { seen.add(k); dedup.push(p); }
      }
      return { fee_near: feeNear, fee_far: feeFar, far_places: dedup };
    },
  });
  if (!res.isConfirmed) return;

  try {
    window.bbBusy('Saving fee rules…');
    await setDoc(doc(db, COL.META, 'fee_rules'), res.value, { merge: false });
    // Force-reload the cached rules so subsequent renders (incl. this Dashboard
    // refresh) pick up the new values.
    await loadFeeRules(db, { force: true });
    window.bbDone();
    Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
    await refresh(root, db);
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
  }
}

function kpiSkeleton() {
  const blank = (label, icon) => `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas ${icon}"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">${label}</div>
        <div class="kpi-value">—</div>
        <div class="kpi-sub">&nbsp;</div>
      </div>
    </div>`;
  return [
    blank('Orders (30d)',     'fa-receipt'),
    blank('Revenue (30d)',    'fa-indian-rupee-sign'),
    blank('Active partners',  'fa-store'),
    blank('Pending payouts',  'fa-hand-holding-dollar'),
  ].join('');
}

async function refresh(root, db) {
  const kpisEl = root.querySelector('#dashKpis');
  kpisEl.classList.add('is-loading');
  // Mark all chart cards as loading so the spinner overlay appears on each
  // while data is in flight. Cleared at the end of refresh().
  const chartBodies = root.querySelectorAll('.chart-card-body');
  chartBodies.forEach(el => el.classList.add('is-loading'));

  // Fetch window: orders since the 1st of last month (matches admin Orders +
  // staff/partners views). Single-field range query → no composite index.
  const sinceTs = Timestamp.fromDate(startOfLastMonth());
  const [ordersSnap, partnersSnap, staffSnap, rules] = await Promise.all([
    getDocs(query(collection(db, COL.ORDERS), where('created_at', '>=', sinceTs))),
    getDocs(collection(db, COL.PARTNERS)),
    getDocs(collection(db, COL.STAFF)),
    loadFeeRules(db, { autoSeed: true }),
  ]);

  const orders = [];
  ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));
  const partners = [];
  partnersSnap.forEach(d => partners.push({ id: d.id, ...d.data() }));
  const staff = [];
  staffSnap.forEach(d => staff.push({ uid: d.id, ...d.data() }));

  renderKpis(kpisEl, orders, partners, staff, rules);
  kpisEl.classList.remove('is-loading');

  const p = chartPalette();
  renderOrdersPerDay(orders, p);
  renderRevenuePerDay(orders, p);
  renderStatusMix(orders, p);
  renderMonthOverMonth(orders, p);
  renderTopRestaurants(orders, p);
  renderTopAreas(orders, p);
  renderPaymentMix(orders, p);
  renderPartnerPayouts(orders, staff, rules, p);
  renderFarNear(orders, rules, p);
  renderCancelRate(orders, p);
  renderAovTrend(orders, p);
  renderRepeatNew(orders, p);
  renderTopCustomers(orders, p);
  renderTopItems(orders, p);
  renderDiscountTrend(orders, p);
  renderPrepaidCod(orders, p);
  renderDayOfWeek(orders, p);
  renderPartnerOrders(orders, staff, p);

  chartBodies.forEach(el => el.classList.remove('is-loading'));
}

function renderKpis(el, orders, partners, staff, rules) {
  // `orders` is already scoped to "since the 1st of last month" (fetch window).
  const windowLabel = startOfLastMonth().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

  // Orders KPI — delivered count only; total shown in sub-line
  const deliveredOrders = orders.filter(isDelivered);

  // Revenue KPI — current month only with MoM comparison
  const curStart = startOfCurrentMonth();
  const curMonthDelivered  = orders.filter(o => isDelivered(o) && (toDateSafe(o.created_at) || new Date(0)) >= curStart);
  const lastMonthDelivered = orders.filter(o => isDelivered(o) && (toDateSafe(o.created_at) || new Date(0)) < curStart);
  const currentRevenue = curMonthDelivered.reduce((s, o) => s + netRevenue(o), 0);
  const lastRevenue    = lastMonthDelivered.reduce((s, o) => s + netRevenue(o), 0);
  let revBadge;
  if (lastRevenue > 0) {
    const pct = ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1);
    if (pct > 0) revBadge = `<span style="color:#16a34a">↑${pct}%</span> vs last month`;
    else if (pct < 0) revBadge = `<span style="color:#dc3545">↓${Math.abs(pct)}%</span> vs last month`;
    else revBadge = `— vs last month`;
  } else {
    revBadge = `— vs last month`;
  }

  // Pending Payouts — mirror the Delivery section logic exactly:
  // must be delivered, have a delivery_staff_id, not explicitly excluded, and not yet paid.
  const eligibleDeliveries = orders.filter(o => isDelivered(o) && o.delivery_staff_id && o.payout_applicable !== false);
  const pendingPayoutOrders = eligibleDeliveries.filter(o => !isPayoutPaid(o));
  const pendingPayoutTotal  = pendingPayoutOrders.reduce((s, o) => s + feeForOrder(o, rules), 0);

  const activePartners = partners.filter(p => p.is_active !== false).length;
  const activeStaff    = staff.filter(s => s.is_active !== false).length;

  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-receipt"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Orders</div>
        <div class="kpi-value">${deliveredOrders.length}</div>
        <div class="kpi-sub">${orders.length} total | since ${windowLabel}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-indian-rupee-sign"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Revenue</div>
        <div class="kpi-value">${fmtINR(currentRevenue)}</div>
        <div class="kpi-sub">${revBadge}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-store"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Active partners</div>
        <div class="kpi-value">${activePartners}</div>
        <div class="kpi-sub">${activeStaff} delivery staff</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-hand-holding-dollar"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Pending payouts</div>
        <div class="kpi-value">${fmtINR(pendingPayoutTotal)}</div>
        <div class="kpi-sub">${pendingPayoutOrders.length} order${pendingPayoutOrders.length === 1 ? '' : 's'}</div>
      </div>
    </div>
  `;
}

function renderOrdersPerDay(orders, p) {
  const days = bucketByDay(orders, o => toDateSafe(o.created_at), 7);
  const statusKeys = ['new', 'assigned', 'out_for_delivery', 'delivered', 'cancelled', 'fake'];
  const datasets = statusKeys.map(s => ({
    label: s.replace(/_/g, ' '),
    data: days.keys.map(k => days.buckets.get(k).filter(o => o.status === s).length),
    backgroundColor: p.status[s],
    stack: 'orders',
    borderWidth: 0,
  }));
  mountChart('dashOrdersPerDay', {
    type: 'bar',
    data: { labels: days.labels, datasets },
    options: {
      scales: {
        x: { stacked: true, ticks: { autoSkip: true, maxRotation: 0 } },
        y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

function renderRevenuePerDay(orders, p) {
  const delivered = orders.filter(isDelivered);
  const days = bucketByDay(delivered, o => toDateSafe(o.delivered_at) || toDateSafe(o.created_at), 7);
  const data = days.keys.map(k => days.buckets.get(k).reduce((s, o) => s + netRevenue(o), 0));
  mountChart('dashRevenuePerDay', {
    type: 'line',
    data: {
      labels: days.labels,
      datasets: [{
        label: 'Revenue ₹', data,
        borderColor: p.brand, backgroundColor: p.brandSoft,
        fill: true, tension: 0.32, pointRadius: 3, borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });
}

function renderStatusMix(orders, p) {
  const g = groupBy(orders, o => o.status || 'new');
  const keys = [...g.keys()];
  mountChart('dashStatusMix', {
    type: 'doughnut',
    data: {
      labels: keys.map(k => k.replace(/_/g, ' ')),
      datasets: [{ data: keys.map(k => g.get(k).length), backgroundColor: keys.map(k => p.status[k] || p.muted), borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderMonthOverMonth(orders, p) {
  const curStart = startOfCurrentMonth();
  const lastStart = startOfLastMonth();
  const now = new Date();

  const lastMonthLabel = lastStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const curMonthLabel  = curStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  const lastDelivered = orders.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at);
    return d && d >= lastStart && d < curStart;
  });
  const curDelivered = orders.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at);
    return d && d >= curStart;
  });

  const lastRevenue = lastDelivered.reduce((s, o) => s + netRevenue(o), 0);
  const curRevenue  = curDelivered.reduce((s, o) => s + netRevenue(o), 0);

  mountChart('dashMonthOverMonth', {
    type: 'bar',
    data: {
      labels: [lastMonthLabel, curMonthLabel],
      datasets: [
        {
          label: 'Delivered Orders',
          data: [lastDelivered.length, curDelivered.length],
          backgroundColor: [p.muted, p.brand],
          yAxisID: 'y',
          borderWidth: 0,
        },
        {
          label: 'Revenue (₹)',
          data: [lastRevenue, curRevenue],
          backgroundColor: [p.muted + '99', p.brandSoft],
          yAxisID: 'y1',
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 1
              ? `${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}`
              : `${ctx.dataset.label}: ${ctx.parsed.y}`,
          },
        },
      },
      scales: {
        y:  { beginAtZero: true, position: 'left',  ticks: { precision: 0 }, title: { display: true, text: 'Orders' } },
        y1: { beginAtZero: true, position: 'right', ticks: { callback: v => '₹' + v }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Revenue' } },
      },
    },
  });
}

function renderTopRestaurants(orders, p) {
  const g = groupBy(orders.filter(isDelivered), o => o.restaurant_name || o.restaurant_id || 'Unknown');
  const top = topN(g, 5);
  mountChart('dashTopRestaurants', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTopAreas(orders, p) {
  const g = groupBy(orders.filter(isDelivered), o => o.place || 'Unknown');
  const top = topN(g, 5);
  mountChart('dashTopAreas', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPaymentMix(orders, p) {
  const delivered = orders.filter(isDelivered);
  const paid   = delivered.filter(o => o.payment_collected !== false).length;
  const unpaid = delivered.length - paid;
  mountChart('dashPaymentMix', {
    type: 'doughnut',
    data: {
      labels: ['Collected', 'Pending'],
      datasets: [{ data: [paid, unpaid], backgroundColor: [p.status.delivered, p.status.cancelled], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderPartnerPayouts(orders, staff, rules, p) {
  const byStaff = new Map(staff.map(s => [s.uid, { name: s.name || s.email || s.uid, paid: 0, pending: 0 }]));
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    if (o.payout_applicable === false) continue;
    const sid = o.delivery_staff_id;
    if (!sid || !byStaff.has(sid)) continue;
    const fee = feeForOrder(o, rules);
    if (isPayoutPaid(o)) byStaff.get(sid).paid += fee;
    else byStaff.get(sid).pending += fee;
  }
  const rows = [...byStaff.values()].filter(r => r.paid || r.pending);
  rows.sort((a, b) => (b.paid + b.pending) - (a.paid + a.pending));
  const labels = rows.map(r => r.name);
  mountChart('dashPartnerPayouts', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Paid',    data: rows.map(r => r.paid),    backgroundColor: p.status.delivered, stack: 'pay', borderWidth: 0 },
        { label: 'Pending', data: rows.map(r => r.pending), backgroundColor: p.status.cancelled, stack: 'pay', borderWidth: 0 },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtINR(ctx.parsed.x)}` } } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { callback: v => '₹' + v } }, y: { stacked: true } },
    },
  });
}

function renderFarNear(orders, rules, p) {
  let far = 0, near = 0, farFee = 0, nearFee = 0;
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const fee = feeForOrder(o, rules);
    if (isFarPlace(o, rules)) { far++; farFee += fee; } else { near++; nearFee += fee; }
  }
  mountChart('dashFarNear', {
    type: 'doughnut',
    data: {
      labels: [`Far (${fmtINR(farFee)})`, `Near (${fmtINR(nearFee)})`],
      datasets: [{ data: [far, near], backgroundColor: [p.series[3], p.brand], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderCancelRate(orders, p) {
  const days = bucketByDay(orders, o => toDateSafe(o.created_at), 7);
  const data = days.keys.map(k => {
    const bucket = days.buckets.get(k);
    if (!bucket.length) return 0;
    const cancelled = bucket.filter(o => o.status === 'cancelled').length;
    return Math.round((cancelled / bucket.length) * 100);
  });
  mountChart('dashCancelRate', {
    type: 'line',
    data: {
      labels: days.labels,
      datasets: [{
        label: 'Cancel %', data,
        borderColor: p.status.cancelled, backgroundColor: 'rgba(220,38,38,0.15)',
        fill: true, tension: 0.32, pointRadius: 3, borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.parsed.y}%` } } },
      scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
    },
  });
}

function renderAovTrend(orders, p) {
  const delivered = orders.filter(isDelivered);
  const days = bucketByDay(delivered, o => toDateSafe(o.delivered_at) || toDateSafe(o.created_at), 7);
  const data = days.keys.map(k => {
    const bucket = days.buckets.get(k);
    if (!bucket.length) return 0;
    const total = bucket.reduce((s, o) => s + (Number(o.total) || 0), 0);
    return Math.round(total / bucket.length);
  });
  mountChart('dashAovTrend', {
    type: 'line',
    data: {
      labels: days.labels,
      datasets: [{
        label: 'AOV ₹', data,
        borderColor: p.brand, backgroundColor: p.brandSoft,
        fill: true, tension: 0.32, pointRadius: 3, borderWidth: 2,
      }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });
}

function renderRepeatNew(orders, p) {
  // A customer (by phone) is "new" on the first day they appear in the window;
  // every subsequent day they place an order they count as "repeat".
  // Only delivered orders are analysed — mirrors the other customer/area charts.
  const delivered = orders.filter(isDelivered);
  const firstSeen = new Map();
  const sorted = [...delivered].sort((a, b) => (toDateSafe(a.created_at)?.getTime() || 0) - (toDateSafe(b.created_at)?.getTime() || 0));
  for (const o of sorted) {
    const phone = o.customer?.phone;
    const d = toDateSafe(o.created_at);
    if (!phone || !d) continue;
    if (!firstSeen.has(phone)) firstSeen.set(phone, d.getTime());
  }
  const days = bucketByDay(delivered, o => toDateSafe(o.created_at), 7);
  const newData = [], repData = [];
  for (const k of days.keys) {
    const bucket = days.buckets.get(k);
    let n = 0, r = 0;
    const seenToday = new Set();
    for (const o of bucket) {
      const phone = o.customer?.phone;
      const d = toDateSafe(o.created_at);
      if (!phone || !d) continue;
      const dayStart = startOfDay(d).getTime();
      const fs = firstSeen.get(phone);
      // Count each customer once per day to keep "new" and "repeat" comparable.
      if (seenToday.has(phone)) continue;
      seenToday.add(phone);
      if (fs >= dayStart && fs < dayStart + 86400000) n++; else r++;
    }
    newData.push(n);
    repData.push(r);
  }
  mountChart('dashRepeatNew', {
    type: 'bar',
    data: {
      labels: days.labels,
      datasets: [
        { label: 'New',    data: newData, backgroundColor: p.brand,     stack: 'c', borderWidth: 0 },
        { label: 'Repeat', data: repData, backgroundColor: p.series[2], stack: 'c', borderWidth: 0 },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTopCustomers(orders, p) {
  const g = groupBy(orders.filter(isDelivered), o => {
    const c = o.customer || {};
    return c.name || c.phone || '';
  });
  const top = topN(g, 5);
  mountChart('dashTopCustomers', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTopItems(orders, p) {
  const counts = new Map();
  for (const o of orders.filter(isDelivered)) {
    if (!Array.isArray(o.items)) continue;
    for (const it of o.items) {
      const name = (it?.name || '').trim();
      if (!name) continue;
      const qty = Number(it.qty) || 1;
      counts.set(name, (counts.get(name) || 0) + qty);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  mountChart('dashTopItems', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Units sold', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDiscountTrend(orders, p) {
  const days = bucketByDay(orders, o => toDateSafe(o.created_at), 7);
  const data = days.keys.map(k => days.buckets.get(k).reduce((s, o) => s + (Number(o.discount) || 0), 0));
  mountChart('dashDiscountTrend', {
    type: 'bar',
    data: {
      labels: days.labels,
      datasets: [{ label: 'Discount ₹', data, backgroundColor: p.series[3], borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });
}

function renderPrepaidCod(orders, p) {
  const delivered = orders.filter(isDelivered);
  let prepaid = 0, cod = 0;
  for (const o of delivered) {
    if ((Number(o.paid_already) || 0) > 0) prepaid++; else cod++;
  }
  mountChart('dashPrepaidCod', {
    type: 'doughnut',
    data: {
      labels: ['Prepaid', 'COD'],
      datasets: [{ data: [prepaid, cod], backgroundColor: [p.status.delivered, p.brand], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });
}

function renderDayOfWeek(orders, p) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = new Array(7).fill(0);
  for (const o of orders.filter(isDelivered)) {
    const d = toDateSafe(o.created_at);
    if (!d) continue;
    counts[d.getDay()]++;
  }
  mountChart('dashDayOfWeek', {
    type: 'bar',
    data: { labels: names, datasets: [{ label: 'Orders', data: counts, backgroundColor: p.brand, borderWidth: 0 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPartnerOrders(orders, staff, p) {
  const byStaff = new Map(staff.map(s => [s.uid, { name: s.name || s.email || s.uid, count: 0 }]));
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const sid = o.delivery_staff_id;
    if (!sid || !byStaff.has(sid)) continue;
    byStaff.get(sid).count++;
  }
  const rows = [...byStaff.values()].filter(r => r.count > 0).sort((a, b) => b.count - a.count);
  mountChart('dashPartnerOrders', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{ label: 'Deliveries', data: rows.map(r => r.count), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
