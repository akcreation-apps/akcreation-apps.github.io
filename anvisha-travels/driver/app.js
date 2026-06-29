import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

import { renderDriverTripPanel } from '../admin/trips.js';
import {
  fmtINR, fmtNum, fmtDate, fmtTimeLabel, toDateSafe, startOfMonth,
} from '../admin/analytics.js';

const APP_NAME = 'anvisha-driver';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);

const $ = sel => document.querySelector(sel);

window.avBusy = function (message = 'Working…') {
  if (!window.Swal) return;
  Swal.fire({
    title: message, allowOutsideClick: false, allowEscapeKey: false,
    showConfirmButton: false, didOpen: () => Swal.showLoading(),
  });
};
window.avDone = function () {
  if (!window.Swal) return;
  if (Swal.isLoading && Swal.isLoading()) Swal.close();
};

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'fa-chart-line', render: renderDashboard },
  { key: 'log',       label: 'Log Trip',  icon: 'fa-plus',       render: renderLogTrip },
  { key: 'history',   label: 'History',   icon: 'fa-clock-rotate-left', render: renderHistory },
  { key: 'earnings',  label: 'Earnings',  icon: 'fa-coins',      render: renderEarnings },
];

const authGate = $('#authGate');
const appShell = $('#appShell');
const authError = $('#authError');
const tabbar = $('#tabbar');

let driver = null;
let renderedTabs = {};

(async function init() {
  try {
    const auth = await getAuthInstance();

    $('#signInForm').addEventListener('submit', async e => {
      e.preventDefault();
      authError.hidden = true;
      const email = $('#emailInput').value.trim();
      const password = $('#passwordInput').value;
      if (!email || !password) {
        authError.textContent = 'Email and password are required.';
        authError.hidden = false;
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e2) {
        authError.textContent = (e2.code ? e2.code + ': ' : '') + (e2.message || 'Sign-in failed.');
        authError.hidden = false;
      }
    });

    $('#signOutBtn').addEventListener('click', async () => {
      await signOut(auth);
      location.reload();
    });

    onAuthStateChanged(auth, async user => {
      if (!user) {
        authGate.hidden = false;
        appShell.hidden = true;
        return;
      }
      const db = await getDb();
      let drivers;
      try {
        drivers = await getDoc(doc(db, COL.META, 'drivers'));
      } catch (err) {
        authError.textContent = 'Sign-in lookup failed. Please contact support.';
        authError.hidden = false;
        await signOut(auth);
        return;
      }
      const driverUids = drivers.exists() ? (drivers.data().uids || []) : [];
      const driverProfiles = drivers.exists() ? (drivers.data().profile || {}) : {};

      if (!driverUids.includes(user.uid)) {
        authError.textContent = 'This account is not authorised as a driver.';
        authError.hidden = false;
        await signOut(auth);
        return;
      }

      const profile = driverProfiles[user.uid] || {};
      driver = {
        uid:   user.uid,
        name:  profile.name  || user.displayName || user.email,
        phone: profile.phone || '',
      };

      $('#userEmail').textContent = user.email;
      authGate.hidden = true;
      appShell.hidden = false;

      mountTabs();
      activateTab('dashboard');
    });

  } catch (e) {
    authError.textContent = 'Initialisation failed: ' + e.message;
    authError.hidden = false;
  }
})();

function mountTabs() {
  tabbar.innerHTML = '';
  TABS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.id = `tab-btn-${t.key}`;
    btn.dataset.tab = t.key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `tab-${t.key}`);
    btn.innerHTML = `<i class="fas ${t.icon}" aria-hidden="true"></i><span>${t.label}</span>`;
    btn.addEventListener('click', () => activateTab(t.key));
    tabbar.appendChild(btn);
  });
}

async function activateTab(key) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === key;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${key}`));
  if (renderedTabs[key]) return;
  renderedTabs[key] = true;
  const panel = document.getElementById(`tab-${key}`);
  const db = await getDb();
  const def = TABS.find(t => t.key === key);
  try {
    await def.render({ panel, db, driver });
  } catch (e) {
    panel.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed to load: ${e.message || e}</div>`;
  }
}

