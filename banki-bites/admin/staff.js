import { COL, cachedGetDocs, invalidateCache } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, query, where, orderBy, limit, startAfter,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, isFarPlace, isDelivered, isPayoutPaid, isPayoutPending,
  toDateSafe, chartPalette, whenChartReady, fmtINR, wireStatsBlockResize, startOfLastMonth,
  startOfCurrentMonth, truncateName, isOnTime,
} from '../analytics.js';
import {
  getCachedDashboardData, putDashboardDataIntoCache,
  getDashboardSource, DASHBOARD_FETCH_WINDOW_DAYS,
} from './dashboard.js';

// Note: Creating a Firebase Auth user requires the Admin SDK (server-side) or the
// Firebase console. This screen manages the staff *directory* doc — you must create
// the Auth account in the Firebase console first, then paste the UID here.
// Doc id MUST equal the Firebase Auth UID for security rules to authorise the user.

function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}

const staffCharts = new Map();
function mountStaffChart(id, config) {
  const old = staffCharts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  const c = new Chart(el.getContext('2d'), config);
  staffCharts.set(id, c);
  return c;
}

let _staffOrdersCache = null;
let _staffRunsCache = null;         // completed grocery runs across all staff
let _staffFeeRules = null;
let _staffRoot = null;
let _staffDb = null;

// Public refresh entry-point so the Dashboard's refresh button can also
// invalidate the staff/earnings cache. Re-fetches orders, force-reloads fee
// rules, and re-renders the staff list + charts if the Staff tab has been
// opened already. No-op until renderStaff() has been called once.
export async function refreshStaffData(db) {
  const targetDb = db || _staffDb;
  if (!targetDb) return;
  _staffFeeRules = await loadFeeRules(targetDb, { force: true });
  await refreshStaffOrders(targetDb, { force: true });
  if (_staffRoot) {
    await loadStaff(targetDb, _staffRoot, { force: true });
    renderStaffCharts();
  }
}

export async function renderStaff(root, db) {
  _staffRoot = root;
  _staffDb = db;
  root.innerHTML = `
    <details class="stats-block">
      <summary class="stats-block-head"><i class="fas fa-chart-simple"></i> Delivery partner insights</summary>
      <div class="stats-block-body">
        <div id="staffKpis" class="kpi-grid kpi-grid--compact"></div>
        <div class="chart-grid">
          <div class="chart-card chart-card--wide">
            <div class="chart-card-head"><i class="fas fa-hand-holding-dollar"></i> Payouts: Paid vs Pending (₹)</div>
            <div class="chart-card-body"><canvas id="staffPayouts"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-motorcycle"></i> Deliveries per partner</div>
            <div class="chart-card-body"><canvas id="staffDeliveries"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-route"></i> Far (₹40) vs Near (₹30) — orders</div>
            <div class="chart-card-body"><canvas id="staffFarNear"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-clock-rotate-left"></i> On-time % per partner</div>
            <div class="chart-card-body"><canvas id="staffOnTime"></canvas></div>
          </div>
        </div>
      </div>
    </details>

    <div class="section-header section-header--compact section-header--end" style="gap:8px;flex-wrap:wrap">
      <button id="copyEtaBtn" class="btn btn-sm btn-outline-success" title="Copy the ETA ranking and open the delivery partners WhatsApp group — paste inside to send">
        <i class="fab fa-whatsapp mr-1"></i> Share ETA ranking
      </button>
      <button id="addStaffBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add staff</button>
    </div>
    <div class="text-muted mb-2" style="font-size:0.78rem">
      <i class="fas fa-info-circle"></i> Create the Auth account in Firebase Console first, then paste the UID here.
    </div>
    <div id="staffList" class="card-list"><div class="bb-loader-block">Loading delivery partners…</div></div>
  `;
  document.getElementById('addStaffBtn').addEventListener('click', () => openEditor(db, null, root));
  document.getElementById('copyEtaBtn').addEventListener('click', async () => {
    // Share ETA ranking ALWAYS wants fresh numbers — the message goes into
    // the partner WhatsApp group so a stale ranking would be embarrassing.
    // Force a fresh pull of orders + staff + runs, re-render the cards, then
    // copy. Full-screen loader so the admin can see Firestore is in flight;
    // the button's own spinner is too subtle to signal a multi-second fetch.
    const btn = document.getElementById('copyEtaBtn');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try { window.bbBusy('Fetching latest ETA data…'); } catch {}
    // Share ETA ranking only uses CURRENT-MONTH deliveries — no need to
    // pull the full 60-day window the Delivery tab normally holds. Scoped
    // fetch keeps the cost bounded to ~a few hundred reads per share,
    // instead of the 4000-doc worst case the 60-day refresh would charge.
    // Staff list is force-refreshed because the ranking must include every
    // partner currently on file (tiny collection). We temporarily swap the
    // shared staff caches to the current-month arrays for the duration of
    // copyEtaRanking, then restore so the Staff tab's regular card chips
    // (Earned/Paid/Pending over 60 days) stay correct.
    let monthData = null;
    try {
      await loadStaff(db, root, { force: true });
      monthData = await fetchCurrentMonthEtaData(db);
    } catch (err) {
      try { window.bbDone(); } catch {}
      btn.disabled = false;
      btn.classList.remove('is-loading');
      Swal.fire({
        icon: 'error',
        title: 'Could not fetch ETA data',
        text: err?.message || 'Please check your connection and try again.',
        confirmButtonColor: '#FF6B35',
      });
      return;
    }
    // Close the loader BEFORE copyEtaRanking so the full-screen overlay is
    // gone by the time copyEtaRanking assigns window.location.href — avoids
    // any modal ↔ navigation conflict on mobile browsers.
    try { window.bbDone(); } catch {}
    btn.disabled = false;
    btn.classList.remove('is-loading');
    // Swap caches to current-month data just for the ranking build —
    // copyEtaRanking reads caches synchronously, so restoring right after
    // it returns is safe (any async Swal/location.href inside has already
    // captured the row data it needs).
    const prevOrders = _staffOrdersCache;
    const prevRuns = _staffRunsCache;
    _staffOrdersCache = monthData.orders;
    _staffRunsCache = monthData.runs;
    try {
      copyEtaRanking(root);
    } finally {
      _staffOrdersCache = prevOrders;
      _staffRunsCache = prevRuns;
    }
  });
  try { await whenChartReady(); } catch (e) { console.warn('[staff] Chart.js unavailable:', e.message); }
  wireStatsBlockResize(root.querySelector('.stats-block'));
  _staffFeeRules = await loadFeeRules(db);
  await refreshStaffOrders(db);
  await loadStaff(db, root);
  renderStaffCharts();
}

