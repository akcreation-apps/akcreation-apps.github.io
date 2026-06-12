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

// Global busy overlay — shown during every Firestore write/action-read so the
// agent gets immediate feedback instead of a frozen card. Uses SweetAlert2
// which is already loaded by delivery/index.html.
window.bbBusy = function (message = 'Working…') {
  if (!window.Swal) return;
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
};
window.bbDone = function () {
  if (!window.Swal) return;
  if (Swal.isLoading && Swal.isLoading()) Swal.close();
};

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
  listEl.innerHTML = '<div class="bb-loader-block">Loading deliveries…</div>';

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
  // Admin can override how much the partner should collect at the door — falls
  // back to the order total when no override is set.
  const collectAmt = (o.collect_amount != null && Number.isFinite(+o.collect_amount)) ? +o.collect_amount : o.total;
  if (mustCollect) card.classList.add('must-collect');

  // Optional breakdown line: shown when admin recorded a discount or a
  // prepayment so the driver knows why the cash amount differs from the cart.
  const discount  = Number.isFinite(+o.discount)     ? +o.discount     : 0;
  const prepaid   = Number.isFinite(+o.paid_already) ? +o.paid_already : 0;
  const breakdownParts = [];
  if (Number.isFinite(+o.total)) breakdownParts.push(`Cart ₹${o.total}`);
  if (discount > 0)              breakdownParts.push(`− Discount ₹${discount}`);
  if (prepaid  > 0)              breakdownParts.push(`− Prepaid ₹${prepaid}${o.paid_method ? ` (${String(o.paid_method).toUpperCase()})` : ''}`);
  const hasBreakdown = (discount > 0 || prepaid > 0) && breakdownParts.length > 1;

  const collectBanner = (mustCollect && !isBlank(collectAmt))
    ? `<div class="collect-banner">
         <i class="fas fa-money-bill-wave"></i>
         <div class="collect-banner-body">
           <span>Collect <strong>₹${collectAmt}</strong> on delivery</span>
           ${hasBreakdown ? `<small class="collect-banner-meta">${escapeHtml(breakdownParts.join(' '))}</small>` : ''}
         </div>
       </div>`
    : '';

  const isClosed = o.status === 'delivered' || o.status === 'cancelled';

  // Compact history layout for delivered/cancelled orders — no ETA, no actions,
  // no separate address block. One line summary + collapsed items.
  if (isClosed) {
    card.classList.add('history-card');
    const when = o.delivered_at?.toDate?.() || o.created_at?.toDate?.() || new Date();
    // Payout state chip: Paid (settled), Pending (eligible & delivered but unsettled),
    // or Not eligible (admin flagged payout_applicable === false). Cancelled orders
    // with no payout flag show no chip.
    const payoutChip = (() => {
      if (o.payout_applicable === false) {
        return '<span class="payout-chip" title="Not eligible for partner payout"><i class="fas fa-ban"></i> Not eligible</span>';
      }
      if (o.payout_paid === true) {
        return '<span class="payout-chip payout-chip--ok" title="Partner payout settled"><i class="fas fa-circle-check"></i> Paid</span>';
      }
      if (isDelivered(o)) {
        return '<span class="payout-chip payout-chip--warn" title="Partner payout pending"><i class="fas fa-hourglass-half"></i> Pending</span>';
      }
      return '';
    })();
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
            <span class="history-title-text">${escapeHtml(restaurantLabel || '—')}${totalLabel}</span>
            <span class="status-pill status-${o.status}">${pillLabel(o.status)}</span>
            ${payoutChip}
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
         ${o.status === 'out_for_delivery' ? `
           <div class="delivery-dual-actions">
             <button class="btn btn-not-picked" data-act="undo">
               <i class="fas fa-times"></i> Not Picked Up
             </button>
             <button class="btn btn-delivered" data-act="next">
               <i class="fas fa-check"></i> Delivered
             </button>
           </div>` : `
           <button class="btn done-btn" data-act="next">
             <i class="fas fa-check"></i> ${o.status === 'assigned' ? 'Pick up' : 'Update'}
           </button>`}
       </div>`;

  const deliveredMeta = o.status === 'delivered' && o.delivered_at?.toDate
    ? `<div class="ec-meta" style="font-style:italic"><i class="fas fa-circle-check"></i> Delivered on ${o.delivered_at.toDate().toLocaleString('en-IN')}</div>`
    : '';

  const addrBlock = (hasName || hasAddress)
    ? `<div class="addr-block">
         ${hasName ? `<div class="name">${escapeHtml(displayCustomerName)}</div>` : ''}
         ${hasAddress ? `<div class="addr"><i class="fas fa-location-dot" aria-hidden="true"></i><span>${escapeHtml(c.address)}</span></div>` : ''}
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

  card.querySelector('[data-act="undo"]')?.addEventListener('click', async () => {
    const ok = await Swal.fire({
      icon: 'warning',
      title: 'Not picked up?',
      text: 'This will revert the order back to "Assigned". Continue?',
      showCancelButton: true,
      confirmButtonText: 'Yes, revert',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#dc2626',
    });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Reverting status…');
      await updateDoc(doc(db, COL.ORDERS, o.id), { status: 'assigned' });
      window.bbDone();
    } catch (e) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Update failed', text: e.message });
    }
  });

  card.querySelector('[data-act="next"]')?.addEventListener('click', async () => {
    let next = 'out_for_delivery';
    if (o.status === 'out_for_delivery') next = 'delivered';

    // Double-confirm before marking as delivered — once flipped, the order
    // moves to history and cascades "Approved" back to the restaurant admin.
    if (next === 'delivered') {
      const breakdownNote = hasBreakdown
        ? `<br><small class="text-muted">${escapeHtml(breakdownParts.join(' '))}</small>`
        : '';
      const collectNote = o.payment_collected === false && !isBlank(collectAmt)
        ? `<br><br><strong>Make sure you've collected ₹${collectAmt}</strong> from the customer.${breakdownNote}`
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
    if (next === 'delivered') {
      patch.delivered_at = Timestamp.now();
      // If there was still an amount to collect at the door, roll it into
      // paid_already so history reflects "this is now fully paid" instead of
      // leaving the order looking like it still owes money. Discount is left
      // untouched so net-revenue math stays correct. When nothing was owed
      // (already fully paid), touch no payment fields — the admin-recorded
      // breakdown (discount / paid_already / paid_method) must survive.
      const collectNum = Number.isFinite(+collectAmt) ? +collectAmt : 0;
      if (mustCollect && collectNum > 0) {
        patch.paid_already      = prepaid + collectNum;
        patch.paid_method       = o.paid_method || 'cash';
        patch.collect_amount    = 0;
        patch.payment_collected = true;
      }
    }
    try {
      window.bbBusy('Updating status…');
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
      window.bbDone();
      // On Pick up (assigned → out_for_delivery), prompt the agent to
      // notify the customer. The confirm button click is a fresh user
      // gesture so the wa.me deep-link launches WhatsApp directly on
      // mobile (avoids the api.whatsapp.com web interstitial that
      // appears when location.href runs after an `await`).
      if (next === 'out_for_delivery') {
        const go = await Swal.fire({
          icon: 'success',
          title: 'Marked as picked up',
          text: 'Notify customer on WhatsApp?',
          showCancelButton: true,
          confirmButtonText: 'Send WhatsApp',
          cancelButtonText: 'Skip',
          confirmButtonColor: '#16a34a',
        });
        if (go.isConfirmed) openPickupWhatsApp(o, restaurantLabel);
      }
    } catch (e) {
      window.bbDone();
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
  // Show a loader if the orders snapshot hasn't returned its first batch yet.
  // _allOrders is reset on snapshot; an empty array could legitimately mean
  // "no orders" — distinguish via the listen subscription's existence.
  if (!unsub || _allOrders.length === 0 && root.dataset.firstRender !== 'done') {
    root.innerHTML = `<div class="bb-loader-block">Loading earnings…</div>`;
    // Defer real render until next paint so the spinner has a chance to show.
    if (!unsub) return;
  }
  root.dataset.firstRender = 'done';
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
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-store"></i> Earnings by restaurant</div>
        <div class="chart-card-body"><canvas id="earnByRestaurant"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><i class="fas fa-location-dot"></i> Earnings by area</div>
        <div class="chart-card-body"><canvas id="earnByArea"></canvas></div>
      </div>
      <div class="chart-card chart-card--wide">
        <div class="chart-card-head"><i class="fas fa-chart-line"></i> Cumulative earnings — this month vs last</div>
        <div class="chart-card-body"><canvas id="earnCumulative"></canvas></div>
      </div>
    </div>
    <div class="section-header section-header--compact mt-3">
      <h4 class="m-0"><i class="fas fa-hourglass-half text-warning mr-1"></i> Awaiting payout</h4>
    </div>
    <div id="earnPending" class="card-list"></div>
  `;
  try { await whenChartReady(); } catch (e) { console.warn('[earnings] Chart.js unavailable:', e.message); }
  const p = chartPalette();
  const orders = (_allOrders || []).filter(isDelivered).filter(o => o.payout_applicable !== false);

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

  // Active-days streak over the last 30 days: count distinct delivery days.
  const start30 = new Date(startToday); start30.setDate(start30.getDate() - 29);
  const activeDaySet = new Set();
  for (const o of orders) {
    const t = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
    if (!t || t < start30) continue;
    activeDaySet.add(startOfDay(t).getTime());
  }
  const activeDays = activeDaySet.size;

  $('#earnKpis').innerHTML = `
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">Today</div><div class="kpi-value">${fmtINR(today.total)}</div><div class="kpi-sub">${today.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">This week</div><div class="kpi-value">${fmtINR(week.total)}</div><div class="kpi-sub">${week.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">This month</div><div class="kpi-value">${fmtINR(month.total)}</div><div class="kpi-sub">${month.count} delivered</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">Pending payout</div><div class="kpi-value">${fmtINR(life.pending)}</div><div class="kpi-sub">Paid ${fmtINR(life.paid)}</div></div>
    <div class="kpi-card kpi-card--sm"><div class="kpi-label">Active days</div><div class="kpi-value">${activeDays}</div><div class="kpi-sub">last 30 days</div></div>
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

  // Earnings by restaurant (top 5).
  const byRest = new Map();
  for (const o of orders) {
    const key = o.restaurant_name || o.restaurant_id || 'Unknown';
    byRest.set(key, (byRest.get(key) || 0) + feeForOrder(o, _feeRules));
  }
  const topRest = [...byRest.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  mountEarnChart('earnByRestaurant', {
    type: 'bar',
    data: {
      labels: topRest.map(([k]) => k),
      datasets: [{ label: 'Earnings ₹', data: topRest.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.x) } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });

  // Earnings by area/place (top 5).
  const byArea = new Map();
  for (const o of orders) {
    const key = o.place || o.customer?.address || 'Unknown';
    byArea.set(key, (byArea.get(key) || 0) + feeForOrder(o, _feeRules));
  }
  const topArea = [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  mountEarnChart('earnByArea', {
    type: 'bar',
    data: {
      labels: topArea.map(([k]) => k),
      datasets: [{ label: 'Earnings ₹', data: topArea.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtINR(ctx.parsed.x) } } },
      scales: { x: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });

  // Cumulative earnings — month-to-date vs same length of last month, indexed
  // by day-of-month so day N this month aligns with day N last month.
  const today2 = new Date();
  const thisMonthStart = new Date(today2.getFullYear(), today2.getMonth(), 1);
  const lastMonthStart = new Date(today2.getFullYear(), today2.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(today2.getFullYear(), today2.getMonth(), 0); // last day of prev month
  const daysInThisMonth = new Date(today2.getFullYear(), today2.getMonth() + 1, 0).getDate();
  const cumThis = new Array(daysInThisMonth).fill(0);
  const cumLast = new Array(daysInThisMonth).fill(0);
  for (const o of orders) {
    const t = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
    if (!t) continue;
    const fee = feeForOrder(o, _feeRules);
    if (t >= thisMonthStart && t <= today2) {
      cumThis[t.getDate() - 1] += fee;
    } else if (t >= lastMonthStart && t <= lastMonthEnd) {
      const di = t.getDate() - 1;
      if (di < cumLast.length) cumLast[di] += fee;
    }
  }
  // Convert daily totals to running sums.
  for (let i = 1; i < cumThis.length; i++) cumThis[i] += cumThis[i - 1];
  for (let i = 1; i < cumLast.length; i++) cumLast[i] += cumLast[i - 1];
  // Hide future days for "this month" so the line doesn't flatline forward.
  const todayDom = today2.getDate();
  const cumThisDisplay = cumThis.map((v, i) => i < todayDom ? v : null);
  mountEarnChart('earnCumulative', {
    type: 'line',
    data: {
      labels: cumThis.map((_, i) => String(i + 1).padStart(2, '0')),
      datasets: [
        { label: 'This month', data: cumThisDisplay, borderColor: p.brand, backgroundColor: p.brandSoft, fill: false, tension: 0.25, pointRadius: 2, borderWidth: 2 },
        { label: 'Last month', data: cumLast,        borderColor: p.muted, backgroundColor: 'transparent', borderDash: [4, 4], fill: false, tension: 0.25, pointRadius: 0, borderWidth: 2 },
      ],
    },
    options: {
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtINR(ctx.parsed.y)}` } } },
      scales: { x: { ticks: { autoSkip: true, maxRotation: 0 } }, y: { beginAtZero: true, ticks: { callback: v => '₹' + v } } },
    },
  });

  // Awaiting payout list
  const pending = orders.filter(isPayoutPending)
    .sort((a, b) => (toDateSafe(b.delivered_at)?.getTime() || 0) - (toDateSafe(a.delivered_at)?.getTime() || 0));
  const pendingEl = $('#earnPending');
  if (!pending.length) {
    pendingEl.innerHTML = `
      <div class="empty-state empty-state--settled">
        <i class="fas fa-circle-check"></i>
        <p>All settled — nothing pending.</p>
      </div>`;
  } else {
    // Group by delivery day so the list reads chronologically and the driver
    // can quickly verify a specific day's payout.
    const groups = new Map();
    for (const o of pending) {
      const when = toDateSafe(o.delivered_at) || toDateSafe(o.created_at);
      const key = when
        ? when.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })
        : 'Unknown date';
      if (!groups.has(key)) groups.set(key, { items: [], total: 0 });
      const g = groups.get(key);
      g.items.push({ o, when, fee: feeForOrder(o, _feeRules) });
      g.total += feeForOrder(o, _feeRules);
    }
    const totalPending = pending.reduce((s, o) => s + feeForOrder(o, _feeRules), 0);

    const groupBlocks = [...groups.entries()].map(([day, g]) => {
      const rows = g.items.map(({ o, when, fee }) => {
        const timeTxt = when ? when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const far = isFarPlace(o, _feeRules);
        const cust = prettyCustomerName(o.customer?.name) || o.customer?.phone || '';
        const place = o.place || o.customer?.address || '';
        const subParts = [];
        if (cust)  subParts.push(escapeHtml(cust));
        if (place) subParts.push(escapeHtml(place));
        return `
          <li class="pending-row">
            <div class="pending-row-main">
              <div class="pending-row-head">
                <span class="pending-row-restaurant">${escapeHtml(o.restaurant_name || o.restaurant_id || '—')}</span>
                <span class="pending-row-time"><i class="far fa-clock" aria-hidden="true"></i> ${escapeHtml(timeTxt)}</span>
              </div>
              ${subParts.length ? `<div class="pending-row-sub">${subParts.join(' · ')}</div>` : ''}
            </div>
            <div class="pending-row-fee">
              <span class="pending-row-amount">${fmtINR(fee)}</span>
              <span class="tag ${far ? 'tag-far' : 'tag-near'}">${far ? 'far' : 'near'}</span>
            </div>
          </li>
        `;
      }).join('');
      return `
        <div class="pending-group">
          <div class="pending-group-head">
            <span class="pending-group-day">${escapeHtml(day)}</span>
            <span class="pending-group-total">${fmtINR(g.total)} · ${g.items.length} order${g.items.length === 1 ? '' : 's'}</span>
          </div>
          <ul class="pending-list">${rows}</ul>
        </div>
      `;
    }).join('');

    pendingEl.innerHTML = `
      <div class="pending-summary">
        <div class="pending-summary-line">
          <span class="pending-summary-label">Total pending</span>
          <span class="pending-summary-amount">${fmtINR(totalPending)}</span>
        </div>
        <div class="pending-summary-meta">${pending.length} order${pending.length === 1 ? '' : 's'} across ${groups.size} day${groups.size === 1 ? '' : 's'}</div>
      </div>
      ${groupBlocks}
    `;
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

  const enc = encodeURIComponent;
  const NL = '%0A';

  // Pre-encoded UTF-8 byte sequences for emojis — survives any browser
  // URL re-normalisation on the way to wa.me / the WhatsApp app.
  const E_WAVE      = '%F0%9F%91%8B';        // 👋
  const E_SCOOTER   = '%F0%9F%9B%B5';        // 🛵
  const E_CLOCK     = '%E2%8F%B0';           // ⏰
  const E_CASH      = '%F0%9F%92%B5';        // 💵
  const E_SPARKLES  = '%E2%9C%A8';           // ✨
  const E_HEART     = '%E2%9D%A4%EF%B8%8F';  // ❤️
  const E_PIN       = '%F0%9F%93%8D';        // 📍

  const displayName = prettyCustomerName(c.name);

  const parts = [];

  // greeting
  parts.push(
    E_WAVE + enc(' ') +
    (!isBlank(displayName) ? enc('Hi ' + displayName + '!') : enc('Hi there!'))
  );

  // on-the-way
  const fromTxt = !isBlank(restaurantLabel)
    ? enc(' Your *BankiBites* order from *' + restaurantLabel + '* is on the way!')
    : enc(' Your *BankiBites* order is on the way!');
  parts.push(E_SCOOTER + fromTxt);

  // ETA
  const eta = pickupArrival(o);
  const etaTimeStr = eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  parts.push(E_CLOCK + enc(' Arriving by *' + etaTimeStr + '* (~' + pickupEtaMinutes(o) + ' min)'));

  // cash collect (optional)
  const collectAmt = (o.collect_amount != null && Number.isFinite(+o.collect_amount)) ? +o.collect_amount : o.total;
  const prepaidWa  = Number.isFinite(+o.paid_already) ? +o.paid_already : 0;
  if (o.payment_collected === false && !isBlank(collectAmt)) {
    let cashTxt = ' Keep *₹' + collectAmt + '* ready';
    if (prepaidWa > 0) {
      const via = o.paid_method ? ' via ' + String(o.paid_method).toUpperCase() : '';
      cashTxt += ' (already paid ₹' + prepaidWa + via + ')';
    } else {
      cashTxt += ' (cash on delivery)';
    }
    parts.push(E_CASH + enc(cashTxt));
  }

  // location request — only when the customer has no GPS pin on file,
  // so the driver doesn't need to call and disturb them to find the address.
  const gps = c.gps;
  const hasGps = gps && Number.isFinite(+gps.lat) && Number.isFinite(+gps.lng);
  if (!hasGps) {
    parts.push(E_PIN + enc(' Please share your *current location* to help us reach you.'));
  }

  // thank-you
  parts.push(E_SPARKLES + enc(' Thank you for choosing BankiBites ') + E_HEART);

  const text = parts.join(NL + NL);

  const url = 'https://wa.me/' + wa + '?text=' + text;
  window.location.href = url;
}
