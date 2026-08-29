import { COL, cachedGetDocs } from '../firebase-config.js';
import {
  collection, query, where, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { isDelivered, fmtINR } from '../analytics.js';

function todayLocalISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayBoundsFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end   = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
  return { start, end };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export async function renderReport(root, db) {
  root.innerHTML = `
    <div class="report-tab">
      <div class="rpt-toolbar report-controls" role="toolbar" aria-label="Report controls">
        <div class="rpt-field">
          <label for="reportDate"><i class="far fa-calendar-alt"></i> Date</label>
          <input type="date" id="reportDate" class="form-control" value="${todayLocalISO()}" max="${todayLocalISO()}">
        </div>
        <div class="rpt-actions">
          <button id="reportRun"   class="btn btn-primary rpt-btn"><i class="fas fa-bolt"></i><span>Generate</span></button>
          <button id="reportPrint" class="btn btn-outline-secondary rpt-btn" disabled><i class="fas fa-print"></i><span>Print</span></button>
          <button id="reportExcel" class="btn btn-outline-success rpt-btn"   disabled><i class="fas fa-file-excel"></i><span>Excel</span></button>
        </div>
      </div>

      <div id="reportOutput" class="report-output">
        <div class="rpt-empty">
          <div class="rpt-empty-icon"><i class="fas fa-clipboard-list"></i></div>
          <h3>Ready when you are</h3>
          <p>Pick a date above and hit <strong>Generate</strong> to build the day's report.</p>
        </div>
      </div>
    </div>
    <style>
      .report-tab {
        color: var(--text);
        --rpt-radius: 14px;
        --rpt-shadow: 0 1px 2px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.06);
      }
      @media (prefers-color-scheme: dark) {
        .report-tab { --rpt-shadow: 0 1px 2px rgba(0,0,0,0.4), 0 4px 14px rgba(0,0,0,0.35); }
      }

      /* Hero */
      .report-tab .rpt-hero {
        border-radius: var(--rpt-radius);
        padding: 20px 22px;
        margin-bottom: 14px;
        background:
          radial-gradient(1200px 300px at -10% -50%, rgba(255,255,255,0.18), transparent 60%),
          radial-gradient(600px 200px at 110% 150%, rgba(255,255,255,0.12), transparent 60%),
          linear-gradient(135deg, var(--brand, #4f46e5) 0%, #7c3aed 60%, #db2777 100%);
        color: #fff;
        box-shadow: var(--rpt-shadow);
      }
      .report-tab .rpt-hero-title { display: flex; align-items: center; gap: 14px; }
      .report-tab .rpt-hero-icon {
        width: 48px; height: 48px; border-radius: 12px;
        background: rgba(255,255,255,0.18);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.5rem;
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.25);
        flex-shrink: 0;
      }
      .report-tab .rpt-hero h2 { margin: 0; color: #fff; font-size: 1.4rem; font-weight: 800; letter-spacing: -0.01em; }
      .report-tab .rpt-hero-sub { margin: 2px 0 0; opacity: 0.88; font-size: 0.9rem; }

      /* Toolbar */
      .report-tab .rpt-toolbar {
        position: sticky; top: 0; z-index: 5;
        display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px;
        padding: 12px; margin-bottom: 14px;
        background: var(--surface);
        border: 1px solid var(--border-soft);
        border-radius: var(--rpt-radius);
        box-shadow: var(--rpt-shadow);
      }
      .report-tab .rpt-field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1 1 180px; }
      .report-tab .rpt-field label {
        margin: 0; font-size: 0.75rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted);
      }
      .report-tab .rpt-field label i { margin-right: 4px; color: var(--brand); }
      .report-tab .rpt-field input[type="date"] {
        height: 42px; border-radius: 10px; border: 1px solid var(--border);
        background: var(--surface); color: var(--text); padding: 0 12px;
      }
      .report-tab .rpt-field input[type="date"]:focus {
        outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px rgba(79,70,229,0.15);
      }
      .report-tab .rpt-actions { display: flex; gap: 8px; flex-wrap: wrap; flex: 1 1 auto; justify-content: flex-end; }
      .report-tab .rpt-btn {
        height: 42px; border-radius: 10px; font-weight: 600;
        display: inline-flex; align-items: center; gap: 8px; padding: 0 16px;
        transition: transform 0.08s ease, box-shadow 0.12s ease;
      }
      .report-tab .rpt-btn:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(15,23,42,0.1); }
      .report-tab .rpt-btn:disabled { opacity: 0.55; cursor: not-allowed; }
      .report-tab .rpt-btn i { font-size: 0.95rem; }

      /* Empty & error states */
      .report-tab .rpt-empty {
        text-align: center; padding: 40px 20px;
        background: var(--surface); border: 1px dashed var(--border);
        border-radius: var(--rpt-radius); color: var(--muted);
      }
      .report-tab .rpt-empty-icon {
        width: 64px; height: 64px; border-radius: 50%; margin: 0 auto 12px;
        background: var(--surface-2); color: var(--brand);
        display: flex; align-items: center; justify-content: center;
        font-size: 1.8rem;
      }
      .report-tab .rpt-empty h3 { margin: 0 0 4px; color: var(--text-strong); font-size: 1.1rem; }
      .report-tab .rpt-empty p { margin: 0; font-size: 0.92rem; }

      /* KPI grid */
      .report-tab .rpt-kpis {
        display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        gap: 12px; margin-bottom: 16px;
      }
      .report-tab .rpt-kpi {
        position: relative; overflow: hidden;
        background: var(--surface); border: 1px solid var(--border-soft);
        border-radius: var(--rpt-radius); padding: 14px 16px;
        box-shadow: var(--rpt-shadow);
        display: flex; flex-direction: column; gap: 4px;
      }
      .report-tab .rpt-kpi::before {
        content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
        background: linear-gradient(180deg, var(--brand), #7c3aed);
      }
      .report-tab .rpt-kpi.is-money::before { background: linear-gradient(180deg, #10b981, #059669); }
      .report-tab .rpt-kpi.is-cost::before  { background: linear-gradient(180deg, #f59e0b, #d97706); }
      .report-tab .rpt-kpi.is-net::before   { background: linear-gradient(180deg, #06b6d4, #0891b2); }
      .report-tab .rpt-kpi.is-warn::before  { background: linear-gradient(180deg, #ef4444, #b91c1c); }
      .report-tab .rpt-kpi-head {
        display: flex; align-items: center; gap: 8px;
        color: var(--muted); font-size: 0.72rem;
        text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;
      }
      .report-tab .rpt-kpi-head i { font-size: 0.85rem; opacity: 0.7; }
      .report-tab .rpt-kpi-val {
        font-size: 1.35rem; font-weight: 800; color: var(--text-strong);
        letter-spacing: -0.01em; line-height: 1.15;
      }
      .report-tab .rpt-kpi-val small { font-size: 0.75rem; font-weight: 500; color: var(--muted); margin-left: 4px; }

      /* Restaurant cards */
      .report-tab .rpt-cards { display: grid; gap: 14px; }
      .report-tab .report-card {
        border: 1px solid var(--border-soft);
        border-radius: var(--rpt-radius);
        padding: 0;
        background: var(--surface);
        color: var(--text);
        box-shadow: var(--rpt-shadow);
        transition: border-color 0.15s ease, transform 0.12s ease;
        overflow: hidden;
      }
      .report-tab .report-card[open] { border-color: var(--brand); }
      .report-tab .report-card > summary {
        cursor: pointer; list-style: none;
        display: flex; align-items: center; justify-content: space-between;
        gap: 12px; flex-wrap: wrap;
        padding: 14px 16px;
        font-weight: 700;
        color: var(--text-strong);
        background: linear-gradient(180deg, var(--surface), var(--surface-2));
      }
      .report-tab .report-card > summary::-webkit-details-marker { display: none; }
      .report-tab .report-card > summary::after {
        content: "\\f078"; font-family: "Font Awesome 6 Free"; font-weight: 900;
        color: var(--muted); font-size: 0.75rem;
        transition: transform 0.2s ease; margin-left: auto;
      }
      .report-tab .report-card[open] > summary::after { transform: rotate(180deg); }
      .report-tab .rest-name {
        display: flex; align-items: center; gap: 10px;
        font-size: 1.05rem; color: var(--text-strong);
        min-width: 0; flex: 1 1 auto;
      }
      .report-tab .rest-name .rest-avatar {
        width: 36px; height: 36px; border-radius: 10px;
        background: linear-gradient(135deg, var(--brand), #7c3aed);
        color: #fff; display: flex; align-items: center; justify-content: center;
        font-size: 0.95rem; flex-shrink: 0;
        box-shadow: 0 2px 6px rgba(79,70,229,0.25);
      }
      .report-tab .rest-name .rest-label {
        display: flex; flex-direction: column; min-width: 0;
      }
      .report-tab .rest-name .rest-label b {
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .report-tab .rest-meta {
        font-weight: 500; font-size: 0.8rem; color: var(--muted);
      }
      .report-tab .rest-delivery {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 999px;
        background: linear-gradient(135deg, rgba(245,158,11,0.15), rgba(217,119,6,0.15));
        color: #d97706; font-weight: 800; font-size: 0.9rem;
        border: 1px solid rgba(245,158,11,0.35);
        white-space: nowrap;
      }
      @media (prefers-color-scheme: dark) {
        .report-tab .rest-delivery { color: #fbbf24; }
      }
      .report-tab .rpt-card-body { padding: 4px 16px 16px; }
      .report-tab table.items-tbl {
        width: 100%; margin-top: 8px; border-collapse: separate; border-spacing: 0;
        color: var(--text); border-radius: 10px; overflow: hidden;
        border: 1px solid var(--border-soft);
      }
      .report-tab table.items-tbl th {
        padding: 10px 12px; text-align: left;
        color: var(--muted); font-weight: 700; font-size: 0.72rem;
        text-transform: uppercase; letter-spacing: 0.06em;
        background: var(--surface-2);
        border-bottom: 1px solid var(--border);
      }
      .report-tab table.items-tbl td {
        padding: 10px 12px; text-align: left; color: var(--text);
        border-bottom: 1px solid var(--border-soft); font-size: 0.92rem;
      }
      .report-tab table.items-tbl tbody tr:last-child td { border-bottom: none; }
      .report-tab table.items-tbl tbody tr:hover td { background: var(--surface-2); }
      .report-tab table.items-tbl th:last-child,
      .report-tab table.items-tbl td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
      .report-tab table.items-tbl td:last-child { font-weight: 700; color: var(--text-strong); }

      .report-tab .rest-footer {
        margin-top: 12px; padding-top: 12px;
        border-top: 1px dashed var(--border);
        display: grid; gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        font-size: 0.85rem; color: var(--muted);
      }
      .report-tab .rest-footer .foot-cell {
        display: flex; flex-direction: column; gap: 2px;
      }
      .report-tab .rest-footer .foot-lbl {
        font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
        color: var(--muted); font-weight: 700;
      }
      .report-tab .rest-footer .foot-val {
        font-weight: 800; color: var(--text-strong); font-size: 1rem;
        font-variant-numeric: tabular-nums;
      }

      /* Mobile */
      @media (max-width: 640px) {
        .report-tab .rpt-hero { padding: 16px; border-radius: 12px; }
        .report-tab .rpt-hero h2 { font-size: 1.2rem; }
        .report-tab .rpt-hero-icon { width: 42px; height: 42px; font-size: 1.25rem; }
        .report-tab .rpt-toolbar { padding: 10px; gap: 10px; }
        .report-tab .rpt-actions { justify-content: stretch; }
        .report-tab .rpt-actions .rpt-btn { flex: 1 1 calc(50% - 4px); justify-content: center; padding: 0 10px; }
        .report-tab .rpt-actions #reportRun { flex-basis: 100%; }
        .report-tab .rpt-kpi-val { font-size: 1.15rem; }
        .report-tab .report-card > summary { padding: 12px; }
        .report-tab .rest-delivery { font-size: 0.82rem; padding: 5px 10px; }
        .report-tab .rpt-card-body { padding: 4px 12px 12px; }
      }
      @media (max-width: 380px) {
        .report-tab .rpt-actions .rpt-btn span { display: none; }
        .report-tab .rpt-actions .rpt-btn { padding: 0; flex-basis: calc(33.33% - 6px); }
      }

      /* Print */
      @media print {
        body * { visibility: hidden !important; }
        #tab-report, #tab-report * { visibility: visible !important; }
        #tab-report { position: absolute; left: 0; top: 0; width: 100%; }
        .report-controls, .tabbar, .topbar, .admin-footer, .report-card > summary::after { display: none !important; }
        .report-tab .rpt-hero {
          background: #4f46e5 !important;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .report-tab .rpt-kpi, .report-tab .report-card,
        .report-tab table.items-tbl th, .report-tab .rest-footer {
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .report-tab .rpt-kpi::before,
        .report-tab .rest-name .rest-avatar,
        .report-tab .rest-delivery {
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .report-tab .report-card { break-inside: avoid; page-break-inside: avoid; box-shadow: none !important; border-color: #999 !important; }
        .report-tab .rpt-kpi { box-shadow: none !important; }
        .report-tab .report-card[open] > summary::after { display: none; }
      }
    </style>
  `;

  const dateInput = root.querySelector('#reportDate');
  const runBtn    = root.querySelector('#reportRun');
  const printBtn  = root.querySelector('#reportPrint');
  const excelBtn  = root.querySelector('#reportExcel');
  const out       = root.querySelector('#reportOutput');

  let lastReport = null;

  runBtn.addEventListener('click', async () => {
    lastReport = await generate(db, dateInput.value, out, printBtn, excelBtn);
  });
  printBtn.addEventListener('click', () => window.print());
  excelBtn.addEventListener('click', () => { if (lastReport) exportExcel(lastReport); });
}

async function generate(db, iso, out, printBtn, excelBtn) {
  if (!iso) {
    out.innerHTML = `<p class="text-danger" style="margin:16px 0;">Please pick a date.</p>`;
    printBtn.disabled = true;
    excelBtn.disabled = true;
    return null;
  }
  window.bbBusy?.('Building daily report…');
  try {
    const { start, end } = dayBoundsFromISO(iso);
    // Cache Firestore reads per day so re-clicking Generate on the same date is free.
    // Today keeps a short TTL because new deliveries can still arrive; past days can
    // safely cache for much longer since they're closed books.
    const isToday = iso === todayLocalISO();
    const ttlMs = isToday ? 2 * 60_000 : 60 * 60_000;
    const orders = await cachedGetDocs(
      `report:${iso}`,
      () => query(
        collection(db, COL.ORDERS),
        where('created_at', '>=', Timestamp.fromDate(start)),
        where('created_at', '<',  Timestamp.fromDate(end)),
      ),
      { ttlMs },
    );
    const delivered = orders.filter(isDelivered);

    if (delivered.length === 0) {
      out.innerHTML = `
        <div class="rpt-empty">
          <div class="rpt-empty-icon"><i class="far fa-calendar-times"></i></div>
          <h3>No delivered orders</h3>
          <p>Nothing was delivered on <strong>${esc(iso)}</strong>. Try another date.</p>
        </div>`;
      printBtn.disabled = true;
      excelBtn.disabled = true;
      return null;
    }

    const groups = new Map();
    for (const o of delivered) {
      const key = (o.restaurant_name || o.restaurant_id || 'Unknown').toString().trim() || 'Unknown';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(o);
    }

    let dayGross = 0, dayDiscount = 0, dayDelivery = 0, dayOrders = delivered.length;
    const cards = [];
    const restaurants = [];
    const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [restName, list] of sortedGroups) {
      const items = new Map();
      let gross = 0, discount = 0, delivery = 0;
      for (const o of list) {
        gross    += Number(o.total) || 0;
        discount += Number(o.discount) || 0;
        // Only count delivery cost when the partner-earns toggle is on AND a payout
        // amount has been recorded. Orders with payout_applicable=false, or with no
        // payout_amount set, contribute 0 — no fee-rule fallback.
        if (o.payout_applicable === false) {
          // delivery += 0
        } else if (Number.isFinite(+o.payout_amount)) {
          delivery += +o.payout_amount;
        }
        if (Array.isArray(o.items)) {
          for (const it of o.items) {
            const name = (it?.name || '').trim();
            if (!name) continue;
            const qty = Number(it.qty) || 1;
            items.set(name, (items.get(name) || 0) + qty);
          }
        }
      }
      dayGross    += gross;
      dayDiscount += discount;
      dayDelivery += delivery;

      const sortedItems = [...items.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

      restaurants.push({
        name: restName,
        orders: list.length,
        items: sortedItems,
        gross, discount, delivery,
      });

      const rows = sortedItems
        .map(([name, qty]) => `<tr><td>${esc(name)}</td><td>${qty}</td></tr>`)
        .join('');

      const initial = (restName.trim().charAt(0) || '?').toUpperCase();

      cards.push(`
        <details class="report-card" open>
          <summary>
            <span class="rest-name">
              <span class="rest-avatar" aria-hidden="true">${esc(initial)}</span>
              <span class="rest-label">
                <b>${esc(restName)}</b>
                <span class="rest-meta"><i class="fas fa-receipt"></i> ${list.length} order${list.length === 1 ? '' : 's'}</span>
              </span>
            </span>
            <span class="rest-delivery"><i class="fas fa-motorcycle"></i> ${fmtINR(delivery)}</span>
          </summary>
          <div class="rpt-card-body">
            ${rows
              ? `<table class="items-tbl"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>`
              : `<p class="text-muted" style="margin:10px 0 0;">No line items recorded on these orders.</p>`}
            <div class="rest-footer">
              <div class="foot-cell"><span class="foot-lbl">Gross</span><span class="foot-val">${fmtINR(gross)}</span></div>
              <div class="foot-cell"><span class="foot-lbl">Discount</span><span class="foot-val">${fmtINR(discount)}</span></div>
              <div class="foot-cell"><span class="foot-lbl">Net</span><span class="foot-val">${fmtINR(gross - discount)}</span></div>
              <div class="foot-cell"><span class="foot-lbl">Delivery</span><span class="foot-val">${fmtINR(delivery)}</span></div>
            </div>
          </div>
        </details>
      `);
    }

    const prettyDate = new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });

    out.innerHTML = `
      <div class="rpt-kpis">
        <div class="rpt-kpi">
          <div class="rpt-kpi-head"><i class="far fa-calendar-check"></i> Date</div>
          <div class="rpt-kpi-val">${esc(prettyDate)}</div>
        </div>
        <div class="rpt-kpi">
          <div class="rpt-kpi-head"><i class="fas fa-receipt"></i> Delivered orders</div>
          <div class="rpt-kpi-val">${dayOrders}<small>order${dayOrders === 1 ? '' : 's'}</small></div>
        </div>
        <div class="rpt-kpi">
          <div class="rpt-kpi-head"><i class="fas fa-store"></i> Restaurants</div>
          <div class="rpt-kpi-val">${sortedGroups.length}</div>
        </div>
        <div class="rpt-kpi is-money">
          <div class="rpt-kpi-head"><i class="fas fa-indian-rupee-sign"></i> Gross</div>
          <div class="rpt-kpi-val">${fmtINR(dayGross)}</div>
        </div>
        <div class="rpt-kpi is-warn">
          <div class="rpt-kpi-head"><i class="fas fa-tag"></i> Discount</div>
          <div class="rpt-kpi-val">${fmtINR(dayDiscount)}</div>
        </div>
        <div class="rpt-kpi is-net">
          <div class="rpt-kpi-head"><i class="fas fa-wallet"></i> Net</div>
          <div class="rpt-kpi-val">${fmtINR(dayGross - dayDiscount)}</div>
        </div>
        <div class="rpt-kpi is-cost">
          <div class="rpt-kpi-head"><i class="fas fa-motorcycle"></i> Total delivery cost</div>
          <div class="rpt-kpi-val">${fmtINR(dayDelivery)}</div>
        </div>
      </div>
      <div class="rpt-cards">
        ${cards.join('')}
      </div>
    `;
    printBtn.disabled = false;
    excelBtn.disabled = false;
    return {
      iso, dayOrders, dayGross, dayDiscount, dayDelivery,
      restaurants,
    };
  } catch (e) {
    console.error('[report] generate failed', e);
    out.innerHTML = `<p class="text-danger" style="margin:16px 0;">Failed to build report: ${esc(e.message || e)}</p>`;
    printBtn.disabled = true;
    excelBtn.disabled = true;
    return null;
  } finally {
    window.bbDone?.();
  }
}

