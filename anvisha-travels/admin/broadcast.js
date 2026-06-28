import { COL } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import {
  lifecycleBucket, daysBetween, toDateSafe, normalisePhone, buildWaUrl, fmtDate, fmtNum,
} from './analytics.js';

const QUEUE_KEY = 'av_broadcast_queue_v1';

const SEGMENTS = [
  { key: 'all',     label: 'All customers', match: () => true },
  { key: 'active',  label: 'Active (≤30d)',  match: c => c._bucket === 'active' },
  { key: 'cooling', label: 'Cooling (31–60d)', match: c => c._bucket === 'cooling' },
  { key: 'lapsed',  label: 'Lapsed (61–120d)', match: c => c._bucket === 'lapsed' },
  { key: 'lost',    label: 'Lost (>120d)',  match: c => c._bucket === 'lost' },
  { key: 'never',   label: 'Never travelled', match: c => c._bucket === 'never' },
];

export async function renderBroadcast(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-bullhorn"></i> Broadcast</h2>
    <div class="card-an">
      <div class="card-head" style="margin-bottom:8px;"><h3 class="card-title">1 · Pick a segment</h3></div>
      <div class="filter-bar" id="seg-bar"></div>
      <div class="card-sub" id="seg-summary">Loading customers…</div>
    </div>
    <div class="card-an">
      <div class="card-head" style="margin-bottom:8px;"><h3 class="card-title">2 · Compose message</h3></div>
      <div class="f-group mb-12">
        <label class="f-label">Message body — use <code>{name}</code> as a placeholder</label>
        <textarea id="bc-text" class="f-textarea" rows="5">Hi {name}! This is Anvisha Travels. Need a cab? We're available 24/7 around Banki & Cuttack. Reply here to book.</textarea>
      </div>
      <div class="flex-row">
        <button id="bc-queue" class="btn-an"><i class="fas fa-list-check"></i> Queue this segment</button>
        <button id="bc-clear" class="btn-an btn-an-outline btn-an-sm"><i class="fas fa-times"></i> Clear queue</button>
      </div>
    </div>
    <div class="card-an">
      <div class="card-head" style="margin-bottom:8px;"><h3 class="card-title">3 · Send (one at a time)</h3></div>
      <div id="bc-queue-view"></div>
    </div>
  `;

  let customers = [];
  let active = 'active';
  try {
    window.avBusy('Loading customers…');
    const snap = await getDocs(collection(db, COL.CUSTOMERS));
    customers = snap.docs.map(d => {
      const c = { id: d.id, ...d.data() };
      const last = toDateSafe(c.lastTripAt);
      c._days = last ? daysBetween(last, new Date()) : null;
      c._bucket = lifecycleBucket(c._days);
      return c;
    });
    window.avDone();
  } catch (e) {
    window.avDone();
    panel.innerHTML += `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed: ${e.message}</div>`;
    return;
  }

  const segBar = panel.querySelector('#seg-bar');
  SEGMENTS.forEach(s => {
    const b = document.createElement('button');
    b.className = 'filter-chip' + (s.key === active ? ' active' : '');
    b.textContent = s.label;
    b.addEventListener('click', () => {
      active = s.key;
      segBar.querySelectorAll('.filter-chip').forEach(x => x.classList.toggle('active', x === b));
      updateSummary();
    });
    segBar.appendChild(b);
  });

  const summary = panel.querySelector('#seg-summary');
  function getSelected() {
    const s = SEGMENTS.find(x => x.key === active);
    return customers.filter(c => c.phone && s.match(c));
  }
  function updateSummary() {
    const sel = getSelected();
    summary.innerHTML = `<b>${fmtNum(sel.length)}</b> customer${sel.length === 1 ? '' : 's'} match this segment (with phone on file).`;
  }
  updateSummary();

  panel.querySelector('#bc-queue').addEventListener('click', () => {
    const sel = getSelected();
    const text = panel.querySelector('#bc-text').value.trim();
    if (!text) { Swal.fire('Empty message', 'Write a message first.', 'warning'); return; }
    if (!sel.length) { Swal.fire('Empty segment', 'No customers in this segment.', 'info'); return; }
    const queue = sel.map(c => ({
      id: c.id,
      name: c.name || '',
      phone: c.phone || c.id,
      text: text.replace(/\{name\}/g, c.name || 'there'),
      sent: false,
    }));
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    renderQueue();
    Swal.fire({ icon: 'success', title: `Queued ${queue.length}`, timer: 1200, showConfirmButton: false });
  });
  panel.querySelector('#bc-clear').addEventListener('click', () => {
    localStorage.removeItem(QUEUE_KEY);
    renderQueue();
  });

  renderQueue();

  function renderQueue() {
    const queueView = panel.querySelector('#bc-queue-view');
    const raw = localStorage.getItem(QUEUE_KEY);
    let queue = [];
    try { queue = raw ? JSON.parse(raw) : []; } catch (_) { queue = []; }
    if (!queue.length) {
      queueView.innerHTML = `<div class="empty"><i class="fas fa-inbox"></i> Queue is empty.</div>`;
      return;
    }
    const sent = queue.filter(x => x.sent).length;
    queueView.innerHTML = `
      <p class="card-sub mb-12"><b>${sent}</b> / ${queue.length} sent. Each send opens WhatsApp in this tab — confirm and return here to continue.</p>
      <div class="row-list">
        ${queue.map((q, i) => `
          <div class="row-card">
            <div class="row-top">
              <div class="flex-row flex-grow">
                <strong>${escapeHtml(q.name || 'Unnamed')}</strong>
                <span class="text-muted-an">+91 ${escapeHtml(q.phone)}</span>
              </div>
              <span class="chip ${q.sent ? 'completed' : 'new'}">${q.sent ? 'Sent' : 'Pending'}</span>
            </div>
            <div class="row-meta">
              <div style="white-space:pre-wrap; font-size:12px; color:var(--text-2);">${escapeHtml(q.text)}</div>
            </div>
            <div class="row-actions">
              ${q.sent ? '' : `<button class="btn-an btn-an-sm" data-send="${i}"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button>`}
              <button class="btn-an btn-an-outline btn-an-sm" data-remove="${i}" style="margin-left:auto;"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    queueView.querySelectorAll('[data-send]').forEach(el => {
      el.addEventListener('click', () => sendAt(parseInt(el.dataset.send, 10)));
    });
    queueView.querySelectorAll('[data-remove]').forEach(el => {
      el.addEventListener('click', () => { removeAt(parseInt(el.dataset.remove, 10)); });
    });

    async function sendAt(i) {
      const raw2 = localStorage.getItem(QUEUE_KEY);
      const queue2 = raw2 ? JSON.parse(raw2) : [];
      const q = queue2[i];
      if (!q) return;
      const phone = normalisePhone(q.phone);
      if (!phone) { Swal.fire('Bad phone', 'Phone is not valid.', 'warning'); return; }
      // Mobile WhatsApp needs a fresh user gesture; the Swal confirm provides it.
      const r = await Swal.fire({
        title: 'Open WhatsApp?',
        html: `Send to <b>+91${phone}</b>?<br><small class="text-muted-an">${escapeHtml(q.text)}</small>`,
        showCancelButton: true,
        confirmButtonText: 'Open',
      });
      if (!r.isConfirmed) return;
      queue2[i].sent = true;
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue2));
      window.location.href = buildWaUrl('91' + phone, q.text);
    }
    function removeAt(i) {
      const raw2 = localStorage.getItem(QUEUE_KEY);
      const queue2 = raw2 ? JSON.parse(raw2) : [];
      queue2.splice(i, 1);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue2));
      renderQueue();
    }
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