// Window + page size match the rest of the admin panel: last 60 days, 200 docs
// per request, 20-page hard cap. 2-min TTL cache keyed by query so repeated
// tab opens don't re-page the whole window. The `force` flag (passed by
// Dashboard's Refresh / own Refresh paths) bypasses the cache.
const STAFF_WINDOW_DAYS = 60;
const STAFF_PAGE_SIZE = 200;
const STAFF_MAX_PAGES = 20;
const STAFF_CACHE_TTL_MS = 2 * 60 * 1000;
const _staffPagedCache = new Map(); // key -> { t, data }

// Per-partner Earnings & Payouts expand — hard caps + 10-min session cache
// so repeated expansions of the same partner (even across staff-tab
// remounts) don't re-hit Firestore. Caps bound the worst case even for a
// prolific partner with months of history.
const PER_PARTNER_ORDERS_LIMIT = 300;
const PER_PARTNER_RUNS_LIMIT = 150;
const PER_PARTNER_CACHE_TTL_MS = 10 * 60 * 1000;
const _perPartnerPayoutsCache = new Map(); // uid -> { t, mine }

// Share ETA ranking hard caps — bound the current-month fetch so a surprise
// traffic spike can't quietly chew through quota on a single share click.
// A month with >1000 orders would be unprecedented for a BankiBites-size
// store; runs are capped lower because a single partner-day = one run doc.
const ETA_MONTH_ORDERS_LIMIT = 1000;
const ETA_MONTH_RUNS_LIMIT = 300;

// Public hook so the orders live-listener can drop the staff tab's paged
// caches the moment any order changes. Deliberately does NOT touch the
// shared dashboard cache — that one is admin-controlled and only the
// Refresh / Share Summary buttons should force a Firestore refetch.
export function invalidateStaffPagedCache() {
  _staffPagedCache.delete('orders:last60d');
  _staffPagedCache.delete('delivery_runs:completed:last60d');
}

async function fetchPaged(db, cacheKey, colName, extraConstraints, { force } = {}) {
  const hit = _staffPagedCache.get(cacheKey);
  if (!force && hit && (Date.now() - hit.t) < STAFF_CACHE_TTL_MS) return hit.data;
  const out = [];
  let cursor = null;
  for (let i = 0; i < STAFF_MAX_PAGES; i++) {
    const constraints = [...extraConstraints, orderBy('created_at', 'desc')];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(STAFF_PAGE_SIZE));
    const snap = await getDocs(query(collection(db, colName), ...constraints));
    if (snap.empty) break;
    snap.forEach(d => out.push({ id: d.id, ...d.data() }));
    if (snap.size < STAFF_PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  _staffPagedCache.set(cacheKey, { t: Date.now(), data: out });
  return out;
}

// Current-month-only fetch used exclusively by Share ETA ranking.
// Deliberately NARROWER than refreshStaffOrders (which pulls 60 days) so
// each share click costs ~a few hundred reads instead of thousands.
// Returns { orders, runs } — the caller is responsible for swapping them
// into _staffOrdersCache / _staffRunsCache around copyEtaRanking() and
// restoring the prior caches after, so the Staff tab's regular card
// chips (Earned/Paid/Pending over 60 days) aren't narrowed.
async function fetchCurrentMonthEtaData(db) {
  const monthStartDate = startOfCurrentMonth(new Date());
  const sinceTs = Timestamp.fromMillis(monthStartDate.getTime());
  const [ordersSnap, runsSnap] = await Promise.all([
    getDocs(query(
      collection(db, COL.ORDERS),
      where('created_at', '>=', sinceTs),
      orderBy('created_at', 'desc'),
      limit(ETA_MONTH_ORDERS_LIMIT),
    )),
    getDocs(query(
      collection(db, COL.DELIVERY_RUNS),
      where('status', '==', 'completed'),
      where('created_at', '>=', sinceTs),
      limit(ETA_MONTH_RUNS_LIMIT),
    )),
  ]);
  const orders = [];
  ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));
  const runs = [];
  runsSnap.forEach(d => runs.push({ id: d.id, ...d.data() }));
  return { orders, runs };
}

async function refreshStaffOrders(db, { force = false } = {}) {
  const sinceTs = Timestamp.fromMillis(Date.now() - STAFF_WINDOW_DAYS * 86400000);
  // Cache-first path: reuse the dashboard's shared payload so we don't pay
  // the same Firestore reads twice. Only Refresh (force) bypasses it.
  const source = getDashboardSource();
  const cached = !force ? getCachedDashboardData(source) : null;
  if (cached && Array.isArray(cached.ordersAll) && Array.isArray(cached.deliveryRuns)) {
    _staffOrdersCache = cached.ordersAll;
    _staffRunsCache = cached.deliveryRuns;
    return;
  }
  // Partial-hit or miss — fetch whichever piece is missing and backfill into
  // the shared cache so sibling tabs (Dashboard, Partners) share the result.
  const patch = {};
  if (cached && Array.isArray(cached.ordersAll)) {
    _staffOrdersCache = cached.ordersAll;
  } else {
    _staffOrdersCache = await fetchPaged(
      db,
      'orders:last60d',
      COL.ORDERS,
      [where('created_at', '>=', sinceTs)],
      { force: true },
    );
    patch.ordersAll = _staffOrdersCache;
  }
  if (cached && Array.isArray(cached.deliveryRuns)) {
    _staffRunsCache = cached.deliveryRuns;
  } else {
    // Single-page fetch (no orderBy) — completed runs in 60d is a small set,
    // and skipping orderBy avoids forcing a composite index.
    const snap = await getDocs(query(
      collection(db, COL.DELIVERY_RUNS),
      where('status', '==', 'completed'),
      where('created_at', '>=', sinceTs),
      limit(STAFF_PAGE_SIZE),
    ));
    _staffRunsCache = [];
    snap.forEach(d => _staffRunsCache.push({ id: d.id, ...d.data() }));
    _staffPagedCache.set('delivery_runs:completed:last60d', { t: Date.now(), data: _staffRunsCache });
    patch.deliveryRuns = _staffRunsCache;
  }
  if (Object.keys(patch).length) putDashboardDataIntoCache(source, patch);
}

