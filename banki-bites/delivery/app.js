import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';

const APP_NAME = 'bankibites-delivery';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, getDoc, getDocs, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  loadFeeRules, feeForOrder, isFarPlace, isDelivered, isPayoutPaid, isPayoutPending,
  toDateSafe, bucketByDay, chartPalette, whenChartReady, fmtINR, startOfDay, startOfLastMonth,
} from '../analytics.js';

const $ = sel => document.querySelector(sel);
let _feeRules = null;
let _allOrders = [];
let _currentView = 'active';
const _earnCharts = new Map();
function mountEarnChart(id, config) {
  const old = _earnCharts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  const c = new Chart(el.getContext('2d'), config);
  _earnCharts.set(id, c);
  return c;
}

let unsub = null;
let currentUser = null;

(async function init() {
  const auth = await getAuthInstance();

  $('#signInForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('#authError').hidden = true;
    try {
      await signInWithEmailAndPassword(auth, $('#emailInput').value.trim(), $('#passwordInput').value);
    } catch (err) {
      $('#authError').textContent = err.message;
      $('#authError').hidden = false;
    }
  });

  $('#signOutBtn').addEventListener('click', async () => {
    if (unsub) unsub();
    await signOut(auth);
    location.reload();
  });

  $('#filter').addEventListener('change', () => listenOrders(currentUser));
  document.querySelectorAll('.seg-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(x => {
        const isActive = x === b;
        x.classList.toggle('active', isActive);
        x.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      _currentView = b.dataset.view;
      const ordersListEl = $('#ordersList');
      const earningsEl = $('#earningsView');
      if (_currentView === 'earnings') {
        ordersListEl.hidden = true;
        earningsEl.hidden = false;
        renderEarnings();
      } else {
        ordersListEl.hidden = false;
        earningsEl.hidden = true;
        $('#filter').value = _currentView === 'delivered' ? 'delivered' : 'active';
        listenOrders(currentUser);
      }
    });
  });

  window.addEventListener('beforeunload', () => console.warn('[delivery] page is about to unload'));

  onAuthStateChanged(auth, async user => {
    console.log('[delivery] auth state changed:', user?.email, user?.uid, 'at', new Date().toISOString());
    if (!user) {
      $('#authGate').hidden = false;
      $('#appShell').hidden = true;
      return;
    }
    const db = await getDb();
    let staffDoc;
    try {
      staffDoc = await getDoc(doc(db, COL.STAFF, user.uid));
    } catch (err) {
      $('#authError').textContent = `Lookup failed (${err.code || 'error'}): ${err.message}`;
      $('#authError').hidden = false;
      await signOut(auth);
      return;
    }
    if (!staffDoc.exists()) {
      $('#authError').innerHTML = `This account is not registered as a delivery partner.<br><small>UID: <code>${user.uid}</code></small>`;
      $('#authError').hidden = false;
      await signOut(auth);
      return;
    }
    if (staffDoc.data().is_active === false) {
      $('#authError').textContent = 'Your account has been deactivated.';
      $('#authError').hidden = false;
      await signOut(auth);
      return;
    }
    currentUser = user;
    $('#userEmail').textContent = staffDoc.data().name || user.email;
    $('#authGate').hidden = true;
    $('#appShell').hidden = false;
    try { _feeRules = await loadFeeRules(db); } catch {}
    listenOrders(user);
  });
})();

