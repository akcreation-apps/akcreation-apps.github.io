import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, where, writeBatch, Timestamp, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { groupBy, topN, chartPalette, whenChartReady, wireStatsBlockResize, startOfLastMonth, isDelivered, truncateName } from '../analytics.js';

const partnerCharts = new Map();
function mountPartnerChart(id, config) {
  const old = partnerCharts.get(id);
  if (old) { try { old.destroy(); } catch {} }
  const el = document.getElementById(id);
  if (!el || !window.Chart) return null;
  const c = new Chart(el.getContext('2d'), config);
  partnerCharts.set(id, c);
  return c;
}

const EMPTY = {
  name: '', logo: '', url: '', services: [], rating: 4.5,
  opening_hour: '08', closing_hour: '22', break_start_hour: '', break_end_hour: '', address: '', point_of_contact: '',
  is_active: true, is_removed: false, is_veg: false, is_homemade: false, is_separate_price: false,
  sort_order: 0, sync_collection: '', sync_doc_id: '',
};

async function syncToPartnerAdmin(db, syncCollection, syncDocId, updates) {
  if (!syncCollection || !syncDocId) return;
  try {
    await setDoc(doc(db, syncCollection, syncDocId), updates, { merge: true });
  } catch (err) {
    console.warn('[BankiBites] Partner admin sync failed:', err.message);
  }
}

function notifyPartnerWhatsApp(phone, type, name) {
  const msgs = {
    closed:  `Hi, this is BankiBites. Your restaurant *${name}* has been temporarily closed on our platform as per your request. Customers will not see your listing until you contact us to reactivate it.`,
    blocked: `Hi, this is BankiBites. Your restaurant *${name}* has been blocked on our platform for *24 hours* because you missed fulfilling a customer order without informing us about food availability. Please contact us immediately to resolve this issue and reactivate your listing.`,
  };
  window.location.href = `https://wa.me/91${phone}?text=${encodeURIComponent(msgs[type])}`;
}

// Normalise a typed Indian phone to 10 digits (strip +91/91/0 prefix, spaces,
// dashes, parens). Returns the trailing 10 digits if recognisable, else ''.
function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}
function isValidPhone(raw) {
  return /^\d{10}$/.test(normalisePhone(raw));
}