// Convert a completed run doc into a synthetic order the payout UI can
// consume. Matches the shape used by the delivery PWA so both sides stay
// in sync.
function runToSyntheticOrder(r) {
  const stops = (r.order_ids || []).length;
  const deliveredAt = r.completed_at || r.created_at || null;
  return {
    id: `run_${r.id}`,
    __grocery_run: true,
    __run_id: r.id,
    status: 'delivered',
    payout_applicable: true,
    payout_paid: r.payout_paid === true,
    payout_paid_at: r.payout_paid_at || null,
    payout_amount: Number(r.partner_earning) || 0,
    delivered_at: deliveredAt,
    created_at: r.created_at || deliveredAt,
    delivery_staff_id: r.partner_uid || null,
    restaurant_name: 'BankiBites Groceries',
    customer: { name: `${stops} stop${stops === 1 ? '' : 's'}${r.run_date ? ' · ' + r.run_date : ''}` },
    place: '',
    total: Number.isFinite(+r.total_value) ? +r.total_value : undefined,
    run_date: r.run_date,
  };
}

function renderStaffCharts() {
  const p = chartPalette();
  const orders = _staffOrdersCache || [];
  const rules = _staffFeeRules;
  const byStaff = new Map();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    if (o.payout_applicable === false) continue;
    const sid = o.delivery_staff_id;
    if (!sid) continue;
    if (!byStaff.has(sid)) byStaff.set(sid, { name: sid, paid: 0, pending: 0, count: 0, far: 0, near: 0 });
    const row = byStaff.get(sid);
    const fee = feeForOrder(o, rules);
    if (isPayoutPaid(o)) row.paid += fee; else row.pending += fee;
    row.count++;
    if (isFarPlace(o, rules)) row.far++; else row.near++;
    // On-time metric per partner (delivered_at ≤ eta)
    row.onTimeD = row.onTimeD || 0;
    row.onTimeN = row.onTimeN || 0;
    const ot = isOnTime(o);
    if (ot !== null) { row.onTimeD++; if (ot) row.onTimeN++; }
  }
  // Resolve staff names from rendered list
  document.querySelectorAll('.staff-card[data-uid]').forEach(el => {
    const uid = el.dataset.uid;
    const nm = el.querySelector('.ec-title')?.textContent?.trim() || uid;
    if (byStaff.has(uid)) byStaff.get(uid).name = nm;
  });

  const rows = [...byStaff.values()].filter(r => r.paid || r.pending);
  rows.sort((a, b) => (b.paid + b.pending) - (a.paid + a.pending));

  // KPIs
  const kpisEl = document.getElementById('staffKpis');
  if (kpisEl) {
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const totalPending = rows.reduce((s, r) => s + r.pending, 0);
    const totalDeliveries = rows.reduce((s, r) => s + r.count, 0);
    const activePartners = rows.filter(r => r.count > 0).length;
    const avgPerPartner = activePartners ? Math.round(totalDeliveries / activePartners) : 0;
    const totalOnTimeN = rows.reduce((s, r) => s + (r.onTimeN || 0), 0);
    const totalOnTimeD = rows.reduce((s, r) => s + (r.onTimeD || 0), 0);
    const onTimePct = totalOnTimeD ? Math.round((totalOnTimeN / totalOnTimeD) * 100) : null;
    kpisEl.innerHTML = `
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Deliveries</div><div class="kpi-value">${totalDeliveries}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Paid</div><div class="kpi-value">${fmtINR(totalPaid)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Pending</div><div class="kpi-value">${fmtINR(totalPending)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Total earnings</div><div class="kpi-value">${fmtINR(totalPaid + totalPending)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Avg / partner</div><div class="kpi-value">${avgPerPartner}</div><div class="kpi-sub">${activePartners} active</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">On-time rate</div><div class="kpi-value">${onTimePct == null ? '—' : onTimePct + '%'}</div><div class="kpi-sub">${totalOnTimeN}/${totalOnTimeD}</div></div>
    `;
  }

  mountStaffChart('staffPayouts', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
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

  const perStaff = new Map();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const sid = o.delivery_staff_id;
    if (!sid) continue;
    perStaff.set(sid, (perStaff.get(sid) || 0) + 1);
  }
  const recentRows = [...perStaff.entries()].map(([sid, n]) => ({ name: byStaff.get(sid)?.name || sid, n }));
  recentRows.sort((a, b) => b.n - a.n);
  mountStaffChart('staffDeliveries', {
    type: 'bar',
    data: {
      labels: recentRows.map(r => r.name),
      datasets: [{ label: 'Deliveries', data: recentRows.map(r => r.n), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  mountStaffChart('staffFarNear', {
    type: 'bar',
    data: {
      labels: rows.map(r => r.name),
      datasets: [
        { label: 'Near (₹30)', data: rows.map(r => r.near), backgroundColor: p.brand,       stack: 'fn', borderWidth: 0 },
        { label: 'Far (₹40)',  data: rows.map(r => r.far),  backgroundColor: p.series[3],   stack: 'fn', borderWidth: 0 },
      ],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } },
    },
  });

  // On-time % per partner.
  const otRows = rows
    .filter(r => r.onTimeD && r.onTimeD > 0)
    .map(r => ({ name: r.name, pct: Math.round((r.onTimeN / r.onTimeD) * 100), n: r.onTimeN, d: r.onTimeD }))
    .sort((a, b) => b.pct - a.pct);
  mountStaffChart('staffOnTime', {
    type: 'bar',
    data: {
      labels: otRows.map(r => r.name),
      datasets: [{ label: 'On-time %', data: otRows.map(r => r.pct), backgroundColor: p.status.delivered, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => `${ctx.parsed.x}% (${otRows[ctx.dataIndex].n}/${otRows[ctx.dataIndex].d})` } },
      },
      scales: { x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
    },
  });
}

async function loadStaff(db, root, { force = false } = {}) {
  const list = root.querySelector('#staffList');
  list.innerHTML = '<div class="bb-loader-block">Loading delivery partners…</div>';
  // Reuse the dashboard's cached staff list when available. On miss or on
  // force, fall back to the shared cachedGetDocs utility and backfill the
  // dashboard cache so the next tab open is free.
  const source = getDashboardSource();
  const cached = !force ? getCachedDashboardData(source) : null;
  let staff;
  if (cached && Array.isArray(cached.staff) && cached.staff.length) {
    // Dashboard stores staff rows as { uid, ...data }. Normalise to the
    // { id, ...data } shape renderCard below expects.
    staff = cached.staff.map(s => ({ id: s.uid || s.id, ...s }));
  } else {
    staff = await cachedGetDocs(
      'staff:all',
      () => collection(db, COL.STAFF),
      { ttlMs: 10 * 60_000, force },
    );
    if (staff.length) {
      putDashboardDataIntoCache(source, {
        staff: staff.map(s => ({ uid: s.id, ...s })),
      });
    }
  }
  if (!staff.length) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-motorcycle"></i><p>No delivery partners yet.</p></div>`;
    return;
  }
  list.innerHTML = '';
  staff.forEach(s => list.appendChild(renderCard(db, root, s.id, s)));
}

// Build the current-month ETA (on-time %) ranking for every delivery partner
// rendered on screen, drop anyone with 0% (either no ETA data yet or genuinely
// zero on-time deliveries — neither belongs in a motivation blast), and copy
// a Odia-flavoured message to the clipboard so admin can paste it into the
// partners' group chat.
function copyEtaRanking(root) {
  const monthStart = startOfCurrentMonth(new Date());
  const cards = Array.from(root.querySelectorAll('.staff-card[data-uid]'));
  const rows = [];
  // Running tally of deliveries made this month across every partner —
  // feeds the dynamic "minimum orders" threshold for bonus eligibility.
  let totalDeliveriesThisMonth = 0;
  for (const card of cards) {
    const uid = card.dataset.uid;
    const name = card.querySelector('.ec-title')?.childNodes[0]?.nodeValue?.trim() || uid;
    const mine = staffOrdersFor(uid);
    let onTimeN = 0, onTimeD = 0, monthDeliveries = 0;
    for (const o of mine) {
      const d = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
      if (!d || d < monthStart) continue;
      totalDeliveriesThisMonth++;
      monthDeliveries++;
      const flag = isOnTime(o);
      if (flag === null) continue;
      onTimeD++;
      if (flag) onTimeN++;
    }
    if (onTimeD === 0) continue;
    const pct = Math.round((onTimeN / onTimeD) * 100);
    if (pct <= 0) continue;
    rows.push({ name, pct, onTimeN, onTimeD, monthDeliveries });
  }
  // Dynamic bonus threshold: average deliveries per partner if the work
  // were spread across everyone except one (the admin's rule — carve out
  // one slot so the bar sits a bit above the "fair share"). Rounded up so
  // the message never understates the target. Falls back to the prior
  // fixed 30 when we can't compute a sensible average (≤ 1 partner, or
  // nothing delivered yet this month).
  const partnerCount = cards.length;
  const divisor = partnerCount - 1;
  const minOrders = (divisor > 0 && totalDeliveriesThisMonth > 0)
    ? Math.ceil(totalDeliveriesThisMonth / divisor)
    : 30;
  if (!rows.length) {
    Swal.fire({
      icon: 'info',
      title: 'No ETA data',
      text: 'No partner has an ETA % above 0% this month yet.',
      confirmButtonColor: '#FF6B35',
    });
    return;
  }
  rows.sort((a, b) => b.pct - a.pct);

  // Odia motivation lines — tuned to the ≥70% bonus threshold the admin
  // mentioned when asking for this feature. A partner clears the bar only
  // when their ETA % AND their month-to-date delivery count both qualify;
  // high ETA on thin volume gets a separate "pick up more orders" nudge so
  // the message stays consistent with the "Minimum N orders" header.
  // Per-partner delivery counts are confidential and must not leak into
  // the group message — we only use the count to pick the right tone.
  const noteFor = (pct, monthDeliveries) => {
    const volumeShort = monthDeliveries < minOrders;
    if (pct >= 70 && volumeShort) {
      return '📦 ETA ବଢ଼ିଆ, କିନ୍ତୁ orders ଟିକେ କମ୍ — ଆଉ କିଛି order ନେଲେ bonus pakka!';
    }
    if (pct >= 90) return '🏆 ବହୁତ ବଢ଼ିଆ! Bonus pakka — keep flying!';
    if (pct >= 70) return '🎁 Bonus eligible — ବଢ଼ିଆ କାମ, ଏମିତି ଜାରି ରଖନ୍ତୁ!';
    if (pct >= 50) return '⏱️ Target 70%+ — ଆଉ ଟିକେ ଚେଷ୍ଟା କଲେ bonus ଆପଣଙ୍କର!';
    return '🚀 Push harder — ଆପଣ ପାରିବେ, bonus ଅପେକ୍ଷା କରୁଛି!';
  };

  const header = [
    '🏍️ BankiBites — Delivery Partner ETA ranking',
    `\nBonus unlock: ETA ≥ 70% (Minimum ${minOrders} orders)🎁\n`,
    '',
  ].join('\n');
  const body = rows.map((r, i) => {
    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i + 1}. `;
    return `${medal}${r.name} — ${r.pct}%\n   ${noteFor(r.pct, r.monthDeliveries)}`;
  }).join('\n\n');
  const footer = '\n\n_Team BankiBites 💚_';
  const text = header + body + footer;

  // Copy to clipboard synchronously via execCommand (modern async clipboard
  // API loses the race with window.location.href on mobile), then open the
  // delivery-partners WhatsApp group. chat.whatsapp.com URLs can't carry a
  // prefilled ?text= payload — so admin pastes once inside the group.
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0';
  ta.style.width = '1px'; ta.style.height = '1px';
  ta.style.opacity = '0'; ta.style.pointerEvents = 'none';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  try { document.execCommand('copy'); } catch (e) {}
  document.body.removeChild(ta);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch (e) {}

  window.location.href = 'https://chat.whatsapp.com/JVivP6n7w7D5xYkH29J9oL';
}

function staffOrdersFor(uid) {
  const restaurantOrders = (_staffOrdersCache || [])
    .filter(o => o.delivery_staff_id === uid && isDelivered(o) && o.payout_applicable !== false);
  const groceryRunOrders = (_staffRunsCache || [])
    .filter(r => r.partner_uid === uid)
    .map(runToSyntheticOrder);
  return [...restaurantOrders, ...groceryRunOrders];
}

function renderCard(db, root, uid, s) {
  const el = document.createElement('div');
  el.className = 'entity-card staff-card';
  el.dataset.uid = uid;
  const phoneClean = String(s.phone || '').replace(/[\s\-()+]/g, '');
  const callable = /^\d{10,12}$/.test(phoneClean);
  const telHref = callable ? `tel:${phoneClean}` : '';
  const callBtn = callable
    ? `<a class="icon-btn icon-btn--success" href="${telHref}" data-act="call" title="Call ${escapeAttr(s.name)}" aria-label="Call ${escapeAttr(s.name)}"><i class="fas fa-phone"></i></a>`
    : `<button class="icon-btn icon-btn--secondary" data-act="call" disabled title="No phone on file"><i class="fas fa-phone-slash"></i></button>`;

  let mine = staffOrdersFor(uid);
  const earned  = mine.reduce((sum, o) => sum + feeForOrder(o, _staffFeeRules), 0);
  const paid    = mine.filter(isPayoutPaid).reduce((sum, o) => sum + feeForOrder(o, _staffFeeRules), 0);
  const pending = earned - paid;

  // On-time % for the current calendar month — mirrors the formula in
  // /banki-bites/delivery/app.js (renderEarnings). Denominator = deliveries
  // this month that have both `eta` and `delivered_at` recorded; isOnTime
  // returns null otherwise, which keeps synthetic grocery-run rows out of
  // the ratio automatically.
  const monthStartForOT = startOfCurrentMonth(new Date());
  let onTimeN = 0, onTimeD = 0;
  for (const o of mine) {
    const d = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
    if (!d || d < monthStartForOT) continue;
    const flag = isOnTime(o);
    if (flag === null) continue;
    onTimeD++;
    if (flag) onTimeN++;
  }
  const onTimePct = onTimeD > 0 ? Math.round((onTimeN / onTimeD) * 100) : null;
  const onTimeChipMod = onTimePct === null
    ? ''
    : onTimePct >= 90 ? 'payout-chip--ok'
    : onTimePct >= 75 ? 'payout-chip--warn'
    : 'payout-chip--danger';
  const onTimeChip = `<div class="payout-chip ${onTimeChipMod}" title="${onTimePct === null ? 'No ETA data this month' : `${onTimeN} of ${onTimeD} deliveries on-time this month`}"><i class="fas fa-stopwatch"></i> On-time ${onTimePct === null ? '—' : onTimePct + '%'}${onTimeD > 0 ? ` <span class="payout-chip-sub">(${onTimeN}/${onTimeD})</span>` : ''}</div>`;

  // Straight-line projection of month-to-date earnings to a full-month
  // estimate. Uses delivered_at (falls back to created_at) so the run rate
  // reflects when the partner was actually paid for the drop, not when the
  // order landed.
  const now = new Date();
  const monthStart = startOfCurrentMonth(now);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max((now.getTime() - monthStart.getTime()) / 86400000, 1);
  const mtdEarned = mine.reduce((sum, o) => {
    const d = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
    return d && d >= monthStart ? sum + feeForOrder(o, _staffFeeRules) : sum;
  }, 0);
  const projectedMonthly = Math.round(mtdEarned * (daysInMonth / daysElapsed));

  // Availability: a partner is "online" (available to receive new orders)
  // when is_online !== false. Missing field = treated as online so legacy
  // staff docs don't suddenly disappear from the assignment dropdown.
  const isOnline = s.is_online !== false;
  const availBadge = s.is_active === false
    ? '<span class="status-pill status-cancelled">Inactive</span>'
    : `<span class="status-pill ${isOnline ? 'status-delivered' : 'status-cancelled'}" title="${isOnline ? 'Available for new deliveries' : 'Not accepting new deliveries'}"><i class="fas fa-circle" style="font-size:0.55rem;vertical-align:middle"></i> ${isOnline ? 'Online' : 'Offline'}</span>`;

  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">${escapeHtml(s.name)} ${availBadge}</div>
        <div class="ec-meta"><i class="fas fa-envelope"></i> ${escapeHtml(s.email||'')}</div>
        <div class="ec-meta"><i class="fas fa-phone"></i> ${escapeHtml(s.phone||'—')}</div>
        <label class="toggle staff-availability-toggle" title="Admin override: toggle this partner's availability">
          <input type="checkbox" data-act="toggleOnline" ${isOnline ? 'checked' : ''} ${s.is_active === false ? 'disabled' : ''}>
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          <span class="toggle-text">
            <span class="toggle-on">Available</span>
            <span class="toggle-off">Unavailable</span>
          </span>
        </label>
      </div>
      <button class="icon-btn icon-btn--secondary" data-act="edit" title="Edit ${escapeAttr(s.name)}" aria-label="Edit ${escapeAttr(s.name)}">
        <i class="fas fa-pen"></i>
      </button>
    </div>
    <div class="payout-summary">
      <div class="payout-chip"><i class="fas fa-motorcycle"></i> ${mine.length} delivered</div>
      <div class="payout-chip"><i class="fas fa-coins"></i> Earned ${fmtINR(earned)}</div>
      <div class="payout-chip payout-chip--ok"><i class="fas fa-circle-check"></i> Paid ${fmtINR(paid)}</div>
      <div class="payout-chip payout-chip--warn"><i class="fas fa-hourglass-half"></i> Pending ${fmtINR(pending)}</div>
      <div class="payout-chip payout-chip--projection" title="Straight-line projection of this month's earnings at the current run rate"><i class="fas fa-chart-line"></i> Projected ${fmtINR(projectedMonthly)} <span class="payout-chip-sub">/ month</span></div>
      ${onTimeChip}
    </div>
    <details class="payouts-block">
      <summary><i class="fas fa-list-check"></i> Earnings &amp; Payouts</summary>
      <div class="payouts-body">
        <div class="payouts-toolbar">
          <label class="toggle-inline"><input type="checkbox" data-act="onlyPending" checked> Only pending</label>
          <span class="payout-selected-total" data-el="selectedTotal" hidden><i class="fas fa-coins"></i> Selected: <strong data-el="selectedAmount">₹0</strong></span>
          <button class="btn btn-sm btn-pay" data-act="markPaid"><i class="fas fa-check-circle mr-1"></i>Mark selected as paid</button>
          <button class="btn btn-sm btn-pay-all" data-act="markAllPending"><i class="fas fa-check-double mr-1"></i>Mark all pending</button>
        </div>
        <div class="payouts-list" data-el="payouts"></div>
      </div>
    </details>
    <details class="payouts-block payout-history-block">
      <summary><i class="fas fa-clock-rotate-left"></i> Payout history</summary>
      <div class="payouts-body">
        <div class="payout-history-list" data-el="history"></div>
      </div>
    </details>
    <div class="ec-actions ec-actions--bottom">
      ${callBtn}
      <button class="icon-btn icon-btn--danger" data-act="del" title="Remove ${escapeAttr(s.name)}" aria-label="Remove ${escapeAttr(s.name)}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(db, { uid, ...s }, root));
  // Admin override for partner availability. Writing from admin is identical
  // to the partner writing it from the delivery app — same field, same doc.
  const availInput = el.querySelector('[data-act="toggleOnline"]');
  if (availInput) {
    availInput.addEventListener('change', async () => {
      const goingOffline = !availInput.checked;
      if (goingOffline) {
        const ok = await Swal.fire({
          title: `Take ${s.name} offline?`,
          text: 'They will stop receiving new delivery assignments until marked available again.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, take offline',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#dc3545',
        });
        if (!ok.isConfirmed) { availInput.checked = true; return; }
      }
      try {
        window.bbBusy(goingOffline ? 'Taking offline…' : 'Marking online…');
        await updateDoc(doc(db, COL.STAFF, uid), { is_online: !goingOffline });
        invalidateCache('staff:all');
      } catch (err) {
        availInput.checked = !goingOffline;
        Swal.fire({ icon: 'error', title: 'Could not update', text: err.message });
      } finally {
        window.bbDone();
      }
      loadStaff(db, root, { force: true });
    });
  }
  el.querySelector('[data-act="del"]').addEventListener('click', async () => {
    const ok = await Swal.fire({ title: `Remove ${s.name}?`, text: 'This only removes the directory entry; delete the Auth user separately in Firebase Console.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc3545' });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Removing…');
      await deleteDoc(doc(db, COL.STAFF, uid));
      invalidateCache('staff:all');
    } finally {
      window.bbDone();
    }
    loadStaff(db, root, { force: true });
  });

  const payoutsEl = el.querySelector('[data-el="payouts"]');
  const onlyPendingChk = el.querySelector('[data-act="onlyPending"]');
  function renderPayoutRows() {
    const onlyPending = onlyPendingChk.checked;
    const rows = mine
      .filter(o => !onlyPending || !isPayoutPaid(o))
      .sort((a, b) => (b.delivered_at?.toMillis?.() || 0) - (a.delivered_at?.toMillis?.() || 0));
    if (!rows.length) {
      payoutsEl.innerHTML = `<p class="text-muted small mb-0">${onlyPending ? 'No pending payouts.' : 'No deliveries yet.'}</p>`;
      return;
    }
    payoutsEl.innerHTML = rows.map(o => {
      const fee = feeForOrder(o, _staffFeeRules);
      const when = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
      const whenTxt = when ? when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      const cust = o.customer?.name || o.customer?.phone || '—';
      const farTag = isFarPlace(o, _staffFeeRules) ? '<span class="tag tag-far">far</span>' : '<span class="tag tag-near">near</span>';
      return `
        <label class="payout-row ${isPayoutPaid(o) ? 'is-paid' : 'is-pending'}">
          <input type="checkbox" data-order="${o.id}" data-fee="${fee}" ${isPayoutPaid(o) ? 'checked disabled' : ''}>
          <div class="payout-row-main">
            <div class="payout-row-title" title="${escapeHtml(o.restaurant_name || o.restaurant_id || '—')}">${escapeHtml(truncateName(o.restaurant_name || o.restaurant_id || '—'))} · ${escapeHtml(cust)}</div>
            <div class="payout-row-meta">${escapeHtml(whenTxt)} ${farTag}</div>
          </div>
          <div class="payout-row-fee">${fmtINR(fee)}</div>
        </label>
      `;
    }).join('');
    updateSelectedTotal();
  }
  const selectedTotalEl = el.querySelector('[data-el="selectedTotal"]');
  const selectedAmountEl = el.querySelector('[data-el="selectedAmount"]');
  function updateSelectedTotal() {
    const checked = [...payoutsEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')];
    const sum = checked.reduce((s, c) => s + (Number(c.dataset.fee) || 0), 0);
    if (selectedAmountEl) selectedAmountEl.textContent = `${fmtINR(sum)} (${checked.length})`;
    if (selectedTotalEl) selectedTotalEl.hidden = checked.length === 0;
  }
  payoutsEl.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"][data-order]')) updateSelectedTotal();
  });
  renderPayoutRows();
  onlyPendingChk.addEventListener('change', renderPayoutRows);

  const historyEl = el.querySelector('[data-el="history"]');
  function renderPayoutHistory() {
    const paidOrders = mine.filter(isPayoutPaid);
    if (!paidOrders.length) {
      historyEl.innerHTML = `<p class="text-muted small mb-0">No payouts settled yet.</p>`;
      return;
    }
    const byDay = new Map();
    for (const o of paidOrders) {
      const when = toDateSafe(o.payout_paid_at) || toDateSafe(o.delivered_at);
      const key = when ? when.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' }) : 'Unknown';
      const sortKey = when ? when.getTime() : 0;
      if (!byDay.has(key)) byDay.set(key, { label: key, sortKey, orders: [], total: 0 });
      const g = byDay.get(key);
      g.orders.push(o);
      g.total += feeForOrder(o, _staffFeeRules);
      if (sortKey > g.sortKey) g.sortKey = sortKey;
    }
    const groups = [...byDay.values()].sort((a, b) => b.sortKey - a.sortKey);
    historyEl.innerHTML = groups.map(g => {
      const rows = g.orders
        .sort((a, b) => {
          const ta = (toDateSafe(b.delivered_at) || toDateSafe(b.created_at) || toDateSafe(b.payout_paid_at))?.getTime() || 0;
          const tb = (toDateSafe(a.delivered_at) || toDateSafe(a.created_at) || toDateSafe(a.payout_paid_at))?.getTime() || 0;
          return ta - tb;
        })
        .map(o => {
          const fee = feeForOrder(o, _staffFeeRules);
          const when = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
          const whenTxt = when ? when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
          const cust = o.customer?.name || o.customer?.phone || '—';
          const farTag = isFarPlace(o, _staffFeeRules) ? '<span class="tag tag-far">far</span>' : '<span class="tag tag-near">near</span>';
          return `
            <div class="payout-history-row">
              <div class="payout-row-main">
                <div class="payout-row-title" title="${escapeHtml(o.restaurant_name || o.restaurant_id || '—')}">${escapeHtml(truncateName(o.restaurant_name || o.restaurant_id || '—'))} · ${escapeHtml(cust)}</div>
                <div class="payout-row-meta">${escapeHtml(whenTxt)} ${farTag}</div>
              </div>
              <div class="payout-row-fee">${fmtINR(fee)}</div>
            </div>
          `;
        }).join('');
      return `
        <details class="payout-history-group">
          <summary>
            <span class="payout-history-date"><i class="fas fa-calendar-day"></i> ${escapeHtml(g.label)}</span>
            <span class="payout-history-summary">
              <span class="payout-history-count">${g.orders.length} order${g.orders.length === 1 ? '' : 's'}</span>
              <span class="payout-history-total">${fmtINR(g.total)}</span>
            </span>
          </summary>
          <div class="payout-history-orders">${rows}</div>
        </details>
      `;
    }).join('');
  }
  renderPayoutHistory();

  // Per-partner realtime refetch — when the admin expands the Earnings &
  // Payouts details for this partner, pull their fresh orders from
  // Firestore so the payout list reflects any writes made since the
  // dashboard cache was last filled. Guarded three ways against burning
  // read quota:
  //   1. `fetchedFresh` — single fetch per card lifetime (open/close
  //      within same card does nothing after first open).
  //   2. `_perPartnerPayoutsCache` with a 10-min TTL — repeated expansions
  //      across staff-tab remounts reuse cached rows, no Firestore read.
  //   3. Both queries carry an explicit `limit()` — a prolific partner
  //      with months of history can't accidentally pull thousands of docs.
  const payoutsDetails = el.querySelector('details.payouts-block');
  if (payoutsDetails) {
    let fetchedFresh = false;
    payoutsDetails.addEventListener('toggle', async () => {
      if (!payoutsDetails.open || fetchedFresh) return;
      fetchedFresh = true;
      // Session cache hit — reuse within TTL, zero Firestore reads.
      const cached = _perPartnerPayoutsCache.get(uid);
      if (cached && (Date.now() - cached.t) < PER_PARTNER_CACHE_TTL_MS) {
        mine = cached.mine;
        renderPayoutRows();
        renderPayoutHistory();
        return;
      }
      try {
        const sinceTs = Timestamp.fromMillis(Date.now() - (DASHBOARD_FETCH_WINDOW_DAYS || 60) * 86400000);
        const [ordersSnap, runsSnap] = await Promise.all([
          getDocs(query(
            collection(db, COL.ORDERS),
            where('delivery_staff_id', '==', uid),
            where('created_at', '>=', sinceTs),
            orderBy('created_at', 'desc'),
            limit(PER_PARTNER_ORDERS_LIMIT),
          )),
          // No orderBy on delivery_runs — avoids forcing a new composite
          // index on (partner_uid, status, created_at). The limit just caps
          // the worst case; row order is reconciled client-side after merge.
          getDocs(query(
            collection(db, COL.DELIVERY_RUNS),
            where('partner_uid', '==', uid),
            where('status', '==', 'completed'),
            where('created_at', '>=', sinceTs),
            limit(PER_PARTNER_RUNS_LIMIT),
          )),
        ]);
        const freshOrders = [];
        ordersSnap.forEach(d => {
          const o = { id: d.id, ...d.data() };
          if (isDelivered(o) && o.payout_applicable !== false) freshOrders.push(o);
        });
        const freshRuns = [];
        runsSnap.forEach(d => freshRuns.push(runToSyntheticOrder({ id: d.id, ...d.data() })));
        mine = [...freshOrders, ...freshRuns];
        _perPartnerPayoutsCache.set(uid, { t: Date.now(), mine });
        renderPayoutRows();
        renderPayoutHistory();
      } catch (err) {
        // Fetch failed — allow a retry on the next expansion.
        fetchedFresh = false;
        console.warn('[staff] realtime payouts refetch failed:', err.message);
      }
    });
  }

  el.querySelector('[data-act="markAllPending"]').addEventListener('click', () => {
    // Just ticks every visible pending checkbox so the admin can review the
    // selection (and its total) before hitting "Mark selected as paid". Does
    // NOT trigger the paid write itself.
    const pending = payoutsEl.querySelectorAll('input[type="checkbox"]:not(:disabled)');
    if (!pending.length) return;
    pending.forEach(c => { c.checked = true; });
    updateSelectedTotal();
  });

  el.querySelector('[data-act="markPaid"]').addEventListener('click', async () => {
    const checked = [...payoutsEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')];
    if (!checked.length) {
      Swal.fire({ icon: 'info', title: 'Nothing selected', text: 'Tick at least one pending order first.' });
      return;
    }
    const ok = await Swal.fire({
      icon: 'question',
      title: `Mark ${checked.length} order${checked.length === 1 ? '' : 's'} as paid?`,
      text: 'This records the courier payout as settled. You cannot undo this from the UI.',
      showCancelButton: true,
      confirmButtonText: 'Mark paid',
      confirmButtonColor: '#16a34a',
    });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Saving payouts…');
      const batch = writeBatch(db);
      const now = Timestamp.now();
      const ids = checked.map(c => c.dataset.order);
      // Split ids by their target collection. Grocery-run synthetic rows are
      // prefixed `run_<runId>` and write to bankibites_delivery_runs; the
      // rest are restaurant order ids in bankibites_orders.
      const runIds = [];
      const orderIds = [];
      for (const id of ids) {
        if (id.startsWith('run_')) runIds.push(id.slice(4));
        else orderIds.push(id);
      }
      for (const id of orderIds) {
        batch.update(doc(db, COL.ORDERS, id), { payout_paid: true, payout_paid_at: now });
      }
      for (const rid of runIds) {
        batch.update(doc(db, COL.DELIVERY_RUNS, rid), { payout_paid: true, payout_paid_at: now });
      }
      await batch.commit();
      window.bbDone();
      // Reflect in local caches so the current tab re-renders without a
      // round-trip. Other tabs pick up via cache invalidation.
      for (const o of _staffOrdersCache) {
        if (orderIds.includes(o.id)) { o.payout_paid = true; o.payout_paid_at = now; }
      }
      for (const r of (_staffRunsCache || [])) {
        if (runIds.includes(r.id)) { r.payout_paid = true; r.payout_paid_at = now; }
      }
      // In-memory caches already patched above; also drop the staff tab's
      // paged caches so the next refreshStaffOrders() path re-reads fresh
      // state from the dashboard cache. We intentionally do NOT touch the
      // shared dashboard cache — the admin's design is that only an
      // explicit Refresh / Share Summary click refetches analytics.
      _staffPagedCache.delete('orders:last60d');
      _staffPagedCache.delete('delivery_runs:completed:last60d');
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
      loadStaff(db, root);
      renderStaffCharts();
    } catch (err) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
  });

  return el;
}

async function openEditor(db, existing, root) {
  const s = existing || { uid: '', name: '', email: '', phone: '', is_active: true };
  const html = `
    <form id="staffForm" class="text-left">
      <div class="form-group">
        <label>Firebase Auth UID ${existing ? '(read-only)' : ''}</label>
        <input class="form-control" name="uid" value="${escapeAttr(s.uid)}" ${existing ? 'readonly' : 'required'}>
        <small class="text-muted">From Firebase Console → Authentication → Users.</small>
      </div>
      <div class="form-group"><label>Name</label><input class="form-control" name="name" value="${escapeAttr(s.name)}" required></div>
      <div class="form-group"><label>Email</label><input class="form-control" type="email" name="email" value="${escapeAttr(s.email)}" required></div>
      <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${escapeAttr(s.phone)}" inputmode="tel"></div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="staffActive" ${s.is_active !== false ? 'checked' : ''}>
        <label class="form-check-label" for="staffActive">Active</label>
      </div>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${s.name}` : 'Add delivery partner',
    html, showCancelButton: true, confirmButtonText: 'Save', width: 500,
    didOpen: () => {
      const phoneInput = document.querySelector('#staffForm [name="phone"]');
      if (phoneInput) {
        const norm = () => { const n = normalisePhone(phoneInput.value); if (n !== phoneInput.value) phoneInput.value = n; };
        phoneInput.addEventListener('blur', norm);
        phoneInput.addEventListener('paste', () => setTimeout(norm, 0));
      }
    },
    preConfirm: () => {
      const f = document.getElementById('staffForm');
      const fd = new FormData(f);
      const data = {
        uid: fd.get('uid').trim(),
        name: fd.get('name').trim(),
        email: fd.get('email').trim(),
        phone: normalisePhone(fd.get('phone')),
        is_active: f.querySelector('#staffActive').checked,
      };
      if (!data.uid || !data.name || !data.email) {
        Swal.showValidationMessage('UID, name and email are required');
        return false;
      }
      return data;
    },
  });
  if (!res.isConfirmed) return;
  const { uid, ...payload } = res.value;
  if (!existing) payload.created_at = Timestamp.now();
  try {
    window.bbBusy('Saving…');
    await setDoc(doc(db, COL.STAFF, uid), payload, { merge: true });
    invalidateCache('staff:all');
  } finally {
    window.bbDone();
  }
  loadStaff(db, root, { force: true });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
