import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';

const APP_NAME = 'bankibites-delivery';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, getDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const $ = sel => document.querySelector(sel);

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
    const orders = [];
    snap.forEach(d => orders.push({ id: d.id, ...d.data() }));
    orders.sort((a, b) => {
      const ta = a.created_at?.toMillis?.() || 0;
      const tb = b.created_at?.toMillis?.() || 0;
      return tb - ta;
    });
    const today = new Date(); today.setHours(0,0,0,0);
    const filtered = orders.filter(o => {
      if (filter === 'delivered') {
        if (o.status !== 'delivered') return false;
        const t = o.delivered_at?.toDate?.() || o.created_at?.toDate?.();
        return t && t >= today;
      }
      return o.status !== 'delivered' && o.status !== 'cancelled';
    });
    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state"><i class="fas fa-inbox"></i><p>${filter === 'delivered' ? 'Nothing delivered today.' : 'No active deliveries.'}</p></div>`;
      return;
    }
    listEl.innerHTML = '';
    filtered.forEach(o => listEl.appendChild(renderCard(db, o)));
  }, err => {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><p>${err.message}</p></div>`;
  });
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
    if (hasName) metaParts.push(escapeHtml(c.name));
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
            <span class="status-pill status-${o.status}" style="margin-left:6px">${(o.status||'').replace('_',' ')}</span>
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

  // Once delivered, the partner is read-only: no call, no status update.
  // Call button is only rendered when a phone number is actually present.
  const actionsBlock = isClosed
    ? ''
    : `<div class="delivery-actions">
         ${hasPhone
           ? `<a class="btn call-btn" href="tel:${escapeAttr(c.phone)}"><i class="fas fa-phone"></i> Call</a>`
           : ''}
         <button class="btn done-btn" data-act="next">
           <i class="fas fa-check"></i> ${o.status === 'assigned' ? 'Pick up' : (o.status === 'out_for_delivery' ? 'Delivered' : 'Update')}
         </button>
       </div>`;

  const deliveredMeta = o.status === 'delivered' && o.delivered_at?.toDate
    ? `<div class="ec-meta" style="font-style:italic"><i class="fas fa-circle-check"></i> Delivered on ${o.delivered_at.toDate().toLocaleString('en-IN')}</div>`
    : '';

  const addrBlock = (hasName || hasAddress)
    ? `<div class="addr-block">
         ${hasName ? `<div class="name">${escapeHtml(c.name)}</div>` : ''}
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
        <span class="status-pill status-${o.status}">${(o.status||'').replace('_',' ')}</span>
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
        html: `Confirm that you've handed the order to <strong>${escapeHtml(c.name || 'the customer')}</strong>.${collectNote}`,
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

// Outlying villages take ~15 min from pick-up; everywhere else in/near
// Banki we estimate ~10 min. Match is case-insensitive and matches as a
// whole word against o.place first, then the customer address as a
// fallback (some orders only carry the area name inside the address).
const FAR_PLACES = ['Bedapur', 'Sisua', 'Chakapada', 'Harirajpur', 'Gopalpur', 'Patapur', 'Ragadi'];

function pickupEtaMinutes(o) {
  const haystack = [o.place, o.customer?.address].filter(Boolean).join(' ').toLowerCase();
  const isFar = FAR_PLACES.some(p => {
    const re = new RegExp(`\\b${p.toLowerCase()}\\b`);
    return re.test(haystack);
  });
  return isFar ? 15 : 10;
}

// Customer-facing ETA: computed at pick-up time from "now" + a delivery
// window that depends on the place — see pickupEtaMinutes().
function pickupArrival(o) {
  return new Date(Date.now() + pickupEtaMinutes(o) * 60 * 1000);
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

  const greeting = !isBlank(c.name) ? `Hi ${c.name}! 👋` : 'Hi there! 👋';
  const fromLine = !isBlank(restaurantLabel)
    ? `Your *BankiBites* 🛵 order from *${restaurantLabel}* is on the way.`
    : `Your *BankiBites* 🛵 order is on the way.`;

  const eta = pickupArrival(o);
  const etaLine = `⏱ Arriving by *${eta.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}* (~${pickupEtaMinutes(o)} min).`;

  const collectLine = o.payment_collected === false && !isBlank(o.total)
    ? `💵 Please keep *₹${o.total}* ready (cash on delivery).`
    : '';

  const message = [
    greeting,
    fromLine,
    etaLine,
    `📍 To reach you quickly with minimal disturbance, please share your *current location*.`,
    collectLine,
    `Thanks for ordering with us! 🙏`,
  ].filter(Boolean).join('\n');

  const url = `https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  // Same-tab navigation: avoids popup blockers and works inside installed PWAs.
  window.location.href = url;
}