export async function renderPartners(root, db) {
  root.innerHTML = `
    <style>
      /* BankiMart storefront status card — sits at the top of the
         Partners tab so admin always has a route to bring the storefront
         back online. Green when live, amber when offline. */
      .bm-store {
        display: flex; align-items: center; gap: 12px;
        padding: 10px 12px;
        border: 1px solid #e2e8f0; border-radius: 10px;
        background: #ffffff;
        margin-bottom: 10px;
        box-shadow: 0 1px 2px rgba(15,23,42,.04);
      }
      .bm-store--offline { border-color: #f59e0b; background: #fef8ec; }
      .bm-store-icon {
        width: 34px; height: 34px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        background: #dcfce7; color: #15803d; font-size: .9rem;
        flex-shrink: 0;
      }
      .bm-store--offline .bm-store-icon { background: #fef3c7; color: #b45309; }
      .bm-store-title {
        flex: 1 1 auto; min-width: 0;
        font-size: .88rem; font-weight: 700;
        color: #0f172a; margin: 0; letter-spacing: -.01em;
        line-height: 1.25;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .bm-store-btn {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 12px; border-radius: 7px; border: 0;
        font-size: .78rem; font-weight: 700; cursor: pointer;
        transition: background .12s, transform .06s;
        white-space: nowrap;
      }
      .bm-store-btn:active { transform: scale(.97); }
      .bm-store-btn--off { background: #dc2626; color: #fff; }
      .bm-store-btn--off:hover { background: #b91c1c; }
      .bm-store-btn--on { background: #16a34a; color: #fff; }
      .bm-store-btn--on:hover { background: #15803d; }
      /* Narrow phones — clip the subtitle to one line so long copy
         doesn't push the card to two rows of text. */
      @media (max-width: 420px) {
        .bm-store { gap: 10px; padding: 8px 10px; }
        .bm-store-icon { width: 30px; height: 30px; font-size: .82rem; }
        .bm-store-title { font-size: .82rem; }
        .bm-store-btn { padding: 6px 10px; font-size: .72rem; gap: 4px; }
        .bm-store-btn span { display: none; }
      }
      @media (prefers-color-scheme: dark) {
        .bm-store { background: #14161c; border-color: #262a33; }
        .bm-store--offline { background: #3f2d0b; border-color: #b45309; }
        .bm-store-icon { background: rgba(22,163,74,.15); color: #4ade80; }
        .bm-store--offline .bm-store-icon { background: rgba(245,158,11,.15); color: #fbbf24; }
        .bm-store-title { color: #f1f5f9; }
        .bm-store-sub { color: #94a3b8; }
      }
    </style>
    <div id="bmStoreCard" class="bm-store" hidden>
      <div class="bm-store-icon"><i class="fas fa-store"></i></div>
      <p class="bm-store-title" id="bmStoreTitle">BankiBites Groceries · Live</p>
      <button type="button" id="bmStoreBtn" class="bm-store-btn bm-store-btn--off">
        <i class="fas fa-power-off"></i> <span id="bmStoreBtnLabel">Take offline</span>
      </button>
    </div>

    <details class="stats-block">
      <summary class="stats-block-head"><i class="fas fa-chart-simple"></i> Partner insights</summary>
      <div class="stats-block-body">
        <div class="chart-grid">
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-store"></i> Top restaurants by orders</div>
            <div class="chart-card-body"><canvas id="partnersOrders"></canvas></div>
          </div>
          <div class="chart-card">
            <div class="chart-card-head"><i class="fas fa-eye"></i> Active vs hidden</div>
            <div class="chart-card-body"><canvas id="partnersActive"></canvas></div>
          </div>
          <div class="chart-card chart-card--wide">
            <div class="chart-card-head"><i class="fas fa-star"></i> Ratings</div>
            <div class="chart-card-body"><canvas id="partnersRatings"></canvas></div>
          </div>
        </div>
      </div>
    </details>

    <div class="section-header section-header--compact section-header--end">
      <button id="addPartnerBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add partner</button>
    </div>
    <div id="partnersList" class="card-list"><div class="bb-loader-block">Loading restaurants…</div></div>
  `;
  document.getElementById('addPartnerBtn').addEventListener('click', () => openEditor(db, null, root));
  wireStorefrontToggle(root, db);
  try { await whenChartReady(); } catch (e) { console.warn('[partners] Chart.js unavailable:', e.message); }
  wireStatsBlockResize(root.querySelector('.stats-block'));
  await loadPartners(db, root);
  await renderPartnerCharts(db);
}

