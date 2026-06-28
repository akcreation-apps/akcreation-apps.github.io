import { COL } from '../firebase-config.js';
import {
  collection, getDocs,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  fmtINR, fmtNum, toDateSafe, startOfMonth, bucketByDay, groupBy, topN,
  chartPalette, applyChartGlobalDefaults, wireStatsBlockResize,
} from './analytics.js';

export async function renderDashboard(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-chart-line"></i> Dashboard</h2>
    <div class="kpi-grid" id="kpis">
      ${kpi('bookings-month', 'This-month bookings')}
      ${kpi('trips-month',    'This-month trips')}
      ${kpi('km-month',       'Distance (km)')}
      ${kpi('fuel-month',     'Fuel + misc (₹)')}
    </div>
    <div class="chart-grid">
      <div class="chart-block"><h3>Bookings · last 30 days</h3><div class="chart-canvas-wrap"><canvas id="ch-bk-day"></canvas></div></div>
      <div class="chart-block"><h3>Trips · last 30 days</h3><div class="chart-canvas-wrap"><canvas id="ch-tr-day"></canvas></div></div>
      <div class="chart-block"><h3>Booking status mix</h3><div class="chart-canvas-wrap"><canvas id="ch-bk-status"></canvas></div></div>
      <div class="chart-block"><h3>Fuel type mix</h3><div class="chart-canvas-wrap"><canvas id="ch-fuel"></canvas></div></div>
      <div class="chart-block" style="grid-column:1/-1;"><h3>Top 10 destinations</h3><div class="chart-canvas-wrap" style="height:300px;"><canvas id="ch-dest"></canvas></div></div>
    </div>
  `;

  applyChartGlobalDefaults();

  let bookings = [], trips = [];
  try {
    window.avBusy('Loading analytics…');
    [bookings, trips] = await Promise.all([
      getDocs(collection(db, COL.BOOKINGS)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
      getDocs(collection(db, COL.TRIPS   )).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))),
    ]);
    window.avDone();
  } catch (e) {
    window.avDone();
    panel.innerHTML += `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed: ${e.message}</div>`;
    return;
  }

  const monthStart = startOfMonth();
  const bkThisMonth = bookings.filter(b => {
    const d = toDateSafe(b.createdAt) || (b.date && new Date(b.date));
    return d && d >= monthStart;
  });
  const trThisMonth = trips.filter(t => {
    const d = toDateSafe(t.createdAt) || (t.date && new Date(t.date));
    return d && d >= monthStart;
  });
  const kmMonth   = trThisMonth.reduce((a, t) => a + Number(t.km || 0), 0);
  const fuelMonth = trThisMonth.reduce((a, t) => a + Number((t.fuel && t.fuel.cost) || 0) + Number(t.miscCost || 0), 0);

  setKpi('bookings-month', fmtNum(bkThisMonth.length));
  setKpi('trips-month',    fmtNum(trThisMonth.length));
  setKpi('km-month',       fmtNum(Math.round(kmMonth)));
  setKpi('fuel-month',     fmtINR(fuelMonth));

  const palette = chartPalette();
  const charts = [];

  // Bookings per day
  {
    const b = bucketByDay(bookings, x => toDateSafe(x.createdAt) || (x.date && new Date(x.date)), 30);
    charts.push(new Chart(panel.querySelector('#ch-bk-day'), {
      type: 'bar',
      data: { labels: b.labels, datasets: [{ label: 'Bookings', data: b.data, backgroundColor: palette[0] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    }));
  }
  // Trips per day
  {
    const b = bucketByDay(trips, x => toDateSafe(x.createdAt) || (x.date && new Date(x.date)), 30);
    charts.push(new Chart(panel.querySelector('#ch-tr-day'), {
      type: 'bar',
      data: { labels: b.labels, datasets: [{ label: 'Trips', data: b.data, backgroundColor: palette[1] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } },
    }));
  }
  // Booking status mix
  {
    const byStatus = groupBy(bookings, b => b.status || 'new');
    const labels = [...byStatus.keys()];
    const data = labels.map(k => byStatus.get(k).length);
    charts.push(new Chart(panel.querySelector('#ch-bk-status'), {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: palette }] },
      options: { responsive: true, maintainAspectRatio: false },
    }));
  }
  // Fuel mix
  {
    const byFuel = new Map();
    trips.forEach(t => {
      const k = (t.fuel && t.fuel.type) || 'Unknown';
      byFuel.set(k, (byFuel.get(k) || 0) + 1);
    });
    charts.push(new Chart(panel.querySelector('#ch-fuel'), {
      type: 'doughnut',
      data: {
        labels: [...byFuel.keys()],
        datasets: [{ data: [...byFuel.values()], backgroundColor: palette }],
      },
      options: { responsive: true, maintainAspectRatio: false },
    }));
  }
  // Top destinations (from both bookings and trips)
  {
    const counts = new Map();
    bookings.forEach(b => {
      const k = (b.destination || '').trim();
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    trips.forEach(t => {
      const k = ((t.route && t.route.destination) || '').trim();
      if (!k) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    const top = topN(counts, 10);
    charts.push(new Chart(panel.querySelector('#ch-dest'), {
      type: 'bar',
      data: {
        labels: top.map(x => x[0]),
        datasets: [{ label: 'Mentions', data: top.map(x => x[1]), backgroundColor: palette[2] }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      },
    }));
  }

  wireStatsBlockResize(charts);
}

function kpi(id, label) {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value" id="kpi-${id}">—</div></div>`;
}
function setKpi(id, v) {
  const el = document.getElementById(`kpi-${id}`);
  if (el) el.textContent = v;
}