async function listenOrders(user) {
  if (unsub) unsub();
  const db = await getDb();
  const filter = $('#filter').value;
  const listEl = $('#ordersList');
  listEl.innerHTML = '<p class="text-muted">Loading…</p>';

  // Filter server-side by assignee; sort/filter the rest client-side so we
  // don't need a composite Firestore index.
  const q = query(
    collection(db, COL.ORDERS),
    where('delivery_staff_id', '==', user.uid),
  );
  unsub = onSnapshot(q, snap => {
    const allOrders = [];
    snap.forEach(d => allOrders.push({ id: d.id, ...d.data() }));
    // Cap everything client-side at the start of the previous month — that's the
    // canonical "fetch window" used across admin + delivery views.
    const since = startOfLastMonth();
    const orders = allOrders.filter(o => {
      const t = toDateSafe(o.created_at) || toDateSafe(o.delivered_at);
      return !t || t >= since;
    });
    _allOrders = orders;
    if (_currentView === 'earnings') renderEarnings();
    orders.sort((a, b) => {
      const ta = a.created_at?.toMillis?.() || 0;
      const tb = b.created_at?.toMillis?.() || 0;
      return tb - ta;
    });
    const filtered = orders.filter(o => {
      if (filter === 'delivered') {
        if (o.status !== 'delivered') return false;
        const t = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
        return t && t >= since;
      }
      return o.status !== 'delivered' && o.status !== 'cancelled';
    });
    if (!filtered.length) {
      const sinceLabel = since.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${filter === 'delivered' ? `Nothing delivered since ${sinceLabel}.` : 'No active deliveries.'}</p></div>`;
      return;
    }
    listEl.innerHTML = '';
    filtered.forEach(o => listEl.appendChild(renderCard(db, o)));
  }, err => {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${err.message}</p></div>`;
  });
}

// Short, single-token-ish labels for the status pill. Long phrases like
// "out for delivery" wreck the responsive layout when paired with a long
// restaurant name, so we abbreviate to keep the pill narrow.
const STATUS_PILL_LABEL = {
  new: 'new',
  assigned: 'assigned',
  out_for_delivery: 'on the way',
  delivered: 'delivered',
  cancelled: 'cancelled',
};
function pillLabel(status) {
  return STATUS_PILL_LABEL[status] || String(status || '').replace(/_/g, ' ');
}

function renderCard(db, o) {
  // Active orders use a collapsible <details>; closed/history orders stay
  // as a static <div> so their compact summary is always visible.
  const isClosedStatus = o.status === 'delivered' || o.status === 'cancelled';
  const card = document.createElement(isClosedStatus ? 'div' : 'details');
  card.className = 'entity-card' + (isClosedStatus ? '' : ' delivery-order');
  const c = o.customer || {};
  const created = o.created_at?.toDate ? o.created_at.toDate() : new Date();
  const items = (o.items || []).filter(i => !isBlank(i?.name));
  const itemsHtml = items.map(i =>
    `<li>${i.qty ? i.qty + ' × ' : ''}${escapeHtml(i.name)}</li>`
  ).join('');
  const hasItems = items.length > 0;
  const hasName = !isBlank(c.name);
  const hasPhone = !isBlank(c.phone);
  const hasAddress = !isBlank(c.address);
  const restaurantLabel = !isBlank(o.restaurant_name)
    ? o.restaurant_name
    : (!isBlank(o.restaurant_id) ? o.restaurant_id : '');
  // Some customers are stored with names like "BB Anil (Anil Kumar)" — strip
  // the BB prefix and show just the inner-bracket name to the delivery partner.
  const displayCustomerName = prettyCustomerName(c.name);
  const totalLabel = !isBlank(o.total) ? ` · ₹${o.total}` : '';
  const mustCollect = o.payment_collected === false;
  if (mustCollect) card.classList.add('must-collect');

  const collectBanner = (mustCollect && !isBlank(o.total))
    ? `<div class="collect-banner">
         <i class="fas fa-money-bill-wave"></i>
         <span>Collect <strong>₹${o.total}</strong> on delivery</span>
       </div>`
    : '';

  const isClosed = o.status === 'delivered' || o.status === 'cancelled';

  // Compact history layout for delivered/cancelled orders — no ETA, no actions,
  // no separate address block. One line summary + collapsed items.
  if (isClosed) {
    card.classList.add('history-card');
    const when = o.delivered_at?.toDate?.() || o.created_at?.toDate?.() || new Date();
    const metaParts = [];
    if (hasName) metaParts.push(escapeHtml(displayCustomerName));
    if (hasPhone) metaParts.push(escapeHtml(c.phone));
    metaParts.push(when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));

    const summaryParts = [];
    if (hasItems) summaryParts.push(`${items.length} items`);
    if (hasAddress) summaryParts.push('address');
    const detailsBlock = (hasItems || hasAddress)
      ? `<details>
          <summary class="ec-meta" style="cursor:pointer;user-select:none">${summaryParts.join(' · ')}</summary>
          <div class="history-detail">
            ${hasAddress ? `<div><strong>Address:</strong> ${escapeHtml(c.address)}</div>` : ''}
            ${hasItems ? `<ul class="order-items" style="margin-top:6px">${itemsHtml}</ul>` : ''}
          </div>
        </details>`
      : '';

    card.innerHTML = `
      <div class="history-row">
        <div class="history-main">
          <div class="history-title">
            ${escapeHtml(restaurantLabel || '—')}${totalLabel}
            <span class="status-pill status-${o.status}" style="margin-left:6px">${pillLabel(o.status)}</span>
          </div>
          <div class="history-meta">${metaParts.join(' · ')}</div>
        </div>
      </div>
      ${detailsBlock}
    `;
    return card;
  }

  let etaBanner = '';
  // Once the order is delivered/cancelled the ETA is no longer actionable.
  if (o.eta?.toDate && !isClosed) {
    const eta = o.eta.toDate();
    const minsLeft = Math.round((eta.getTime() - Date.now()) / 60000);
    const etaText = eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const isLate = minsLeft < 0;
    const relative = isLate
      ? `<strong>${Math.abs(minsLeft)} min late</strong>`
      : (minsLeft <= 10
          ? `<strong>${minsLeft} min left</strong>`
          : `in ${minsLeft} min`);
    etaBanner = `
      <div class="eta-banner ${isLate ? 'eta-late' : (minsLeft <= 10 ? 'eta-soon' : '')}">
        <i class="fas fa-stopwatch"></i>
        <span>Deliver by <strong>${etaText}</strong> · ${relative}</span>
      </div>`;
  }

  // GPS pin from the customer record (set by admin from the customer modal).
  // Renders a Maps link button so the driver can navigate without copy-pasting.
  const gps = c.gps;
  const hasGps = gps && Number.isFinite(+gps.lat) && Number.isFinite(+gps.lng);
  const mapsHref = hasGps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : '';

  // Once delivered, the partner is read-only: no call, no status update.
  // Call button is only rendered when a phone number is actually present.
  const actionsBlock = isClosed
    ? ''
    : `<div class="delivery-actions">
         <div class="delivery-quick-actions">
           ${hasPhone
             ? `<a class="icon-action call-btn" href="tel:${escapeAttr(c.phone)}" aria-label="Call customer" title="Call customer"><i class="fas fa-phone" aria-hidden="true"></i></a>`
             : ''}
           ${hasGps
             ? `<a class="icon-action map-btn" href="${mapsHref}" target="_blank" rel="noopener noreferrer" aria-label="Open customer location in Google Maps" title="Open in Google Maps"><i class="fas fa-map-location-dot" aria-hidden="true"></i></a>`
             : ''}
         </div>
         <button class="btn done-btn" data-act="next">
           <i class="fas fa-check"></i> ${o.status === 'assigned' ? 'Pick up' : (o.status === 'out_for_delivery' ? 'Delivered' : 'Update')}
         </button>
       </div>`;

  const deliveredMeta = o.status === 'delivered' && o.delivered_at?.toDate
    ? `<div class="ec-meta" style="font-style:italic"><i class="fas fa-circle-check"></i> Delivered on ${o.delivered_at.toDate().toLocaleString('en-IN')}</div>`
    : '';

  const addrBlock = (hasName || hasAddress)
    ? `<div class="addr-block">
         ${hasName ? `<div class="name">${escapeHtml(displayCustomerName)}</div>` : ''}
         ${hasAddress ? `<div class="addr">${escapeHtml(c.address)}</div>` : ''}
       </div>`
    : '';

  // Items list is shown inline (not collapsible) inside the expanded card so
  // tapping near the Call button never toggles anything underneath.
  const itemsBlock = hasItems
    ? `<div class="items-block">
         <div class="items-block-head"><i class="fas fa-utensils"></i> ${items.length} item${items.length === 1 ? '' : 's'}</div>
         <ul class="order-items">${itemsHtml}</ul>
       </div>`
    : '';

  // Auto-expand only the actively-out-for-delivery order so the driver sees
  // the address + actions without an extra tap. Everything else stays collapsed.
  if (o.status === 'out_for_delivery') card.open = true;

  card.innerHTML = `
    <summary class="delivery-summary">
      <div class="ec-row">
        <div class="delivery-summary-main">
          <div class="ec-title">${escapeHtml(restaurantLabel || '—')}${totalLabel}</div>
          <div class="ec-meta">${created.toLocaleString('en-IN')}${hasItems ? ' · ' + items.length + ' items' : ''}</div>
          ${deliveredMeta}
        </div>
        <span class="status-pill status-${o.status}">${pillLabel(o.status)}</span>
        <i class="fas fa-chevron-down delivery-chevron" aria-hidden="true"></i>
      </div>
    </summary>

    <div class="delivery-body">
      ${etaBanner}
      ${collectBanner}
      ${addrBlock}
      ${itemsBlock}
      <div class="delivery-actions-spacer" aria-hidden="true"></div>
      ${actionsBlock}
    </div>
  `;

  card.querySelector('[data-act="next"]')?.addEventListener('click', async () => {
    let next = 'out_for_delivery';
    if (o.status === 'out_for_delivery') next = 'delivered';

    // Double-confirm before marking as delivered — once flipped, the order
    // moves to history and cascades "Approved" back to the restaurant admin.
    if (next === 'delivered') {
      const collectNote = o.payment_collected === false && !isBlank(o.total)
        ? `<br><br><strong>Make sure you've collected ₹${o.total}</strong> from the customer.`
        : '';
      const ok = await Swal.fire({
        icon: 'question',
        title: 'Mark as delivered?',
        html: `Confirm that you've handed the order to <strong>${escapeHtml(displayCustomerName || 'the customer')}</strong>.${collectNote}`,
        showCancelButton: true,
        confirmButtonText: 'Yes, delivered',
        cancelButtonText: 'Not yet',
        confirmButtonColor: '#16a34a',
      });
      if (!ok.isConfirmed) return;
    }

    const patch = { status: next };
    if (next === 'delivered') patch.delivered_at = Timestamp.now();
    try {
      await updateDoc(doc(db, COL.ORDERS, o.id), patch);
      // Cascade terminal status back to the source restaurant order so the
      // individual TCD/A1 admin sees the same Approved outcome.
      if (next === 'delivered' && o.source_doc_path) {
        const [coll, docId] = o.source_doc_path.split('/');
        if (coll && docId) {
          try {
            await updateDoc(doc(db, coll, docId), { status: 'Approved' });
          } catch (err) {
            console.warn('Source order cascade failed:', err);
          }
        }
      }
      // On Pick up (assigned → out_for_delivery), notify the customer via
      // WhatsApp with the order ETA so they know it's on the way.
      if (next === 'out_for_delivery') {
        openPickupWhatsApp(o, restaurantLabel);
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Update failed', text: e.message });
    }
  });

  return card;
}

// If a customer name starts with "BB" (case-insensitive, e.g. internal alias
// tags like "BB Anil") and contains a parenthesised segment, return what is
// inside the first pair of brackets so the delivery partner sees the real
// customer name. Otherwise return the original name.
// Examples:
//   "BB Anil (Anil Kumar)" → "Anil Kumar"
//   "BBAnil(Anil Kumar)"   → "Anil Kumar"
//   "Anil Kumar"           → "Anil Kumar"
function prettyCustomerName(name) {
  if (isBlank(name)) return '';
  const s = String(name).trim();
  if (!/^bb/i.test(s)) return s;
  const m = s.match(/\(([^)]+)\)/);
  if (m && m[1].trim()) return m[1].trim();
  return s;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// Treat null/undefined, empty strings, NaN and the literal word "pending"
// (case-insensitive) as blank — those fields are hidden in the delivery UI.
function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'number') return !Number.isFinite(v);
  const s = String(v).trim();
  return s === '' || s.toLowerCase() === 'pending';
}