// ── BankiMart storefront maintenance toggle ─────────────────────────
// The single source of truth lives at bankibites_meta/bankimart_maintenance.
// When enabled, the storefront's maintenance.js reads the flag and swaps
// customer pages for the maintenance screen; here we mirror the state on
// the card and flip the doc when admin taps the button.
function wireStorefrontToggle(root, db) {
  const card = root.querySelector('#bmStoreCard');
  const btn = root.querySelector('#bmStoreBtn');
  const btnLabel = root.querySelector('#bmStoreBtnLabel');
  const title = root.querySelector('#bmStoreTitle');
  if (!card || !btn) return;

  const paint = (enabled) => {
    card.hidden = false;
    card.classList.toggle('bm-store--offline', enabled);
    title.textContent = enabled ? 'BankiBites Groceries · Offline' : 'BankiBites Groceries · Live';
    btnLabel.textContent = enabled ? 'Take online' : 'Take offline';
    btn.classList.toggle('bm-store-btn--on', enabled);
    btn.classList.toggle('bm-store-btn--off', !enabled);
  };

  // Live-subscribe so the card reflects a change made from another tab.
  const ref = doc(db, COL.META, 'bankimart_maintenance');
  onSnapshot(ref, snap => {
    const enabled = snap.exists() && snap.data().enabled === true;
    paint(enabled);
  }, err => {
    console.warn('[partners] maintenance flag listener failed:', err.message);
    paint(false);
  });

  btn.addEventListener('click', async () => {
    const currentlyOffline = card.classList.contains('bm-store--offline');
    const nextEnabled = !currentlyOffline;
    const ok = await Swal.fire({
      icon: nextEnabled ? 'warning' : 'question',
      title: nextEnabled ? 'Take BankiBites Groceries storefront offline?' : 'Bring BankiBites Groceries back online?',
      html: nextEnabled
        ? "Customers won't be able to place new grocery orders and will see the maintenance screen instead. Existing orders keep working."
        : 'Customers can place new grocery orders again.',
      showCancelButton: true,
      confirmButtonText: nextEnabled ? 'Take offline' : 'Bring online',
      confirmButtonColor: nextEnabled ? '#dc2626' : '#16a34a',
      reverseButtons: true,
    });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Saving…');
      await setDoc(ref, {
        enabled: nextEnabled,
        updated_at: Timestamp.now(),
      }, { merge: true });
      // Bust the tab-session cache so Dashboard's next check hits fresh state.
      if (typeof window.bbGroceryMaintenanceInvalidate === 'function') {
        window.bbGroceryMaintenanceInvalidate();
      }
      window.bbDone();
    } catch (err) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    }
  });
}

async function renderPartnerCharts(db) {
  const p = chartPalette();
  // Same window as the rest of the admin panel: from the 1st of last month.
  const sinceTs = Timestamp.fromDate(startOfLastMonth());
  const [partnersSnap, ordersSnap] = await Promise.all([
    getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order'))),
    getDocs(query(collection(db, COL.ORDERS), where('created_at', '>=', sinceTs))),
  ]);
  const partners = []; partnersSnap.forEach(d => partners.push({ id: d.id, ...d.data() }));
  const orders = []; ordersSnap.forEach(d => orders.push({ id: d.id, ...d.data() }));

  const g = groupBy(orders.filter(isDelivered), o => o.restaurant_name || o.restaurant_id || 'Unknown');
  const top = topN(g, 8);
  const topNames = top.map(([k]) => k);

  mountPartnerChart('partnersOrders', {
    type: 'bar',
    data: {
      labels: topNames.map(n => truncateName(n, 10)),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: ctx => topNames[ctx[0].dataIndex] } },
      },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  const removed = partners.filter(x => x.is_removed === true).length;
  const activeVisible = partners.filter(x => x.is_active !== false && x.is_removed !== true).length;
  const closedVisible = partners.length - removed - activeVisible;
  mountPartnerChart('partnersActive', {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Closed', 'Removed'],
      datasets: [{ data: [activeVisible, closedVisible, removed], backgroundColor: [p.status.delivered, p.status.pending || p.muted, p.muted], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });

  const sorted = [...partners].sort((a, b) => (+b.rating || 0) - (+a.rating || 0));
  const ratingNames = sorted.map(x => x.name || '');
  mountPartnerChart('partnersRatings', {
    type: 'bar',
    data: {
      labels: ratingNames.map(n => truncateName(n, 10)),
      datasets: [{ label: 'Rating', data: sorted.map(x => +x.rating || 0), backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: ctx => ratingNames[ctx[0].dataIndex] } },
      },
      scales: { y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }, x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } } },
    },
  });
}

async function loadPartners(db, root) {
  const list = root.querySelector('#partnersList');
  list.innerHTML = '<div class="bb-loader-block">Loading restaurants…</div>';
  const q = query(collection(db, COL.PARTNERS), orderBy('sort_order'));
  const snap = await getDocs(q);
  if (snap.empty) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-store"></i><p>No partners yet.</p></div>`;
    return;
  }
  list.innerHTML = '';
  snap.forEach(d => list.appendChild(renderCard(db, root, d.id, d.data())));
}

