import { COL } from '../firebase-config.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { fmtDate, fmtTimeLabel, fmtINR, fmtNum } from './analytics.js';

// Referrals tab: list every referral name that appears on a booking, with a
// count + total fare + paid vs pending totals. Click a referral to drill in
// and see the individual bookings that referral brought.
export async function renderReferrals(ctx) {
  const { panel, db } = ctx;
  panel.innerHTML = `
    <h2 class="section-title"><i class="fas fa-user-tag"></i> Referrals</h2>
    <div class="kpi-grid" id="rf-kpis">
      ${kpi('people', 'Referrers')}
      ${kpi('bookings', 'Referred bookings')}
      ${kpi('value', 'Total fare (₹)')}
      ${kpi('paid', 'Received (₹)')}
    </div>
    <div id="rf-view"></div>
  `;

  let bookings = [];
  try {
    window.avBusy('Loading referrals…');
    const snap = await getDocs(collection(db, COL.BOOKINGS));
    bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    window.avDone();
  } catch (e) {
    window.avDone();
    panel.querySelector('#rf-view').innerHTML =
      `<div class="empty"><i class="fas fa-triangle-exclamation"></i> ${escapeHtml(e.message || String(e))}</div>`;
    return;
  }

  const referred = bookings.filter(b => (b.referral || '').trim());

  // Aggregate per referrer.
  const agg = new Map();
  for (const b of referred) {
    const key = String(b.referral).trim();
    if (!agg.has(key)) agg.set(key, { name: key, count: 0, fare: 0, paid: 0, pending: 0, bookings: [] });
    const a = agg.get(key);
    const fare = Number(b.fare || 0);
    a.count += 1;
    a.fare  += fare;
    if (b.status === 'completed' && b.paid) a.paid += fare;
    else a.pending += fare;
    a.bookings.push(b);
  }

  const summary = Array.from(agg.values()).sort((a, b) => b.count - a.count || b.fare - a.fare);

  setKpi('people',   fmtNum(summary.length));
  setKpi('bookings', fmtNum(referred.length));
  setKpi('value',    fmtINR(summary.reduce((a, x) => a + x.fare, 0)));
  setKpi('paid',     fmtINR(summary.reduce((a, x) => a + x.paid, 0)));

  const view = panel.querySelector('#rf-view');
  renderList();

  function renderList() {
    if (!summary.length) {
      view.innerHTML = `<div class="empty"><i class="far fa-user"></i> No referrals recorded yet. Add a "Referral" to a booking to start tracking.</div>`;
      return;
    }
    view.innerHTML = `
      <div class="av-toolbar" style="margin-top:12px;">
        <div class="av-toolbar__left">
          <span class="text-muted-an">Tap a referrer to see the bookings they brought in.</span>
        </div>
      </div>
      <div class="row-list" id="rf-list">
        ${summary.map(r => `
          <div class="row-card rf-row" data-name="${escapeAttr(r.name)}" role="button" tabindex="0" style="cursor:pointer;">
            <div class="row-top">
              <div class="flex-row flex-grow">
                <strong>${escapeHtml(r.name)}</strong>
              </div>
              <span class="chip completed"><i class="fas fa-users" aria-hidden="true"></i> ${fmtNum(r.count)}</span>
            </div>
            <div class="row-meta">
              <div><b>Bookings</b> ${fmtNum(r.count)}</div>
              <div><b>Value</b> ${fmtINR(r.fare)}</div>
              <div><b>Paid</b> ${fmtINR(r.paid)}</div>
              <div><b>Pending</b> ${fmtINR(r.pending)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    view.querySelectorAll('.rf-row').forEach(el => {
      const open = () => openDetailModal(el.dataset.name);
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  function openDetailModal(name) {
    const r = agg.get(name);
    if (!r) return;
    const rows = r.bookings.slice().sort((a, b) => {
      const ak = (a.date || '') + ' ' + (a.time || '');
      const bk = (b.date || '') + ' ' + (b.time || '');
      return bk.localeCompare(ak);
    });
    Swal.fire({
      width: 760,
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'rf-popup', htmlContainer: 'rf-popup__body' },
      html: `
        <div class="rf-detail">
          <header class="rf-detail__head">
            <div class="rf-detail__avatar" aria-hidden="true">
              <i class="fas fa-user-tag"></i>
            </div>
            <div class="rf-detail__title">
              <div class="rf-detail__name">${escapeHtml(r.name)}</div>
              <div class="rf-detail__sub">Referral summary</div>
            </div>
          </header>
          <div class="rf-stats">
            <div class="rf-stat">
              <div class="rf-stat__label">Bookings</div>
              <div class="rf-stat__value">${fmtNum(r.count)}</div>
            </div>
            <div class="rf-stat">
              <div class="rf-stat__label">Total value</div>
              <div class="rf-stat__value">${fmtINR(r.fare)}</div>
            </div>
            <div class="rf-stat rf-stat--paid">
              <div class="rf-stat__label">Paid</div>
              <div class="rf-stat__value">${fmtINR(r.paid)}</div>
            </div>
            <div class="rf-stat rf-stat--pending">
              <div class="rf-stat__label">Pending</div>
              <div class="rf-stat__value">${fmtINR(r.pending)}</div>
            </div>
          </div>
          <h4 class="rf-detail__section">Bookings brought in</h4>
          <div class="rf-detail__list">
            ${rows.map(renderBookingRow).join('')}
          </div>
        </div>
      `,
    });
  }
}

function renderBookingRow(b) {
  const status = b.status || 'new';
  const customer = b.customer || {};
  const payChip = status === 'completed'
    ? (b.paid
        ? `<span class="chip completed"><i class="fas fa-circle-check"></i> Paid</span>`
        : `<span class="chip cancelled"><i class="fas fa-hourglass-half"></i> Pending</span>`)
    : `<span class="chip ${status}">${labelFor(status)}</span>`;
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
        <div><b>Customer</b> ${customer.name ? escapeHtml(customer.name) : '<i class="text-muted-an">unidentified</i>'}${customer.phone ? ' · ' + escapeHtml(customer.phone) : ''}</div>
        <div><b>Passengers</b> ${escapeHtml(b.passengers || '?')}</div>
        ${b.fare ? `<div><b>Fare</b> ₹${escapeHtml(String(b.fare))}</div>` : ''}
      </div>
    </div>
  `;
}

function labelFor(s) {
  return ({
    new: 'New', confirmed: 'Confirmed', allocated: 'Allocated',
    in_progress: 'On trip', completed: 'Completed', cancelled: 'Cancelled',
  })[s] || s;
}

function kpi(id, label) {
  return `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value" id="kpi-rf-${id}">—</div></div>`;
}
function setKpi(id, v) {
  const el = document.getElementById(`kpi-rf-${id}`);
  if (el) el.textContent = v;
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