// WhatsApp notify on Pick up — opens a chat directly with the CUSTOMER
// carrying a short, polite, pre-filled message. The agent just hits send.
// Navigates the same tab (no popup) so the WhatsApp deep-link launches
// reliably on mobile without being blocked by popup-blockers.

// Normalises an Indian mobile number to the wa.me-ready `91XXXXXXXXXX`
// format. Returns null when we can't make sense of the input.
function toWaNumber(raw) {
  if (isBlank(raw)) return null;
  let s = String(raw).replace(/[\s\-()+]/g, '');
  if (s.startsWith('91') && s.length === 12) return s;
  if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  if (/^\d{10}$/.test(s)) return '91' + s;
  return null;
}

// Outlying villages take ~15 min from pick-up; everywhere else in/near Banki
// we estimate ~10 min. The "far" list is sourced from `bankibites_meta/fee_rules`
// (loaded into _feeRules at sign-in), so admin can edit the list without code.
function pickupEtaMinutes(o) {
  return isFarPlace(o, _feeRules) ? 15 : 10;
}

// Customer-facing ETA: computed at pick-up time from "now" + a delivery
// window that depends on the place — see pickupEtaMinutes().
function pickupArrival(o) {
  return new Date(Date.now() + pickupEtaMinutes(o) * 60 * 1000);
}

