// BankiBites admin — Settings tab.
// Currently holds the merchant UPI config (VPA + display name) read by
// /banki-bites/pay.html. Stored at bankibites_meta/upi_config.

import { doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from '../firebase-config.js';
import { encodePayToken } from '../pay-token.js';

const DEFAULT_VPA = '20261033297374-iservuqrsbrp@cbin';
const DEFAULT_NAME = 'Ak Creation';
const DEFAULT_MIN_ORDER = 0;

// Mirrors the per-module helper used across admin/* — strip +91 / 91 /
// leading 0 / spaces / dashes and return the trailing digits, or '' if the
// input can't be normalised to a phone-shape.
function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}

// Mirrors normalisePhone's forgiveness: strip whitespace, validate against
// the UPI handle shape `<id>@<psp>` without being over-strict on allowed chars.
function isValidVpa(s) {
  if (!s) return false;
  const v = String(s).trim();
  return /^[A-Za-z0-9._\-]{2,}@[A-Za-z][A-Za-z0-9.\-]{1,}$/.test(v);
}

export async function renderSettings(root, db) {
  root.innerHTML = `
    <div class="settings-wrap">
      <header class="settings-head">
        <h2><i class="fas fa-cog mr-2"></i>Settings</h2>
        <p class="text-muted">Admin-wide configuration. Changes take effect immediately for every customer.</p>
      </header>

      <details class="settings-card" aria-labelledby="custom-link-heading">
        <summary class="settings-card-summary">
          <span class="scs-icon"><i class="fas fa-link"></i></span>
          <span class="scs-text">
            <strong id="custom-link-heading">Custom payment link</strong>
            <small>One-off UPI link for walk-ins, split bills, outstanding dues</small>
          </span>
          <i class="fas fa-chevron-down scs-chev"></i>
        </summary>
        <div class="settings-card-body">
          <p class="text-muted">
            Create a one-off UPI payment link without needing a saved order. The link is valid for 5 minutes and opens WhatsApp pre-filled for the customer's number.
          </p>
          <div class="settings-actions settings-actions--leading">
            <button type="button" class="btn btn-primary" id="customPayLinkBtn">
              <i class="fas fa-link mr-1"></i> Create custom pay link
            </button>
          </div>
        </div>
      </details>

      <details class="settings-card" aria-labelledby="discount-heading">
        <summary class="settings-card-summary">
          <span class="scs-icon"><i class="fas fa-tag"></i></span>
          <span class="scs-text">
            <strong id="discount-heading">Discount threshold</strong>
            <small>Reference value for ad-hoc discount decisions (informational)</small>
          </span>
          <i class="fas fa-chevron-down scs-chev"></i>
        </summary>
        <div class="settings-card-body">
          <p class="text-muted">
            A reference number you can refer to when deciding whether to add a discount to an order. Setting a value here does <strong>not</strong> block or alter discounts — whatever discount you enter on an order is always sent to the customer.
          </p>

          <form id="discountForm" autocomplete="off" novalidate>
          <div class="form-group">
            <label for="minOrder"><strong>Minimum order value (₹)</strong></label>
            <input class="form-control" type="number" id="minOrder" min="0" step="1" inputmode="numeric" placeholder="0">
            <small class="form-text text-muted">If the cart total is below this amount, no offer appears on the payment link — the customer just pays the full amount.</small>
          </div>

          <div class="settings-meta" id="discountMeta" hidden>
            <i class="fas fa-clock-rotate-left"></i>
            <span>Last updated <span id="discountUpdatedAt">—</span></span>
          </div>

            <div class="settings-actions">
              <button type="submit" class="btn btn-primary" id="saveDiscountBtn">
                <i class="fas fa-save mr-1"></i> Save
              </button>
            </div>
          </form>
        </div>
      </details>

      <details class="settings-card" aria-labelledby="upi-heading">
        <summary class="settings-card-summary">
          <span class="scs-icon"><i class="fas fa-mobile-alt"></i></span>
          <span class="scs-text">
            <strong id="upi-heading">UPI payment details</strong>
            <small>Merchant VPA &amp; payee name shown in the customer's UPI app</small>
          </span>
          <i class="fas fa-chevron-down scs-chev"></i>
        </summary>
        <div class="settings-card-body">
          <p class="text-muted">
            Used by the customer-facing
            <a href="#" id="upiDemoLink" target="_blank" rel="noopener">payment page</a>
            — the "Pay link" button in Orders sends this VPA to the customer.
          </p>

          <form id="upiForm" autocomplete="off" novalidate>
          <div class="form-group">
            <label for="upiVpa"><strong>Merchant UPI ID</strong></label>
            <input class="form-control" type="text" id="upiVpa"
                   placeholder="e.g. test-api@bnk" required
                   autocapitalize="off" autocorrect="off" spellcheck="false">
            <small class="form-text text-muted">Format: <code>name@psp</code>. Double-check — a typo here means money goes to the wrong account.</small>
          </div>

          <div class="form-group">
            <label for="upiName"><strong>Payee name</strong></label>
            <input class="form-control" type="text" id="upiName"
                   placeholder="e.g. BankiBites" maxlength="60"
                   autocapitalize="words" autocorrect="off" spellcheck="false">
            <small class="form-text text-muted">Shown inside the customer's UPI app (GPay / PhonePe / Paytm) during the payment prompt.</small>
          </div>

          <div class="form-group">
            <label for="upiSupport"><strong>Support WhatsApp number</strong></label>
            <input class="form-control" type="tel" id="upiSupport"
                   placeholder="10-digit mobile" inputmode="tel" maxlength="15"
                   autocapitalize="off" autocorrect="off" spellcheck="false">
            <small class="form-text text-muted">Shown as a floating WhatsApp button on the customer-facing payment page. Leave blank to hide the button.</small>
          </div>

          <div class="settings-meta" id="upiMeta" hidden>
            <i class="fas fa-clock-rotate-left"></i>
            <span>Last updated <span id="upiUpdatedAt">—</span></span>
          </div>

            <div class="settings-actions">
              <button type="submit" class="btn btn-primary" id="saveUpiBtn">
                <i class="fas fa-save mr-1"></i> Save
              </button>
            </div>
          </form>
        </div>
      </details>

      <details class="settings-card" aria-labelledby="notify-heading">
        <summary class="settings-card-summary">
          <span class="scs-icon"><i class="fas fa-bell"></i></span>
          <span class="scs-text">
            <strong id="notify-heading">Server &amp; notifications</strong>
            <small>Local notification server + where admin alerts are sent</small>
          </span>
          <i class="fas fa-chevron-down scs-chev"></i>
        </summary>
        <div class="settings-card-body">
          <p class="text-muted">
            Points the admin console at your local notification server (e.g. an ngrok URL for the Flask app on your laptop). The server fires email + WhatsApp alerts on new orders, partner assignments, and ETA updates.
          </p>
          <form id="notifyForm" autocomplete="off" novalidate>
            <div class="form-group">
              <label for="notifyServer"><strong>Notification server URL</strong></label>
              <input class="form-control" type="url" id="notifyServer"
                     placeholder="https://your-ngrok-id.ngrok-free.app"
                     autocapitalize="off" autocorrect="off" spellcheck="false">
              <small class="form-text text-muted">No trailing slash. Leave blank to disable all server-side notifications.</small>
            </div>

            <div class="form-group">
              <label for="notifyToken"><strong>X-Notify-Token</strong></label>
              <input class="form-control" type="password" id="notifyToken"
                     placeholder="the NOTIFY_TOKEN env var you set on the server"
                     autocapitalize="off" autocorrect="off" spellcheck="false">
              <small class="form-text text-muted">Must match the <code>NOTIFY_TOKEN</code> env var on the Flask server. Needed for every call.</small>
            </div>

            <div class="form-group">
              <label for="notifyAdminEmails"><strong>Admin email(s)</strong></label>
              <input class="form-control" type="text" id="notifyAdminEmails"
                     placeholder="you@example.com, another@example.com"
                     autocapitalize="off" autocorrect="off" spellcheck="false">
              <small class="form-text text-muted">Comma-separated. All admins get the HTML email on every new order and ETA update.</small>
            </div>

            <div class="form-group">
              <label for="notifyWaGroup"><strong>WhatsApp group link</strong></label>
              <input class="form-control" type="url" id="notifyWaGroup"
                     placeholder="https://chat.whatsapp.com/HxYzAbC123xxxxx"
                     autocapitalize="off" autocorrect="off" spellcheck="false">
              <small class="form-text text-muted">The host's WhatsApp Web session must already be a member of this group.</small>
            </div>

            <div class="settings-meta" id="notifyMeta" hidden>
              <i class="fas fa-clock-rotate-left"></i>
              <span>Last updated <span id="notifyUpdatedAt">—</span></span>
            </div>

            <div class="settings-actions">
              <button type="button" class="btn btn-outline-secondary" id="notifyTestBtn">
                <i class="fas fa-vial mr-1"></i> Test connection
              </button>
              <button type="submit" class="btn btn-primary" id="saveNotifyBtn">
                <i class="fas fa-save mr-1"></i> Save
              </button>
            </div>
          </form>

          <hr class="my-3">

          <!-- Active orders & notifications tracker -->
          <div id="activeOrdersPanel" class="mt-3">
            <div class="d-flex justify-content-between align-items-baseline mb-2">
              <strong><i class="fas fa-list-check mr-1"></i> Active orders being tracked</strong>
              <button type="button" class="btn btn-sm btn-outline-secondary" id="activeOrdersRefreshBtn" title="Reload now">
                <i class="fas fa-rotate"></i>
              </button>
            </div>
            <div id="activeOrdersStatus" class="active-orders-status">—</div>
            <div id="activeOrdersList" class="active-orders-list mt-2">
              <div class="text-muted small">Loading…</div>
            </div>
          </div>

          <style>
            .active-orders-status{font-size:13px;padding:8px 12px;border-radius:8px;background:rgba(0,0,0,.03);border:1px solid rgba(0,0,0,.06);}
            .active-orders-status.ok{color:#16a34a;background:rgba(22,163,74,.08);border-color:rgba(22,163,74,.25);}
            .active-orders-status.down{color:#fff;background:#D7263D;border-color:#D7263D;font-weight:700;padding:12px 14px;}
            .active-orders-status.down small{opacity:.9;display:block;font-weight:400;margin-top:4px;}
            .ao-row{padding:10px 12px;border:1px solid rgba(0,0,0,.08);border-radius:8px;margin-bottom:8px;background:rgba(255,255,255,.4);}
            .ao-row-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline;margin-bottom:6px;}
            .ao-row-head strong{font-family:monospace;}
            .ao-eta{font-weight:700;}
            .ao-eta.urgent{color:#D7263D;}
            .ao-eta.ok{color:#16a34a;}
            .ao-eta.warn{color:#E07A1F;}
            .ao-chips{display:flex;gap:4px;flex-wrap:wrap;font-size:11px;margin-top:4px;}
            .ao-chip{padding:2px 8px;border-radius:10px;border:1px solid rgba(0,0,0,.1);background:rgba(0,0,0,.03);}
            .ao-chip.on{background:rgba(22,163,74,.1);color:#15803d;border-color:rgba(22,163,74,.3);}
            .ao-chip.off{background:rgba(155,155,167,.1);color:#6b7280;}
            .ao-chip.err{background:rgba(215,38,61,.1);color:#b91c1c;border-color:rgba(215,38,61,.3);}
            .ao-row-err{margin-top:6px;padding:6px 8px;background:rgba(215,38,61,.08);color:#b91c1c;border-radius:6px;font-size:11px;}
            .ao-edit{margin-left:8px;font-size:12px;cursor:pointer;color:#FF6B35;text-decoration:underline;background:none;border:none;padding:0;}
            .ao-del{margin-left:6px;width:26px;height:26px;border-radius:5px;background:transparent;border:1px solid rgba(215,38,61,.2);color:#D7263D;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;transition:background .12s;}
            .ao-del:hover{background:rgba(215,38,61,.1);}
            .ao-del i{font-size:12px;}
            @media (prefers-color-scheme: dark){
              .active-orders-status{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:#d1d5db;}
              .active-orders-status.ok{background:rgba(45,179,106,.15);border-color:rgba(45,179,106,.35);color:#86efac;}
              .ao-row{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);color:#e5e7eb;}
              .ao-chip{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1);color:#d1d5db;}
              .ao-chip.on{background:rgba(45,179,106,.2);color:#86efac;}
              .ao-chip.off{background:rgba(255,255,255,.05);color:#9ca3af;}
            }
          </style>

          <!-- Live tracking JSON editor hidden by default — admins get the
               human-readable active-orders panel above. Toggle via
               ?debug=tracking in the URL if you ever need the raw JSON. -->
          <div id="notifyTrackingDebug" hidden>
            <details class="mt-2">
              <summary class="text-muted" style="cursor:pointer;">
                <i class="fas fa-database mr-1"></i> Live tracking file (<code id="notifyTrackingPath">—</code>)
              </summary>
              <p class="text-muted mt-2 mb-2">Raw tracking file — rarely needs editing.</p>
              <textarea id="notifyTrackingBox" class="form-control"
                        style="font-family:monospace;font-size:12px;min-height:200px;"
                        spellcheck="false"></textarea>
              <div class="settings-actions mt-2">
                <button type="button" class="btn btn-outline-secondary btn-sm" id="notifyTrackingReloadBtn">
                  <i class="fas fa-rotate mr-1"></i> Reload
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm" id="notifyTrackingSaveBtn">
                  <i class="fas fa-save mr-1"></i> Overwrite
                </button>
              </div>
            </details>
          </div>
        </div>
      </details>
    </div>
  `;

  // Point the "payment page" demo link at a freshly-minted token so it decodes
  // cleanly on pay.html instead of hitting the expired-state fallback. 10-year
  // expiry is fine — this link only ever opens in a new admin tab for preview.
  const demoLink = root.querySelector('#upiDemoLink');
  if (demoLink) {
    const demoToken = encodePayToken({
      o: 'DEMO',
      a: 100,
      e: Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60,
    });
    demoLink.href = `/banki-bites/pay.html?t=${demoToken}`;
  }

  const vpaInput = root.querySelector('#upiVpa');
  const nameInput = root.querySelector('#upiName');
  const supportInput = root.querySelector('#upiSupport');
  const metaBox = root.querySelector('#upiMeta');
  const updatedAtEl = root.querySelector('#upiUpdatedAt');
  const form = root.querySelector('#upiForm');

  // Live phone normalisation on the support-number field — same behaviour as
  // the custom-pay-link form, so pasting +91 / 91 / 0-prefix / spaces / dashes
  // collapses to a clean 10-digit number in the input.
  if (supportInput) {
    const trim = () => {
      const n = normalisePhone(supportInput.value);
      if (n !== supportInput.value) supportInput.value = n;
    };
    supportInput.addEventListener('input', trim);
    supportInput.addEventListener('change', trim);
    supportInput.addEventListener('blur', trim);
  }

  // Prefill from Firestore — fall back to the historical defaults so the form
  // never renders empty on a first-time install.
  try {
    window.bbBusy && window.bbBusy('Loading settings…');
    const snap = await getDoc(doc(db, COL.META, 'upi_config'));
    if (snap.exists()) {
      const d = snap.data() || {};
      vpaInput.value = d.merchant_vpa || DEFAULT_VPA;
      nameInput.value = d.merchant_name || DEFAULT_NAME;
      if (supportInput) supportInput.value = normalisePhone(d.support_whatsapp || '');
      if (d.updated_at?.toDate) {
        updatedAtEl.textContent = d.updated_at.toDate().toLocaleString('en-IN');
        metaBox.hidden = false;
      }
    } else {
      vpaInput.value = DEFAULT_VPA;
      nameInput.value = DEFAULT_NAME;
    }
  } catch (err) {
    console.warn('[settings] load failed:', err.message);
    vpaInput.value = DEFAULT_VPA;
    nameInput.value = DEFAULT_NAME;
  } finally {
    window.bbDone && window.bbDone();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const vpa = vpaInput.value.trim();
    const name = (nameInput.value || '').trim() || DEFAULT_NAME;
    const support = supportInput ? normalisePhone(supportInput.value) : '';

    if (!isValidVpa(vpa)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid UPI ID',
        text: 'Expected format is name@psp (e.g. test-upi@bnk).',
        confirmButtonColor: '#FF6B35',
      });
      vpaInput.focus();
      return;
    }
    if (support && !/^\d{10}$/.test(support)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid support number',
        text: 'Enter a 10-digit Indian mobile number, or leave blank to hide the support button.',
        confirmButtonColor: '#FF6B35',
      });
      supportInput.focus();
      return;
    }

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'Save UPI settings?',
      html: `This will change the VPA shown to every customer immediately.<br><br>
             <strong>UPI ID:</strong> <code>${vpa}</code><br>
             <strong>Payee:</strong> ${name}<br>
             <strong>Support WhatsApp:</strong> ${support ? '+91 ' + support : '<em>not set</em>'}`,
      showCancelButton: true,
      confirmButtonText: 'Save',
      confirmButtonColor: '#FF6B35',
    });
    if (!confirm.isConfirmed) return;

    try {
      window.bbBusy && window.bbBusy('Saving UPI settings…');
      await setDoc(doc(db, COL.META, 'upi_config'), {
        merchant_vpa: vpa,
        merchant_name: name,
        support_whatsapp: support || null,
        updated_at: serverTimestamp(),
      }, { merge: true });
      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
      updatedAtEl.textContent = new Date().toLocaleString('en-IN');
      metaBox.hidden = false;
    } catch (err) {
      window.bbDone && window.bbDone();
      Swal.fire({
        icon: 'error',
        title: 'Save failed',
        text: err.message || 'Please try again.',
        confirmButtonColor: '#FF6B35',
      });
    }
  });

  // ── Discount threshold card ────────────────────────────────────────────
  const minOrderInput = root.querySelector('#minOrder');
  const discountForm = root.querySelector('#discountForm');
  const discountMeta = root.querySelector('#discountMeta');
  const discountUpdatedEl = root.querySelector('#discountUpdatedAt');

  try {
    const snap = await getDoc(doc(db, COL.META, 'discount_config'));
    if (snap.exists()) {
      const d = snap.data() || {};
      minOrderInput.value = Number.isFinite(+d.min_order_value) ? +d.min_order_value : DEFAULT_MIN_ORDER;
      if (d.updated_at?.toDate) {
        discountUpdatedEl.textContent = d.updated_at.toDate().toLocaleString('en-IN');
        discountMeta.hidden = false;
      }
    } else {
      minOrderInput.value = DEFAULT_MIN_ORDER;
    }
  } catch (err) {
    console.warn('[settings] discount_config load failed:', err.message);
    minOrderInput.value = DEFAULT_MIN_ORDER;
  }

  // ── Custom pay link card ──────────────────────────────────────────────
  // Lets the admin mint a one-off payment link for ad-hoc collections (walk-in,
  // outstanding dues, etc.) without needing a saved order. Amount + phone are
  // required; discount and a human-readable note are optional. A short random
  // reference stands in for the order id so the pay page / UPI txn note still
  // carries something recognisable.
  const customPayLinkBtn = root.querySelector('#customPayLinkBtn');
  if (customPayLinkBtn) {
    customPayLinkBtn.addEventListener('click', async () => {
      const res = await Swal.fire({
        title: '<i class="fas fa-link mr-1" style="color:#25d366"></i> Custom pay link',
        html: `
          <div class="text-left" style="font-size:0.88rem">
            <div class="form-group">
              <label style="font-size:0.82rem;font-weight:600">Amount (₹) <span style="color:#d94c3d">*</span></label>
              <input id="cplAmount" class="form-control" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 250">
            </div>
            <div class="form-group">
              <label style="font-size:0.82rem;font-weight:600">Discount (₹) <span style="color:#6b7280;font-weight:400">— optional</span></label>
              <input id="cplDiscount" class="form-control" type="number" min="0" step="1" inputmode="numeric" placeholder="e.g. 20">
            </div>
            <div class="form-group">
              <label style="font-size:0.82rem;font-weight:600">Customer WhatsApp <span style="color:#d94c3d">*</span></label>
              <input id="cplPhone" class="form-control" type="tel" inputmode="tel" maxlength="15" placeholder="10-digit mobile">
            </div>
            <div class="form-group mb-0">
              <label style="font-size:0.82rem;font-weight:600">Note <span style="color:#6b7280;font-weight:400">— optional, added to WhatsApp message</span></label>
              <input id="cplNote" class="form-control" type="text" maxlength="40" placeholder="e.g. Table 3 · Walk-in">
            </div>
          </div>
        `,
        confirmButtonText: '<i class="fab fa-whatsapp mr-1"></i> Send on WhatsApp',
        confirmButtonColor: '#25d366',
        showCancelButton: true,
        width: 460,
        focusConfirm: false,
        didOpen: () => {
          // Mirror the main order form's phone-field behaviour: as soon as the
          // admin pastes/types anything, strip +91 / 91 / leading 0 / spaces /
          // dashes so the field always shows the clean 10-digit number.
          const phoneEl = document.getElementById('cplPhone');
          const trim = () => {
            const normalised = normalisePhone(phoneEl.value);
            if (normalised !== phoneEl.value) phoneEl.value = normalised;
          };
          phoneEl.addEventListener('input', trim);
          phoneEl.addEventListener('change', trim);
          phoneEl.addEventListener('blur', trim);
        },
        preConfirm: () => {
          const amount = parseFloat(document.getElementById('cplAmount').value);
          const discountRaw = document.getElementById('cplDiscount').value.trim();
          const discount = discountRaw ? parseFloat(discountRaw) : 0;
          const phone = normalisePhone(document.getElementById('cplPhone').value);
          const note = document.getElementById('cplNote').value.trim();
          if (!(Number.isFinite(amount) && amount > 0)) {
            Swal.showValidationMessage('Enter a valid amount greater than 0.');
            return false;
          }
          if (!Number.isFinite(discount) || discount < 0) {
            Swal.showValidationMessage('Discount must be 0 or greater.');
            return false;
          }
          if (discount >= amount) {
            Swal.showValidationMessage('Discount must be smaller than the amount.');
            return false;
          }
          if (!/^\d{10}$/.test(phone)) {
            Swal.showValidationMessage('Enter a valid 10-digit WhatsApp number.');
            return false;
          }
          return { amount, discount, phone, note };
        },
      });

      if (!res.isConfirmed) return;
      const { amount, discount, phone, note } = res.value;

      // Random short reference that doubles as the UPI `tr` (transaction id).
      // Prefix `CP` (custom-pay) + base36 timestamp + 3 random base36 chars.
      const ref = 'CP' + Date.now().toString(36).toUpperCase()
        + Math.random().toString(36).slice(2, 5).toUpperCase();

      const PAY_LINK_EXPIRY_SECONDS = 300;
      const exp = Math.floor(Date.now() / 1000) + PAY_LINK_EXPIRY_SECONDS;
      const tokenPayload = {
        o: ref,
        a: +amount.toFixed(2),
        e: exp,
      };
      if (discount > 0 && discount < amount) {
        tokenPayload.d = +discount.toFixed(2);
      }
      const payUrl = `${location.origin}/banki-bites/pay.html?t=${encodePayToken(tokenPayload)}`;

      // Final confirmation — show the admin exactly what's about to be encoded
      // into the link (amount, discount, note) and which number it's being sent
      // to, so a wrong value is caught before WhatsApp opens.
      const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(2);
      const escapeHtml = (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
      const row = (label, value, opts = {}) => {
        const s = opts.strong ? 'font-weight:700;color:' + (opts.color || '#1f1b16') : 'color:' + (opts.color || '#6b7280');
        const valStyle = opts.wrap ? 'word-break:break-word' : 'white-space:nowrap';
        return `<div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:3px 0">
          <span style="${s};flex-shrink:0">${label}</span>
          <span style="${s};${valStyle};text-align:right;min-width:0">${value}</span>
        </div>`;
      };
      const rows = [row('Amount in link', `₹${fmt(amount)}`, { strong: true, color: '#FF6B35' })];
      if (tokenPayload.d) {
        rows.push(row('Offer (opt-in)', `− ₹${fmt(tokenPayload.d)}`, { color: '#1fa971' }));
        rows.push(row('If customer applies', `₹${fmt(amount - tokenPayload.d)}`, { color: '#6b7280' }));
      }
      if (note) {
        rows.push(row('Note', `<em>${escapeHtml(note)}</em>`, { wrap: true }));
      }
      const confirmRes = await Swal.fire({
        title: 'Send payment link?',
        html: `
          <div style="text-align:left;font-size:0.9rem">
            <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #e5e7eb">
              <div style="color:#6b7280;font-size:0.72rem;text-transform:uppercase;letter-spacing:.05em">To WhatsApp</div>
              <div style="font-weight:600;word-break:break-all">+91 ${phone}</div>
            </div>
            ${rows.join('')}
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: '<i class="fab fa-whatsapp mr-1"></i> Send',
        confirmButtonColor: '#25d366',
        cancelButtonText: 'Cancel',
        focusCancel: true,
        width: 'min(420px, 92vw)',
      });
      if (!confirmRes.isConfirmed) return;

      const noteLine = note ? `*For:* ${note}` : null;
      const msg = [
        'ନମସ୍କାର !',
        'ଆପଣଙ୍କ ପାଇଁ secure payment link (valid for 5 minutes) —',
        payUrl,
        noteLine,
        'Payment ହେଲା ପରେ screenshot ଏହି WhatsApp number ରେ share କରିଦିଅନ୍ତୁ, ଆମେ confirm କରିଦେବୁ ।',
        '_Team BankiBites_',
      ].filter(Boolean).join('\n\n');

      const waUrl = 'https://wa.me/91' + phone + '?text=' + encodeURIComponent(msg);
      try { navigator.clipboard && navigator.clipboard.writeText(payUrl).catch(() => {}); } catch (e) {}
      try { window.location.href = waUrl; return; } catch (e) {}
      try { window.location.assign(waUrl); return; } catch (e) {}
      try { window.open(waUrl, '_self'); return; } catch (e) {}
      try { window.open(waUrl, '_blank'); return; } catch (e) {}
    });
  }

  discountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const minOrder = parseFloat(minOrderInput.value);
    if (!(Number.isFinite(minOrder) && minOrder >= 0)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid value',
        text: 'Minimum order value must be 0 or greater.',
        confirmButtonColor: '#FF6B35',
      });
      minOrderInput.focus();
      return;
    }

    try {
      window.bbBusy && window.bbBusy('Saving discount threshold…');
      await setDoc(doc(db, COL.META, 'discount_config'), {
        min_order_value: minOrder,
        updated_at: serverTimestamp(),
      }, { merge: true });
      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
      discountUpdatedEl.textContent = new Date().toLocaleString('en-IN');
      discountMeta.hidden = false;
    } catch (err) {
      window.bbDone && window.bbDone();
      Swal.fire({
        icon: 'error',
        title: 'Save failed',
        text: err.message || 'Please try again.',
        confirmButtonColor: '#FF6B35',
      });
    }
  });

  // ── Server & notifications card ───────────────────────────────────────
  const notifyServerInput = root.querySelector('#notifyServer');
  const notifyTokenInput  = root.querySelector('#notifyToken');
  const notifyEmailsInput = root.querySelector('#notifyAdminEmails');
  const notifyGroupInput  = root.querySelector('#notifyWaGroup');
  const notifyForm        = root.querySelector('#notifyForm');
  const notifyMeta        = root.querySelector('#notifyMeta');
  const notifyUpdatedAt   = root.querySelector('#notifyUpdatedAt');
  const notifyTrackingBox = root.querySelector('#notifyTrackingBox');
  const notifyTrackingPath= root.querySelector('#notifyTrackingPath');

  function cleanBaseUrl(s) { return String(s || '').trim().replace(/\/+$/, ''); }

  try {
    const snap = await getDoc(doc(db, COL.META, 'notification_config'));
    if (snap.exists()) {
      const d = snap.data() || {};
      notifyServerInput.value = d.server_url || '';
      notifyTokenInput.value  = d.notify_token || '';
      notifyEmailsInput.value = Array.isArray(d.admin_emails)
        ? d.admin_emails.join(', ')
        : (d.admin_emails || '');
      notifyGroupInput.value  = d.whatsapp_group || '';
      if (d.updated_at?.toDate) {
        notifyUpdatedAt.textContent = d.updated_at.toDate().toLocaleString('en-IN');
        notifyMeta.hidden = false;
      }
    }
  } catch (err) {
    console.warn('[settings] notification_config load failed:', err.message);
  }

  async function postServerSettings(server, token, emails, group) {
    // Mirror the emails + WA group to the Flask server so /bankibites/order-sync
    // knows where to send. (server_url + token stay on the client only.)
    if (!server) return;
    const res = await fetch(`${server}/bankibites/settings`, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json', 'X-Notify-Token': token },
      body: JSON.stringify({ admin_emails: emails, whatsapp_group: group }),
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    return res.json();
  }

  notifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    const emails = notifyEmailsInput.value
      .split(',').map(s => s.trim()).filter(Boolean);
    const group  = notifyGroupInput.value.trim();

    try {
      window.bbBusy && window.bbBusy('Saving notification settings…');
      await setDoc(doc(db, COL.META, 'notification_config'), {
        server_url:     server || null,
        notify_token:   token || null,
        admin_emails:   emails,
        whatsapp_group: group || null,
        updated_at:     serverTimestamp(),
      }, { merge: true });

      if (server && token) {
        try { await postServerSettings(server, token, emails, group); }
        catch (err) {
          window.bbDone && window.bbDone();
          const go = await Swal.fire({
            icon: 'warning',
            title: 'Firestore saved, server unreachable',
            html: `Could not reach <code>${server}</code>:<br><small>${err.message}</small><br><br>Firestore config saved anyway. Start the server and try "Test connection".`,
            confirmButtonColor: '#FF6B35',
          });
          return;
        }
      }

      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1100, showConfirmButton: false });
      notifyUpdatedAt.textContent = new Date().toLocaleString('en-IN');
      notifyMeta.hidden = false;
    } catch (err) {
      window.bbDone && window.bbDone();
      Swal.fire({
        icon: 'error',
        title: 'Save failed',
        text: err.message || 'Please try again.',
        confirmButtonColor: '#FF6B35',
      });
    }
  });

  root.querySelector('#notifyTestBtn').addEventListener('click', async () => {
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    if (!server || !token) {
      Swal.fire({ icon: 'info', title: 'Fill server URL and token first', confirmButtonColor: '#FF6B35' });
      return;
    }
    try {
      window.bbBusy && window.bbBusy('Pinging server…');
      const res = await fetch(`${server}/bankibites/settings`, {
        method: 'GET',
        mode:  'cors',
        headers: { 'X-Notify-Token': token },
      });
      window.bbDone && window.bbDone();
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.success === false) throw new Error(body.message || `HTTP ${res.status}`);
      Swal.fire({
        icon: 'success',
        title: 'Server reachable',
        html: `<pre style="text-align:left;font-size:12px;">${JSON.stringify(body.settings || {}, null, 2)}</pre>`,
        confirmButtonColor: '#FF6B35',
      });
    } catch (err) {
      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'error', title: 'Server unreachable', text: err.message, confirmButtonColor: '#FF6B35' });
    }
  });

  async function reloadTracking() {
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    if (!server || !token) return;
    try {
      const res = await fetch(`${server}/bankibites/tracking`, {
        method: 'GET', mode: 'cors',
        headers: { 'X-Notify-Token': token },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      notifyTrackingPath.textContent = body.path || '—';
      notifyTrackingBox.value = JSON.stringify(body.data || {}, null, 2);
    } catch (err) {
      notifyTrackingBox.value = `// failed: ${err.message}`;
    }
  }
  root.querySelector('#notifyTrackingReloadBtn').addEventListener('click', reloadTracking);
  // Lazy-load when the user actually opens the inner <details>.
  const trackingDetails = notifyTrackingBox.closest('details');
  trackingDetails?.addEventListener('toggle', () => { if (trackingDetails.open) reloadTracking(); });

  root.querySelector('#notifyTrackingSaveBtn').addEventListener('click', async () => {
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    if (!server || !token) return;
    let parsed;
    try { parsed = JSON.parse(notifyTrackingBox.value); }
    catch (err) {
      Swal.fire({ icon: 'error', title: 'Invalid JSON', text: err.message, confirmButtonColor: '#FF6B35' });
      return;
    }
    const confirm = await Swal.fire({
      icon: 'warning',
      title: 'Overwrite tracking file?',
      text: 'This replaces the server\'s current tracking state. Orders dropped from the file may get re-notified.',
      showCancelButton: true,
      confirmButtonColor: '#D7263D',
      confirmButtonText:  'Overwrite',
    });
    if (!confirm.isConfirmed) return;
    try {
      const res = await fetch(`${server}/bankibites/tracking`, {
        method: 'PUT', mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'X-Notify-Token': token },
        body: JSON.stringify(parsed),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      Swal.fire({ icon: 'success', title: 'Saved', timer: 1000, showConfirmButton: false });
      reloadTracking();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Save failed', text: err.message, confirmButtonColor: '#FF6B35' });
    }
  });

  // ── Active orders panel ─────────────────────────────────────────
  // Polls /bankibites/tracking-summary every 15s, renders compact rows with
  // ETA + notification status, and surfaces server-down as a big red banner.
  const activeStatusEl = root.querySelector('#activeOrdersStatus');
  const activeListEl   = root.querySelector('#activeOrdersList');

  function escapeHtmlLite(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  function etaClass(mins) {
    if (mins === null || mins === undefined) return '';
    if (mins <= 5) return 'urgent';
    if (mins <= 15) return 'warn';
    return 'ok';
  }

  function etaText(mins) {
    if (mins === null || mins === undefined) return 'no ETA set';
    if (mins < 0) return `${Math.abs(mins)} min overdue`;
    return `${mins} min left`;
  }

  async function reloadActiveOrders() {
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    if (!server || !token) {
      activeStatusEl.className = 'active-orders-status';
      activeStatusEl.textContent = 'Set server URL + token above, then save.';
      activeListEl.innerHTML = '';
      return;
    }
    try {
      const res = await fetch(`${server}/bankibites/tracking-summary`, {
        method: 'GET', mode: 'cors',
        headers: { 'X-Notify-Token': token },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      const orders = body.orders || [];
      const dueCount = orders.filter(o => o.minutes_left !== null && o.minutes_left <= 5).length;
      activeStatusEl.className = 'active-orders-status ok';
      activeStatusEl.innerHTML = `✅ Server reachable. <strong>${orders.length}</strong> tracked · <strong style="color:#D7263D;">${dueCount}</strong> within 5-min window`;
      if (!orders.length) {
        activeListEl.innerHTML = '<div class="text-muted small">No active orders being tracked.</div>';
        return;
      }
      activeListEl.innerHTML = orders.map(o => {
        const chips = [];
        chips.push(o.notified_admin_new
          ? '<span class="ao-chip on">✅ new-order sent</span>'
          : '<span class="ao-chip off">— new-order pending</span>');
        if (o.notified_partners?.length) {
          const names = o.notified_partners.map(p => escapeHtmlLite(p.name || p.phone)).join(', ');
          chips.push(`<span class="ao-chip on">✅ partner (${names})</span>`);
        } else {
          chips.push('<span class="ao-chip off">— no partner yet</span>');
        }
        if (o.status === 'assigned') {
          chips.push(o.notified_eta_breach
            ? '<span class="ao-chip on">✅ ETA alert sent</span>'
            : (o.last_error
                ? '<span class="ao-chip err">🚨 breach fire failed · retrying</span>'
                : '<span class="ao-chip off">⏳ breach pending</span>'));
        }
        const errBlock = o.last_error
          ? `<div class="ao-row-err">🚨 ${escapeHtmlLite(o.last_error)}</div>` : '';

        // Creation time: prefer order creation (customer placed it), fall
        // back to first-seen by server. Both strings already arrive in
        // 'YYYY-MM-DD HH:MM:SS IST' from the server — strip the date when
        // it's today for a tighter display.
        const rawCreated = o.created_at_ist || o.first_seen_at_ist || '';
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
        const createdDisplay = rawCreated.startsWith(today)
          ? rawCreated.slice(11)                  // just "HH:MM:SS IST"
          : rawCreated;
        const createdLabel = o.created_at_ist ? 'placed' : 'first seen';

        return `<div class="ao-row">
          <div class="ao-row-head">
            <div>
              <strong>#${escapeHtmlLite(o.order_number)}</strong>
              · ${escapeHtmlLite(o.customer_name || 'Guest')}
              · ${escapeHtmlLite(o.restaurant)}
            </div>
            <div class="ao-eta ${etaClass(o.minutes_left)}">
              ⏱ ${escapeHtmlLite(o.eta_ist || '—')} <small>(${etaText(o.minutes_left)})</small>
              <button class="ao-edit" data-oid="${escapeHtmlLite(o.order_id)}" data-eta="${escapeHtmlLite(o.eta_iso || '')}">edit</button>
              <button class="ao-del" data-oid="${escapeHtmlLite(o.order_id)}" data-num="${escapeHtmlLite(o.order_number)}" title="Remove from tracking file">
                <i class="fas fa-trash-can"></i>
              </button>
            </div>
          </div>
          <div class="text-muted small">
            status=${escapeHtmlLite(o.status)}
            ${rawCreated ? ` · ${createdLabel} <strong>${escapeHtmlLite(createdDisplay)}</strong>` : ''}
          </div>
          <div class="ao-chips">${chips.join('')}</div>
          ${errBlock}
        </div>`;
      }).join('');
      // Wire edit + delete buttons
      activeListEl.querySelectorAll('.ao-edit').forEach(btn => {
        btn.addEventListener('click', () => openEtaEditor(btn.dataset.oid, btn.dataset.eta));
      });
      activeListEl.querySelectorAll('.ao-del').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteEntry(btn.dataset.oid, btn.dataset.num));
      });
    } catch (err) {
      // Server unreachable → big red actionable banner.
      activeStatusEl.className = 'active-orders-status down';
      activeStatusEl.innerHTML = `
        🚨 SERVER DOWN — TAKE IMMEDIATE ACTION
        <small>
          Cannot reach <code style="color:#fff;background:rgba(0,0,0,.2);padding:1px 6px;border-radius:3px;">${escapeHtmlLite(server)}</code>:
          ${escapeHtmlLite(err.message)}<br>
          <b>Scheduled ETA alerts will NOT fire until this is restored.</b><br>
          Fix: start the local_machine Flask server on your laptop, confirm ngrok is live, then click <b>retry</b>.
        </small>`;
      activeListEl.innerHTML = '';
    }
  }

  async function confirmDeleteEntry(oid, orderNumber) {
    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    if (!server || !token) {
      Swal.fire({ icon: 'info', title: 'Save server URL + token first', confirmButtonColor: '#FF6B35' });
      return;
    }
    const confirm = await Swal.fire({
      icon: 'warning',
      title: `Remove #${orderNumber || oid.slice(-6).toUpperCase()}?`,
      html: `
        <div class="text-left">
          <p>This removes the entry from the <strong>tracking file only</strong> on the notification server.</p>
          <ul>
            <li>The scanner stops queuing this order.</li>
            <li>No email / WhatsApp is fired.</li>
            <li><strong>The Firestore order is NOT deleted</strong> — use the Orders tab for that.</li>
          </ul>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'Remove from tracking',
      confirmButtonColor: '#D7263D',
      cancelButtonText: 'Cancel',
    });
    if (!confirm.isConfirmed) return;
    try {
      const res = await fetch(`${server}/bankibites/order-delete`, {
        method: 'POST', mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'X-Notify-Token': token },
        body: JSON.stringify({ order_id: oid, actor: 'admin' }),
      });
      const body = await res.json();
      if (!res.ok || body.success === false) throw new Error(body.message || `HTTP ${res.status}`);
      Swal.fire({
        icon: body.removed ? 'success' : 'info',
        title: body.removed ? 'Removed from tracking' : 'Was already gone',
        timer: 1200, showConfirmButton: false,
      });
      reloadActiveOrders();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Delete failed', text: err.message, confirmButtonColor: '#D7263D' });
    }
  }

  async function openEtaEditor(oid, currentEtaIso) {
    // Convert ISO to datetime-local (IST) for the input default.
    let dtLocal = '';
    try {
      if (currentEtaIso) {
        const d = new Date(currentEtaIso);
        const istMs = d.getTime() + 330 * 60 * 1000;
        dtLocal = new Date(istMs).toISOString().slice(0, 16);
      }
    } catch {}
    const { value: picked } = await Swal.fire({
      title: `Override ETA for #${oid.slice(-6).toUpperCase()}`,
      html: `
        <div class="text-left">
          <p class="text-muted small">Pick a new ETA (IST). This also:</p>
          <ul class="text-muted small" style="text-align:left;">
            <li>Updates the Firestore order (so the delivery partner sees it)</li>
            <li>Resets the server's breach flag so a fresh alert fires on the new deadline</li>
          </ul>
          <input type="datetime-local" id="swalEtaInput" class="swal2-input" value="${dtLocal}">
        </div>`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Save ETA',
      confirmButtonColor: '#FF6B35',
      preConfirm: () => {
        const v = document.getElementById('swalEtaInput').value;
        if (!v) { Swal.showValidationMessage('Pick a date and time'); return false; }
        return v;
      },
    });
    if (!picked) return;

    const server = cleanBaseUrl(notifyServerInput.value);
    const token  = notifyTokenInput.value.trim();
    const etaMs  = new Date(picked).getTime();   // local-time interpretation (IST on admin machine)
    const etaIso = new Date(etaMs).toISOString();

    try {
      window.bbBusy && window.bbBusy('Saving ETA…');
      // 1. Update Firestore so the delivery partner sees the new ETA
      try {
        const { Timestamp } = await import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js');
        const { updateDoc, doc } = await import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js');
        await updateDoc(doc(db, COL.ORDERS, oid), { eta: Timestamp.fromMillis(etaMs) });
      } catch (err) {
        console.warn('[eta-override] Firestore update failed:', err.message);
      }
      // 2. Update server tracking (resets breach flag so alert refires)
      const res = await fetch(`${server}/bankibites/tracking/${encodeURIComponent(oid)}/eta`, {
        method: 'PUT', mode: 'cors',
        headers: { 'Content-Type': 'application/json', 'X-Notify-Token': token },
        body: JSON.stringify({ eta: etaIso }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'success', title: 'ETA updated', timer: 1000, showConfirmButton: false });
      reloadActiveOrders();
    } catch (err) {
      window.bbDone && window.bbDone();
      Swal.fire({ icon: 'error', title: 'Update failed', text: err.message, confirmButtonColor: '#D7263D' });
    }
  }

  root.querySelector('#activeOrdersRefreshBtn')?.addEventListener('click', reloadActiveOrders);
  // Auto-refresh every 15s, pause when tab hidden to save network.
  let _activeTimer = null;
  function startActivePoll() {
    stopActivePoll();
    reloadActiveOrders();
    _activeTimer = setInterval(() => { if (!document.hidden) reloadActiveOrders(); }, 15000);
  }
  function stopActivePoll() {
    if (_activeTimer) { clearInterval(_activeTimer); _activeTimer = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActivePoll();
    else startActivePoll();
  });
  startActivePoll();
}