function renderCard(db, root, id, p) {
  const el = document.createElement('div');
  el.className = 'entity-card partner-card';
  const closeIcon = p.is_active ? 'fa-store-slash' : 'fa-store';
  const closeLabel = p.is_active ? 'Close' : 'Open';
  const closeBtnClass = p.is_active ? 'icon-btn--warn' : 'icon-btn--success';
  const statusPill = p.is_removed
    ? '<span class="status-pill status-cancelled">Removed</span>'
    : (!p.is_active ? '<span class="status-pill status-cancelled">Closed</span>' : '');

  const pocPhone = normalisePhone(p.point_of_contact);
  const callBtn = pocPhone
    ? `<a class="icon-btn icon-btn--success" href="tel:${escapeAttr(pocPhone)}" title="Call ${escapeAttr(p.point_of_contact)}" aria-label="Call point of contact for ${escapeAttr(p.name)}">
         <i class="fas fa-phone"></i>
       </a>`
    : '';

  const closedBtn = (!p.is_active && pocPhone)
    ? `<button class="icon-btn icon-btn--warn" data-act="notify-closed" title="Notify: closed per request" aria-label="Notify ${escapeAttr(p.name)}: closed per request">
         <i class="fas fa-store-slash"></i>
       </button>`
    : '';

  const blockBtn = pocPhone
    ? `<button class="icon-btn icon-btn--danger" data-act="notify-blocked" title="Block: notify restaurant for missing order" aria-label="Block notify ${escapeAttr(p.name)}">
         <i class="fas fa-ban"></i>
       </button>`
    : '';

  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">
          <span class="partner-pos" title="Position">#${p.sort_order ?? '–'}</span>
          <span title="${escapeAttr(p.name || '')}">${escapeHtml(truncateName(p.name || ''))}</span>
          ${statusPill}
        </div>
        <div class="ec-meta">${(p.services || []).join(' · ')} · ★ ${p.rating} · ${p.opening_hour}–${p.closing_hour}</div>
        <div class="ec-meta">${escapeHtml(p.address || '')}</div>
        ${p.point_of_contact ? `<div class="ec-meta"><i class="fas fa-user-tie"></i> ${escapeHtml(p.point_of_contact)}</div>` : ''}
      </div>
      <button class="icon-btn icon-btn--secondary" data-act="edit" title="Edit" aria-label="Edit ${escapeAttr(p.name)}">
        <i class="fas fa-pen"></i>
      </button>
    </div>
    <div class="ec-actions ec-actions--bottom">
      <button class="icon-btn ${closeBtnClass}" data-act="toggle" title="${closeLabel}" aria-label="${closeLabel} ${escapeAttr(p.name)}">
        <i class="fas ${closeIcon}"></i>
      </button>
      ${callBtn}
      ${closedBtn}
      ${blockBtn}
      <button class="icon-btn icon-btn--danger" data-act="del" title="Delete" aria-label="Delete ${escapeAttr(p.name)}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(db, { id, ...p }, root));
  el.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
    const action = p.is_active ? 'Close' : 'Open';
    const ok = await Swal.fire({
      title: `${action} ${p.name}?`,
      text: p.is_active
        ? 'This partner will be marked as Closed on the public list — still visible, but not orderable.'
        : 'This partner will be marked as Open on the public list.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action,
      confirmButtonColor: p.is_active ? '#f59e0b' : '#16a34a',
    });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Updating…');
      await setDoc(doc(db, COL.PARTNERS, id), { is_active: !p.is_active }, { merge: true });
      // Removed partners stay closed regardless of is_active flip.
      const nextShopStatus = (!p.is_active && !p.is_removed) ? 'open' : 'closed';
      await syncToPartnerAdmin(db, p.sync_collection, p.sync_doc_id, { shop_status: nextShopStatus });
      window.bbDone();
      loadPartners(db, root);
    } catch (err) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
  });
  if (!p.is_active && pocPhone) {
    el.querySelector('[data-act="notify-closed"]').addEventListener('click', () => {
      notifyPartnerWhatsApp(pocPhone, 'closed', p.name);
    });
  }
  if (pocPhone) {
    el.querySelector('[data-act="notify-blocked"]').addEventListener('click', () => {
      notifyPartnerWhatsApp(pocPhone, 'blocked', p.name);
    });
  }
  el.querySelector('[data-act="del"]').addEventListener('click', async () => {
    const ok = await Swal.fire({
      title: `Delete ${p.name}?`,
      text: 'This action cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      confirmButtonColor: '#dc3545',
    });
    if (!ok.isConfirmed) return;
    try {
      window.bbBusy('Deleting…');
      await deleteDoc(doc(db, COL.PARTNERS, id));
      await resequencePartners(db);
      window.bbDone();
      loadPartners(db, root);
    } catch (err) {
      window.bbDone();
      Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message });
    }
  });
  return el;
}