function exportExcel(data) {
  // Excel opens .xls when the payload is an HTML table with the ms-excel MIME.
  // This avoids pulling in a heavy SheetJS dependency for a single-sheet export.
  const rows = [];
  const money = n => (Number(n) || 0).toFixed(2);

  rows.push(`<tr><th colspan="2" style="font-size:14pt;background:#4f46e5;color:#fff;">BankiBites — Daily Report</th></tr>`);
  rows.push(`<tr><td><b>Date</b></td><td>${esc(data.iso)}</td></tr>`);
  rows.push(`<tr><td><b>Delivered orders</b></td><td>${data.dayOrders}</td></tr>`);
  rows.push(`<tr><td><b>Restaurants</b></td><td>${data.restaurants.length}</td></tr>`);
  rows.push(`<tr><td><b>Gross</b></td><td>${money(data.dayGross)}</td></tr>`);
  rows.push(`<tr><td><b>Discount</b></td><td>${money(data.dayDiscount)}</td></tr>`);
  rows.push(`<tr><td><b>Net</b></td><td>${money(data.dayGross - data.dayDiscount)}</td></tr>`);
  rows.push(`<tr><td><b>Total delivery cost</b></td><td>${money(data.dayDelivery)}</td></tr>`);
  rows.push(`<tr><td colspan="2">&nbsp;</td></tr>`);

  for (const r of data.restaurants) {
    rows.push(`<tr><th colspan="2" style="background:#f3f4f6;font-size:12pt;">${esc(r.name)} — ${r.orders} order${r.orders === 1 ? '' : 's'}</th></tr>`);
    rows.push(`<tr><th style="background:#e5e7eb;">Item</th><th style="background:#e5e7eb;">Qty</th></tr>`);
    if (r.items.length === 0) {
      rows.push(`<tr><td colspan="2"><i>No line items recorded</i></td></tr>`);
    } else {
      for (const [name, qty] of r.items) {
        rows.push(`<tr><td>${esc(name)}</td><td>${qty}</td></tr>`);
      }
    }
    rows.push(`<tr><td><b>Gross</b></td><td>${money(r.gross)}</td></tr>`);
    rows.push(`<tr><td><b>Discount</b></td><td>${money(r.discount)}</td></tr>`);
    rows.push(`<tr><td><b>Net</b></td><td>${money(r.gross - r.discount)}</td></tr>`);
    rows.push(`<tr><td><b>Delivery cost</b></td><td>${money(r.delivery)}</td></tr>`);
    rows.push(`<tr><td colspan="2">&nbsp;</td></tr>`);
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Daily Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table border="1" cellspacing="0" cellpadding="4">${rows.join('')}</table></body></html>`;

  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bankibites-daily-report-${data.iso}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
