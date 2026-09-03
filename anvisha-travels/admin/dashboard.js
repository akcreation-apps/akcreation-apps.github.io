import { COL } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtINR, fmtNum, toDateSafe, startOfDay, startOfMonth, addDays, groupBy, topN,
  chartPalette, applyChartGlobalDefaults, wireStatsBlockResize,
} from './analytics.js';

const RANGE_LS_KEY = 'av_admin_dashboard_range';

function startOfLastMonth(d = new Date()) {
  const x = startOfMonth(d);
  x.setMonth(x.getMonth() - 1);
  return x;
}

// Given a preset (or 'custom' + fromISO/toISO), compute concrete { preset, from, to, label }.
// `to` is exclusive (start of next day) so same-day picks include the whole day.
// `all` yields from=null/to=null so inRange() short-circuits.
function normalizeRange(input) {
  const now = new Date();
  const startOfToday = startOfDay(now);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const preset = input.preset || 'this_month';
  let from, to, label;
  switch (preset) {
    case 'this_month': from = startOfMonth(now);     to = endOfToday;             label = 'This month'; break;
    case 'last_month': from = startOfLastMonth(now); to = startOfMonth(now);      label = 'Last month'; break;
    case 'all':        from = null; to = null; label = 'All time'; break;
    case 'custom': {
      const f = input.fromISO ? new Date(input.fromISO) : startOfMonth(now);
      const t = input.toISO   ? new Date(input.toISO)   : startOfToday;
      from = startOfDay(f);
      to   = new Date(startOfDay(t).getTime() + 86400000);
      label = 'Custom';
      break;
    }
    default: from = startOfMonth(now); to = endOfToday; label = 'This month';
  }
  return { preset, from, to, label };
}

function loadRangeState() {
  try {
    const raw = localStorage.getItem(RANGE_LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.preset) return normalizeRange(p);
    }
  } catch {}
  return normalizeRange({ preset: 'this_month' });
}

function saveRangeState(range) {
  try {
    localStorage.setItem(RANGE_LS_KEY, JSON.stringify({
      preset: range.preset,
      fromISO: range.from ? range.from.toISOString() : null,
      toISO:   range.to   ? range.to.toISOString()   : null,
    }));
  } catch {}
}

