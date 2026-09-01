import { COL } from '../firebase-config.js';
import {
  collection, getDocs, query, where, Timestamp, doc, setDoc,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, isFarPlace, isDelivered, isCancelled, isPayoutPaid, isPayoutPending,
  bucketByDay, groupBy, topN, toDateSafe, fmtINR, chartPalette, whenChartReady, startOfDay, startOfLastMonth, startOfCurrentMonth, netRevenue,
  truncateName, splitByMonth, median, isOnTime, minutesBetween,
} from '../analytics.js';
import { refreshStaffData } from './staff.js';

const charts = new Map(); // canvas-id -> Chart instance (so we destroy on re-render)

// Hard cap on how far back we ever fetch from Firestore. Keeps memory bounded
// and prevents runaway queries on custom ranges the admin might type.
// Declared above `state` because normalizeRange() reads it at module init.
const MAX_FETCH_DAYS = 60;

// Date-range state — persisted to localStorage so the choice survives reloads.
// `preset` drives from/to/cutAt; 'custom' means from+to were user-entered.
const RANGE_LS_KEY = 'bb_admin_dashboard_range';
const state = {
  range: loadRangeState(),
};

function loadRangeState() {
  try {
    const raw = localStorage.getItem(RANGE_LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.preset) {
        // Retired preset — migrate legacy 'last90' to the new 60-day cap.
        if (parsed.preset === 'last90') parsed.preset = 'last60';
        return normalizeRange(parsed);
      }
    }
  } catch {}
  return normalizeRange({ preset: 'last60' });
}

function saveRangeState() {
  try {
    localStorage.setItem(RANGE_LS_KEY, JSON.stringify({
      preset: state.range.preset,
      fromISO: state.range.from.toISOString(),
      toISO:   state.range.to.toISOString(),
    }));
  } catch {}
}