// ───────────────────────── Dashboard ─────────────────────────
// KPIs (this month) + collapsable "Allocated to me" list.
async function renderDashboard(ctx) {
  const { panel, db, driver } = ctx;
  panel.innerHTML = `
    <h2 class="dr-greet">Hi, <strong>${escapeHtml(driver.name || 'Driver')}</strong> 👋</h2>
    <div class="kpi-grid" id="dr-kpis">
      ${kpi('trips', 'Trips this month')}
      ${kpi('km',    'Distance (km)')}
      ${kpi('fuel',  'Fuel + misc (₹)')}
      ${kpi('earn',  'Earnings (paid)')}
    </div>

    <div class="card-an ex-card mt-16">
      <button id="da-toggle" type="button" class="ex-toggle is-open" aria-expanded="true" aria-controls="da-list-wrap">
        <span class="ex-toggle__label">
          <i class="fas fa-bell"></i> Allocated to me
          <span id="da-badge" class="bk-toolbar__count"></span>
        </span>
        <i class="fas fa-chevron-down ex-toggle__chevron" aria-hidden="true"></i>
      </button>
      <div id="da-list-wrap" class="ex-form-wrap">
        <div id="da-list" class="row-list"></div>
      </div>
    </div>
  `;

  // Collapse / expand the allocated-bookings card.
  const toggleBtn = panel.querySelector('#da-toggle');
  const wrap      = panel.querySelector('#da-list-wrap');
  toggleBtn.addEventListener('click', () => {
    const open = wrap.hidden ? true : false;
    wrap.hidden = !open;
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleBtn.classList.toggle('is-open', open);
  });

  // KPI fetch + render (parallel with allocated-bookings load).
  const monthStart = startOfMonth();
  let trips = [];
  try {
    const snap = await getDocs(query(
      collection(db, COL.TRIPS),
      where('driver.uid', '==', driver.uid),
    ));
    trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) { /* swallow */ }

  const inMonth = trips.filter(t => {
    const d = toDateSafe(t.createdAt) || (t.date && new Date(t.date));
    return d && d >= monthStart;
  });
  const km   = inMonth.reduce((a, t) => a + Number(t.km || 0), 0);
  const fuel = inMonth.reduce((a, t) => a + Number((t.fuel && t.fuel.cost) || 0) + Number(t.miscCost || 0), 0);

  let earn = 0;
  try {
    const ids = [...new Set(inMonth.filter(t => t.bookingId).map(t => t.bookingId))];
    for (let i = 0; i < ids.length; i += 10) {
      const chunk = ids.slice(i, i + 10);
      if (!chunk.length) continue;
      const snap = await getDocs(query(
        collection(db, COL.BOOKINGS),
        where('__name__', 'in', chunk),
      ));
      snap.forEach(d => {
        const b = d.data() || {};
        if (b.status === 'completed' && b.paid) earn += Number(b.fare || 0);
      });
    }
  } catch (_) { /* swallow */ }

  setKpi('trips', fmtNum(inMonth.length));
  setKpi('km',    fmtNum(Math.round(km)));
  setKpi('fuel',  fmtINR(fuel));
  setKpi('earn',  fmtINR(earn));

  // Allocated-to-me bookings (status='allocated').
  const list  = panel.querySelector('#da-list');
  const badge = panel.querySelector('#da-badge');
  list.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
  onSnapshot(
    query(collection(db, COL.BOOKINGS), where('allocatedDriver.uid', '==', driver.uid)),
    snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
                            .filter(b => b.status === 'allocated')
                            .sort((a, b) => {
                              // Soonest pickup first (by date+time string).
                              const ak = (a.date || '') + ' ' + (a.time || '');
                              const bk = (b.date || '') + ' ' + (b.time || '');
                              return ak.localeCompare(bk);
                            });
      badge.textContent = all.length ? `· ${all.length}` : '';
      if (!all.length) {
        list.innerHTML = `<div class="empty"><i class="far fa-bell-slash"></i> No active allocations.</div>`;
        return;
      }
      list.innerHTML = all.map(renderAllocationRow).join('');
    },
    err => {
      list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
    }
  );
}

