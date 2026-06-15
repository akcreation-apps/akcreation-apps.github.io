import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, getDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}
function isValidPhone(raw) {
  return /^\d{10}$/.test(normalisePhone(raw));
}

export async function loadCustomers(db) {
  const snap = await getDocs(collection(db, COL.CUSTOMERS));
  const map = new Map();
  snap.forEach(d => map.set(d.id, { phone: d.id, ...d.data() }));
  return map;
}

// Returns ALL customers whose name/phone/address contain the term, sorted with
// name-prefix matches first, then phone-prefix matches, then everything else
// alphabetically by name. The results container is scrollable, so we don't
// truncate — callers can scroll through the full match list.
export function searchCustomers(map, term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t) return [];
  const out = [];
  for (const c of map.values()) {
    const name = (c.name || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    const addr = (c.address || '').toLowerCase();
    if (name.includes(t) || phone.includes(t) || addr.includes(t)) {
      let rank = 3;
      if (name.startsWith(t)) rank = 0;
      else if (phone.startsWith(t)) rank = 1;
      else if (name.includes(t)) rank = 2;
      out.push({ c, rank });
    }
  }
  out.sort((a, b) => a.rank - b.rank || (a.c.name || '').localeCompare(b.c.name || ''));
  return out.map(x => x.c);
}

// Upsert a customer doc keyed by phone. Sets created_at on first insert.
export async function upsertCustomer(db, payload) {
  const phone = normalisePhone(payload.phone);
  if (!isValidPhone(phone)) throw new Error('Valid 10-digit phone is required');
  window.bbBusy('Saving customer…');
  const ref = doc(db, COL.CUSTOMERS, phone);
  const existing = await getDoc(ref);
  const data = {
    name: payload.name || '',
    phone,
    address: payload.address || '',
    last_seen: Timestamp.now(),
  };
  if (payload.gps && Number.isFinite(payload.gps.lat) && Number.isFinite(payload.gps.lng)) {
    data.gps = { lat: payload.gps.lat, lng: payload.gps.lng };
  }
  if (typeof payload.not_interested === 'boolean') {
    data.not_interested = payload.not_interested;
  }
  if (!existing.exists()) data.created_at = Timestamp.now();
  try {
    await setDoc(ref, data, { merge: true });
  } finally {
    window.bbDone();
  }
  return { phone, ...data };
}

