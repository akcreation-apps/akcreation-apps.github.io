import { COL } from '../firebase-config.js';
import {
  doc, setDoc, collection, query, where, getDocs, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { loadCustomers } from './customers.js';

const OFFER_URL = 'https://akcreation-apps.com/banki-bites/offer.jpg';
const FOOTER = 'Reply "Stop" to stop receiving future advertisements.\n\n_Team BankiBites_ ❤️';
const QUEUE_KEY = 'bb_broadcast_queue_v1';
const NAME_FALLBACK = 'Friend';

// Look back this many days when computing "last order" — anyone whose most
// recent order is older than this is treated as "never" for the win-back
// segments. 180 days covers every meaningful lifecycle cohort cheaply.
const ORDER_LOOKBACK_DAYS = 180;

// Win-back lifecycle segments, by days since last delivered order. Customers
// with no order in the look-back window are folded into "Lost 60d+".
const SEGMENTS = [
  { id: 'all',     label: 'All',            icon: 'fa-users' },
  { id: 'active',  label: 'Active ≤14d',    icon: 'fa-fire' },
  { id: 'cooling', label: 'Cooling 15–30d', icon: 'fa-hourglass-half' },
  { id: 'lapsed',  label: 'Lapsed 31–60d',  icon: 'fa-clock-rotate-left' },
  { id: 'lost',    label: 'Lost 60d+',      icon: 'fa-heart-crack' },
];

function segmentOf(daysAgo) {
  if (daysAgo === null) return 'lost';
  if (daysAgo <= 14) return 'active';
  if (daysAgo <= 30) return 'cooling';
  if (daysAgo <= 60) return 'lapsed';
  return 'lost';
}
function inSegment(daysAgo, segId) {
  if (segId === 'all') return true;
  return segmentOf(daysAgo) === segId;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Mirrors the prettyName rule from orders.js (the "Thank You" WhatsApp flow):
// auto-generated placeholder names like "BB 5" aren't real — only the alias
// inside parentheses counts ("BB 5 (Raj Kumar)" → "Raj Kumar"). Returns
// NAME_FALLBACK when no usable name exists so {name} always renders cleanly.
function displayName(rawName) {
  if (!rawName) return NAME_FALLBACK;
  const s = String(rawName).replace(/\s+/g, ' ').trim();
  if (!s) return NAME_FALLBACK;
  if (/^bb/i.test(s)) {
    const m = s.match(/\(([^)]+)\)/);
    const alias = m && m[1] ? m[1].trim() : '';
    return alias || NAME_FALLBACK;
  }
  return s;
}

function personalize(template, name) {
  if (!template) return '';
  // Support {name}, {Name}, { name } — case- and whitespace-tolerant.
  return template.replace(/\{\s*name\s*\}/gi, displayName(name));
}

function buildMessage(body, imageUrl, name) {
  const parts = [];
  const t = personalize((body || '').trim(), name);
  if (t) parts.push(t);
  const u = (imageUrl || '').trim();
  if (u) parts.push(u);
  parts.push(FOOTER);
  return parts.join('\n\n');
}

function loadQueue() {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    if (!raw) return null;
    const q = JSON.parse(raw);
    if (!q || !Array.isArray(q.recipients)) return null;
    // Accept both the new schema (body + imageUrl, personalised per recipient)
    // and the legacy schema (pre-built message string) for in-flight queues.
    const hasNew = typeof q.body === 'string';
    const hasLegacy = typeof q.message === 'string';
    if (!hasNew && !hasLegacy) return null;
    return q;
  } catch { return null; }
}
function saveQueue(q) { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
function clearQueue() { sessionStorage.removeItem(QUEUE_KEY); }

// For each customer phone, returns the millisecond timestamp of their most
// recent delivered order in the last ORDER_LOOKBACK_DAYS. Customers without
// any delivered order in the window are simply absent from the map and end
// up in the "Never ordered" segment in the UI.
async function loadLastOrderByPhone(db) {
  const cutoffMs = Date.now() - ORDER_LOOKBACK_DAYS * 86400000;
  const sinceTs = Timestamp.fromMillis(cutoffMs);
  const snap = await getDocs(query(
    collection(db, COL.ORDERS),
    where('created_at', '>=', sinceTs),
  ));
  const out = new Map();
  snap.forEach(d => {
    const o = d.data() || {};
    if (o.status === 'cancelled' || o.status === 'fake') return;
    const phone = (o.customer && o.customer.phone) || '';
    if (!phone) return;
    const ms = o.created_at?.toMillis?.();
    if (!ms) return;
    const prev = out.get(phone);
    if (!prev || ms > prev) out.set(phone, ms);
  });
  return out;
}

export async function renderBroadcast(root, db) {
  root.innerHTML = `
    <section class="bb-bc">
      <div class="bb-bc__stats">
        <div class="bb-bc__stat">
          <div class="bb-bc__stat-icon bb-bc__stat-icon--total"><i class="fas fa-users"></i></div>
          <div class="bb-bc__stat-body">
            <div class="bb-bc__stat-num" id="bcStatTotal">0</div>
            <div class="bb-bc__stat-label">Total customers</div>
          </div>
        </div>
        <div class="bb-bc__stat">
          <div class="bb-bc__stat-icon bb-bc__stat-icon--ok"><i class="fas fa-paper-plane"></i></div>
          <div class="bb-bc__stat-body">
            <div class="bb-bc__stat-num" id="bcStatEligible">0</div>
            <div class="bb-bc__stat-label">Eligible</div>
          </div>
        </div>
        <div class="bb-bc__stat">
          <div class="bb-bc__stat-icon bb-bc__stat-icon--off"><i class="fas fa-ban"></i></div>
          <div class="bb-bc__stat-body">
            <div class="bb-bc__stat-num" id="bcStatOpted">0</div>
            <div class="bb-bc__stat-label">Opted out</div>
          </div>
        </div>
        <div class="bb-bc__stat bb-bc__stat--accent">
          <div class="bb-bc__stat-icon bb-bc__stat-icon--sel"><i class="fas fa-check-double"></i></div>
          <div class="bb-bc__stat-body">
            <div class="bb-bc__stat-num" id="bcStatSelected">0</div>
            <div class="bb-bc__stat-label">Selected</div>
          </div>
        </div>
      </div>

      <div class="bb-bc__grid">
        <!-- Composer card -->
        <article class="bb-bc__card">
          <div class="bb-bc__card-head">
            <h3><i class="fas fa-pen-to-square"></i> Compose message</h3>
            <span class="bb-bc__badge bb-bc__badge--soft">Step 1</span>
          </div>

          <div class="bb-bc__field">
            <label for="bcMsg">Message text</label>
            <textarea id="bcMsg" class="bb-bc__textarea" rows="5"
              maxlength="900"
              placeholder="e.g. Hi {name}, today only — 20% off on all Chinese combos at The Cafe Darbar. Order on the BankiBites app or web!"></textarea>
            <div class="bb-bc__field-foot">
              <span class="bb-bc__hint">
                Use <button type="button" id="bcInsertName" class="bb-bc__chip">
                  <i class="fas fa-user"></i> Insert {name}
                </button>
                — replaced with each customer's first name (falls back to "Friend").
                Footer is appended automatically.
              </span>
              <span class="bb-bc__count"><span id="bcMsgCount">0</span> / 900</span>
            </div>
          </div>

          <div class="bb-bc__field">
            <label for="bcImg">Offer image URL <span class="bb-bc__optional">optional</span></label>
            <div class="bb-bc__input-row">
              <input id="bcImg" class="bb-bc__input" type="url"
                placeholder="https://akcreation-apps.com/banki-bites/offer.jpg">
              <button type="button" class="bb-bc__btn bb-bc__btn--ghost" id="bcUseOffer">
                <i class="fas fa-image"></i> Use offer.jpg
              </button>
            </div>
            <span class="bb-bc__hint">WhatsApp previews the URL — it can't attach images via a deep-link.</span>
          </div>

          <div class="bb-bc__field">
            <label>Final message preview</label>
            <div class="bb-bc__preview-tag">
              <i class="fas fa-eye"></i>
              Previewing as <strong id="bcPreviewName">Friend</strong>
              <span class="bb-bc__hint" id="bcPreviewSrc"></span>
            </div>
            <div class="bb-bc__phone">
              <div class="bb-bc__bubble">
                <pre id="bcPreview" class="bb-bc__bubble-text"></pre>
                <div class="bb-bc__bubble-time"><i class="fas fa-check-double"></i> now</div>
              </div>
            </div>
          </div>
        </article>

        <!-- Recipients card -->
        <article class="bb-bc__card">
          <div class="bb-bc__card-head">
            <h3><i class="fas fa-address-book"></i> Recipients</h3>
            <span class="bb-bc__badge bb-bc__badge--soft">Step 2</span>
          </div>

          <div class="bb-bc__segments" id="bcSegments" role="tablist" aria-label="Customer segments">
            ${SEGMENTS.map(s => `
              <button type="button"
                      class="bb-bc__seg ${s.id === 'all' ? 'is-active' : ''}"
                      data-seg="${s.id}"
                      role="tab"
                      aria-selected="${s.id === 'all' ? 'true' : 'false'}">
                <i class="fas ${s.icon}"></i>
                <span class="bb-bc__seg-label">${s.label}</span>
                <span class="bb-bc__seg-count" data-seg-count="${s.id}">0</span>
              </button>
            `).join('')}
          </div>

          <div class="bb-bc__toolbar">
            <div class="bb-bc__search">
              <i class="fas fa-search"></i>
              <input id="bcSearch" type="search" placeholder="Search name, phone or address…">
            </div>
            <div class="bb-bc__toolbar-actions">
              <button type="button" class="bb-bc__btn bb-bc__btn--ghost" id="bcSelectAll">
                <i class="fas fa-check"></i> Select all in view
              </button>
              <button type="button" class="bb-bc__btn bb-bc__btn--ghost" id="bcClearSel">
                <i class="fas fa-xmark"></i> Clear
              </button>
            </div>
          </div>

          <div class="bb-bc__list-head">
            <span id="bcRecCount" class="bb-bc__list-count"></span>
            <span id="bcSegHint" class="bb-bc__list-hint"></span>
          </div>

          <div id="bcList" class="bb-bc__list" role="list"></div>
        </article>
      </div>

      <footer class="bb-bc__actionbar">
        <div class="bb-bc__actionbar-info">
          <i class="fas fa-circle-info"></i>
          <span id="bcSelInfo">No recipients selected.</span>
        </div>
        <button id="bcStart" class="bb-bc__btn bb-bc__btn--primary" disabled>
          <i class="fab fa-whatsapp"></i> Start broadcast
        </button>
      </footer>
    </section>
  `;

  const statTotal    = root.querySelector('#bcStatTotal');
  const statEligible = root.querySelector('#bcStatEligible');
  const statOpted    = root.querySelector('#bcStatOpted');
  const statSelected = root.querySelector('#bcStatSelected');
  const msgCount     = root.querySelector('#bcMsgCount');
  const insertNameBtn= root.querySelector('#bcInsertName');
  const previewName  = root.querySelector('#bcPreviewName');
  const previewSrc   = root.querySelector('#bcPreviewSrc');
  const segmentsEl   = root.querySelector('#bcSegments');
  const segHint      = root.querySelector('#bcSegHint');

  const msgEl    = root.querySelector('#bcMsg');
  const imgEl    = root.querySelector('#bcImg');
  const useBtn   = root.querySelector('#bcUseOffer');
  const previewEl= root.querySelector('#bcPreview');
  const listEl   = root.querySelector('#bcList');
  const searchEl = root.querySelector('#bcSearch');
  const selAllBtn= root.querySelector('#bcSelectAll');
  const clearBtn = root.querySelector('#bcClearSel');
  const startBtn = root.querySelector('#bcStart');
  const recCount = root.querySelector('#bcRecCount');
  const selInfo  = root.querySelector('#bcSelInfo');

  const selected = new Set();
  let customers = []; // [{phone, name, address, not_interested, lastOrderAt, daysAgo, segment}]
  let term = '';
  let activeSeg = 'all';

  function hasRealName(c) {
    // A "real" name is anything that survives the prettyName rule — i.e. not
    // empty and not an unaliased "BB N" placeholder.
    return displayName(c.name) !== NAME_FALLBACK;
  }
  function pickSampleRecipient() {
    // Prefer the first selected eligible customer with a real name. Falls
    // back to any eligible customer with a real name, then the fallback.
    const selectedReal = customers.find(c => selected.has(c.phone) && eligible(c) && hasRealName(c));
    if (selectedReal) return { name: selectedReal.name, source: 'selected' };
    const anyReal = customers.find(c => eligible(c) && hasRealName(c));
    if (anyReal) return { name: anyReal.name, source: 'sample' };
    return { name: NAME_FALLBACK, source: 'fallback' };
  }

  function updatePreview() {
    const sample = pickSampleRecipient();
    previewEl.textContent = buildMessage(msgEl.value, imgEl.value, sample.name);
    msgCount.textContent = msgEl.value.length;
    previewName.textContent = displayName(sample.name);
    const hasPlaceholder = /\{\s*name\s*\}/i.test(msgEl.value);
    previewSrc.textContent = hasPlaceholder
      ? (sample.source === 'selected' ? '(first selected recipient)'
         : sample.source === 'sample'  ? '(sample — pick recipients to personalise)'
         : '(fallback — no named customers yet)')
      : '(add {name} to personalise per recipient)';
  }
  function updateSelInfo() {
    const n = selected.size;
    selInfo.textContent = n === 0
      ? 'No recipients selected.'
      : `${n} recipient${n === 1 ? '' : 's'} ready to broadcast.`;
    startBtn.disabled = n === 0;
    statSelected.textContent = n;
  }
  function updateStats() {
    const total = customers.length;
    const opted = customers.filter(c => c.not_interested).length;
    statTotal.textContent = total;
    statEligible.textContent = total - opted;
    statOpted.textContent = opted;
  }
  function eligible(c) { return !c.not_interested; }
  function matchesSeg(c) { return inSegment(c.daysAgo, activeSeg); }
  function daysAgoLabel(daysAgo) {
    if (daysAgo === null) return 'Never ordered';
    if (daysAgo === 0) return 'Ordered today';
    if (daysAgo === 1) return 'Ordered yesterday';
    return `Ordered ${daysAgo}d ago`;
  }
  function daysAgoIcon(daysAgo) {
    return ({
      active:  'fa-fire',
      cooling: 'fa-hourglass-half',
      lapsed:  'fa-clock-rotate-left',
      lost:    'fa-heart-crack',
    })[segmentOf(daysAgo)];
  }
  function updateSegments() {
    const counts = { all: 0, active: 0, cooling: 0, lapsed: 0, lost: 0 };
    for (const c of customers) {
      if (!eligible(c)) continue;
      counts.all += 1;
      counts[segmentOf(c.daysAgo)] += 1;
    }
    for (const id of Object.keys(counts)) {
      const el = segmentsEl.querySelector(`[data-seg-count="${id}"]`);
      if (el) el.textContent = counts[id];
    }
    const seg = SEGMENTS.find(s => s.id === activeSeg);
    segHint.textContent = seg && seg.id !== 'all'
      ? `Filter: ${seg.label}`
      : '';
  }
  function initials(name, phone) {
    const n = (name || '').trim();
    if (n) {
      const parts = n.split(/\s+/).slice(0, 2);
      return parts.map(p => p[0]).join('').toUpperCase();
    }
    return (phone || '?').slice(-2);
  }
  function avatarHue(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffff;
    return h % 360;
  }
  function matchesTerm(c) {
    if (!term) return true;
    const t = term.toLowerCase();
    return (c.name || '').toLowerCase().includes(t)
      || (c.phone || '').includes(t)
      || (c.address || '').toLowerCase().includes(t);
  }

  function renderList() {
    const rows = customers
      .filter(matchesSeg)
      .filter(matchesTerm)
      .sort((a, b) => {
        // Within a segment, sort by most-recent activity desc; "never" customers go last.
        const ta = a.lastOrderAt ?? -Infinity;
        const tb = b.lastOrderAt ?? -Infinity;
        if (tb !== ta) return tb - ta;
        return (a.name || '').localeCompare(b.name || '');
      });

    recCount.textContent = `Showing ${rows.length} of ${customers.length}`;

    if (!rows.length) {
      listEl.innerHTML = `
        <div class="bb-bc__empty">
          <i class="fas fa-magnifying-glass"></i>
          <div>No customers match your search.</div>
        </div>`;
      return;
    }
    listEl.innerHTML = rows.map(c => {
      const opted = !!c.not_interested;
      const checked = selected.has(c.phone) ? 'checked' : '';
      const disabled = opted ? 'disabled' : '';
      const hue = avatarHue(c.phone);
      const init = initials(c.name, c.phone);
      return `
        <label class="bb-bc__row ${opted ? 'is-opted-out' : ''}" data-phone="${escapeHtml(c.phone)}">
          <input type="checkbox" class="bb-bc__chk" ${checked} ${disabled}
                 data-phone="${escapeHtml(c.phone)}">
          <span class="bb-bc__avatar" style="background:hsl(${hue} 65% 45%);">${escapeHtml(init)}</span>
          <div class="bb-bc__who">
            <div class="bb-bc__name">
              ${escapeHtml(c.name || '(no name)')}
              ${opted ? `<span class="bb-bc__pill"><i class="fas fa-ban"></i> Opted out</span>` : ''}
            </div>
            <div class="bb-bc__meta">
              <span class="bb-bc__meta-item"><i class="fas fa-phone"></i> ${escapeHtml(c.phone)}</span>
              <span class="bb-bc__meta-item bb-bc__life bb-bc__life--${segmentOf(c.daysAgo)}">
                <i class="fas ${daysAgoIcon(c.daysAgo)}"></i> ${escapeHtml(daysAgoLabel(c.daysAgo))}
              </span>
              ${c.address ? `<span class="bb-bc__meta-item bb-bc__addr"><i class="fas fa-location-dot"></i> ${escapeHtml(c.address)}</span>` : ''}
            </div>
          </div>
          <button type="button" class="bb-bc__btn bb-bc__btn--toggle ${opted ? 'is-restore' : ''}"
                  data-phone="${escapeHtml(c.phone)}" data-opt="${opted ? '1' : '0'}"
                  title="${opted ? 'Restore' : 'Mark not interested'}">
            <i class="fas ${opted ? 'fa-rotate-left' : 'fa-ban'}"></i>
            <span>${opted ? 'Restore' : 'Mark not interested'}</span>
          </button>
        </label>
      `;
    }).join('');
  }

  async function setNotInterested(phone, value) {
    window.bbBusy(value ? 'Marking…' : 'Restoring…');
    try {
      await setDoc(doc(db, COL.CUSTOMERS, phone), { not_interested: !!value }, { merge: true });
      const c = customers.find(x => x.phone === phone);
      if (c) c.not_interested = !!value;
      if (value) selected.delete(phone);
    } finally {
      window.bbDone();
    }
    renderList();
    updateSelInfo();
    updateStats();
    updateSegments();
  }

  msgEl.addEventListener('input', updatePreview);
  imgEl.addEventListener('input', updatePreview);
  useBtn.addEventListener('click', () => { imgEl.value = OFFER_URL; updatePreview(); });

  insertNameBtn.addEventListener('click', () => {
    const start = msgEl.selectionStart ?? msgEl.value.length;
    const end = msgEl.selectionEnd ?? msgEl.value.length;
    const before = msgEl.value.slice(0, start);
    const after = msgEl.value.slice(end);
    const needsSpaceBefore = before && !/\s$/.test(before);
    const insert = (needsSpaceBefore ? ' ' : '') + '{name}';
    msgEl.value = before + insert + after;
    const caret = (before + insert).length;
    msgEl.focus();
    msgEl.setSelectionRange(caret, caret);
    updatePreview();
  });

  searchEl.addEventListener('input', () => { term = searchEl.value.trim(); renderList(); });

  selAllBtn.addEventListener('click', () => {
    customers.filter(eligible).filter(matchesSeg).filter(matchesTerm).forEach(c => selected.add(c.phone));
    renderList(); updateSelInfo(); updatePreview();
  });

  segmentsEl.addEventListener('click', e => {
    const btn = e.target.closest('.bb-bc__seg');
    if (!btn) return;
    const id = btn.dataset.seg;
    if (id === activeSeg) return;
    activeSeg = id;
    segmentsEl.querySelectorAll('.bb-bc__seg').forEach(b => {
      const on = b.dataset.seg === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    updateSegments();
    renderList();
  });
  clearBtn.addEventListener('click', () => { selected.clear(); renderList(); updateSelInfo(); });

  listEl.addEventListener('change', e => {
    const cb = e.target.closest('.bb-bc__chk');
    if (!cb) return;
    const phone = cb.dataset.phone;
    if (cb.checked) selected.add(phone); else selected.delete(phone);
    updateSelInfo();
    updatePreview();
  });

  listEl.addEventListener('click', async e => {
    const btn = e.target.closest('.bb-bc__btn--toggle');
    if (!btn) return;
    e.preventDefault();
    const phone = btn.dataset.phone;
    const opted = btn.dataset.opt === '1';
    await setNotInterested(phone, !opted);
  });

  startBtn.addEventListener('click', async () => {
    if (!selected.size) return;
    const body = msgEl.value || '';
    const imageUrl = imgEl.value || '';
    // Validate using a fallback name so empty bodies with only a placeholder
    // don't slip past as "non-empty".
    const sample = buildMessage(body, imageUrl, NAME_FALLBACK);
    if (!sample.trim() || sample.trim() === FOOTER) {
      Swal.fire({ icon: 'warning', title: 'Empty message', text: 'Type a message or paste an offer image URL first.' });
      return;
    }
    const recipients = customers
      .filter(c => selected.has(c.phone) && eligible(c))
      .map(c => ({ phone: c.phone, name: c.name || '' }));
    if (!recipients.length) {
      Swal.fire({ icon: 'warning', title: 'No eligible recipients', text: 'All selected customers are opted out.' });
      return;
    }
    const personalised = /\{\s*name\s*\}/i.test(body);
    const confirm = await Swal.fire({
      title: 'Start broadcast?',
      html: `You're about to send this message to <strong>${recipients.length}</strong> recipient(s),
             one at a time. WhatsApp opens for each — return to this tab to send the next one.
             ${personalised ? '<br><br><i class="fas fa-user"></i> <em>Each message is personalised with the recipient\'s first name.</em>' : ''}`,
      showCancelButton: true,
      confirmButtonText: 'Start',
    });
    if (!confirm.isConfirmed) return;
    saveQueue({ body, imageUrl, recipients, index: 0 });
    runNextInQueue();
  });

  // Initial load — customers + last-order map for win-back segments.
  window.bbBusy('Loading customers…');
  try {
    const [map, lastOrderByPhone] = await Promise.all([
      loadCustomers(db),
      loadLastOrderByPhone(db),
    ]);
    const now = Date.now();
    customers = Array.from(map.values()).map(c => {
      const lastMs = lastOrderByPhone.get(c.phone) ?? null;
      const daysAgo = lastMs === null ? null : Math.floor((now - lastMs) / 86400000);
      return {
        phone: c.phone,
        name: c.name || '',
        address: c.address || '',
        not_interested: !!c.not_interested,
        lastOrderAt: lastMs,
        daysAgo,
      };
    });
  } finally {
    window.bbDone();
  }
  updatePreview();
  updateSegments();
  renderList();
  updateSelInfo();
  updateStats();

  // If a queue from a prior gesture is still pending (admin tabbed back from
  // WhatsApp), pick up where we left off.
  if (loadQueue()) runNextInQueue();
}

async function runNextInQueue() {
  const q = loadQueue();
  if (!q) return;
  if (q.index >= q.recipients.length) {
    clearQueue();
    Swal.fire({ icon: 'success', title: 'Broadcast complete', text: 'All selected recipients have been sent.' });
    return;
  }
  const r = q.recipients[q.index];
  const remaining = q.recipients.length - q.index;
  // Build personalised message for this recipient. Old queues (created before
  // {name} support) carry a pre-built `message` string — honour that as-is.
  const finalMessage = (typeof q.body === 'string')
    ? buildMessage(q.body, q.imageUrl || '', r.name)
    : (q.message || '');
  const headerName = displayName(r.name);
  const res = await Swal.fire({
    title: `Send to ${headerName}`,
    html: `
      <div class="bb-bc__swal">
        <div class="bb-bc__swal-who">
          <strong>${escapeHtml(r.name || headerName)}</strong>
          <code>${escapeHtml(r.phone)}</code>
        </div>
        <div class="bb-bc__swal-count">${remaining} of ${q.recipients.length} remaining</div>
        <pre class="bb-bc__swal-msg">${escapeHtml(finalMessage)}</pre>
      </div>
    `,
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: '<i class="fab fa-whatsapp"></i> Send via WhatsApp',
    denyButtonText: 'Skip',
    cancelButtonText: 'Stop broadcast',
    width: 560,
  });
  if (res.isConfirmed) {
    q.index += 1;
    saveQueue(q);
    window.location.href = 'https://wa.me/91' + r.phone + '?text=' + encodeURIComponent(finalMessage);
    return;
  }
  if (res.isDenied) {
    q.index += 1;
    saveQueue(q);
    runNextInQueue();
    return;
  }
  clearQueue();
}
