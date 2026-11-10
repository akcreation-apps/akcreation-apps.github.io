// BankiBites admin — Settings tab.
// Currently holds the merchant UPI config (VPA + display name) read by
// /banki-bites/pay.html. Stored at bankibites_meta/upi_config.

import { doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from '../firebase-config.js';
import { encodePayToken } from '../pay-token.js';

const DEFAULT_VPA = '8270171898m@pnb';
const DEFAULT_NAME = 'BankiBites';
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
                   placeholder="e.g. 8270171898m@pnb" required
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
  const metaBox = root.querySelector('#upiMeta');
  const updatedAtEl = root.querySelector('#upiUpdatedAt');
  const form = root.querySelector('#upiForm');

  // Prefill from Firestore — fall back to the historical defaults so the form
  // never renders empty on a first-time install.
  try {
    window.bbBusy && window.bbBusy('Loading settings…');
    const snap = await getDoc(doc(db, COL.META, 'upi_config'));
    if (snap.exists()) {
      const d = snap.data() || {};
      vpaInput.value = d.merchant_vpa || DEFAULT_VPA;
      nameInput.value = d.merchant_name || DEFAULT_NAME;
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

    if (!isValidVpa(vpa)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid UPI ID',
        text: 'Expected format is name@psp (e.g. 8270171898m@pnb).',
        confirmButtonColor: '#FF6B35',
      });
      vpaInput.focus();
      return;
    }

    const confirm = await Swal.fire({
      icon: 'question',
      title: 'Save UPI settings?',
      html: `This will change the VPA shown to every customer immediately.<br><br>
             <strong>UPI ID:</strong> <code>${vpa}</code><br>
             <strong>Payee:</strong> ${name}`,
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
}