function renderAllocationRow(b) {
  const customer = b.customer || {};
  const friendly = customer.name ? customer.name : 'Customer';
  const phoneDigits = customer.phone ? String(customer.phone).replace(/\D/g, '') : '';
  const phoneE164 = phoneDigits ? `+91${phoneDigits}` : '';
  return `
  <div class="row-card alloc-card">
    <div class="alloc-card__head">
      <div class="alloc-when">
        <div class="alloc-when__date">${escapeHtml(fmtDate(b.date))}</div>
        <div class="alloc-when__time"><i class="fas fa-clock" aria-hidden="true"></i> ${escapeHtml(fmtTimeLabel(b.time))}</div>
      </div>
      <div class="alloc-actions">
        <span class="chip allocated">Allocated</span>
        ${phoneE164 ? `<a href="tel:${escapeAttr(phoneE164)}" class="btn-call" aria-label="Call ${escapeAttr(friendly)} at ${escapeAttr(phoneE164)}" title="Call customer"><i class="fas fa-phone" aria-hidden="true"></i></a>` : ''}
      </div>
    </div>
    <div class="row-meta">
      <div><b>Customer</b> ${escapeHtml(friendly)}${phoneDigits ? ' · +91 ' + escapeHtml(phoneDigits) : ''}</div>
      <div><b>Passengers</b> ${escapeHtml(b.passengers || '?')}</div>
      ${b.destination ? `<div><b>To</b> ${escapeHtml(b.destination)}</div>` : ''}
      ${b.fare ? `<div><b>Fare</b> ₹${escapeHtml(String(b.fare))}</div>` : ''}
    </div>
  </div>
  `;
}

function escapeAttr(s) {
  return escapeHtml(s);
}

