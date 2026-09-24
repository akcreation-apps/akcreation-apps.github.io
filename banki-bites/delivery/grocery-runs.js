// Delivery-partner view of BankiMart grocery delivery runs.
// Subscribes to bankibites_delivery_runs where partner_uid == me AND status != 'completed'.
// For each run, fetches its grocery orders and renders per-stop cards.
// Actions: Mark a stop delivered (patches only that grocery order),
// Mark entire run delivered (patches all remaining stops + the run doc).

import { COL } from '../firebase-config.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

let _runsUnsub = null;
let _orderUnsubs = new Map();   // orderId -> unsubscribe fn
let _ordersCache = new Map();   // orderId -> data snapshot
let _lastRuns = [];             // active runs (dispatched only) — drives the Active tab
let _allRuns = [];              // every run for this partner — drives Earnings/History
let _earningsRoot = null;       // #earningsView container while it's mounted
let _rootEl = null;             // #groceryRuns container
let _db = null;
let _view = 'active';           // 'active' | 'delivered' | 'earnings'

export function setGroceryRunsView(view) {
  _view = view || 'active';
  if (_rootEl && _db) repaint(_rootEl, _db);
}

// Number of dispatched-run stops currently on the rider's plate. Used by
// listenOrders() in app.js to decide whether the empty-state message for
// restaurant orders should render — if there are grocery stops visible in
// the Active tab, the "No active deliveries" banner would be misleading.
export function activeGroceryStopCount() {
  return _lastRuns.reduce((s, r) => s + ((r.order_ids || []).length), 0);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const money = n => '₹' + Number(n || 0).toFixed(0);

// Strip the internal "BB N" prefix from customer names so the rider sees
// the real person, not the admin's placeholder tag. Mirrors app.js's
// prettyCustomerName (kept local so we don't have to export it).
//   "BB 3 (Babita)"     → "Babita"
//   "BB Anil (A Kumar)" → "A Kumar"
//   "Anil Kumar"        → "Anil Kumar"
function prettyName(name) {
  const s = String(name || '').trim();
  if (!s) return '';
  if (!/^bb/i.test(s)) return s;
  const m = s.match(/\(([^)]+)\)/);
  return m && m[1].trim() ? m[1].trim() : s;
}

// Fetch each order by id in parallel. Uses single-doc `get` — which the
// grocery-orders Firestore rules allow for anyone with the id — instead of
// a `list` query, which is admin-only. Silently skips missing docs.
async function fetchOrders(db, ids) {
  const out = new Map();
  const results = await Promise.all(
    (ids || []).map(id =>
      getDoc(doc(db, COL.GROCERY_ORDERS, id))
        .then(snap => snap.exists() ? [id, snap.data()] : null)
        .catch(err => { console.warn('[delivery] order fetch failed for', id, err.message); return null; })
    )
  );
  results.forEach(pair => { if (pair) out.set(pair[0], pair[1]); });
  return out;
}

