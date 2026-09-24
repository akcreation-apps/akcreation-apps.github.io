// bill.html renderer.
// Router: delivered orders get a TCD-style receipt with Download / Delete
// actions; cancelled or fake orders get a brief red notice; every other
// status gets a clean tracker card (icon + status label + ETA + WA CTA)
// with no items or totals, because pre-delivery those can still change.

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const APP_NAME = 'bankimart-reader';
const COLLECTION = 'bankibites_grocery_orders';
const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');
const HKEY = 'bb_grocery_orders_v1';
const TERMINAL_KEY = 'bb_grocery_terminal_v1';

async function getReaderDb() {
  const existing = getApps().find(a => a.name === APP_NAME);
  if (existing) return getFirestore(existing);
  const res = await fetch('https://akcreation-apps.com/TCD/credentials.json?v=' + Date.now());
  if (!res.ok) throw new Error('credentials fetch failed');
  const c = await res.json();
  const decrypt = v => CryptoJS.AES.decrypt(v, ENC_KEY).toString(CryptoJS.enc.Utf8);
  const cfg = {
    apiKey:            decrypt(c.API_KEY),
    authDomain:        decrypt(c.AUTH_DOMAIN),
    projectId:         decrypt(c.ID),
    storageBucket:     decrypt(c.STORAGE_BUCKET),
    messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
    appId:             decrypt(c.APP_ID),
    measurementId:     decrypt(c.MEASUREMENT_ID),
  };
  const app = initializeApp(cfg, APP_NAME);
  return getFirestore(app);
}

const CFG = window.BB_CONFIG || {};
const moneyPlain = n => Number(n || 0).toFixed(2);
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const TRACKER_META = {
  new:              { label: 'Order placed',        tone: 'pending',   icon: 'fa-hourglass-half', sub: "We've received your order — waiting for our team to confirm." },
  order_confirmed:  { label: 'Order confirmed',     tone: 'confirmed', icon: 'fa-check',          sub: "We'll pack your basket and dispatch on delivery day." },
  approved:         { label: 'Order confirmed',     tone: 'confirmed', icon: 'fa-check',          sub: "We'll pack your basket and dispatch on delivery day." },
  assigned:         { label: 'Ready to dispatch',   tone: 'confirmed', icon: 'fa-box',            sub: 'Your order is scheduled with our delivery partner.' },
  out_for_delivery: { label: 'On the way',          tone: 'active',    icon: 'fa-truck-fast',     sub: 'Our rider is heading to your address. Please keep your phone reachable.' },
};

function loadLocalOrders() {
  try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; }
}
function loadLocalOrder(id) {
  return loadLocalOrders().find(x => x.orderId === id) || null;
}
function loadTerminalMap() {
  try { return JSON.parse(localStorage.getItem(TERMINAL_KEY)) || {}; } catch { return {}; }
}
function saveTerminalMap(map) {
  try { localStorage.setItem(TERMINAL_KEY, JSON.stringify(map)); } catch {}
}
function cacheTerminalStatus(id, status) {
  if (!id || (status !== 'delivered' && status !== 'cancelled')) return;
  const map = loadTerminalMap();
  if (map[id] === status) return;
  map[id] = status;
  saveTerminalMap(map);
}