// ───────────────────────── Log Trip tab ─────────────────────────
async function renderLogTrip(ctx) {
  const { panel, db, driver } = ctx;
  // Reuse the existing renderDriverTripPanel — it renders form + recent trips
  // list. We only want the form here (recent trips live in the History tab).
  const sandbox = document.createElement('div');
  await renderDriverTripPanel({ panel: sandbox, db, driver });
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-pen-to-square"></i> Log a new trip</h2>
    <div class="card-an" id="dt-host"></div>
  `;
  const formNode = sandbox.querySelector('#dt-form');
  if (formNode) panel.querySelector('#dt-host').appendChild(formNode);
}

// ───────────────────────── History ─────────────────────────
async function renderHistory(ctx) {
  const { panel, db, driver } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-clock-rotate-left"></i> My trips</h2>
    <div id="dh-list" class="row-list"></div>
  `;
  const list = panel.querySelector('#dh-list');
  list.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
  onSnapshot(
    query(collection(db, COL.TRIPS), where('driver.uid', '==', driver.uid), orderBy('createdAt', 'desc'), limit(200)),
    snap => {
      const trips = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!trips.length) {
        list.innerHTML = `<div class="empty"><i class="far fa-flag"></i> No trips yet.</div>`;
        return;
      }
      list.innerHTML = trips.map(renderHistoryRow).join('');
    },
    err => { list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`; }
  );
}

function renderHistoryRow(t) {
  const fuel = t.fuel || null;
  const route = t.route || {};
  const tied = t.bookingId
    ? `<span class="chip completed"><i class="fas fa-link" aria-hidden="true"></i> Linked</span>`
    : `<span class="chip untied"><i class="fas fa-link-slash" aria-hidden="true"></i> Untied</span>`;
  const fuelLine = fuel
    ? `<div><b>Fuel</b> ${escapeHtml(fuel.type || '—')} · ₹${escapeHtml(String(fuel.cost ?? 0))}${fuel.qty != null ? ` (${escapeHtml(String(fuel.qty))})` : ''}</div>`
    : '';
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(fmtDate(t.date))}</strong>
        <span class="text-muted-an">${escapeHtml(route.source || '?')} → ${escapeHtml(route.destination || '?')}</span>
      </div>
      ${tied}
    </div>
    <div class="row-meta">
      <div><b>Distance</b> ${escapeHtml(String(t.km ?? 0))} km</div>
      ${fuelLine}
      <div><b>Misc</b> ₹${escapeHtml(String(t.miscCost ?? 0))}</div>
      ${t.notes ? `<div><b>Notes</b> ${escapeHtml(t.notes)}</div>` : ''}
    </div>
  </div>
  `;
}

// ───────────────────────── Earnings ─────────────────────────
async function renderEarnings(ctx) {
  const { panel, db, driver } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-coins"></i> Earnings</h2>
    <div class="kpi-grid" id="dr-earn-kpis">
      ${kpi('paid_count',    'Paid trips')}
      ${kpi('pending_count', 'Pending trips')}
      ${kpi('paid_amt',      'Received (₹)')}
      ${kpi('pending_amt',   'Outstanding (₹)')}
    </div>
    <h3 class="section-title" style="font-size:14px; margin-top:18px;"><i class="fas fa-list"></i> Allocated to me</h3>
    <div id="de-list" class="row-list"></div>
  `;
  const list = panel.querySelector('#de-list');
  list.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;
  let bookings = [];
  try {
    const snap = await getDocs(query(
      collection(db, COL.BOOKINGS),
      where('allocatedDriver.uid', '==', driver.uid),
      orderBy('allocatedAt', 'desc'),
      limit(200),
    ));
    bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_) {
    // Fallback if composite index missing — fetch by allocatedDriver only, sort client-side.
    const snap = await getDocs(query(collection(db, COL.BOOKINGS), where('allocatedDriver.uid', '==', driver.uid)));
    bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (toDateSafe(b.allocatedAt) || 0) - (toDateSafe(a.allocatedAt) || 0));
  }

  const completed = bookings.filter(b => b.status === 'completed');
  const paid     = completed.filter(b => !!b.paid);
  const pending  = completed.filter(b => !b.paid);
  const paidAmt    = paid.reduce((a, b) => a + Number(b.fare || 0), 0);
  const pendingAmt = pending.reduce((a, b) => a + Number(b.fare || 0), 0);

  setKpi('paid_count',    fmtNum(paid.length));
  setKpi('pending_count', fmtNum(pending.length));
  setKpi('paid_amt',      fmtINR(paidAmt));
  setKpi('pending_amt',   fmtINR(pendingAmt));

  if (!bookings.length) {
    list.innerHTML = `<div class="empty"><i class="far fa-folder-open"></i> No bookings allocated to you yet.</div>`;
    return;
  }
  list.innerHTML = bookings.map(renderEarningsRow).join('');
}

function renderEarningsRow(b) {
  const status = b.status || 'new';
  const fare = b.fare ? `₹${b.fare}` : '<i class="text-muted-an">no fare</i>';
  const payChip = status === 'completed'
    ? (b.paid
        ? `<span class="chip completed"><i class="fas fa-circle-check" aria-hidden="true"></i> Paid</span>`
        : `<span class="chip cancelled"><i class="fas fa-hourglass-half" aria-hidden="true"></i> Pending</span>`)
    : `<span class="chip ${status}">${status === 'allocated' ? 'Allocated' : status}</span>`;
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <strong>${escapeHtml(fmtDate(b.date))}</strong>
        <span class="text-muted-an">${escapeHtml(fmtTimeLabel(b.time))}</span>
        ${b.destination ? `<span class="text-muted-an">→ ${escapeHtml(b.destination)}</span>` : ''}
      </div>
      ${payChip}
    </div>
    <div class="row-meta">
      <div><b>Fare</b> ${fare}</div>
      <div><b>Passengers</b> ${escapeHtml(b.passengers || '?')}</div>
    </div>
  </div>
  `;
}

// ─────────────────────── helpers ───────────────────────
function kpi(id, label) {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value" id="kpi-${id}">—</div></div>`;
}
function setKpi(id, v) {
  const el = document.getElementById(`kpi-${id}`);
  if (el) el.textContent = v;
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
