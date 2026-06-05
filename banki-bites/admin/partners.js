import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, orderBy, query, writeBatch,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const EMPTY = {
  name: '', logo: '', url: '', services: [], rating: 4.5,
  opening_hour: '08', closing_hour: '22', address: '', is_active: true, sort_order: 0,
};

export async function renderPartners(root, db) {
  root.innerHTML = `
    <div class="section-header section-header--compact section-header--end">
      <button id="addPartnerBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add partner</button>
    </div>
    <div id="partnersList" class="card-list"><p class="text-muted">Loading…</p></div>
  `;
  document.getElementById('addPartnerBtn').addEventListener('click', () => openEditor(db, null, root));
  await loadPartners(db, root);
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
      </div>
      <button class="icon-btn icon-btn--secondary" data-act="edit" title="Edit" aria-label="Edit ${escapeAttr(p.name)}">
        <i class="fas fa-pen"></i>
      </button>
    </div>
    <div class="ec-actions ec-actions--bottom">
      <button class="icon-btn ${hideClass}" data-act="toggle" title="${hideLabel}" aria-label="${hideLabel} ${escapeAttr(p.name)}">
        <i class="fas ${hideIcon}"></i>
      </button>
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
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="paIsActive" name="is_active" ${p.is_active ? 'checked' : ''}>
        <label class="form-check-label" for="paIsActive">Active (visible on public page)</label>
      </div>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${p.name}` : 'Add partner',
    html, showCancelButton: true, confirmButtonText: 'Save', width: 560,
    preConfirm: () => {
      const f = document.getElementById('partnerForm');
      const fd = new FormData(f);
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
        is_active: f.querySelector('#paIsActive').checked,
      };
      if (!data.name || !data.url) {
        Swal.showValidationMessage('Name and URL are required');
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