// Given a preset (or 'custom' + explicit fromISO/toISO), compute the concrete
// { from, to, cutAt, label } used by the fetch query + splitByMonth().
function normalizeRange(input) {
  const now = new Date();
  const startOfToday = startOfDay(now);
  const endOfToday   = new Date(startOfToday.getTime() + 86400000);
  const preset = input.preset || 'last60';
  let from, to, label;

  const daysAgo = n => new Date(startOfToday.getTime() - n * 86400000);

  switch (preset) {
    case 'last7':   from = daysAgo(6);  to = endOfToday; label = 'Last 7 days'; break;
    case 'last30':  from = daysAgo(29); to = endOfToday; label = 'Last 30 days'; break;
    case 'last60':  from = daysAgo(59); to = endOfToday; label = 'Last 60 days'; break;
    case 'thisMonth': from = startOfCurrentMonth(now); to = endOfToday; label = 'This month'; break;
    case 'lastMonth': from = startOfLastMonth(now);   to = startOfCurrentMonth(now); label = 'Last month'; break;
    case 'custom': {
      const f = input.fromISO ? new Date(input.fromISO) : startOfLastMonth(now);
      const t = input.toISO   ? new Date(input.toISO)   : endOfToday;
      from = startOfDay(f);
      to   = new Date(startOfDay(t).getTime() + 86400000);
      label = 'Custom';
      break;
    }
    default: from = daysAgo(59); to = endOfToday; label = 'Last 60 days';
  }

  // Clamp `from` so we never fetch more than MAX_FETCH_DAYS of history.
  const earliest = daysAgo(MAX_FETCH_DAYS - 1);
  if (from < earliest) {
    from = earliest;
    if (preset === 'custom') label = `Custom (capped ${MAX_FETCH_DAYS}d)`;
  }

  // Cut for splitByMonth: midpoint of the range so "earlier vs later" is
  // symmetric when the range doesn't align to calendar months. When it does
  // straddle a month boundary, prefer the calendar boundary — that's what
  // users usually mean by "month-wise".
  const spanMs = to.getTime() - from.getTime();
  const midMs  = from.getTime() + spanMs / 2;
  const monthBoundary = startOfCurrentMonth(new Date(midMs));
  const cutAt = (monthBoundary > from && monthBoundary < to) ? monthBoundary : new Date(midMs);

  return { preset, from, to, cutAt, label };
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

    <div id="dashRange" class="dash-range" role="toolbar" aria-label="Date range">
      ${renderRangeControls()}
    </div>

    <div id="dashKpis" class="kpi-grid">
      ${kpiSkeleton()}
    </div>

    <div class="chart-grid">
      <!-- Month over month first — big-picture comparison. -->
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-calendar-alt"></i> Month over month</div>
        <div class="chart-card-body"><canvas id="dashMonthOverMonth"></canvas></div>
      </div>
      <!-- Day-wise cumulative revenue: this month vs the same day-of-month
           progression last month. Ignores the date-range picker on purpose —
           it's always a fixed month-over-month comparison. -->
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-chart-line"></i> Monthly growth (day-wise revenue)</div>
        <div class="chart-card-body"><canvas id="dashMonthlyGrowth"></canvas></div>
      </div>

      <!-- 7-day trend charts (day-by-day series). -->
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-calendar-days"></i> Orders per day (7d)</div>
        <div class="chart-card-body"><canvas id="dashOrdersPerDay"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Revenue per day (7d)</div>
        <div class="chart-card-body"><canvas id="dashRevenuePerDay"></canvas></div>
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
        <div class="chart-card-head"><i class="fas fa-tag"></i> Discounts given (7d)</div>
        <div class="chart-card-body"><canvas id="dashDiscountTrend"></canvas></div>
      </div>

      <!-- Range-wide / aggregate charts (respect the date range picker). -->
      <div class="chart-card">
        <div class="chart-card-head">
          <span><i class="fas fa-circle-half-stroke"></i> Orders by status</span>
          <select id="dashStatusMixRestaurant" class="chart-filter" aria-label="Filter Orders by status by restaurant"></select>
        </div>
        <div class="chart-card-body"><canvas id="dashStatusMix"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-store"></i> Top restaurants</div>
        <div class="chart-card-body"><canvas id="dashTopRestaurants"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-location-dot"></i> Top areas</div>
        <div class="chart-card-body"><canvas id="dashTopAreas"></canvas></div>
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
        <div class="chart-card-head"><i class="fas fa-crown"></i> Top customers</div>
        <div class="chart-card-body"><canvas id="dashTopCustomers"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-utensils"></i> Top items sold</div>
        <div class="chart-card-body"><canvas id="dashTopItems"></canvas></div>
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
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-stopwatch"></i> Delivery time distribution</div>
        <div class="chart-card-body"><canvas id="dashDeliveryTime"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Revenue by restaurant (₹)</div>
        <div class="chart-card-body"><canvas id="dashRevenueByRestaurant"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-clock"></i> Hourly demand (hour × weekday)</div>
        <div class="chart-card-body"><div id="dashHourlyHeatmap" class="heatmap-wrap" aria-label="Hourly heatmap"></div></div>
      </div>
    </div>
  `;

  try { await whenChartReady(); } catch (e) { console.warn('[dashboard] Chart.js unavailable:', e.message); }
  wireRangeControls(root, db);
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
    blank('Orders',           'fa-receipt'),
    blank('Revenue',          'fa-indian-rupee-sign'),
    blank('Active partners',  'fa-store'),
    blank('Pending payouts',  'fa-hand-holding-dollar'),
    blank('Delivery success', 'fa-circle-check'),
    blank('Repeat share',     'fa-users'),
    blank('Avg order value',  'fa-basket-shopping'),
    blank('Payout coverage',  'fa-piggy-bank'),
    blank('Total discounts',  'fa-tag'),
  ].join('');
}

function renderRangeControls() {
  const presets = [
    ['last7',     'Last 7d'],
    ['last30',    'Last 30d'],
    ['last60',    'Last 60d'],
    ['thisMonth', 'This month'],
    ['lastMonth', 'Last month'],
    ['custom',    'Custom'],
  ];
  const cur = state.range.preset;
  const chips = presets.map(([k, l]) =>
    `<button type="button" class="dash-range-chip${k === cur ? ' is-active' : ''}" data-preset="${k}" aria-pressed="${k === cur}">${l}</button>`
  ).join('');
  const fromISO = state.range.from.toISOString().slice(0, 10);
  // Show `to - 1 day` in the picker so the inclusive-looking end date matches
  // the exclusive upper bound used internally.
  const toISO = new Date(state.range.to.getTime() - 86400000).toISOString().slice(0, 10);
  return `
    <div class="dash-range-chips" role="group" aria-label="Range preset">${chips}</div>
    <div class="dash-range-custom" ${cur === 'custom' ? '' : 'hidden'}>
      <label>From <input type="date" id="dashRangeFrom" value="${fromISO}"></label>
      <label>To <input type="date" id="dashRangeTo" value="${toISO}"></label>
    </div>
  `;
}

function wireRangeControls(root, db) {
  const wrap = root.querySelector('#dashRange');
  if (!wrap) return;
  wrap.addEventListener('click', async (ev) => {
    const btn = ev.target.closest('.dash-range-chip');
    if (!btn) return;
    const preset = btn.dataset.preset;
    if (preset === state.range.preset) return;
    if (preset === 'custom') {
      state.range = normalizeRange({ preset: 'custom',
        fromISO: state.range.from.toISOString(),
        toISO:   new Date(state.range.to.getTime() - 86400000).toISOString(),
      });
    } else {
      state.range = normalizeRange({ preset });
    }
    saveRangeState();
    wrap.innerHTML = renderRangeControls();
    await refresh(root, db);
  });
  wrap.addEventListener('change', async (ev) => {
    if (ev.target.id !== 'dashRangeFrom' && ev.target.id !== 'dashRangeTo') return;
    const f = document.getElementById('dashRangeFrom').value;
    const t = document.getElementById('dashRangeTo').value;
    if (!f || !t) return;
    state.range = normalizeRange({ preset: 'custom', fromISO: f, toISO: t });
    saveRangeState();
    await refresh(root, db);
  });
}

async function refresh(root, db) {
  const kpisEl = root.querySelector('#dashKpis');
  kpisEl.classList.add('is-loading');
  // Mark all chart cards as loading so the spinner overlay appears on each
  // while data is in flight. Cleared at the end of refresh().
  const chartBodies = root.querySelectorAll('.chart-card-body');
  chartBodies.forEach(el => el.classList.add('is-loading'));

  // Fetch window: driven by the range picker. Query the widest of {selected
  // range, last-month-to-now} so KPIs like "MoM revenue" still work when the
  // user picks a short range like Last 7d.
  const mom = { from: startOfLastMonth(), to: new Date() };
  const fetchFrom = state.range.from < mom.from ? state.range.from : mom.from;
  const sinceTs = Timestamp.fromDate(fetchFrom);
  const [ordersSnap, partnersSnap, staffSnap, customersSnap, rules] = await Promise.all([
    getDocs(query(collection(db, COL.ORDERS), where('created_at', '>=', sinceTs))),
    getDocs(collection(db, COL.PARTNERS)),
    getDocs(collection(db, COL.STAFF)),
    // Customers collection carries each phone's created_at (first-time
    // upsert), which the "New vs Repeat" chart uses to classify orders — this
    // knowledge predates the current fetch window so a customer who first
    // ordered months ago is correctly tagged as "Repeat" even if their only
    // order inside the range is the earliest one we've fetched.
    getDocs(collection(db, COL.CUSTOMERS)),
    loadFeeRules(db, { autoSeed: true }),
  ]);

  const ordersAll = [];
  ordersSnap.forEach(d => ordersAll.push({ id: d.id, ...d.data() }));
  const partners = [];
  partnersSnap.forEach(d => partners.push({ id: d.id, ...d.data() }));
  const staff = [];
  staffSnap.forEach(d => staff.push({ uid: d.id, ...d.data() }));
  const customers = [];
  customersSnap.forEach(d => customers.push({ phone: d.id, ...d.data() }));

  // Filter to the selected range for every chart/KPI that respects the picker.
  // MoM KPI + MoM chart use the always-loaded last-month window instead.
  const range = state.range;
  const orders = ordersAll.filter(o => {
    const d = toDateSafe(o.created_at);
    return d && d >= range.from && d < range.to;
  });

  renderKpis(kpisEl, orders, ordersAll, partners, staff, rules);
  kpisEl.classList.remove('is-loading');

  const p = chartPalette();
  renderOrdersPerDay(orders, p);
  renderRevenuePerDay(orders, p);
  renderStatusMix(orders, p);
  renderMonthOverMonth(ordersAll, p);
  renderMonthlyGrowth(ordersAll, p);
  renderTopRestaurants(orders, p);
  renderTopAreas(orders, p);
  renderPartnerPayouts(orders, staff, rules, p);
  renderFarNear(orders, rules, p);
  renderCancelRate(orders, p);
  renderAovTrend(orders, p);
  renderRepeatNew(orders, customers, p);
  renderTopCustomers(orders, p);
  renderTopItems(orders, p);
  renderDiscountTrend(orders, p);
  renderPrepaidCod(orders, p);
  renderDayOfWeek(orders, p);
  renderPartnerOrders(orders, staff, p);
  renderDeliveryTime(orders, p);
  renderRevenueByRestaurant(orders, p);
  renderHourlyHeatmap(orders, p, root);

  chartBodies.forEach(el => el.classList.remove('is-loading'));
}

function renderKpis(el, orders, ordersAll, partners, staff, rules) {
  const rangeLabel = state.range.label;

  // Orders KPI — delivered count only; total shown in sub-line
  const deliveredOrders = orders.filter(isDelivered);

  // Revenue KPI — current MTD vs last month MTD (same day-of-month cutoff)
  // so early-month comparisons stay meaningful. Uses ordersAll — always the
  // full MoM window regardless of picker selection.
  const curStart   = startOfCurrentMonth();
  const lastStart  = startOfLastMonth();
  const now        = new Date();
  const lastCutoff = new Date(lastStart.getFullYear(), lastStart.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const curMonthDelivered = ordersAll.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at); return d && d >= curStart;
  });
  const lastMonthDelivered = ordersAll.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at); return d && d >= lastStart && d < lastCutoff;
  });
  const currentRevenue = curMonthDelivered.reduce((s, o) => s + netRevenue(o), 0);
  const lastRevenue    = lastMonthDelivered.reduce((s, o) => s + netRevenue(o), 0);
  let revBadge;
  if (lastRevenue > 0) {
    const pct = ((currentRevenue - lastRevenue) / lastRevenue * 100).toFixed(1);
    if (pct > 0) revBadge = `<span style="color:#16a34a">↑${pct}%</span> vs last month (MTD)`;
    else if (pct < 0) revBadge = `<span style="color:#dc3545">↓${Math.abs(pct)}%</span> vs last month (MTD)`;
    else revBadge = `— vs last month (MTD)`;
  } else {
    revBadge = `— vs last month (MTD)`;
  }

  // Pending Payouts — mirror the Delivery section logic exactly:
  // must be delivered, have a delivery_staff_id, not explicitly excluded, and not yet paid.
  const eligibleDeliveries = orders.filter(o => isDelivered(o) && o.delivery_staff_id && o.payout_applicable !== false);
  const pendingPayoutOrders = eligibleDeliveries.filter(o => !isPayoutPaid(o));
  const pendingPayoutTotal  = pendingPayoutOrders.reduce((s, o) => s + feeForOrder(o, rules), 0);

  const activePartners = partners.filter(p => p.is_active !== false).length;
  const activeStaff    = staff.filter(s => s.is_active !== false).length;

  // Part B KPIs (respect the range picker).
  const cancelledCount = orders.filter(isCancelled).length;
  const successDenom = deliveredOrders.length + cancelledCount;
  const successPct = successDenom ? Math.round((deliveredOrders.length / successDenom) * 100) : 0;

  // Repeat share — of delivered orders in range, how many belong to customers
  // who had ≥2 lifetime deliveries within the loaded ordersAll window.
  const lifetimeDelivered = new Map();
  for (const o of ordersAll) {
    if (!isDelivered(o)) continue;
    const ph = o.customer?.phone;
    if (!ph) continue;
    lifetimeDelivered.set(ph, (lifetimeDelivered.get(ph) || 0) + 1);
  }
  let repeatN = 0;
  for (const o of deliveredOrders) {
    const ph = o.customer?.phone;
    if (ph && (lifetimeDelivered.get(ph) || 0) >= 2) repeatN++;
  }
  const repeatPct = deliveredOrders.length ? Math.round((repeatN / deliveredOrders.length) * 100) : 0;

  const rangeRevenue = deliveredOrders.reduce((s, o) => s + netRevenue(o), 0);
  const aov = deliveredOrders.length ? Math.round(rangeRevenue / deliveredOrders.length) : 0;

  const paidPayoutTotal = eligibleDeliveries.filter(isPayoutPaid)
    .reduce((s, o) => s + feeForOrder(o, rules), 0);
  const payoutTotal = paidPayoutTotal + pendingPayoutTotal;
  const payoutCoverage = payoutTotal ? Math.round((paidPayoutTotal / payoutTotal) * 100) : 0;

  // Total discounts given on delivered orders inside the selected range.
  const discountOrders  = deliveredOrders.filter(o => (Number(o.discount) || 0) > 0);
  const totalDiscount   = deliveredOrders.reduce((s, o) => s + (Number(o.discount) || 0), 0);
  const discountPctRev  = rangeRevenue > 0 ? Math.round((totalDiscount / (rangeRevenue + totalDiscount)) * 100) : 0;

  el.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-receipt"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Orders</div>
        <div class="kpi-value">${deliveredOrders.length}</div>
        <div class="kpi-sub">${orders.length} total | ${rangeLabel}</div>
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
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-circle-check"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Delivery success</div>
        <div class="kpi-value">${successPct}%</div>
        <div class="kpi-sub">${deliveredOrders.length} delivered / ${cancelledCount} cancelled</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-users"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Repeat share</div>
        <div class="kpi-value">${repeatPct}%</div>
        <div class="kpi-sub">${repeatN} of ${deliveredOrders.length} orders</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-basket-shopping"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Avg order value</div>
        <div class="kpi-value">${fmtINR(aov)}</div>
        <div class="kpi-sub">${rangeLabel}</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-piggy-bank"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Payout coverage</div>
        <div class="kpi-value">${payoutCoverage}%</div>
        <div class="kpi-sub">${fmtINR(paidPayoutTotal)} paid / ${fmtINR(payoutTotal)} total</div>
      </div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon"><i class="fas fa-tag"></i></div>
      <div class="kpi-body">
        <div class="kpi-label">Total discounts</div>
        <div class="kpi-value">${fmtINR(totalDiscount)}</div>
        <div class="kpi-sub">${discountOrders.length} order${discountOrders.length === 1 ? '' : 's'}${totalDiscount > 0 ? ` · ${discountPctRev}% of gross` : ''} | ${rangeLabel}</div>
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
      scales: { y: { beginAtZero: true, ticks: { callback: fmtCompactINR } } },
    },
  });
}

function renderStatusMix(orders, p) {
  // Simple bar of totals across the selected date range. Only terminal
  // statuses are meaningful in retrospective analytics — new / assigned /
  // out_for_delivery are transient and reflect current in-flight work.
  const statusKeys = ['delivered', 'cancelled', 'fake'];
  const restKey = o => o.restaurant_name || o.restaurant_id || 'Unknown';

  const select = document.getElementById('dashStatusMixRestaurant');
  if (select) {
    const uniqueRestaurants = [...new Set(orders.map(restKey))].sort((a, b) => a.localeCompare(b));
    const prevSelected = select.value || 'all';
    select.innerHTML = '';
    const optAll = document.createElement('option');
    optAll.value = 'all';
    optAll.textContent = 'All restaurants';
    select.appendChild(optAll);
    uniqueRestaurants.forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
    select.value = [...select.options].some(o => o.value === prevSelected) ? prevSelected : 'all';
    // Replace handler each render so it closes over the latest `orders`.
    select.onchange = () => renderStatusMix(orders, p);
  }

  const selected = select?.value || 'all';
  const filtered = selected === 'all' ? orders : orders.filter(o => restKey(o) === selected);
  const counts = statusKeys.map(s => filtered.filter(o => (o.status || 'new') === s).length);
  mountChart('dashStatusMix', {
    type: 'bar',
    data: {
      labels: statusKeys.map(k => k.replace(/_/g, ' ')),
      datasets: [{ label: 'Orders', data: counts, backgroundColor: palettePerBar(counts.length, p), borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} orders` } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderMonthOverMonth(orders, p) {
  const curStart = startOfCurrentMonth();
  const lastStart = startOfLastMonth();
  const now = new Date();

  const lastCutoff = new Date(lastStart.getFullYear(), lastStart.getMonth(), now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const dayLabel = ` (till day ${now.getDate()})`;
  const lastFullLabel = lastStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) + ' (full)';
  const lastMtdLabel  = lastStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) + dayLabel;
  const curMonthLabel = curStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) + dayLabel;

  const lastDelivered = orders.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at);
    return d && d >= lastStart && d < curStart;
  });
  const lastMtdDelivered = orders.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at);
    return d && d >= lastStart && d < lastCutoff;
  });
  const curDelivered = orders.filter(o => {
    if (!isDelivered(o)) return false;
    const d = toDateSafe(o.created_at);
    return d && d >= curStart;
  });

  const lastRevenue    = lastDelivered.reduce((s, o) => s + netRevenue(o), 0);
  const lastMtdRevenue = lastMtdDelivered.reduce((s, o) => s + netRevenue(o), 0);
  const curRevenue     = curDelivered.reduce((s, o) => s + netRevenue(o), 0);

  mountChart('dashMonthOverMonth', {
    type: 'bar',
    data: {
      labels: [lastFullLabel, lastMtdLabel, curMonthLabel],
      datasets: [
        {
          label: 'Delivered Orders',
          data: [lastDelivered.length, lastMtdDelivered.length, curDelivered.length],
          backgroundColor: [p.muted, p.muted, p.brand],
          yAxisID: 'y',
          borderWidth: 0,
        },
        {
          label: 'Revenue (₹)',
          data: [lastRevenue, lastMtdRevenue, curRevenue],
          backgroundColor: [p.muted + '99', p.muted + '99', p.brandSoft],
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
        y1: { beginAtZero: true, position: 'right', ticks: { callback: fmtCompactINR }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Revenue' } },
      },
    },
  });
}

// Day-wise cumulative net revenue for this month vs the same day-of-month
// progression last month. Uses ordersAll (unfiltered by range picker) since
// the whole point is a fixed month-over-month comparison — the picker only
// scopes the range-aware charts.
//
// x-axis: day of month (1..31 depending on this month's length).
// y-axis: cumulative ₹ revenue up to that day.
// "This month" is truncated to today so the line doesn't flatline forward;
// "Last month" is drawn full-length as a dashed reference line.
function renderMonthlyGrowth(ordersAll, p) {
  const today = new Date();
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(today.getFullYear(), today.getMonth(), 0);
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  const cumThis = new Array(daysInThisMonth).fill(0);
  const cumLast = new Array(daysInThisMonth).fill(0);
  for (const o of ordersAll) {
    if (!isDelivered(o)) continue;
    const t = toDateSafe(o.created_at);
    if (!t) continue;
    const rev = netRevenue(o);
    if (t >= thisMonthStart && t <= today) {
      cumThis[t.getDate() - 1] += rev;
    } else if (t >= lastMonthStart && t <= lastMonthEnd) {
      const di = t.getDate() - 1;
      if (di < cumLast.length) cumLast[di] += rev;
    }
  }
  for (let i = 1; i < cumThis.length; i++) cumThis[i] += cumThis[i - 1];
  for (let i = 1; i < cumLast.length; i++) cumLast[i] += cumLast[i - 1];

  const todayDom = today.getDate();
  const cumThisDisplay = cumThis.map((v, i) => i < todayDom ? Math.round(v) : null);
  const cumLastDisplay = cumLast.map(v => Math.round(v));

  const thisLabel = thisMonthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const lastLabel = lastMonthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  mountChart('dashMonthlyGrowth', {
    type: 'line',
    data: {
      labels: cumThis.map((_, i) => String(i + 1).padStart(2, '0')),
      datasets: [
        { label: `This month · ${thisLabel}`, data: cumThisDisplay, borderColor: p.brand, backgroundColor: p.brandSoft, fill: false, tension: 0.25, pointRadius: 2, borderWidth: 2 },
        { label: `Last month · ${lastLabel}`, data: cumLastDisplay, borderColor: p.muted, backgroundColor: 'transparent', borderDash: [4, 4], fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: {
      // Show both lines' values in a single tooltip anchored to the hovered
      // day — the whole point of this chart is to compare same-date figures,
      // so the tooltip needs to surface last month's number even when you're
      // hovering this month's line (and vice-versa).
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: ctxs => `Day ${ctxs[0].label}`,
            label: ctx => {
              const val = ctx.parsed.y;
              return `${ctx.dataset.label}: ${val == null ? '—' : fmtINR(val)}`;
            },
            footer: ctxs => {
              // If both months have a value on this day, show the delta so the
              // admin can read growth at a glance without doing the math.
              const items = ctxs.filter(c => c.parsed.y != null);
              if (items.length < 2) return '';
              const thisIdx = ctxs.findIndex(c => c.datasetIndex === 0);
              const lastIdx = ctxs.findIndex(c => c.datasetIndex === 1);
              if (thisIdx < 0 || lastIdx < 0) return '';
              const t = ctxs[thisIdx].parsed.y, l = ctxs[lastIdx].parsed.y;
              if (t == null || l == null) return '';
              const diff = t - l;
              const pct  = l > 0 ? Math.round((diff / l) * 100) : null;
              const sign = diff >= 0 ? '+' : '−';
              const pctText = pct == null ? '' : ` (${diff >= 0 ? '+' : ''}${pct}%)`;
              return `Δ vs last month: ${sign}${fmtINR(Math.abs(diff))}${pctText}`;
            },
          },
        },
      },
      scales: {
        x: { ticks: { autoSkip: true, maxRotation: 0 }, title: { display: true, text: 'Day of month' } },
        y: { beginAtZero: true, ticks: { callback: fmtCompactINR }, title: { display: true, text: 'Cumulative revenue' } },
      },
    },
  });
}

// Helper: given a full delivered-orders list, compute Top-N categories then
// return { labels, earlierCounts, laterCounts } for grouped-bar rendering.
function topNSplitCounts(delivered, keyFn, n, range, valueFn) {
  const g = groupBy(delivered, keyFn);
  const top = topN(g, n, valueFn);
  const labels = top.map(([k]) => k);
  const split = splitByMonth(delivered, o => toDateSafe(o.created_at), range);
  const perKey = list => {
    const m = new Map();
    for (const o of list) {
      const k = keyFn(o);
      if (k == null || k === '') continue;
      if (valueFn) m.set(k, (m.get(k) || 0) + valueFn([o]));
      else m.set(k, (m.get(k) || 0) + 1);
    }
    return labels.map(l => m.get(l) || 0);
  };
  return { labels, earlier: perKey(split.earlier), later: perKey(split.later), split };
}

// Compact ₹ axis label: 1,00,000 → "₹1L", 12,340 → "₹12k", <1000 stays raw.
// Used on Y-axes of revenue charts so narrow screens don't blow up horizontally
// under long numeric labels. Full ₹ value still shows in the tooltip.
function fmtCompactINR(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '₹0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 10000000) return `${sign}₹${(n / 10000000).toFixed(n % 10000000 === 0 ? 0 : 1)}Cr`;
  if (abs >= 100000)   return `${sign}₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`;
  if (abs >= 1000)     return `${sign}₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

// Cycle through the chart palette to give each bar its own color — used by
// the aggregated single-series charts so bars stay easy to tell apart even
// when the legend is hidden.
function palettePerBar(count, p) {
  const src = p.series && p.series.length ? p.series : [p.brand];
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = src[i % src.length];
  return out;
}

// Helper: total counts per group, sorted desc, top-N labels + values.
function topNTotals(items, keyFn, n) {
  const m = new Map();
  for (const o of items) {
    const k = keyFn(o);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderTopRestaurants(orders, p) {
  const top = topNTotals(orders.filter(isDelivered), o => o.restaurant_name || o.restaurant_id || 'Unknown', 5);
  const fullLabels = top.map(([k]) => k);
  mountChart('dashTopRestaurants', {
    type: 'bar',
    data: {
      labels: fullLabels.map(n => truncateName(n, 10)),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: palettePerBar(top.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => fullLabels[ctx[0].dataIndex],
            label: ctx => `${ctx.parsed.x} orders`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { ticks: { autoSkip: false, font: { size: 11 } } },
      },
    },
  });
}

function renderTopAreas(orders, p) {
  const top = topNTotals(orders.filter(isDelivered), o => o.place || 'Unknown', 5);
  mountChart('dashTopAreas', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: palettePerBar(top.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} orders` } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPartnerPayouts(orders, staff, rules, p) {
  // One bar per partner, stacked to show Paid vs Pending — admin needs to
  // see at a glance how much is still owed. Colors are fixed by state
  // (green = paid, amber = pending) rather than cycling per partner, since
  // the paid/pending semantic is the point of this chart.
  const staffMap = new Map(staff.map(s => [s.uid, s.name || s.email || s.uid]));
  const m = new Map();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    if (o.payout_applicable === false) continue;
    const sid = o.delivery_staff_id;
    if (!sid || !staffMap.has(sid)) continue;
    if (!m.has(sid)) m.set(sid, { paid: 0, pending: 0 });
    const fee = feeForOrder(o, rules);
    if (isPayoutPaid(o)) m.get(sid).paid += fee;
    else m.get(sid).pending += fee;
  }
  const rows = [...m.entries()]
    .map(([uid, v]) => ({ uid, name: staffMap.get(uid), paid: v.paid, pending: v.pending, total: v.paid + v.pending }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  mountChart('dashPartnerPayouts', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [
        // Muted, analytics-first palette — Tableau/Looker style. Saturated
        // enough to distinguish paid vs pending at a glance, but low-key
        // enough not to shout on a dashboard full of other charts.
        { label: 'Paid',    data: rows.map(r => r.paid),    backgroundColor: '#8ab89b', borderWidth: 0, stack: 'payout' },
        { label: 'Pending', data: rows.map(r => r.pending), backgroundColor: '#e0a458', borderWidth: 0, stack: 'payout' },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${fmtINR(ctx.parsed.x)}`,
            footer: ctxs => {
              const row = rows[ctxs[0].dataIndex];
              return row ? `Total: ${fmtINR(row.total)}` : '';
            },
          },
        },
      },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { callback: fmtCompactINR } },
        y: { stacked: true },
      },
    },
  });
}

function renderFarNear(orders, rules, p) {
  let far = 0, near = 0;
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    if (isFarPlace(o, rules)) far++; else near++;
  }
  mountChart('dashFarNear', {
    type: 'bar',
    data: {
      labels: ['Far', 'Near'],
      datasets: [{ label: 'Orders', data: [far, near], backgroundColor: palettePerBar(2, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} orders` } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
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
      scales: { y: { beginAtZero: true, ticks: { callback: fmtCompactINR } } },
    },
  });
}