// SweetAlert2 modal to create or edit a customer.
// `existing` may be a partial customer object (or null for create).
// Returns the saved customer object, or null if cancelled.
export async function openCustomerModal(db, existing, defaults = {}) {
  const c = existing || {};
  const gps = c.gps || {};
  const initName = c.name || defaults.name || '';
  const html = `
    <form id="customerForm" class="text-left" autocomplete="off">
      <!-- decoy fields: some browsers ignore autocomplete="off" unless they
           see at least one field they can fill; these absorb the autofill -->
      <input type="text" name="bb-decoy-user" autocomplete="username" style="display:none" tabindex="-1" aria-hidden="true">
      <input type="password" name="bb-decoy-pass" autocomplete="new-password" style="display:none" tabindex="-1" aria-hidden="true">
      <div class="form-group">
        <label>Name</label>
        <input class="form-control" name="name" value="${escapeAttr(initName)}" required
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="form-group">
        <label>Contact no (10 digits)</label>
        <input class="form-control" name="phone" inputmode="tel" maxlength="15"
               value="${escapeAttr(c.phone || '')}" ${existing && c.phone ? 'readonly' : ''} required
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        ${existing && c.phone ? '<small class="text-muted">Phone is the customer ID and cannot be changed.</small>' : ''}
      </div>
      <div class="form-group">
        <label>Address</label>
        <textarea class="form-control" name="address" rows="2" required
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">${escapeHtml(c.address || '')}</textarea>
      </div>
      <div class="form-group">
        <label>Paste Google Maps link <small class="text-muted">(optional)</small></label>
        <div class="input-group input-group-sm">
          <input class="form-control" id="mapsLink" type="url" placeholder="https://maps.google.com/?q=..." autocomplete="off" autocapitalize="off" spellcheck="false">
          <div class="input-group-append">
            <button type="button" class="btn btn-outline-secondary" id="mapsParseBtn">
              <i class="fas fa-location-crosshairs"></i> Use
            </button>
          </div>
        </div>
        <small id="mapsHint" class="text-muted">
          Open Google Maps → drop a pin → <strong>Share → Copy link</strong> → paste here. Lat/lng fields below fill in automatically.
        </small>
      </div>
      <div class="form-row">
        <div class="form-group col-6">
          <label>GPS latitude <small class="text-muted">(optional)</small></label>
          <input class="form-control" name="lat" type="number" step="any"
                 value="${gps.lat ?? ''}" placeholder="e.g. 20.3741" autocomplete="off">
        </div>
        <div class="form-group col-6">
          <label>GPS longitude <small class="text-muted">(optional)</small></label>
          <input class="form-control" name="lng" type="number" step="any"
                 value="${gps.lng ?? ''}" placeholder="e.g. 85.5135" autocomplete="off">
        </div>
      </div>
      <div class="form-group form-check">
        <input class="form-check-input" type="checkbox" name="not_interested" id="cust_not_interested"
               ${c.not_interested ? 'checked' : ''}>
        <label class="form-check-label" for="cust_not_interested">
          Customer is not interested in promotions (do not contact)
        </label>
      </div>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${c.name || c.phone}` : 'Add customer',
    html,
    showCancelButton: true,
    confirmButtonText: 'Save',
    width: 520,
    didOpen: () => {
      const phoneInput = document.querySelector('#customerForm [name="phone"]');
      if (phoneInput && !phoneInput.readOnly) {
        const norm = () => { const n = normalisePhone(phoneInput.value); if (n !== phoneInput.value) phoneInput.value = n; };
        phoneInput.addEventListener('blur', norm);
        phoneInput.addEventListener('paste', e => {
          e.preventDefault();
          const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
          phoneInput.value = normalisePhone(raw);
        });
      }

      const linkInput = document.getElementById('mapsLink');
      const parseBtn  = document.getElementById('mapsParseBtn');
      const hintEl    = document.getElementById('mapsHint');
      const latInput  = document.querySelector('#customerForm [name="lat"]');
      const lngInput  = document.querySelector('#customerForm [name="lng"]');

      function setHint(msg, ok) {
        hintEl.innerHTML = msg;
        hintEl.style.color = ok === true ? 'var(--success)' : (ok === false ? 'var(--danger)' : '');
      }
      function applyLink() {
        const raw = linkInput.value.trim();
        if (!raw) { setHint('Paste a Maps link to auto-fill.'); return; }
        const coords = parseMapsLink(raw);
        if (!coords) {
          setHint('Could not find coordinates in that link. Open the short link once in your browser so it expands, then paste the full URL.', false);
          return;
        }
        latInput.value = coords.lat.toFixed(6);
        lngInput.value = coords.lng.toFixed(6);
        setHint(`<i class="fas fa-circle-check"></i> Got it — ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`, true);
      }
      parseBtn.addEventListener('click', applyLink);
      linkInput.addEventListener('paste', () => setTimeout(applyLink, 0));
      linkInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
      });
    },
    preConfirm: () => {
      const f = document.getElementById('customerForm');
      const fd = new FormData(f);
      const name = (fd.get('name') || '').toString().trim();
      const phone = normalisePhone(fd.get('phone'));
      const address = (fd.get('address') || '').toString().trim();
      const latRaw = (fd.get('lat') || '').toString().trim();
      const lngRaw = (fd.get('lng') || '').toString().trim();
      if (!name) { Swal.showValidationMessage('Name is required'); return false; }
      if (!isValidPhone(phone)) { Swal.showValidationMessage('Phone must be 10 digits'); return false; }
      if (!address) { Swal.showValidationMessage('Address is required'); return false; }
      if ((latRaw === '') !== (lngRaw === '')) {
        Swal.showValidationMessage('Enter both latitude and longitude, or leave both blank');
        return false;
      }
      const not_interested = !!fd.get('not_interested');
      const payload = { name, phone, address, not_interested };
      if (latRaw !== '' && lngRaw !== '') {
        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
          Swal.showValidationMessage('Latitude must be between -90 and 90');
          return false;
        }
        if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
          Swal.showValidationMessage('Longitude must be between -180 and 180');
          return false;
        }
        payload.gps = { lat, lng };
      }
      return payload;
    },
  });
  if (!res.isConfirmed) return null;
  try {
    return await upsertCustomer(db, res.value);
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Save failed', text: err.message });
    return null;
  }
}

// Best-effort extraction of {lat, lng} from a pasted Google Maps URL.
// Covers the common share-link shapes the Maps mobile/web apps produce:
//   https://www.google.com/maps?q=20.3741,85.5135
//   https://www.google.com/maps/@20.3741,85.5135,17z
//   https://www.google.com/maps/place/Foo/@20.3741,85.5135,17z/data=...
//   https://maps.google.com/?ll=20.3741,85.5135
//   geo:20.3741,85.5135
// Note: short links (maps.app.goo.gl/...) do NOT contain the coords — they
// resolve to a long URL via a redirect, which we can't follow client-side
// without CORS. The hint asks the user to expand short links first.
export function parseMapsLink(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // Try a series of patterns in order — first one that matches a sane
  // lat/lng pair wins.
  const patterns = [
    /[?&](?:q|ll|destination|center)=(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/i,
    /[!]?@?(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)(?:,\d+(?:\.\d+)?z)?/, // @lat,lng or !1d, !2d, etc.
    /^geo:(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i,
    /(-?\d{1,3}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/, // bare "20.3741, 85.5135"
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