function mapsUrl(order) {
  // Always source directions from the customer record on the order —
  // gps coords when the admin dropped a pin, otherwise the saved address.
  // The order's original `place` (area label the customer picked at cart
  // time) is ignored so the rider is never sent to a stale area label.
  const gps = order.customer?.gps;
  if (gps && Number.isFinite(gps.lat) && Number.isFinite(gps.lng)) {
    return `https://www.google.com/maps?q=${gps.lat},${gps.lng}`;
  }
  const q = order.customer?.address;
  if (!q) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function renderStop(runId, orderId, order, position, isCurrent) {
  const status = order.status || 'assigned';
  const done = status === 'delivered';
  const fee = Number(order.delivery_fee_final ?? order.delivery_fee_estimated ?? 0);
  const total = (Number(order.subtotal) || 0) + fee;
  const collect = (order.collect_amount != null && Number.isFinite(+order.collect_amount))
    ? +order.collect_amount
    : (order.payment_collected ? 0 : total);
  const isPaid = order.payment_collected === true || collect === 0;
  const payChip = isPaid
    ? '<span class="gr-pay gr-pay--paid"><i class="fas fa-circle-check"></i> PAID</span>'
    : `<span class="gr-pay gr-pay--cod"><i class="fas fa-money-bill-wave"></i> ${money(collect)}</span>`;
  const mUrl = mapsUrl(order);
  const itemsCount = (order.items || []).length;
  const address = order.customer?.address || '';
  // Short order id = last 6 characters, uppercased. The rider confirms
  // delivery by matching the customer's copy of this id — so it needs to
  // sit prominently at the top of every stop card.
  const shortId = String(orderId || '').slice(-6).toUpperCase();
  const classes = ['gr-stop'];
  if (done) classes.push('gr-stop--done');
  if (isCurrent && !done) classes.push('gr-stop--next');
  // Once delivered, the row becomes read-only. No call, no map, no delivered
  // button — every action gets stripped so the rider can't accidentally
  // re-open a completed drop or double-tap into cash collection.
  const actionsBlock = done
    ? '<div class="gr-stop-actions gr-stop-actions--done" aria-hidden="true"><i class="fas fa-lock" title="Locked"></i></div>'
    : `<div class="gr-stop-actions">
        ${order.customer?.phone
          ? `<a class="icon-action call-btn" href="tel:${esc(order.customer.phone)}" aria-label="Call customer" title="Call"><i class="fas fa-phone" aria-hidden="true"></i></a>`
          : ''}
        ${mUrl
          ? `<a class="icon-action map-btn" href="${esc(mUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Directions" title="Directions"><i class="fas fa-map-location-dot" aria-hidden="true"></i></a>`
          : ''}
        <button class="icon-action deliver-btn" data-act="deliverStop" data-run="${esc(runId)}" data-order="${esc(orderId)}" aria-label="Mark delivered" title="Mark delivered"><i class="fas fa-check" aria-hidden="true"></i></button>
      </div>`;
  return `
    <div class="${classes.join(' ')}" data-stop="${esc(orderId)}">
      <div class="gr-stop-num">${done ? '<i class="fas fa-check"></i>' : position}</div>
      <div class="gr-stop-body">
        <div class="gr-stop-id">Order #${esc(shortId)}${isCurrent && !done ? ' <span class="gr-next-chip">NEXT</span>' : ''}</div>
        <div class="gr-stop-name">${esc(prettyName(order.customer?.name) || 'Customer')}</div>
        ${address ? `<div class="gr-stop-addr">${esc(address)}</div>` : ''}
        <div class="gr-stop-meta">
          <span>${itemsCount} item${itemsCount === 1 ? '' : 's'} · ${money(total)}</span>
          ${payChip}
        </div>
        <div class="gr-stop-footer">${actionsBlock}</div>
      </div>
    </div>`;
}

function renderRun(root, db, run) {
  const ids = run.order_ids || [];
  // The "current" stop is the first non-delivered one in the sequence — this
  // is what the boy should be working on right now.
  const currentIdx = ids.findIndex(id => (_ordersCache.get(id)?.status !== 'delivered'));
  const stops = ids.map((id, i) =>
    renderStop(run.id, id, _ordersCache.get(id) || {}, i + 1, i === currentIdx)
  ).join('');
  const pending = ids.filter(id => (_ordersCache.get(id)?.status !== 'delivered')).length;
  const total = ids.length;
  const dateLabel = fmtRunDay(run.run_date);
  const notes = String(run.notes || '').trim();
  // No "Complete run" button — the last stop's ✓ Delivered auto-completes
  // the run. Bulk-completing without per-stop confirmation would skip cash
  // collection and let a rider close out orders they never actually delivered.
  return `
    <div class="gr-run" data-run="${esc(run.id)}">
      <div class="gr-run-head">
        <div class="gr-run-title"><i class="fas fa-basket-shopping"></i> ${esc(dateLabel)}</div>
        <div class="gr-run-stat">${total - pending}<span class="gr-run-stat-sep">/</span>${total}</div>
      </div>
      ${notes ? `<div class="gr-run-notes"><i class="fas fa-note-sticky"></i> ${esc(notes)}</div>` : ''}
      <div class="gr-run-stops">${stops}</div>
    </div>`;
}

function fmtRunDay(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}

async function deliverStop(db, runId, orderId) {
  const order = _ordersCache.get(orderId) || {};
  const name = prettyName(order.customer?.name) || 'this customer';
  const collect = Number(order.collect_amount) || 0;
  const collectLine = collect > 0
    ? `<div style="margin-top:.5rem;padding:.5rem;background:#fef3c7;color:#92400e;border-radius:8px;font-weight:600">
         Collect <strong>${money(collect)}</strong> from the customer before confirming.
       </div>`
    : `<div style="margin-top:.5rem;padding:.5rem;background:#dcfce7;color:#166534;border-radius:8px">
         Already fully paid — no cash to collect.
       </div>`;
  const shortId = String(orderId || '').slice(-6).toUpperCase();
  const ok = await Swal.fire({
    title: `Delivered to ${name}?`,
    html: `
      <div style="font-size:1.1rem;margin-bottom:.35rem">
        Confirm order <strong>#${shortId}</strong> matches the customer's copy.
      </div>
      ${collectLine}
    `,
    icon: 'question', showCancelButton: true, confirmButtonText: 'Yes, delivered',
    cancelButtonText: 'Not yet',
    confirmButtonColor: '#16a34a',
  });
  if (!ok.isConfirmed) return;
  try {
    window.bbBusy('Updating…');
    const patch = { status: 'delivered', delivered_at: Timestamp.now() };
    if (collect > 0) {
      patch.payment_collected = true;
      patch.collect_amount = 0;
      patch.paid_at = Timestamp.now();
      if (!order.payment_method) patch.payment_method = 'cash';
    }
    await updateDoc(doc(db, COL.GROCERY_ORDERS, orderId), patch);

    // Auto-complete the run when every stop is now delivered. The rider
    // shouldn't have to hit a separate "Complete run" button after the last
    // drop — and admin's Active-runs filter needs the run marked completed
    // to drop it from the visible list.
    const run = _lastRuns.find(r => r.id === runId);
    if (run && run.status !== 'completed') {
      const ids = run.order_ids || [];
      // Merge the just-written status into the cache before the check —
      // the per-order snapshot listener hasn't necessarily fired yet.
      _ordersCache.set(orderId, { ...(order || {}), ...patch });
      const allDelivered = ids.every(id => _ordersCache.get(id)?.status === 'delivered');
      if (allDelivered) {
        // Sum every stop's subtotal + delivery fee so the History card can
        // show the run's true value instead of ₹0. Cache is warm here; no
        // extra reads. If the update permission doesn't allow this field the
        // write still succeeds because the rule keeps to hasOnly(['status',
        // 'completed_at']) — see notes in FIRESTORE_RULES.md.
        let total_value = 0;
        for (const oid of ids) {
          const o = _ordersCache.get(oid) || {};
          const fee = Number(o.delivery_fee_final ?? o.delivery_fee_estimated ?? 0);
          total_value += (Number(o.subtotal) || 0) + (Number.isFinite(fee) ? fee : 0);
        }
        try {
          await updateDoc(doc(db, COL.DELIVERY_RUNS, runId), {
            status: 'completed', completed_at: Timestamp.now(), total_value,
          });
        } catch (err) {
          console.warn('[delivery] auto-complete run failed:', err.message);
          // Retry without the money field in case rules reject it. Preserves
          // the completion state even if total_value can't be persisted here.
          try {
            await updateDoc(doc(db, COL.DELIVERY_RUNS, runId), {
              status: 'completed', completed_at: Timestamp.now(),
            });
          } catch {}
        }
      }
    }
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
  }
}

function unsubAllOrders() {
  for (const fn of _orderUnsubs.values()) { try { fn(); } catch {} }
  _orderUnsubs.clear();
}

// Rebuild the UI from _lastRuns + _ordersCache. Called whenever the run set
// changes OR any watched order doc changes.
function repaint(root, db) {
  // History & Earnings tabs handle grocery runs inline via the main orders
  // list + earnings aggregator — nothing to paint into this container.
  if (_view === 'delivered' || _view === 'earnings') {
    root.innerHTML = '';
    return;
  }
  const active = _lastRuns;
  if (!active.length) { root.innerHTML = ''; return; }
  const parts = active.map(r => renderRun(root, db, r));
  root.innerHTML = parts.join('');
  root.querySelectorAll('[data-act="deliverStop"]').forEach(btn => {
    btn.addEventListener('click', () => deliverStop(db, btn.dataset.run, btn.dataset.order));
  });
}

function fmtHistoryRunDate(ymd) {
  if (!ymd) return '—';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}

// History tab view of completed grocery runs. Read-only cards with the
// payout state chip (Pending = amber, Paid = green) — same colour system as
// restaurant deliveries in the History tab.
function renderHistoryRuns(root) {
  const completed = _allRuns
    .filter(r => r.status === 'completed')
    .sort((a, b) => {
      const ta = a.completed_at?.toMillis?.() || 0;
      const tb = b.completed_at?.toMillis?.() || 0;
      return tb - ta;
    });
  if (!completed.length) { root.innerHTML = ''; return; }
  root.innerHTML = completed.map(r => {
    const stops = (r.order_ids || []).length;
    const paid = r.payout_paid === true;
    const chip = paid
      ? '<span class="pay-chip pay-chip--paid"><i class="fas fa-circle-check"></i> PAID</span>'
      : '<span class="pay-chip pay-chip--cod"><i class="fas fa-hourglass-half"></i> PENDING</span>';
    return `
      <div class="entity-card" style="margin-bottom:.5rem">
        <div class="ec-row">
          <div style="min-width:0;flex:1">
            <div class="ec-title">
              <i class="fas fa-basket-shopping" style="margin-right:.35rem"></i>
              Grocery run · ${esc(fmtHistoryRunDate(r.run_date))}
            </div>
            <div class="ec-meta">${stops} stop${stops === 1 ? '' : 's'}${r.notes ? ' · ' + esc(String(r.notes).slice(0, 60)) : ''}</div>
            <div class="ec-meta" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:.25rem">
              <strong style="font-size:1rem">Payout ${money(r.partner_earning)}</strong>
              ${chip}
            </div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// Ensure we hold a live onSnapshot on every order id referenced by any run.
// New ids get a listener; ids no longer referenced by any run are dropped.
function syncOrderSubs(db, root, ids) {
  const wanted = new Set(ids);
  // Drop stale listeners
  for (const oid of Array.from(_orderUnsubs.keys())) {
    if (!wanted.has(oid)) {
      try { _orderUnsubs.get(oid)(); } catch {}
      _orderUnsubs.delete(oid);
      _ordersCache.delete(oid);
    }
  }
  // Add new listeners
  for (const oid of wanted) {
    if (_orderUnsubs.has(oid)) continue;
    const unsub = onSnapshot(doc(db, COL.GROCERY_ORDERS, oid), snap => {
      if (snap.exists()) _ordersCache.set(oid, snap.data());
      else _ordersCache.delete(oid);
      repaint(root, db);
    }, err => {
      console.warn('[delivery] order snapshot error for', oid, err.message);
    });
    _orderUnsubs.set(oid, unsub);
  }
}

export function mountGroceryRuns(db, user) {
  const root = document.getElementById('groceryRuns');
  if (!root) return;
  _rootEl = root;
  _db = db;
  if (_runsUnsub) { try { _runsUnsub(); } catch {} _runsUnsub = null; }
  unsubAllOrders();
  _ordersCache.clear();
  _lastRuns = [];

  const q = query(collection(db, COL.DELIVERY_RUNS), where('partner_uid', '==', user.uid));
  _runsUnsub = onSnapshot(q, async snap => {
    const runs = [];
    snap.forEach(d => runs.push({ id: d.id, ...d.data() }));
    _allRuns = runs;
    // Rider only sees runs admin has actually dispatched in the Active tab.
    const active = runs.filter(r => r.status === 'dispatched');
    active.sort((a, b) => String(a.run_date).localeCompare(String(b.run_date)));
    _lastRuns = active;

    // Live order subs only for the ACTIVE runs — history doesn't need them.
    const allIds = [...new Set(active.flatMap(r => r.order_ids || []))];
    syncOrderSubs(db, root, allIds);

    if (allIds.length) {
      const initial = await fetchOrders(db, allIds);
      initial.forEach((v, k) => { if (!_ordersCache.has(k)) _ordersCache.set(k, v); });
    }
    repaint(root, db);
    if (_earningsRoot) repaintEarnings();
    if (typeof _earningsChangeCb === 'function') {
      try { _earningsChangeCb(); } catch (e) { console.warn('[delivery] earnings callback failed:', e.message); }
    }
    // When we've just gained the first active stop, clear the restaurant
    // orders list's "No active deliveries" empty-state so the rider isn't
    // told they have nothing to do while grocery stops sit above.
    if (_view === 'active' && _lastRuns.length) {
      const ordersListEl = document.getElementById('ordersList');
      if (ordersListEl && ordersListEl.querySelector('.empty-state')) {
        ordersListEl.innerHTML = '';
      }
    }
  }, err => {
    console.warn('[delivery] grocery-runs snapshot error:', err.message);
    root.innerHTML = '';
  });
}

// ── Earnings integration ────────────────────────────────────────────────
// Called from app.js when the Earnings tab is rendered. Grocery run payouts
// live on the run doc (partner_earning) — not on individual orders — so the
// main earnings aggregator can't see them. This section fills the gap.
export function mountGroceryEarningsSection(earningsRoot) {
  _earningsRoot = earningsRoot;
  repaintEarnings();
}

// Register a callback to be invoked whenever the completed-runs list changes.
// app.js uses this to re-run its top-level renderEarnings so the KPIs +
// history stay in sync when a run auto-completes on the rider's device.
let _earningsChangeCb = null;
export function onGroceryRunsChanged(cb) { _earningsChangeCb = cb; }

// Convert completed runs into "order-like" synthetic objects that plug
// straight into the main earnings aggregator (feeForOrder / isPayoutPaid
// / isDelivered / history bucketing). Each run becomes ONE synthetic order
// with the whole run's earning attached — matching the "1 payout per run"
// mental model shown in the admin's runs view.
// One-shot direct fetch of every run for the given partner. Used by the
// Earnings tab to guarantee fresh data even if the live subscription hasn't
// fired yet (or the tab was opened before mountGroceryRuns finished its
// first snapshot). Falls back to _allRuns if the fetch fails.
export async function fetchAllRunsForPartner(db, uid) {
  try {
    const snap = await getDocs(query(
      collection(db, COL.DELIVERY_RUNS),
      where('partner_uid', '==', uid),
    ));
    const runs = [];
    snap.forEach(d => runs.push({ id: d.id, ...d.data() }));
    // Merge into module cache so subsequent renders + the runs snapshot
    // handler see the same freshest data.
    _allRuns = runs;
    return runs;
  } catch (err) {
    console.warn('[delivery] fetchAllRunsForPartner failed:', err.message);
    return _allRuns;
  }
}

export function getCompletedRunsAsSyntheticOrders() {
  const completed = _allRuns.filter(r => r.status === 'completed');
  return completed.map(r => {
    const stops = (r.order_ids || []).length;
    const deliveredAt = r.completed_at || r.created_at || null;
    const earning = Number(r.partner_earning) || 0;
    const eligible = earning > 0;
    // Prefer the cached run total (written at completion time). Fall back to
    // undefined so the delivery card's title label hides the "· ₹0" tail
    // rather than lying about the value.
    const runTotal = Number.isFinite(+r.total_value) ? +r.total_value : undefined;
    return {
      id: `run_${r.id}`,
      __grocery_run: true,
      __run_id: r.id,
      status: 'delivered',
      payout_applicable: eligible,
      payout_paid: eligible ? (r.payout_paid === true) : true,
      payout_paid_at: eligible ? (r.payout_paid_at || null) : null,
      payout_amount: earning,
      delivered_at: deliveredAt,
      created_at: r.created_at || deliveredAt,
      delivery_staff_id: r.partner_uid || null,
      restaurant_name: 'BankiBites Groceries',
      customer: { name: `${stops} stop${stops === 1 ? '' : 's'}${r.run_date ? ' · ' + r.run_date : ''}` },
      place: '',
      total: runTotal,
      payment_collected: true,
    };
  });
}

function fmtRunDate(ymd) {
  if (!ymd) return '—';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function repaintEarnings() {
  if (!_earningsRoot) return;
  const container = document.getElementById('groceryEarnings');
  if (!container) return;

  const completed = _allRuns
    .filter(r => r.status === 'completed')
    .sort((a, b) => String(b.run_date).localeCompare(String(a.run_date)));
  const lifetimeTotal = completed.reduce((s, r) => s + (Number(r.partner_earning) || 0), 0);
  const lifetimeStops = completed.reduce((s, r) => s + ((r.order_ids || []).length), 0);

  // This-month bucket by run_date (string compare on YYYY-MM-DD is safe).
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const monthYmd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const monthRuns = completed.filter(r => (r.run_date || '') >= monthYmd);
  const monthTotal = monthRuns.reduce((s, r) => s + (Number(r.partner_earning) || 0), 0);

  if (!completed.length) {
    container.innerHTML = `
      <div class="section-header section-header--compact mt-3">
        <h4 class="m-0"><i class="fas fa-basket-shopping text-primary mr-1"></i> Grocery runs</h4>
      </div>
      <div class="empty-state" style="padding:1rem"><i class="fas fa-truck-fast"></i><p>No completed grocery runs yet.</p></div>`;
    return;
  }

  const rows = completed.map(r => `
    <div class="entity-card" style="padding:.55rem .7rem;margin-bottom:.4rem">
      <div class="ec-row">
        <div style="min-width:0;flex:1">
          <div class="ec-title" style="font-size:.9rem">${esc(fmtRunDate(r.run_date))}</div>
          <div class="ec-meta">${(r.order_ids || []).length} stop${(r.order_ids || []).length === 1 ? '' : 's'}${r.notes ? ' · ' + esc(String(r.notes).slice(0, 40)) : ''}</div>
        </div>
        <div style="text-align:right;font-weight:800">${money(r.partner_earning)}</div>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="section-header section-header--compact mt-3">
      <h4 class="m-0"><i class="fas fa-basket-shopping text-primary mr-1"></i> Grocery runs</h4>
    </div>
    <div class="kpi-grid kpi-grid--compact" style="margin-bottom:.75rem">
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">This month</div><div class="kpi-value">${money(monthTotal)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Month · runs</div><div class="kpi-value">${monthRuns.length}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Lifetime</div><div class="kpi-value">${money(lifetimeTotal)}</div></div>
      <div class="kpi-card kpi-card--sm"><div class="kpi-label">Lifetime · stops</div><div class="kpi-value">${lifetimeStops}</div></div>
    </div>
    <details class="payouts-block payout-history-block" open>
      <summary><i class="fas fa-clock-rotate-left"></i> Grocery run history</summary>
      <div class="payouts-body">${rows}</div>
    </details>`;
}
