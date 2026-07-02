import { COL } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtINR, fmtNum, toDateSafe, startOfMonth, addDays, groupBy, topN,
  chartPalette, applyChartGlobalDefaults, wireStatsBlockResize,
} from './analytics.js';

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
      <div class="chart-block">
        <h3>Expense breakdown</h3>
        <div class="chart-canvas-wrap"><canvas id="ch-exp-mix" aria-label="Expense category breakdown doughnut chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Top 10 destinations</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-dest" aria-label="Top destinations horizontal bar chart"></canvas></div>
      </div>
      <div class="chart-block">
        <h3>Driver leaderboard (trips)</h3>
        <div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-drivers" aria-label="Driver leaderboard horizontal bar chart"></canvas></div>
      </div>
    </div>
  `;

  applyChartGlobalDefaults();

  // ── Range filter ──
  const ranges = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'all',        label: 'All time' },
  ];
  let activeRange = 'this_month';
  const rangeBar = panel.querySelector('#db-range');
  ranges.forEach(rg => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (rg.key === activeRange ? ' active' : '');
    b.textContent = rg.label;
    b.addEventListener('click', () => {
      activeRange = rg.key;
      rangeBar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === b));
      compute();
    });
    rangeBar.appendChild(b);
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
    if (activeRange === 'all') return true;
    const d = toDateSafe(rec[dateField]) || (rec.date && new Date(rec.date));
    if (!d) return false;
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    if (activeRange === 'this_month') return d >= start;
    if (activeRange === 'last_month') return d >= lastStart && d < start;
    return true;
  }

  function compute() {
    // Slice everything for the active range.
    const bkInRange = bookings.filter(b => inRange(b, 'completedAt') || inRange(b, 'createdAt'));
    const trInRange = trips.filter(t => inRange(t, 'createdAt'));
    const exInRange = expenses.filter(e => inRange(e, 'date'));

    // ── Revenue: fare from completed bookings ──
    const completedBookings = bookings.filter(b => (b.status === 'completed') && (inRange(b, 'completedAt') || inRange(b, 'createdAt')));
    const revenue = completedBookings.reduce((a, b) => a + Number(b.fare || 0), 0);

    // ── Direct costs: fuel + misc from trips ──
    const direct = trInRange.reduce(
      (a, t) => a + Number((t.fuel && t.fuel.cost) || 0) + Number(t.miscCost || 0), 0);

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
      const directByMonth = months.map(m =>
        trips.reduce((a, t) => {
          const d = toDateSafe(t.createdAt) || (t.date && new Date(t.date));
          if (!inMonth(d, m)) return a;
          return a + Number((t.fuel && t.fuel.cost) || 0) + Number(t.miscCost || 0);
        }, 0)
      );
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
            { label: 'Revenue',     data: revByMonth,    backgroundColor: palette[1] },
            { label: 'Direct cost', data: directByMonth, backgroundColor: palette[7] },
            { label: 'Opex',        data: opexByMonth,   backgroundColor: palette[4] },
            { label: 'Net profit',  type: 'line', data: profitByMonth, borderColor: palette[0], backgroundColor: palette[0], tension: 0.3, yAxisID: 'y' },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false },
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