// Re-number all partners 1..N by their current sort order, plugging any gaps
// (e.g., after a delete) so positions stay contiguous.
async function resequencePartners(db) {
  const snap = await getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order')));
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, sort_order: d.data().sort_order ?? 0 }));
  const batch = writeBatch(db);
  docs.forEach((d, idx) => {
    const target = idx + 1;
    if (d.sort_order !== target) {
      batch.update(doc(db, COL.PARTNERS, d.id), { sort_order: target });
    }
  });
  await batch.commit();
}

async function openEditor(db, existing, root) {
  const p = existing || { ...EMPTY };

  // Pre-load the current partner list so we can clamp sort position and
  // auto-reorder siblings on save.
  window.bbBusy('Loading…');
  let allSnap;
  try {
    allSnap = await getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order')));
  } finally {
    window.bbDone();
  }
  const existingList = [];
  allSnap.forEach(d => existingList.push({ id: d.id, ...d.data() }));
  const isNew = !existing;
  const maxPos = isNew ? existingList.length + 1 : existingList.length;
  const minPos = existingList.length === 0 ? 1 : 1;
  const currentPos = p.sort_order || maxPos;

  const html = `
    <form id="partnerForm" class="text-left">
      <div class="form-group"><label>Name</label><input class="form-control" name="name" value="${escapeAttr(p.name)}" required></div>
      <div class="form-group"><label>Logo URL</label><input class="form-control" name="logo" value="${escapeAttr(p.logo)}" required></div>
      <div class="form-group"><label>Order URL</label><input class="form-control" name="url" value="${escapeAttr(p.url)}" required></div>
      <div class="form-group"><label>Services (comma-separated)</label><input class="form-control" name="services" value="${escapeAttr((p.services||[]).join(', '))}"></div>
      <div class="form-row">
        <div class="form-group col-6"><label>Rating</label><input class="form-control" type="number" step="0.1" min="0" max="5" name="rating" value="${p.rating}"></div>
        <div class="form-group col-6">
          <label>Position (1–${maxPos})</label>
          <input class="form-control" type="number" name="sort_order" min="${minPos}" max="${maxPos}" value="${currentPos}">
          <small class="text-muted">Out-of-range values are clamped to the end.</small>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group col-6"><label>Open hour (0-23)</label><input class="form-control" name="opening_hour" value="${escapeAttr(p.opening_hour)}"></div>
        <div class="form-group col-6"><label>Close hour (0-23)</label><input class="form-control" name="closing_hour" value="${escapeAttr(p.closing_hour)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group col-6"><label>Break start hour (0-23, optional)</label><input class="form-control" name="break_start_hour" value="${escapeAttr(p.break_start_hour || '')}"></div>
        <div class="form-group col-6"><label>Break end hour (0-23, optional)</label><input class="form-control" name="break_end_hour" value="${escapeAttr(p.break_end_hour || '')}"></div>
      </div>
      <small class="text-muted d-block" style="margin-top:-.25rem;margin-bottom:.75rem">Leave both blank for no break. Break must fall inside open/close hours.</small>
      <div class="form-group"><label>Address</label><textarea class="form-control" name="address" rows="2">${escapeHtml(p.address)}</textarea></div>
      <div class="form-group">
        <label>Point of contact (10-digit mobile) <span class="text-danger">*</span></label>
        <input class="form-control" name="point_of_contact" inputmode="tel" maxlength="15"
               value="${escapeAttr(p.point_of_contact || '')}" required>
        <small class="text-muted">Phone number to call when an order needs follow-up.</small>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsActive" name="is_active" ${p.is_active ? 'checked' : ''}>
        <label class="form-check-label" for="paIsActive">Active (orderable on public page)</label>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsRemoved" name="is_removed" ${p.is_removed ? 'checked' : ''}>
        <label class="form-check-label" for="paIsRemoved">Removed (fully hide from public list)</label>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsVeg" name="is_veg" ${p.is_veg ? 'checked' : ''}>
        <label class="form-check-label" for="paIsVeg">Pure Veg (serves only vegetarian food)</label>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsHomemade" name="is_homemade" ${p.is_homemade ? 'checked' : ''}>
        <label class="form-check-label" for="paIsHomemade">Home Made (food prepared at home kitchen)</label>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsSeparatePrice" name="is_separate_price" ${p.is_separate_price ? 'checked' : ''}>
        <label class="form-check-label" for="paIsSeparatePrice">Limited Area Delivery (delivers only within a restricted area)</label>
      </div>
      <details class="mt-2">
        <summary class="text-muted" style="font-size:.85em;cursor:pointer">Advanced (admin panel sync)</summary>
        <div class="form-row mt-2">
          <div class="form-group col-6">
            <label>Collection <small class="text-muted">(Firestore collection name)</small></label>
            <input class="form-control" name="sync_collection" value="${escapeAttr(p.sync_collection || '')}">
          </div>
          <div class="form-group col-6">
            <label>Document ID</label>
            <input class="form-control" name="sync_doc_id" value="${escapeAttr(p.sync_doc_id || '')}">
          </div>
        </div>
        <small class="text-muted d-block" style="margin-top:-.5rem">When both are set, hiding/showing this partner and editing hours will sync to that restaurant's own admin panel.</small>
      </details>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${p.name}` : 'Add partner',
    html, showCancelButton: true, confirmButtonText: 'Save', width: 560,
    didOpen: () => {
      // Auto-normalise the point-of-contact phone on blur so the visible value
      // mirrors what gets saved (strips +91 / spaces / dashes / parens etc.).
      const phoneInput = document.querySelector('#partnerForm [name="point_of_contact"]');
      if (phoneInput) {
        const norm = () => { const n = normalisePhone(phoneInput.value); if (n !== phoneInput.value) phoneInput.value = n; };
        phoneInput.addEventListener('blur', norm);
        phoneInput.addEventListener('paste', () => setTimeout(norm, 0));
      }
    },
    preConfirm: () => {
      const f = document.getElementById('partnerForm');
      const fd = new FormData(f);
      const pocRaw = (fd.get('point_of_contact') || '').toString().trim();
      const data = {
        name: fd.get('name').trim(),
        logo: fd.get('logo').trim(),
        url:  fd.get('url').trim(),
        services: fd.get('services').split(',').map(s => s.trim()).filter(Boolean),
        rating: parseFloat(fd.get('rating')) || 0,
        sort_order: parseInt(fd.get('sort_order')) || maxPos,
        opening_hour: fd.get('opening_hour').trim(),
        closing_hour: fd.get('closing_hour').trim(),
        break_start_hour: (fd.get('break_start_hour') || '').trim(),
        break_end_hour:   (fd.get('break_end_hour')   || '').trim(),
        address: fd.get('address').trim(),
        point_of_contact: pocRaw ? normalisePhone(pocRaw) : '',
        is_active: f.querySelector('#paIsActive').checked,
        is_removed: f.querySelector('#paIsRemoved').checked,
        is_veg: f.querySelector('#paIsVeg').checked,
        is_homemade: f.querySelector('#paIsHomemade').checked,
        is_separate_price: f.querySelector('#paIsSeparatePrice').checked,
        sync_collection: (fd.get('sync_collection') || '').trim(),
        sync_doc_id: (fd.get('sync_doc_id') || '').trim(),
      };
      if (!data.name || !data.url) {
        Swal.showValidationMessage('Name and URL are required');
        return false;
      }
      const oh = parseInt(data.opening_hour);
      const ch = parseInt(data.closing_hour);
      if (isNaN(oh) || oh < 0 || oh > 23) {
        Swal.showValidationMessage('Open hour must be between 0 and 23');
        return false;
      }
      if (isNaN(ch) || ch < 0 || ch > 23) {
        Swal.showValidationMessage('Close hour must be between 0 and 23');
        return false;
      }
      if (oh >= ch) {
        Swal.showValidationMessage('Open hour must be earlier than close hour');
        return false;
      }
      data.opening_hour = String(oh).padStart(2, '0');
      data.closing_hour = String(ch).padStart(2, '0');
      const bsRaw = data.break_start_hour;
      const beRaw = data.break_end_hour;
      if (bsRaw === '' && beRaw === '') {
        data.break_start_hour = '';
        data.break_end_hour = '';
      } else {
        const bs = parseInt(bsRaw);
        const be = parseInt(beRaw);
        if (isNaN(bs) || bs < 0 || bs > 23 || isNaN(be) || be < 0 || be > 23) {
          Swal.showValidationMessage('Break hours must both be between 0 and 23, or both blank');
          return false;
        }
        if (bs >= be) {
          Swal.showValidationMessage('Break start must be earlier than break end');
          return false;
        }
        if (bs < oh || be > ch) {
          Swal.showValidationMessage('Break must fall inside the open/close window');
          return false;
        }
        data.break_start_hour = String(bs).padStart(2, '0');
        data.break_end_hour   = String(be).padStart(2, '0');
      }
      // Point of contact is mandatory for both add and edit — every partner
      // must have a reachable phone before the record can be saved.
      if (!pocRaw) {
        Swal.showValidationMessage('Point of contact phone is required');
        return false;
      }
      if (!isValidPhone(pocRaw)) {
        Swal.showValidationMessage('Point of contact must be a valid 10-digit mobile number');
        return false;
      }
      return data;
    },
  });
  if (!res.isConfirmed) return;

  const id = existing?.id || res.value.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Clamp requested position, then rebuild the ordered list and assign
  // contiguous 1..N positions. Everything in a single batch for atomicity.
  let target = res.value.sort_order;
  if (!Number.isFinite(target) || target < 1) target = maxPos;
  if (target > maxPos) target = maxPos;

  const others = existingList
    .filter(x => x.id !== id)
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const insertIdx = Math.min(Math.max(target - 1, 0), others.length);
  const finalPayload = { ...res.value, sort_order: target };
  const ordered = [...others.slice(0, insertIdx), { id, _payload: finalPayload }, ...others.slice(insertIdx)];

  const batch = writeBatch(db);
  ordered.forEach((entry, idx) => {
    const newPos = idx + 1;
    if (entry._payload) {
      // The partner being saved/created.
      batch.set(doc(db, COL.PARTNERS, entry.id), { ...entry._payload, sort_order: newPos }, { merge: true });
    } else if (entry.sort_order !== newPos) {
      batch.update(doc(db, COL.PARTNERS, entry.id), { sort_order: newPos });
    }
  });
  try {
    window.bbBusy('Saving restaurant…');
    await batch.commit();
    // Partner admin schema is locked to exactly 5 keys (disabled_items,
    // whatsapp_no, shop_status, opening_time, closing_time). is_removed is a
    // BankiBites-side concept and is intentionally NOT propagated — adding it
    // would violate the partner admin's size()==5 rule.
    await syncToPartnerAdmin(db, res.value.sync_collection, res.value.sync_doc_id, {
      opening_time: String(parseInt(res.value.opening_hour) || 0),
      closing_time: String(parseInt(res.value.closing_hour) || 0),
      shop_status: (res.value.is_active && !res.value.is_removed) ? 'open' : 'closed',
    });
    window.bbDone();
  } catch (err) {
    window.bbDone();
    Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    return;
  }
  loadPartners(db, root);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
