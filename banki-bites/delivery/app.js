import { getDb, getAuthInstance, COL } from '../firebase-config.js';
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
  const card = document.createElement('div');
  card.className = 'entity-card';
  const c = o.customer || {};
  const created = o.created_at?.toDate ? o.created_at.toDate() : new Date();
  const itemsHtml = (o.items || []).map(i =>
    `<li>${i.qty} × ${escapeHtml(i.name)}</li>`
  ).join('');

  card.innerHTML = `
    <div class="ec-row">
      <div>
        <div class="ec-title">${escapeHtml(o.restaurant_name || o.restaurant_id || '?')} · ₹${o.total ?? '?'}</div>
        <div class="ec-meta">${created.toLocaleString('en-IN')}</div>
      </div>
      <span class="status-pill status-${o.status}">${(o.status||'').replace('_',' ')}</span>
    </div>

    <div class="addr-block">
      <div class="name">${escapeHtml(c.name || '— customer name pending —')}</div>
      <div class="addr">${escapeHtml(c.address || 'No address yet')}</div>
    </div>

    <details>
      <summary class="ec-meta" style="cursor:pointer;user-select:none">${(o.items||[]).length} items</summary>
      <ul class="order-items">${itemsHtml}</ul>
    </details>

    <div class="delivery-actions">
      <a class="btn call-btn ${c.phone ? '' : 'disabled'}" href="${c.phone ? 'tel:' + c.phone : '#'}" ${c.phone ? '' : 'aria-disabled="true"'}>
        <i class="fas fa-phone"></i> ${c.phone ? 'Call' : 'No phone'}
      </a>
      <button class="btn done-btn" data-act="next">
        <i class="fas fa-check"></i> ${o.status === 'assigned' ? 'Pick up' : (o.status === 'out_for_delivery' ? 'Delivered' : 'Update')}
      </button>
    </div>
  `;

  card.querySelector('[data-act="next"]').addEventListener('click', async () => {
    let next = 'out_for_delivery';
    if (o.status === 'out_for_delivery') next = 'delivered';
    const patch = { status: next };
    if (next === 'delivered') patch.delivered_at = Timestamp.now();
    try {
      await updateDoc(doc(db, COL.ORDERS, o.id), patch);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Update failed', text: e.message });
    }
  });

  return card;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