export async function renderDashboard(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-chart-line"></i> Dashboard</h2>

    <div class="filter-bar" id="db-range" style="margin-bottom:14px;"></div>

    <h3 class="card-title mb-12" style="margin-top:4px;">Profit &amp; Loss</h3>
    <div class="kpi-grid" id="pnl-kpis">
      ${kpi('revenue',    'Revenue')}
      ${kpi('direct',     'Direct costs (fuel + misc)')}
      ${kpi('expenses',   'Operating expenses')}
      ${kpi('profit',     'Net profit', 'profit-card')}
    </div>

    <h3 class="card-title mb-12" style="margin-top:18px;">Operations</h3>
    <div class="kpi-grid" id="ops-kpis">
      ${kpi('bookings',  'Bookings')}
      ${kpi('completed', 'Completed trips')}
      ${kpi('km',        'Distance (km)')}
      ${kpi('aov',       'Avg fare / trip')}
    </div>

    <h3 class="card-title mb-12" style="margin-top:18px;">Payments</h3>
    <div class="kpi-grid" id="pay-kpis">
      ${kpi('paid',     'Payment received')}
      ${kpi('pending',  'Payment pending', 'pending-card')}
      ${kpi('paid_amt', 'Received (₹)')}
      ${kpi('pending_amt', 'Outstanding (₹)')}
    </div>

    <div class="chart-grid mt-16">
      <div class="chart-block" style="grid-column:1/-1;">
        <h3>P&amp;L by month — last 6 months</h3>
        <div class="chart-canvas-wrap" style="height:280px;"><canvas id="ch-pnl" aria-label="P and L per month bar chart"></canvas></div>
      </div>
      <div class="chart-block" style="grid-column:1/-1;">
        <h3>Monthly growth — this month vs last (day-wise revenue)</h3>
        <div class="chart-canvas-wrap" style="height:280px;"><canvas id="ch-monthly-growth" aria-label="Cumulative revenue this month vs last month"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Expense breakdown</h3>
        <div class="chart-canvas-wrap"><canvas id="ch-exp-mix" aria-label="Expense category breakdown doughnut chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Fuel breakdown</h3>
        <div class="chart-canvas-wrap"><canvas id="ch-fuel-mix" aria-label="Fuel type breakdown doughnut chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Top 10 destinations</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-dest" aria-label="Top destinations horizontal bar chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Driver leaderboard (trips)</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-drivers" aria-label="Driver leaderboard horizontal bar chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Referral by Qty</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-ref-qty" aria-label="Referrals by booking count"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Referral by Value (₹)</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-ref-val" aria-label="Referrals by total fare value"></canvas></div>
      </div>
    </div>
  `;

  applyChartGlobalDefaults();

  // ── Range filter ──
  const state = { range: loadRangeState() };
  const presets = [
    ['this_month', 'This month'],
    ['last_month', 'Last month'],
    ['custom',     'Custom'],
    ['all',        'All time'],
  ];
  const rangeBar = panel.querySelector('#db-range');
  function renderRangeBar() {
    const cur = state.range.preset;
    const chip = (k, l) => `<button type="button" class="filter-chip${k === cur ? ' active' : ''}" data-preset="${k}" aria-pressed="${k === cur}">${l}</button>`;
    const fromISO = state.range.from ? state.range.from.toISOString().slice(0, 10) : '';
    const toISO   = state.range.to   ? new Date(state.range.to.getTime() - 86400000).toISOString().slice(0, 10) : '';
    rangeBar.innerHTML = `
      <div class="filter-bar" style="margin:0;">${presets.map(([k, l]) => chip(k, l)).join('')}</div>
      <div class="filter-custom" ${cur === 'custom' ? '' : 'hidden'} style="margin-top:8px;">
        <label>From <input type="date" id="dbRangeFrom" value="${fromISO}"></label>
        <label>To <input type="date" id="dbRangeTo" value="${toISO}"></label>
      </div>
    `;
  }
  renderRangeBar();
  rangeBar.addEventListener('click', (e) => {
    const b = e.target.closest('.filter-chip');
    if (!b) return;
    const preset = b.dataset.preset;
    if (preset === state.range.preset) return;
    if (preset === 'custom') {
      state.range = normalizeRange({
        preset: 'custom',
        fromISO: state.range.from ? state.range.from.toISOString() : null,
        toISO:   state.range.to   ? new Date(state.range.to.getTime() - 86400000).toISOString() : null,
      });
    } else {
      state.range = normalizeRange({ preset });
    }
    saveRangeState(state.range);
    renderRangeBar();
    compute();
  });
  rangeBar.addEventListener('change', (e) => {
    if (e.target.id !== 'dbRangeFrom' && e.target.id !== 'dbRangeTo') return;
    const f = document.getElementById('dbRangeFrom').value;
    const t = document.getElementById('dbRangeTo').value;
    if (!f || !t) return;
    state.range = normalizeRange({ preset: 'custom', fromISO: f, toISO: t });
    saveRangeState(state.range);
    compute();
  });

  // ── Load everything once ──
  let bookings = [], trips = [], expenses = [];
  try {
    window.avBusy('Loading analytics…');
    [bookings, trips, expenses] = await Promise.all([
      getDocs(collection(db, COL.BOOKINGS)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      getDocs(collection(db, COL.TRIPS   )).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      getDocs(collection(db, COL.EXPENSES)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    ]);
    window.avDone();
  } catch (e) {
    window.avDone();
    panel.innerHTML += `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed: ${e.message}</div>`;
    return;
  }

  const charts = [];
  compute();

  function inRange(rec, dateField) {
    if (state.range.preset === 'all') return true;
    const d = toDateSafe(rec[dateField]) || (rec.date && new Date(rec.date));
    if (!d) return false;
    return d >= state.range.from && d < state.range.to;
  }

  function compute() {
    // Slice everything for the active range.
    const bkInRange = bookings.filter(b => inRange(b, 'completedAt') || inRange(b, 'createdAt'));
    const trInRange = trips.filter(t => inRange(t, 'createdAt'));
    const exInRange = expenses.filter(e => inRange(e, 'date'));

    // ── Revenue: fare from completed bookings ──
    const completedBookings = bookings.filter(b => (b.status === 'completed') && (inRange(b, 'completedAt') || inRange(b, 'createdAt')));
    const revenue = completedBookings.reduce((a, b) => a + Number(b.fare || 0), 0);

    // ── Direct costs: fuel from bookings + misc from trips ──
    const fuelCost = bkInRange.reduce(
      (a, b) => a + Number((b.fuel && b.fuel.cost) || 0), 0);
    const miscCost = trInRange.reduce(
      (a, t) => a + Number(t.miscCost || 0), 0);
    const direct = fuelCost + miscCost;

    // ── Operating expenses ──
    const opex = exInRange.reduce((a, e) => a + Number(e.amount || 0), 0);

    const profit = revenue - direct - opex;
    const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;

    setKpi('revenue',  fmtINR(revenue));
    setKpi('direct',   fmtINR(direct));
    setKpi('expenses', fmtINR(opex));
    setKpi('profit',   fmtINR(profit), margin == null ? '' : `${margin}% margin`);
    // Color the profit card by sign
    const pc = document.getElementById('kpi-profit-card');
    if (pc) {
      pc.style.borderColor = profit >= 0 ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)';
      pc.style.background = profit >= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)';
    }

    const km    = trInRange.reduce((a, t) => a + Number(t.km || 0), 0);
    const aov   = completedBookings.length ? Math.round(revenue / completedBookings.length) : 0;
    setKpi('bookings',  fmtNum(bkInRange.length));
    setKpi('completed', fmtNum(completedBookings.length));
    setKpi('km',        fmtNum(Math.round(km)));
    setKpi('aov',       fmtINR(aov));

    // ── Payments ──
    const paidBookings    = completedBookings.filter(b => !!b.paid);
    const pendingBookings = completedBookings.filter(b => !b.paid);
    const paidAmt    = paidBookings.reduce((a, b) => a + Number(b.fare || 0), 0);
    const pendingAmt = pendingBookings.reduce((a, b) => a + Number(b.fare || 0), 0);
    setKpi('paid',        fmtNum(paidBookings.length));
    setKpi('pending',     fmtNum(pendingBookings.length));
    setKpi('paid_amt',    fmtINR(paidAmt));
    setKpi('pending_amt', fmtINR(pendingAmt));
    const pendingCard = document.getElementById('kpi-pending-card');
    if (pendingCard) {
      pendingCard.style.borderColor = pendingBookings.length > 0 ? 'rgba(239,68,68,0.45)' : 'rgba(34,197,94,0.45)';
      pendingCard.style.background  = pendingBookings.length > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)';
    }

    // Clear old charts before re-drawing
    charts.forEach(c => { try { c.destroy(); } catch (_) {} });
    charts.length = 0;

    const palette = chartPalette();

    // ── P&L by month — last 6 calendar months including current ──
    {
      const now = new Date();
      const months = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d);
      }
      const monthLabels = months.map(d => d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));

      function inMonth(d, m) {
        if (!d) return false;
        return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
      }

      const revByMonth = months.map(m =>
        bookings.filter(b => b.status === 'completed').reduce((a, b) => {
          const d = toDateSafe(b.completedAt) || toDateSafe(b.createdAt);
          return inMonth(d, m) ? a + Number(b.fare || 0) : a;
        }, 0)
      );
      const directByMonth = months.map(m => {
        const fuelPart = bookings.reduce((a, b) => {
          const d = toDateSafe(b.completedAt) || toDateSafe(b.createdAt) || (b.date && new Date(b.date));
          if (!inMonth(d, m)) return a;
          return a + Number((b.fuel && b.fuel.cost) || 0);
        }, 0);
        const miscPart = trips.reduce((a, t) => {
          const d = toDateSafe(t.createdAt) || (t.date && new Date(t.date));
          if (!inMonth(d, m)) return a;
          return a + Number(t.miscCost || 0);
        }, 0);
        return fuelPart + miscPart;
      });
      const opexByMonth = months.map(m =>
        expenses.reduce((a, e) => {
          const d = (e.date && new Date(e.date)) || toDateSafe(e.createdAt);
          return inMonth(d, m) ? a + Number(e.amount || 0) : a;
        }, 0)
      );
      const profitByMonth = revByMonth.map((r, i) => r - directByMonth[i] - opexByMonth[i]);

      charts.push(new Chart(panel.querySelector('#ch-pnl'), {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [
            { label: 'Revenue',    data: revByMonth,    backgroundColor: palette[1], borderRadius: 6, stack: 'rev' },
            { label: 'Direct cost', data: directByMonth, backgroundColor: palette[7], borderRadius: 6, stack: 'cost' },
            { label: 'Opex',        data: opexByMonth,   backgroundColor: palette[4], borderRadius: 6, stack: 'cost' },
            { label: 'Net profit',  type: 'line', data: profitByMonth, borderColor: palette[0], backgroundColor: palette[0], tension: 0.35, borderWidth: 2, pointRadius: 3 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { stacked: true },
            y: { stacked: true, beginAtZero: true },
          },
        },
      }));
    }

    // ── Monthly growth: this month vs last (cumulative fare from completed
    //    bookings, indexed by day-of-month). Deliberately ignores the range
    //    picker — it's always a fixed month-over-month comparison, mirroring
    //    the BankiBites admin dashboard chart. ──
    {
      const now = new Date();
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);
      const daysInThisMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

      const cumThis = new Array(daysInThisMonth).fill(0);
      const cumLast = new Array(daysInThisMonth).fill(0);
      for (const b of bookings) {
        if (b.status !== 'completed') continue;
        const t = toDateSafe(b.completedAt) || toDateSafe(b.createdAt);
        if (!t) continue;
        const fare = Number(b.fare || 0);
        if (t >= thisMonthStart && t <= now) {
          cumThis[t.getDate() - 1] += fare;
        } else if (t >= lastMonthStart && t <= lastMonthEnd) {
          const di = t.getDate() - 1;
          if (di < cumLast.length) cumLast[di] += fare;
        }
      }
      for (let i = 1; i < cumThis.length; i++) cumThis[i] += cumThis[i - 1];
      for (let i = 1; i < cumLast.length; i++) cumLast[i] += cumLast[i - 1];

      const todayDom = now.getDate();
      const cumThisDisplay = cumThis.map((v, i) => i < todayDom ? Math.round(v) : null);
      const cumLastDisplay = cumLast.map(v => Math.round(v));

      const thisLabel = thisMonthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const lastLabel = lastMonthStart.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

      charts.push(new Chart(panel.querySelector('#ch-monthly-growth'), {
        type: 'line',
        data: {
          labels: cumThis.map((_, i) => String(i + 1).padStart(2, '0')),
          datasets: [
            { label: `This month · ${thisLabel}`, data: cumThisDisplay, borderColor: palette[0], backgroundColor: palette[0] + '33', fill: false, tension: 0.25, pointRadius: 2, borderWidth: 2 },
            { label: `Last month · ${lastLabel}`, data: cumLastDisplay, borderColor: '#94a3b8',    backgroundColor: 'transparent',   borderDash: [4, 4], fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              mode: 'index',
              intersect: false,
              callbacks: {
                title: ctxs => `Day ${ctxs[0].label}`,
                label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y == null ? '—' : fmtINR(ctx.parsed.y)}`,
                footer: ctxs => {
                  const thisCtx = ctxs.find(c => c.datasetIndex === 0);
                  const lastCtx = ctxs.find(c => c.datasetIndex === 1);
                  const t = thisCtx?.parsed.y, l = lastCtx?.parsed.y;
                  if (t == null || l == null) return '';
                  const diff = t - l;
                  const pct  = l > 0 ? Math.round((diff / l) * 100) : null;
                  const pctText = pct == null ? '' : ` (${diff >= 0 ? '+' : ''}${pct}%)`;
                  return `Δ vs last month: ${diff >= 0 ? '+' : '−'}${fmtINR(Math.abs(diff))}${pctText}`;
                },
              },
            },
          },
          scales: {
            x: { ticks: { autoSkip: true, maxRotation: 0 }, title: { display: true, text: 'Day of month' } },
            y: { beginAtZero: true, ticks: { callback: fmtCompactINR }, title: { display: true, text: 'Cumulative revenue' } },
          },
        },
      }));
    }

    // ── Expense breakdown ──
    {
      const byCat = groupBy(exInRange, e => e.category || 'other');
      const labels = [...byCat.keys()];
      const data = labels.map(k => byCat.get(k).reduce((a, e) => a + Number(e.amount || 0), 0));
      charts.push(new Chart(panel.querySelector('#ch-exp-mix'), {
        type: 'doughnut',
        data: { labels: labels.map(prettify), datasets: [{ data, backgroundColor: palette }] },
        options: { responsive: true, maintainAspectRatio: false },
      }));
    }

    // ── Fuel breakdown (by fuel type, ₹ from bookings in range) ──
    {
      const byType = new Map();
      bkInRange.forEach(b => {
        if (!b.fuel || !b.fuel.cost) return;
        const k = (b.fuel.type || 'Unknown').trim() || 'Unknown';
        byType.set(k, (byType.get(k) || 0) + Number(b.fuel.cost || 0));
      });
      const labels = [...byType.keys()];
      const data   = labels.map(k => byType.get(k));
      charts.push(new Chart(panel.querySelector('#ch-fuel-mix'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: palette }] },
        options: { responsive: true, maintainAspectRatio: false },
      }));
    }

    // ── Top destinations (from trips only) ──
    {
      const counts = new Map();
      trInRange.forEach(t => {
        const k = ((t.route && t.route.destination) || '').trim();
        if (!k) return;
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const top = topN(counts, 10);
      charts.push(new Chart(panel.querySelector('#ch-dest'), {
        type: 'bar',
        data: {
          labels: top.map(x => x[0]),
          datasets: [{ label: 'Trips', data: top.map(x => x[1]), backgroundColor: palette[2] }],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }));
    }

    // ── Driver leaderboard by trips (source: booking's assigned driver) ──
    {
      const counts = new Map();
      trInRange.forEach(t => {
        const k = (t.bookingDriver && t.bookingDriver.name)
          || (t.driver && t.driver.name)
          || (t.driver && t.driver.uid && t.driver.uid.slice(0, 8))
          || '—';
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const top = topN(counts, 10);
      charts.push(new Chart(panel.querySelector('#ch-drivers'), {
        type: 'bar',
        data: {
          labels: top.map(x => x[0]),
          datasets: [{ label: 'Trips', data: top.map(x => x[1]), backgroundColor: palette[3] }],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }));
    }

    // ── Referral by Qty ──
    {
      const counts = new Map();
      bkInRange.forEach(b => {
        const k = String(b.referral || '').trim();
        if (!k) return;
        counts.set(k, (counts.get(k) || 0) + 1);
      });
      const top = topN(counts, 10);
      charts.push(new Chart(panel.querySelector('#ch-ref-qty'), {
        type: 'bar',
        data: {
          labels: top.map(x => x[0]),
          datasets: [{ label: 'Bookings', data: top.map(x => x[1]), backgroundColor: palette[5] }],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }));
    }

    // ── Referral by Value (₹) ──
    {
      const sums = new Map();
      bkInRange.forEach(b => {
        const k = String(b.referral || '').trim();
        if (!k) return;
        sums.set(k, (sums.get(k) || 0) + Number(b.fare || 0));
      });
      const top = topN(sums, 10);
      charts.push(new Chart(panel.querySelector('#ch-ref-val'), {
        type: 'bar',
        data: {
          labels: top.map(x => x[0]),
          datasets: [{ label: 'Fare ₹', data: top.map(x => x[1]), backgroundColor: palette[6] }],
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
      }));
    }

    wireStatsBlockResize(charts);
  }
}

function kpi(id, label, extraId) {
  return `<div class="kpi" ${extraId ? `id="kpi-${extraId}"` : ''}>
    <div class="kpi-label">${label}</div>
    <div class="kpi-value" id="kpi-${id}">—</div>
    <div class="kpi-sub" id="kpi-${id}-sub"></div>
  </div>`;
}
function setKpi(id, value, sub) {
  const el = document.getElementById(`kpi-${id}`);
  if (el) el.textContent = value;
  const subEl = document.getElementById(`kpi-${id}-sub`);
  if (subEl) subEl.textContent = sub || '';
}
function prettify(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Compact ₹ axis label: 1,00,000 → "₹1L", 12,340 → "₹12.3k", <1000 stays raw.
// Keeps y-axis narrow on phones without truncating tooltip precision.
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
