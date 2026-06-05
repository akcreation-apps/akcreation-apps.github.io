import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch, query, where,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, isFarPlace, isDelivered, isPayoutPaid, isPayoutPending,
  toDateSafe, chartPalette, whenChartReady, fmtINR, wireStatsBlockResize, startOfLastMonth,
} from '../analytics.js';

// Note: Creating a Firebase Auth user requires the Admin SDK (server-side) or the
// Firebase console. This screen manages the staff *directory* doc — you must create
// the Auth account in the Firebase console first, then paste the UID here.
// Doc id MUST equal the Firebase Auth UID for security rules to authorise the user.

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
let _staffFeeRules = null;

export async function renderStaff(root, db) {
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
        </div>
      </div>
    </details>

    <div class="section-header section-header--compact section-header--end">
      <button id="addStaffBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add staff</button>
    </div>
    <div class="text-muted mb-2" style="font-size:0.78rem">
      <i class="fas fa-info-circle"></i> Create the Auth account in Firebase Console first, then paste the UID here.
    </div>
    <div id="staffList" class="card-list"><p class="text-muted">Loading…</p></div>
  `;
  document.getElementById('addStaffBtn').addEventListener('click', () => openEditor(db, null, root));
  await whenChartReady();
  wireStatsBlockResize(root.querySelector('.stats-block'));
  _staffFeeRules = await loadFeeRules(db);
  await refreshStaffOrders(db);
  await loadStaff(db, root);
  renderStaffCharts();
}

async function refreshStaffOrders(db) {
  const sinceTs = Timestamp.fromDate(startOfLastMonth());
  const snap = await getDocs(query(collection(db, COL.ORDERS), where('created_at', '>=', sinceTs)));
  _staffOrdersCache = [];
  snap.forEach(d => _staffOrdersCache.push({ id: d.id, ...d.data() }));
}

function renderStaffCharts() {
  const p = chartPalette();
  const orders = _staffOrdersCache || [];
  const rules = _staffFeeRules;
  const byStaff = new Map();
  for (const o of orders) {
    if (!isDelivered(o)) continue;
    const sid = o.delivery_staff_id;
    if (!sid) continue;
    if (!byStaff.has(sid)) byStaff.set(sid, { name: sid, paid: 0, pending: 0, count: 0, far: 0, near: 0 });
    const row = byStaff.get(sid);
    const fee = feeForOrder(o, rules);
    if (isPayoutPaid(o)) row.paid += fee; else row.pending += fee;
    row.count++;
    if (isFarPlace(o, rules)) row.far++; else row.near++;
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
    kpisEl.innerHTML = `
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Deliveries</div><div class="kpi-value">${totalDeliveries}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Paid</div><div class="kpi-value">${fmtINR(totalPaid)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Pending</div><div class="kpi-value">${fmtINR(totalPending)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Total earnings</div><div class="kpi-value">${fmtINR(totalPaid + totalPending)}</div></div>
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
}

async function loadStaff(db, root) {
  const list = root.querySelector('#staffList');
  list.innerHTML = '<p class="text-muted">Loading…</p>';
  const snap = await getDocs(collection(db, COL.STAFF));
  if (snap.empty) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-motorcycle"></i><p>No delivery partners yet.</p></div>`;
    return;
  }
  list.innerHTML = '';
  snap.forEach(d => list.appendChild(renderCard(db, root, d.id, d.data())));
}

function staffOrdersFor(uid) {
  return (_staffOrdersCache || []).filter(o => o.delivery_staff_id === uid && isDelivered(o));
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

  const mine = staffOrdersFor(uid);
  const earned  = mine.reduce((sum, o) => sum + feeForOrder(o, _staffFeeRules), 0);
  const paid    = mine.filter(isPayoutPaid).reduce((sum, o) => sum + feeForOrder(o, _staffFeeRules), 0);
  const pending = earned - paid;

  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">${escapeHtml(s.name)} ${s.is_active === false ? '<span class="status-pill status-cancelled">Inactive</span>' : ''}</div>
        <div class="ec-meta"><i class="fas fa-envelope"></i> ${escapeHtml(s.email||'')}</div>
        <div class="ec-meta"><i class="fas fa-phone"></i> ${escapeHtml(s.phone||'—')}</div>
        <div class="ec-meta" style="font-family:monospace;font-size:0.7rem">${uid}</div>
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
    </div>
    <details class="payouts-block">
      <summary><i class="fas fa-list-check"></i> Earnings &amp; Payouts</summary>
      <div class="payouts-body">
        <div class="payouts-toolbar">
          <label class="toggle-inline"><input type="checkbox" data-act="onlyPending" checked> Only pending</label>
          <button class="btn btn-sm btn-success" data-act="markPaid"><i class="fas fa-check"></i> Mark selected as paid</button>
        </div>
        <div class="payouts-list" data-el="payouts"></div>
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
  el.querySelector('[data-act="del"]').addEventListener('click', async () => {
    const ok = await Swal.fire({ title: `Remove ${s.name}?`, text: 'This only removes the directory entry; delete the Auth user separately in Firebase Console.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc3545' });
    if (!ok.isConfirmed) return;
    await deleteDoc(doc(db, COL.STAFF, uid));
    loadStaff(db, root);
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
          <input type="checkbox" data-order="${o.id}" ${isPayoutPaid(o) ? 'checked disabled' : ''}>
          <div class="payout-row-main">
            <div class="payout-row-title">${escapeHtml(o.restaurant_name || o.restaurant_id || '—')} · ${escapeHtml(cust)}</div>
            <div class="payout-row-meta">${escapeHtml(whenTxt)} ${farTag}</div>
          </div>
          <div class="payout-row-fee">${fmtINR(fee)}</div>
        </label>
      `;
    }).join('');
  }
  renderPayoutRows();
  onlyPendingChk.addEventListener('change', renderPayoutRows);

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
      const batch = writeBatch(db);
      const now = Timestamp.now();
      const ids = checked.map(c => c.dataset.order);
      for (const id of ids) {
        batch.update(doc(db, COL.ORDERS, id), { payout_paid: true, payout_paid_at: now });
      }
      await batch.commit();
      // Reflect in cache and re-render
      for (const o of _staffOrdersCache) {
        if (ids.includes(o.id)) { o.payout_paid = true; o.payout_paid_at = now; }
      }
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
      loadStaff(db, root);
      renderStaffCharts();
    } catch (err) {
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
    preConfirm: () => {
      const f = document.getElementById('staffForm');
      const fd = new FormData(f);
      const data = {
        uid: fd.get('uid').trim(),
        name: fd.get('name').trim(),
        email: fd.get('email').trim(),
        phone: fd.get('phone').trim(),
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
  await setDoc(doc(db, COL.STAFF, uid), payload, { merge: true });
  loadStaff(db, root);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
