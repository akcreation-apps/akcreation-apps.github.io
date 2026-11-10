// BankiBites admin — Settings tab.
// Currently holds the merchant UPI config (VPA + display name) read by
// /banki-bites/pay.html. Stored at bankibites_meta/upi_config.

import { doc, getDoc, setDoc, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from '../firebase-config.js';

const DEFAULT_VPA = '8270171898m@pnb';
const DEFAULT_NAME = 'BankiBites';
const DEFAULT_MIN_ORDER = 0;

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

      <section class="settings-card" aria-labelledby="upi-heading">
        <div class="settings-card-head">
          <h3 id="upi-heading"><i class="fas fa-mobile-alt mr-2"></i>UPI payment details</h3>
          <p class="text-muted">
            Used by the customer-facing
            <a href="/banki-bites/pay.html?order=DEMO&amount=100&exp=9999999999" target="_blank" rel="noopener">payment page</a>
            — the "Pay link" button in Orders sends this VPA to the customer.
          </p>
        </div>

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
      </section>

      <section class="settings-card" aria-labelledby="discount-heading">
        <div class="settings-card-head">
          <h3 id="discount-heading"><i class="fas fa-tag mr-2"></i>Discount threshold</h3>
          <p class="text-muted">
            Discounts are only shown to the customer on the payment page when the order cart total is at or above this value. Set to <code>0</code> to always surface the discount.
          </p>
        </div>

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
      </section>
    </div>
  `;

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