function renderRepeatNew(orders, customers, p) {
  // A customer (by phone) is "new" only on the calendar day the customer doc
  // was first created (their real first-ever order across all history); every
  // later day they order they count as "repeat".
  //
  // Previously the firstSeen map was built only from orders already inside
  // the fetch window, so a long-time customer whose earliest fetched order
  // fell inside the window was wrongly tagged "new". Using the customers
  // collection's `created_at` fixes that because it predates the range.
  const delivered = orders.filter(isDelivered);
  const firstSeen = new Map();
  for (const c of customers || []) {
    const d = toDateSafe(c.created_at);
    if (c.phone && d) firstSeen.set(c.phone, d.getTime());
  }
  // Safety net: if any delivered order has a phone we've never seen a
  // customer doc for, fall back to the earliest order's day as their first.
  for (const o of delivered) {
    const phone = o.customer?.phone;
    if (!phone || firstSeen.has(phone)) continue;
    const d = toDateSafe(o.created_at);
    if (d) firstSeen.set(phone, d.getTime());
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
      // Count each customer once per day so "new" and "repeat" stay comparable.
      if (seenToday.has(phone)) continue;
      seenToday.add(phone);
      if (fs != null && fs >= dayStart && fs < dayStart + 86400000) n++; else r++;
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
  // Group by phone (identity), then pick a display label from the most
  // recently seen name for that phone. Grouping by name-or-phone splits a
  // single customer across labels when some of their orders had a blank or
  // different name, so the tallied count under-reports vs the profile modal
  // which always filters by phone.
  const perPhone = new Map(); // phone -> { count, name, lastAt }
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const c = o.customer || {};
    const phone = c.phone;
    if (!phone) continue;
    const at = toDateSafe(o.created_at)?.getTime() || 0;
    const entry = perPhone.get(phone) || { count: 0, name: '', lastAt: 0 };
    entry.count += 1;
    if ((c.name || '').trim() && at >= entry.lastAt) {
      entry.name = c.name.trim();
      entry.lastAt = at;
    }
    perPhone.set(phone, entry);
  }
  const top = [...perPhone.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);
  const labels = top.map(([phone, v]) => v.name || phone);
  mountChart('dashTopCustomers', {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v.count), backgroundColor: palettePerBar(top.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} orders` } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderTopItems(orders, p) {
  const delivered = orders.filter(isDelivered);
  const m = new Map();
  for (const o of delivered) {
    if (!Array.isArray(o.items)) continue;
    for (const it of o.items) {
      const name = (it?.name || '').trim();
      if (!name) continue;
      const qty = Number(it.qty) || 1;
      m.set(name, (m.get(name) || 0) + qty);
    }
  }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  mountChart('dashTopItems', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Qty sold', data: top.map(([, v]) => v), backgroundColor: palettePerBar(top.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} sold` } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDiscountTrend(orders, p) {
  const delivered = orders.filter(isDelivered);
  const days = bucketByDay(delivered, o => toDateSafe(o.created_at), 7);
  const data = days.keys.map(k => days.buckets.get(k).reduce((s, o) => s + (Number(o.discount) || 0), 0));
  mountChart('dashDiscountTrend', {
    type: 'bar',
    data: {
      labels: days.labels,
      datasets: [{ label: 'Discount ₹', data, backgroundColor: p.series[3], borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: fmtCompactINR } } },
    },
  });
}

