import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, where, writeBatch, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { groupBy, topN, chartPalette, whenChartReady, wireStatsBlockResize, startOfLastMonth } from '../analytics.js';

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
  opening_hour: '08', closing_hour: '22', address: '', point_of_contact: '',
  is_active: true, sort_order: 0,
};

// Normalise a typed Indian phone to 10 digits (strip +91/91/0 prefix, spaces,
// dashes, parens). Returns the trailing 10 digits if recognisable, else ''.
function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s;
}
function isValidPhone(raw) {
  return /^\d{10}$/.test(normalisePhone(raw));
}

export async function renderPartners(root, db) {
  root.innerHTML = `
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
    <div id="partnersList" class="card-list"><p class="text-muted">Loading…</p></div>
  `;
  document.getElementById('addPartnerBtn').addEventListener('click', () => openEditor(db, null, root));
  try { await whenChartReady(); } catch (e) { console.warn('[partners] Chart.js unavailable:', e.message); }
  wireStatsBlockResize(root.querySelector('.stats-block'));
  await loadPartners(db, root);
  await renderPartnerCharts(db);
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

  const g = groupBy(orders, o => o.restaurant_name || o.restaurant_id || 'Unknown');
  const top = topN(g, 8);

  mountPartnerChart('partnersOrders', {
    type: 'bar',
    data: {
      labels: top.map(([k]) => k),
      datasets: [{ label: 'Orders', data: top.map(([, v]) => v), backgroundColor: p.series, borderWidth: 0 }],
    },
    options: {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  const active = partners.filter(x => x.is_active !== false).length;
  const hidden = partners.length - active;
  mountPartnerChart('partnersActive', {
    type: 'doughnut',
    data: {
      labels: ['Active', 'Hidden'],
      datasets: [{ data: [active, hidden], backgroundColor: [p.status.delivered, p.muted], borderWidth: 0 }],
    },
    options: { plugins: { legend: { position: 'bottom' } }, cutout: '60%' },
  });

  const sorted = [...partners].sort((a, b) => (+b.rating || 0) - (+a.rating || 0));
  mountPartnerChart('partnersRatings', {
    type: 'bar',
    data: {
      labels: sorted.map(x => x.name),
      datasets: [{ label: 'Rating', data: sorted.map(x => +x.rating || 0), backgroundColor: p.brand, borderWidth: 0 }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } }, x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } } },
    },
  });
}

async function loadPartners(db, root) {
  const list = root.querySelector('#partnersList');
  list.innerHTML = '<p class="text-muted">Loading…</p>';
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
  const hideIcon = p.is_active ? 'fa-eye-slash' : 'fa-eye';
  const hideLabel = p.is_active ? 'Hide' : 'Show';
  const hideClass = p.is_active ? 'icon-btn--warn' : 'icon-btn--success';

  const pocPhone = normalisePhone(p.point_of_contact);
  const callBtn = pocPhone
    ? `<a class="icon-btn icon-btn--success" href="tel:${escapeAttr(pocPhone)}" title="Call ${escapeAttr(p.point_of_contact)}" aria-label="Call point of contact for ${escapeAttr(p.name)}">
         <i class="fas fa-phone"></i>
       </a>`
    : '';

  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">
          <span class="partner-pos" title="Position">#${p.sort_order ?? '–'}</span>
          ${escapeHtml(p.name)}
          ${p.is_active ? '' : '<span class="status-pill status-cancelled">Hidden</span>'}
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
      <button class="icon-btn ${hideClass}" data-act="toggle" title="${hideLabel}" aria-label="${hideLabel} ${escapeAttr(p.name)}">
        <i class="fas ${hideIcon}"></i>
      </button>
      ${callBtn}
      <button class="icon-btn icon-btn--danger" data-act="del" title="Delete" aria-label="Delete ${escapeAttr(p.name)}">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `;
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(db, { id, ...p }, root));
  el.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
    const action = p.is_active ? 'Hide' : 'Show';
    const ok = await Swal.fire({
      title: `${action} ${p.name}?`,
      text: p.is_active
        ? 'This partner will be hidden from the public list until you show it again.'
        : 'This partner will become visible on the public list.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: action,
      confirmButtonColor: p.is_active ? '#f59e0b' : '#16a34a',
    });
    if (!ok.isConfirmed) return;
    try {
      await setDoc(doc(db, COL.PARTNERS, id), { is_active: !p.is_active }, { merge: true });
      loadPartners(db, root);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
  });
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
      await deleteDoc(doc(db, COL.PARTNERS, id));
      await resequencePartners(db);
      loadPartners(db, root);
    } catch (err) {
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
  const allSnap = await getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order')));
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
      <div class="form-group"><label>Address</label><textarea class="form-control" name="address" rows="2">${escapeHtml(p.address)}</textarea></div>
      <div class="form-group">
        <label>Point of contact (10-digit mobile) <span class="text-danger">*</span></label>
        <input class="form-control" name="point_of_contact" inputmode="tel" maxlength="15"
               value="${escapeAttr(p.point_of_contact || '')}" required>
        <small class="text-muted">Phone number to call when an order needs follow-up.</small>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsActive" name="is_active" ${p.is_active ? 'checked' : ''}>
        <label class="form-check-label" for="paIsActive">Active (visible on public page)</label>
      </div>
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
        phoneInput.addEventListener('blur', () => {
          const n = normalisePhone(phoneInput.value);
          if (n) phoneInput.value = n;
        });
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
        address: fd.get('address').trim(),
        point_of_contact: pocRaw ? normalisePhone(pocRaw) : '',
        is_active: f.querySelector('#paIsActive').checked,
      };
      if (!data.name || !data.url) {
        Swal.showValidationMessage('Name and URL are required');
        return false;
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
    await batch.commit();
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    return;
  }
  loadPartners(db, root);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
