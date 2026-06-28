import { COL } from '../firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, getDoc, onSnapshot, query, orderBy,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { fmtINR, fmtDate, fmtNum } from './analytics.js';

const CATEGORIES = [
  { key: 'service',  label: 'Service',  icon: 'fa-wrench' },
  { key: 'car_wash', label: 'Car Wash', icon: 'fa-soap' },
  { key: 'repair',   label: 'Repair',   icon: 'fa-screwdriver-wrench' },
  { key: 'salary',   label: 'Salary',   icon: 'fa-money-bill-wave' },
  { key: 'other',    label: 'Other',    icon: 'fa-ellipsis' },
];

export async function renderExpenses(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <div class="card-an ex-card">
      <button id="ex-toggle" type="button" class="ex-toggle" aria-expanded="false" aria-controls="ex-form">
        <span class="ex-toggle__label"><i class="fas fa-plus"></i> Add expense</span>
        <i class="fas fa-chevron-down ex-toggle__chevron" aria-hidden="true"></i>
      </button>
      <div id="ex-form" class="ex-form-wrap" hidden></div>
    </div>
    <div class="filter-bar mt-12" id="ex-filters"></div>
    <div class="card-an mb-12">
      <div class="card-sub" id="ex-summary" aria-live="polite" aria-atomic="true">Loading…</div>
    </div>
    <div id="ex-list" class="row-list"></div>
  `;

  // Collapse / expand the form.
  const toggleBtn = panel.querySelector('#ex-toggle');
  const formWrap  = panel.querySelector('#ex-form');
  toggleBtn.addEventListener('click', () => {
    const open = !formWrap.hidden ? false : true;
    formWrap.hidden = !open;
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggleBtn.classList.toggle('is-open', open);
  });

  // ── Driver options for Salary category ──
  let drivers = [];
  try {
    const meta = await getDoc(doc(db, COL.META, 'drivers'));
    if (meta.exists()) {
      const data = meta.data();
      const uids = data.uids || [];
      const profile = data.profile || {};
      drivers = uids.map(uid => ({ uid, ...(profile[uid] || {}) }));
    }
  } catch (_) { /* swallow */ }

  renderForm(panel.querySelector('#ex-form'), db, drivers);

  // ── Filters ──
  const filters = [
    { key: 'this_month', label: 'This month' },
    { key: 'last_month', label: 'Last month' },
    { key: 'all',        label: 'All' },
    ...CATEGORIES.map(c => ({ key: 'cat:' + c.key, label: c.label })),
  ];
  let activeFilter = 'this_month';
  const filterBar = panel.querySelector('#ex-filters');
  filters.forEach(f => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (f.key === activeFilter ? ' active' : '');
    b.textContent = f.label;
    b.addEventListener('click', () => {
      activeFilter = f.key;
      filterBar.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c === b));
      render();
    });
    filterBar.appendChild(b);
  });

  const list = panel.querySelector('#ex-list');
  const summary = panel.querySelector('#ex-summary');
  let expenses = [];

  list.innerHTML = `<div class="empty"><i class="fas fa-spinner fa-spin"></i> Loading expenses…</div>`;
  onSnapshot(query(collection(db, COL.EXPENSES), orderBy('date', 'desc')), snap => {
    expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    render();
  }, err => {
    list.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${err.message}</div>`;
  });

  function render() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 1);

    let rows = expenses.slice();
    if (activeFilter === 'this_month') {
      rows = rows.filter(e => e.date && new Date(e.date) >= monthStart);
    } else if (activeFilter === 'last_month') {
      rows = rows.filter(e => e.date && new Date(e.date) >= lastMonthStart && new Date(e.date) < lastMonthEnd);
    } else if (activeFilter.startsWith('cat:')) {
      const cat = activeFilter.slice(4);
      rows = rows.filter(e => e.category === cat);
    }

    const total = rows.reduce((a, e) => a + Number(e.amount || 0), 0);
    summary.innerHTML = `<b>${fmtNum(rows.length)}</b> expense${rows.length === 1 ? '' : 's'} · total <b>${fmtINR(total)}</b>`;

    if (!rows.length) {
      list.innerHTML = `<div class="empty"><i class="fas fa-receipt"></i> No expenses in this view.</div>`;
      return;
    }
    list.innerHTML = rows.map(e => renderRow(e, drivers)).join('');
    list.querySelectorAll('[data-del]').forEach(el => {
      el.addEventListener('click', () => deleteExpense(db, el.dataset.del));
    });
  }
}