function fmtEtaDate(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function fmtReceiptDate(v) {
  const d = v?.toDate ? v.toDate() : (v instanceof Date ? v : (v ? new Date(v) : null));
  if (!d || isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function shortOrderId(id) { return String(id || '').slice(-6).toUpperCase(); }

function paintOffline(banner) {
  const el = document.getElementById('offlineBanner');
  if (!el) return;
  el.textContent = banner || '';
  el.hidden = !banner;
}

// ── Router ─────────────────────────────────────────────────────────────
function render(order, source) {
  const status = order.status || 'new';
  if (status === 'delivered') return renderBill(order);
  if (status === 'cancelled' || status === 'fake' || order.is_fake === true) return renderCancelled(order);
  return renderTracker(order, source);
}

function renderError(msg) {
  document.getElementById('billRoot').innerHTML = `
    <div class="cancelled">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <h3>Order not found</h3>
      <p>${esc(msg || "We couldn't locate this order.")}</p>
    </div>
    <div class="actions">
      <a href="index.html" class="btn btn-ghost"><i class="fa-solid fa-basket-shopping"></i> Back to shop</a>
    </div>`;
}

// ── Tracker ────────────────────────────────────────────────────────────
function renderTracker(order, source) {
  const status = order.status || 'new';
  const meta = TRACKER_META[status] || TRACKER_META.new;
  const shortId = shortOrderId(window.__ORDER_ID);
  const eta = order.eta_date
    ? `${fmtEtaDate(order.eta_date)}${order.eta_window ? ' · ' + order.eta_window : ''}`
    : '';

  document.getElementById('billRoot').innerHTML = `
    <div class="tracker">
      <div class="tracker-hero">
        <div class="tracker-icon tracker-icon--${meta.tone}"><i class="fa-solid ${meta.icon}"></i></div>
        <h1 class="tracker-title">${esc(meta.label)}</h1>
        <p class="tracker-sub">${esc(meta.sub)}</p>
      </div>
      <div class="tracker-meta">
        <div class="tracker-row">
          <div class="tracker-row-icon"><i class="fa-solid fa-hashtag"></i></div>
          <div class="tracker-row-body">
            <div class="tracker-row-label">Order ID</div>
            <div class="tracker-row-value">#${esc(shortId)}</div>
          </div>
        </div>
        ${eta ? `
        <div class="tracker-row">
          <div class="tracker-row-icon"><i class="fa-solid fa-truck-fast"></i></div>
          <div class="tracker-row-body">
            <div class="tracker-row-label">Arriving</div>
            <div class="tracker-row-value">${esc(eta)}</div>
          </div>
        </div>` : ''}
        ${order.place ? `
        <div class="tracker-row">
          <div class="tracker-row-icon"><i class="fa-solid fa-location-dot"></i></div>
          <div class="tracker-row-body">
            <div class="tracker-row-label">Delivering to</div>
            <div class="tracker-row-value">${esc(order.place)}</div>
          </div>
        </div>` : ''}
      </div>
      <p class="tracker-note">
        Your itemised bill will be available here once the order is delivered.
        Any changes our shopper makes at the market (e.g. an out-of-stock swap)
        are reflected then.
      </p>
    </div>

    ${source === 'local' ? '<p class="site-footer" style="padding:12px 0 0">Showing your last saved copy — live updates resume when you\'re online.</p>' : ''}
  `;
}

// ── Cancelled / fake ──────────────────────────────────────────────────
function renderCancelled(order) {
  const shortId = shortOrderId(window.__ORDER_ID);
  document.getElementById('billRoot').innerHTML = `
    <div class="cancelled">
      <i class="fa-solid fa-circle-xmark"></i>
      <h3>Order cancelled</h3>
      <p>This order was cancelled.</p>
      <div class="id">#${esc(shortId)}</div>
    </div>
  `;
}

// ── Bill (delivered — TCD-style receipt) ──────────────────────────────
function renderBill(order) {
  const shortId = shortOrderId(window.__ORDER_ID);
  const items = order.items || [];
  const subtotal = Number(order.subtotal) || 0;
  const deliveryFee = Number(order.delivery_fee_final ?? order.delivery_fee_estimated ?? 0);
  const grand = subtotal + deliveryFee;
  const dateStr = fmtReceiptDate(order.delivered_at || order.created_at);
  const vendorName = (CFG.vendorName || 'BankiBites Groceries').toUpperCase();
  const vendorShort = CFG.vendorShort || 'BankiBites';
  const address = CFG.fullAddress || CFG.city || '';
  const supportPhone = CFG.supportPhone || '';

  const itemRows = items.map(it => {
    const label = `${it.qty} × ${esc(it.name)}`;
    const unit = it.unit ? `<div class="bill-item-sub">${esc(it.unit)} · @ ₹${moneyPlain(it.price)}</div>` : '';
    const line = moneyPlain((it.price || 0) * (it.qty || 0));
    return `
      <li class="bill-item">
        <span class="qtyname">${label}${unit}</span>
        <span class="price">₹${line}</span>
      </li>`;
  }).join('');

  document.getElementById('billRoot').innerHTML = `
    <div id="billContainer">
      <div class="bill-header">
        <div class="bill-title">${esc(vendorName)}</div>
        <div class="restaurant-info">
          ${address ? `<p>${esc(address)}</p>` : ''}
          ${supportPhone ? `<p>${esc(supportPhone)}</p>` : ''}
        </div>
      </div>

      <div class="table-info">
        <p class="id">#${esc(shortId)}</p>
        <p>${esc(dateStr)}</p>
      </div>

      <hr class="separator">
      <ul class="bill-items">${itemRows || '<li class="bill-item"><span>No items on file.</span></li>'}</ul>
      <hr class="separator">

      <div class="bill-totals">
        <div class="row"><span>Subtotal</span><span>₹${moneyPlain(subtotal)}</span></div>
        <div class="row"><span>Delivery</span><span>${deliveryFee === 0 ? 'FREE' : '₹' + moneyPlain(deliveryFee)}</span></div>
      </div>
      <p id="billTotal">TOTAL &nbsp;₹${moneyPlain(grand)}</p>

      <p class="thank-you">** Thank you — order again soon! **</p>

      <div class="service-note">
        <strong>Disclaimer:</strong> ${esc(vendorShort)} is a market-sourcing service. 
        We arrange the requested items locally on your behalf and handle pickup and doorstep delivery.
      </div>


      <button class="download-button" id="downloadBillBtn">
        <i class="fa-solid fa-download" style="margin-right:6px"></i> Download bill
      </button>
    </div>
  `;

  wireDownload(order);
}

function wireDownload(order) {
  const btn = document.getElementById('downloadBillBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    this.style.display = 'none';
    const billContainer = document.getElementById('billContainer');
    html2canvas(billContainer, { useCORS: true }).then(canvas => {
      const link = document.createElement('a');
      const now = new Date();
      const shortId = shortOrderId(window.__ORDER_ID);
      const filename = `${shortId}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}_${String(now.getDate()).padStart(2,'0')}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getFullYear()).slice(-2)}_Bill.png`;
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      link.click();
      this.style.display = 'block';
    });
  });
}


// ── Bootstrap ─────────────────────────────────────────────────────────
async function main() {
  const id = new URLSearchParams(location.search).get('id');
  window.__ORDER_ID = id || '';
  if (!id) { renderError('Missing order id.'); return; }

  const localHit = loadLocalOrder(id);

  // Terminal-cache short-circuit: if we've already confirmed this order is
  // delivered, render it entirely from the local payload — no Firestore
  // boot, no network round-trip. Delivered is a terminal state, so the
  // server view can never change back.
  const terminalMap = loadTerminalMap();
  if (terminalMap[id] === 'delivered' && localHit?.payload) {
    render({ created_at: localHit.savedAt, ...localHit.payload, status: 'delivered' }, 'local');
    return;
  }

  // Paint the cached order immediately (as a tracker) so the page doesn't
  // sit on the skeleton spinner while Firestore boots. The live snapshot
  // overwrites this the instant it lands.
  if (localHit?.payload) render({ ...localHit.payload, status: 'new' }, 'local');

  try {
    const db = await getReaderDb();
    const ref = doc(db, COLLECTION, id);
    onSnapshot(ref, snap => {
      if (!snap.exists()) {
        if (!localHit) renderError('This order no longer exists.');
        return;
      }
      paintOffline('');
      const data = snap.data();
      const status = data.status || 'new';
      cacheTerminalStatus(id, status);
      // Delivered orders render from the customer's own saved copy — the
      // receipt only needs the server for the status flip; items, totals,
      // place and ETA come from the local payload.
      if (status === 'delivered' && localHit?.payload) {
        render({
          created_at: localHit.savedAt,
          ...localHit.payload,
          delivered_at: data.delivered_at || null,
          status: 'delivered',
        }, 'local');
        return;
      }
      render(data, 'live');
    }, err => {
      console.warn('[bill] snapshot error', err);
      paintOffline('Live updates unavailable — showing your saved copy.');
      if (!localHit) {
        getDoc(ref).then(d => {
          if (d.exists()) render(d.data(), 'live');
          else renderError('This order no longer exists.');
        }).catch(() => renderError(err.message || 'Could not load this order.'));
      }
    });
  } catch (err) {
    console.error('[bill] init failed', err);
    if (!localHit) renderError('Could not connect to the server.');
    else paintOffline("You're offline — showing your saved copy.");
  }
}

main();
