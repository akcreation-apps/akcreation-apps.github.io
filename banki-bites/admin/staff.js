import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, deleteDoc,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { Timestamp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

// Note: Creating a Firebase Auth user requires the Admin SDK (server-side) or the
// Firebase console. This screen manages the staff *directory* doc — you must create
// the Auth account in the Firebase console first, then paste the UID here.
// Doc id MUST equal the Firebase Auth UID for security rules to authorise the user.

export async function renderStaff(root, db) {
  root.innerHTML = `
    <div class="section-header">
      <h3><i class="fas fa-motorcycle text-success mr-1"></i> Delivery Staff</h3>
      <button id="addStaffBtn" class="btn btn-sm btn-primary"><i class="fas fa-plus mr-1"></i> Add</button>
    </div>
    <div class="text-muted mb-2" style="font-size:0.82rem">
      <i class="fas fa-info-circle"></i> Create the Auth account in Firebase Console first
      (Authentication → Users → Add user, email + password). Then paste the resulting UID here.
    </div>
    <div id="staffList" class="card-list"><p class="text-muted">Loading…</p></div>
  `;
  document.getElementById('addStaffBtn').addEventListener('click', () => openEditor(db, null, root));
  await loadStaff(db, root);
}

async function loadStaff(db, root) {
  const list = root.querySelector('#staffList');
  list.innerHTML = '<p class="text-muted">Loading…</p>';
  const snap = await getDocs(collection(db, COL.STAFF));
  if (snap.empty) {
    list.innerHTML = `<div class="empty-state"><i class="fas fa-motorcycle"></i><p>No delivery partners yet.</p></div>`;
    return;
  }
  list.innerHTML = '';
  snap.forEach(d => list.appendChild(renderCard(db, root, d.id, d.data())));
}

function renderCard(db, root, uid, s) {
  const el = document.createElement('div');
  el.className = 'entity-card';
  el.innerHTML = `
    <div class="ec-row">
      <div>
        <div class="ec-title">${escapeHtml(s.name)} ${s.is_active === false ? '<span class="status-pill status-cancelled">Inactive</span>' : ''}</div>
        <div class="ec-meta"><i class="fas fa-envelope"></i> ${escapeHtml(s.email||'')}</div>
        <div class="ec-meta"><i class="fas fa-phone"></i> ${escapeHtml(s.phone||'')}</div>
        <div class="ec-meta" style="font-family:monospace;font-size:0.7rem">${uid}</div>
      </div>
      <div class="ec-actions">
        <button class="btn btn-outline-secondary btn-sm" data-act="edit"><i class="fas fa-pen"></i></button>
        <button class="btn btn-outline-danger btn-sm" data-act="del"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `;
  el.querySelector('[data-act="edit"]').addEventListener('click', () => openEditor(db, { uid, ...s }, root));
  el.querySelector('[data-act="del"]').addEventListener('click', async () => {
    const ok = await Swal.fire({ title: `Remove ${s.name}?`, text: 'This only removes the directory entry; delete the Auth user separately in Firebase Console.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc3545' });
    if (!ok.isConfirmed) return;
    await deleteDoc(doc(db, COL.STAFF, uid));
    loadStaff(db, root);
  });
  return el;
}

async function openEditor(db, existing, root) {
  const s = existing || { uid: '', name: '', email: '', phone: '', is_active: true };
  const html = `
    <form id="staffForm" class="text-left">
      <div class="form-group">
        <label>Firebase Auth UID ${existing ? '(read-only)' : ''}</label>
        <input class="form-control" name="uid" value="${escapeAttr(s.uid)}" ${existing ? 'readonly' : 'required'}>
        <small class="text-muted">From Firebase Console → Authentication → Users.</small>
      </div>
      <div class="form-group"><label>Name</label><input class="form-control" name="name" value="${escapeAttr(s.name)}" required></div>
      <div class="form-group"><label>Email</label><input class="form-control" type="email" name="email" value="${escapeAttr(s.email)}" required></div>
      <div class="form-group"><label>Phone</label><input class="form-control" name="phone" value="${escapeAttr(s.phone)}" inputmode="tel"></div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" id="staffActive" ${s.is_active !== false ? 'checked' : ''}>
        <label class="form-check-label" for="staffActive">Active</label>
      </div>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${s.name}` : 'Add delivery partner',
    html, showCancelButton: true, confirmButtonText: 'Save', width: 500,
    preConfirm: () => {
      const f = document.getElementById('staffForm');
      const fd = new FormData(f);
      const data = {
        uid: fd.get('uid').trim(),
        name: fd.get('name').trim(),
        email: fd.get('email').trim(),
        phone: fd.get('phone').trim(),
        is_active: f.querySelector('#staffActive').checked,
      };
      if (!data.uid || !data.name || !data.email) {
        Swal.showValidationMessage('UID, name and email are required');
        return false;
      }
      return data;
    },
  });
  if (!res.isConfirmed) return;
  const { uid, ...payload } = res.value;
  if (!existing) payload.created_at = Timestamp.now();
  await setDoc(doc(db, COL.STAFF, uid), payload, { merge: true });
  loadStaff(db, root);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