function classifyPayment(o) {
  const method = String(o.paid_method || '').toLowerCase();
  if (method === 'upi' || method === 'online') return 'prepaid';
  if (method === 'cash') return 'cod';
  return (Number(o.paid_already) || 0) > 0 ? 'prepaid' : 'cod';
}

function renderPrepaidCod(orders, p) {
  const delivered = orders.filter(isDelivered);
  let prepaid = 0, cod = 0;
  for (const o of delivered) (classifyPayment(o) === 'prepaid' ? prepaid++ : cod++);
  mountChart('dashPrepaidCod', {
    type: 'bar',
    data: {
      labels: ['Prepaid', 'COD'],
      datasets: [{ label: 'Orders', data: [prepaid, cod], backgroundColor: palettePerBar(2, p), borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} orders` } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderDayOfWeek(orders, p) {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts = new Array(7).fill(0);
  for (const o of orders.filter(isDelivered)) {
    const d = toDateSafe(o.created_at);
    if (d) counts[d.getDay()]++;
  }
  mountChart('dashDayOfWeek', {
    type: 'bar',
    data: {
      labels: names,
      datasets: [{ label: 'Orders', data: counts, backgroundColor: palettePerBar(counts.length, p), borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.y} orders` } },
      },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderPartnerOrders(orders, staff, p) {
  const staffMap = new Map(staff.map(s => [s.uid, s.name || s.email || s.uid]));
  const m = new Map();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const sid = o.delivery_staff_id;
    if (!sid || !staffMap.has(sid)) continue;
    m.set(sid, (m.get(sid) || 0) + 1);
  }
  const rows = [...m.entries()]
    .map(([uid, total]) => ({ uid, name: staffMap.get(uid), total }))
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total);

  mountChart('dashPartnerOrders', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [{ label: 'Orders', data: rows.map(r => r.total), backgroundColor: palettePerBar(rows.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x} orders` } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// ---------- Part C: new dashboard charts ----------

function renderDeliveryTime(orders, p) {
  const buckets = [
    { label: '15-30 m', min: 15,  max: 30 },
    { label: '30-45 m', min: 30,  max: 45 },
    { label: '45-60 m', min: 45,  max: 60 },
    { label: '60-90 m', min: 60,  max: 90 },
    { label: '90+ m',   min: 90,  max: Infinity },
  ];
  const counts = buckets.map(() => 0);
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const m = minutesBetween(o, 'created_at', 'delivered_at');
    if (m == null || m < 0) continue;
    const idx = buckets.findIndex(b => m >= b.min && m < b.max);
    if (idx >= 0) counts[idx]++;
  }
  mountChart('dashDeliveryTime', {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ label: 'Deliveries', data: counts, backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function renderRevenueByRestaurant(orders, p) {
  const delivered = orders.filter(isDelivered);
  const m = new Map();
  for (const o of delivered) {
    const k = o.restaurant_name || o.restaurant_id || 'Unknown';
    m.set(k, (m.get(k) || 0) + netRevenue(o));
  }
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  const fullLabels = top.map(([k]) => k);
  mountChart('dashRevenueByRestaurant', {
    type: 'bar',
    data: {
      labels: fullLabels.map(n => truncateName(n, 10)),
      datasets: [{ label: 'Revenue ₹', data: top.map(([, v]) => Math.round(v)), backgroundColor: palettePerBar(top.length, p), borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => fullLabels[ctx[0].dataIndex],
            label: ctx => fmtINR(ctx.parsed.x),
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { callback: fmtCompactINR } },
        y: { ticks: { autoSkip: false, font: { size: 11 } } },
      },
    },
  });
}

function renderHourlyHeatmap(orders, p, root) {
  const el = root.querySelector('#dashHourlyHeatmap');
  if (!el) return;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Restaurants are only open 11:00–21:59, so restrict the heatmap to that
  // window — the remaining hours are always empty and just add horizontal
  // scroll noise on mobile.
  const HOUR_START = 11;
  const HOUR_END   = 21; // inclusive
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const grid = Array.from({ length: 7 }, () => new Array(hours.length).fill(0));
  let max = 0;
  const delivered = orders.filter(isDelivered);
  for (const o of delivered) {
    const d = toDateSafe(o.created_at);
    if (!d) continue;
    const h = d.getHours();
    if (h < HOUR_START || h > HOUR_END) continue;
    const col = h - HOUR_START;
    grid[d.getDay()][col]++;
    if (grid[d.getDay()][col] > max) max = grid[d.getDay()][col];
  }
  const cell = (v) => {
    const t = max ? v / max : 0;
    const bg = t === 0 ? 'transparent' : `rgba(255,107,53,${Math.max(0.08, t)})`;
    return `<div class="hm-cell" style="background:${bg}" title="${v}">${v || ''}</div>`;
  };
  const header = ['<div class="hm-corner"></div>', ...hours.map(h => `<div class="hm-hour">${String(h).padStart(2, '0')}</div>`)].join('');
  const rows = days.map((name, di) => {
    return `<div class="hm-row"><div class="hm-day">${name}</div>${grid[di].map(cell).join('')}</div>`;
  }).join('');
  el.setAttribute('style', `--hm-cols:${hours.length}`);
  el.innerHTML = `<div class="hm-grid"><div class="hm-header">${header}</div>${rows}</div>`;
}