function renderForm(host, db, drivers) {
  const today = new Date().toISOString().slice(0, 10);
  host.innerHTML = `
    <div class="f-row cols-3">
      <div class="f-group">
        <label class="f-label" for="ex-cat">Category</label>
        <select id="ex-cat" class="f-select">
          ${CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join('')}
        </select>
      </div>
      <div class="f-group">
        <label class="f-label" for="ex-date">Date</label>
        <input id="ex-date" type="date" class="f-input" value="${today}">
      </div>
      <div class="f-group">
        <label class="f-label" for="ex-amt">Amount (₹)</label>
        <input id="ex-amt" type="number" class="f-input" min="0" step="1" inputmode="numeric" placeholder="e.g. 500">
      </div>
    </div>
    <div id="ex-extra"></div>
    <button id="ex-save" class="btn-an mt-8"><i class="fas fa-plus"></i> Add expense</button>
  `;

  const catSelect = host.querySelector('#ex-cat');
  const extra = host.querySelector('#ex-extra');

  function renderExtra() {
    const cat = catSelect.value;
    if (cat === 'salary') {
      const opts = drivers.length
        ? drivers.map(d => `<option value="${escapeAttr(d.uid)}">${escapeHtml(d.name || d.uid.slice(0,8))}</option>`).join('')
        : `<option value="">— no drivers configured —</option>`;
      extra.innerHTML = `
        <div class="f-row cols-2">
          <div class="f-group">
            <label class="f-label" for="ex-driver">Driver</label>
            <select id="ex-driver" class="f-select">${opts}</select>
          </div>
          <div class="f-group">
            <label class="f-label" for="ex-note">Note (optional)</label>
            <input id="ex-note" type="text" class="f-input" placeholder="e.g. June salary">
          </div>
        </div>
      `;
    } else if (cat === 'other') {
      extra.innerHTML = `
        <div class="f-group">
          <label class="f-label" for="ex-note">Note (required for 'Other')</label>
          <input id="ex-note" type="text" class="f-input" placeholder="What is this expense for?">
        </div>
      `;
    } else {
      extra.innerHTML = `
        <div class="f-group">
          <label class="f-label" for="ex-note">Note (optional)</label>
          <input id="ex-note" type="text" class="f-input">
        </div>
      `;
    }
  }
  catSelect.addEventListener('change', renderExtra);
  renderExtra();

  host.querySelector('#ex-save').addEventListener('click', async () => {
    const category = catSelect.value;
    const date = host.querySelector('#ex-date').value;
    const amount = parseFloat(host.querySelector('#ex-amt').value);
    const note = (host.querySelector('#ex-note') && host.querySelector('#ex-note').value.trim()) || null;
    const driverSel = host.querySelector('#ex-driver');
    const driverUid = driverSel ? driverSel.value : null;

    if (!date || isNaN(amount) || amount <= 0) {
      Swal.fire('Missing fields', 'Date and a positive amount are required.', 'warning');
      return;
    }
    if (category === 'other' && !note) {
      Swal.fire('Note required', "Add a note for 'Other' expenses so the entry is recognisable later.", 'warning');
      return;
    }
    if (category === 'salary' && !driverUid) {
      Swal.fire('Driver required', "Pick a driver for the salary expense.", 'warning');
      return;
    }
    try {
      window.avBusy('Saving expense…');
      const driverProfile = drivers.find(d => d.uid === driverUid);
      await addDoc(collection(db, COL.EXPENSES), {
        category, date, amount, note,
        driver: category === 'salary' && driverProfile
          ? { uid: driverProfile.uid, name: driverProfile.name || '' }
          : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      window.avDone();
      host.querySelector('#ex-amt').value = '';
      const noteEl = host.querySelector('#ex-note');
      if (noteEl) noteEl.value = '';
      Swal.fire({ icon: 'success', title: 'Expense added', timer: 1100, showConfirmButton: false });
    } catch (e) {
      window.avDone();
      Swal.fire('Save failed', e.message || String(e), 'error');
    }
  });
}

function renderRow(e) {
  const cat = CATEGORIES.find(c => c.key === e.category) || { label: e.category, icon: 'fa-coins' };
  const driver = e.driver && e.driver.name ? ` · ${escapeHtml(e.driver.name)}` : '';
  return `
  <div class="row-card">
    <div class="row-top">
      <div class="flex-row flex-grow">
        <span class="chip"><i class="fas ${cat.icon}" aria-hidden="true"></i> ${cat.label}</span>
        <strong>${fmtINR(e.amount)}</strong>
        <span class="text-muted-an">${escapeHtml(fmtDate(e.date))}${driver}</span>
      </div>
    </div>
    ${e.note ? `<div class="row-meta"><div>${escapeHtml(e.note)}</div></div>` : ''}
    <div class="row-actions">
      <button class="btn-an btn-an-outline btn-an-sm" data-del="${e.id}" style="margin-left:auto;" aria-label="Delete expense" title="Delete"><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  </div>
  `;
}

async function deleteExpense(db, id) {
  const r = await Swal.fire({ title: 'Delete expense?', text: 'This cannot be undone.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete', confirmButtonColor: '#ef4444' });
  if (!r.isConfirmed) return;
  try {
    window.avBusy('Deleting…');
    await deleteDoc(doc(db, COL.EXPENSES, id));
    window.avDone();
  } catch (e) {
    window.avDone();
    Swal.fire('Failed', e.message || String(e), 'error');
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