async function renderEarnings() {
  const root = $('#earningsView');
  if (!root) return;
  root.innerHTML = `
    <div class="section-header section-header--compact">
      <h3 class="m-0"><i class="fas fa-coins text-primary mr-1"></i> My Earnings</h3>
    </div>
    <div id="earnKpis" class="kpi-grid kpi-grid--compact"></div>
    <div class="chart-grid">
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-calendar-days"></i> Deliveries per day (7d)</div>
        <div class="chart-card-body"><canvas id="earnPerDay"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-indian-rupee-sign"></i> Earnings per day (₹30 vs ₹40)</div>
        <div class="chart-card-body"><canvas id="earnSplit"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-hand-holding-dollar"></i> Paid vs Pending</div>
        <div class="chart-card-body"><canvas id="earnPaidMix"></canvas></div>
      </div>
    </div>
    <div class="section-header section-header--compact mt-3">
      <h4 class="m-0"><i class="fas fa-hourglass-half text-warning mr-1"></i> Awaiting payout</h4>
    </div>
    <div id="earnPending" class="card-list"></div>
  `;
  try { await whenChartReady(); } catch (e) { console.warn('[earnings] Chart.js unavailable:', e.message); }
  const p = chartPalette();
  const orders = (_allOrders || []).filter(isDelivered);

  // KPI window helpers
  const now = new Date();
  const startToday = startOfDay(now);
  const startWeek = new Date(startToday); startWeek.setDate(startWeek.getDate() - 6);
  const startMonth = new Date(startToday); startMonth.setDate(1);

  function statsFor(filterFn) {
    const subset = orders.filter(filterFn);
    const total = subset.reduce((s, o) => s + feeForOrder(o, _feeRules), 0);
    const paid  = subset.filter(isPayoutPaid).reduce((s, o) => s + feeForOrder(o, _feeRules), 0);
    return { count: subset.length, total, paid, pending: total - paid };
  }
  const inRange = (start) => (o) => {
    const t = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
    return t && t.getTime() >= start.getTime();
  };

  const today = statsFor(inRange(startToday));
  const week  = statsFor(inRange(startWeek));
  const month = statsFor(inRange(startMonth));
  const life  = statsFor(() => true);

  $('#earnKpis').innerHTML = `
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">Today</div><div class="kpi-value">${fmtINR(today.total)}</div><div class="kpi-sub">${today.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">This week</div><div class="kpi-value">${fmtINR(week.total)}</div><div class="kpi-sub">${week.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">This month</div><div class="kpi-value">${fmtINR(month.total)}</div><div class="kpi-sub">${month.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">Pending payout</div><div class="kpi-value">${fmtINR(life.pending)}</div><div class="kpi-sub">Paid ${fmtINR(life.paid)}</div></div>
  `;

  // Deliveries per day
  const days = bucketByDay(orders, o => toDateSafe(o.delivered_at) || toDateSafe(o.created_at), 7);
  mountEarnChart('earnPerDay', {
    type: 'bar',
    data: {
      labels: days.labels,
      datasets: [{ label: 'Deliveries', data: days.keys.map(k => days.buckets.get(k).length), backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  // Earnings per day split ₹30 (near) vs ₹40 (far)
  const nearByDay = days.keys.map(k => days.buckets.get(k).filter(o => !isFarPlace(o, _feeRules)).reduce((s, o) => s + feeForOrder(o, _feeRules), 0));
  const farByDay  = days.keys.map(k => days.buckets.get(k).filter(o =>  isFarPlace(o, _feeRules)).reduce((s, o) => s + feeForOrder(o, _feeRules), 0));
  mountEarnChart('earnSplit', {
    type: 'bar',
    data: {
      labels: days.labels,
      datasets: [
        { label: `Near (₹${_feeRules?.fee_near ?? 30})`, data: nearByDay, backgroundColor: p.brand,     stack: 'e', borderWidth: 0 },
        { label: `Far (₹${_feeRules?.fee_far ?? 40})`,   data: farByDay,  backgroundColor: p.series[3], stack: 'e', borderWidth: 0 },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}` } } },
      scales: { x: { stacked: true, ticks: { autoSkip: true, maxRotation: 0 } }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });

  // Paid vs Pending doughnut (lifetime)
  mountEarnChart('earnPaidMix', {
    type: 'doughnut',
    data: {
      labels: ['Paid', 'Pending'],
      datasets: [{ data: [life.paid, life.pending], backgroundColor: [p.status.delivered, p.status.cancelled], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtINR(ctx.parsed)}` } } }, cutout: '60%' },
  });

  // Awaiting payout list
  const pending = orders.filter(isPayoutPending)
    .sort((a, b) => (toDateSafe(b.delivered_at)?.getTime() || 0) - (toDateSafe(a.delivered_at)?.getTime() || 0));
  const pendingEl = $('#earnPending');
  if (!pending.length) {
    pendingEl.innerHTML = `<div class="empty-state"><i class="fas fa-circle-check"></i><p>All your deliveries have been settled. 🎉</p></div>`;
  } else {
    pendingEl.innerHTML = pending.map(o => {
      const fee = feeForOrder(o, _feeRules);
      const when = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
      const whenTxt = when ? when.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
      const far = isFarPlace(o, _feeRules);
      return `
        <div class="entity-card payout-row payout-row--card is-pending">
          <div class="payout-row-main">
            <div class="payout-row-title">${escapeHtml(o.restaurant_name || o.restaurant_id || '—')}</div>
            <div class="payout-row-meta">${escapeHtml(whenTxt)} · ${far ? '<span class="tag tag-far">far</span>' : '<span class="tag tag-near">near</span>'} · ${escapeHtml(o.place || o.customer?.address || '')}</div>
          </div>
          <div class="payout-row-fee">${fmtINR(fee)}</div>
        </div>
      `;
    }).join('');
  }
}

function openPickupWhatsApp(o, restaurantLabel) {
  const c = o.customer || {};
  const wa = toWaNumber(c.phone);
  if (!wa) {
    // No usable phone — skip silently rather than nag the agent; the
    // status update has already been saved successfully.
    console.warn('[delivery] Pick-up WhatsApp skipped — no usable customer phone');
    return;
  }

  const displayName = prettyCustomerName(c.name);
  // Note: U+23F1 (⏱) is a text-default codepoint — it needs the U+FE0F
  // variation selector to render as an emoji on Android/WhatsApp; otherwise
  // it shows as a plain mono glyph or an empty box. Same precaution applied
  // to all the symbol-like emojis below.
  const greeting = !isBlank(displayName) ? `Hi ${displayName}! 👋` : 'Hi there! 👋';
  const fromLine = !isBlank(restaurantLabel)
    ? `Your *BankiBites* 🛵 order from *${restaurantLabel}* is on the way.`
    : `Your *BankiBites* 🛵 order is on the way.`;

  const eta = pickupArrival(o);
  const etaLine = `⏱️ Arriving by *${eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}* (~${pickupEtaMinutes(o)} min).`;

  const collectLine = o.payment_collected === false && !isBlank(o.total)
    ? `💵 Please keep *₹${o.total}* ready (cash on delivery).`
    : '';

  const message = [
    greeting,
    fromLine,
    etaLine,
    collectLine,
    `Thanks for ordering with us! 🙏`,
  ].filter(Boolean).join('\n');

  // Same flow as the customer-side cart checkout (TCD/cart.js): use wa.me
  // and navigate the current tab. WhatsApp's deep-link handler reliably
  // intercepts wa.me on mobile and the host browser does the right thing
  // on desktop too. Matching this app to the existing order-placement flow
  // keeps the delivery partner's experience consistent with the customer's.
  const url = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  window.location.href = url;
}
