import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc, orderBy, query,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const EMPTY = {
  name: '', logo: '', url: '', services: [], rating: 4.5,
  opening_hour: '08', closing_hour: '22', address: '', is_active: true, sort_order: 0,
};

export async function renderPartners(root, db) {
  root.innerHTML = `
    <div class="section-header">
      <h3><i class="fas fa-store text-warning mr-1"></i> Partner Restaurants</h3>
      <button id="addPartnerBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add</button>
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
  el.className = 'entity-card';
  el.innerHTML = `
    <div class="ec-row">
      <div style="min-width:0;flex:1">
        <div class="ec-title">${escapeHtml(p.name)} ${p.is_active ? '' : '<span class="status-pill status-cancelled">Hidden</span>'}</div>
        <div class="ec-meta">${(p.services || []).join(' · ')} · ★ ${p.rating} · ${p.opening_hour}–${p.closing_hour}</div>
        <div class="ec-meta">${escapeHtml(p.address || '')}</div>
      </div>
    </div>
    <div class="ec-actions" style="justify-content:flex-end;flex-wrap:wrap;gap:6px">
      <button class="btn btn-sm btn-outline-${p.is_active ? 'warning' : 'success'}" data-act="toggle">
        <i class="fas fa-${p.is_active ? 'eye-slash' : 'eye'} mr-1"></i> ${p.is_active ? 'Hide' : 'Show'}
      </button>
      <button class="btn btn-sm btn-outline-secondary" data-act="edit">
        <i class="fas fa-pen mr-1"></i> Edit
      </button>
      <button class="btn btn-sm btn-outline-danger" data-act="del">
        <i class="fas fa-trash mr-1"></i> Delete
      </button>
    </div>
  `;
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(db, { id, ...p }, root));
  el.querySelector('[data-act="toggle"]').addEventListener('click', async () => {
    try {
      await setDoc(doc(db, COL.PARTNERS, id), { is_active: !p.is_active }, { merge: true });
      loadPartners(db, root);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Update failed', text: err.message });
    }
  });
  el.querySelector('[data-act="del"]').addEventListener('click', async () => {
    const ok = await Swal.fire({ title: `Delete ${p.name}?`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#dc3545' });
    if (!ok.isConfirmed) return;
    try {
      await deleteDoc(doc(db, COL.PARTNERS, id));
      loadPartners(db, root);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message });
    }
  });
  return el;
}

async function openEditor(db, existing, root) {
  const p = existing || { ...EMPTY };
  const html = `
    <form id="partnerForm" class="text-left">
      <div class="form-group"><label>Name</label><input class="form-control" name="name" value="${escapeAttr(p.name)}" required></div>
      <div class="form-group"><label>Logo URL</label><input class="form-control" name="logo" value="${escapeAttr(p.logo)}" required></div>
      <div class="form-group"><label>Order URL</label><input class="form-control" name="url" value="${escapeAttr(p.url)}" required></div>
      <div class="form-group"><label>Services (comma-separated)</label><input class="form-control" name="services" value="${escapeAttr((p.services||[]).join(', '))}"></div>
      <div class="form-row">
        <div class="form-group col-6"><label>Rating</label><input class="form-control" type="number" step="0.1" min="0" max="5" name="rating" value="${p.rating}"></div>
        <div class="form-group col-6"><label>Sort</label><input class="form-control" type="number" name="sort_order" value="${p.sort_order || 0}"></div>
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
        sort_order: parseInt(fd.get('sort_order')) || 0,
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
  await setDoc(doc(db, COL.PARTNERS, id), res.value, { merge: true });
  loadPartners(db, root);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
