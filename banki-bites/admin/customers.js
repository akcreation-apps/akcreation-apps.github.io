import { COL } from '../firebase-config.js';
import {
  collection, getDocs, doc, setDoc, getDoc, Timestamp,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).replace(/[\s\-()]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s;
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
  if (!existing.exists()) data.created_at = Timestamp.now();
  await setDoc(ref, data, { merge: true });
  return { phone, ...data };
}

// SweetAlert2 modal to create or edit a customer.
// `existing` may be a partial customer object (or null for create).
// Returns the saved customer object, or null if cancelled.
export async function openCustomerModal(db, existing) {
  const c = existing || {};
  const gps = c.gps || {};
  const html = `
    <form id="customerForm" class="text-left" autocomplete="off">
      <!-- decoy fields: some browsers ignore autocomplete="off" unless they
           see at least one field they can fill; these absorb the autofill -->
      <input type="text" name="bb-decoy-user" autocomplete="username" style="display:none" tabindex="-1" aria-hidden="true">
      <input type="password" name="bb-decoy-pass" autocomplete="new-password" style="display:none" tabindex="-1" aria-hidden="true">
      <div class="form-group">
        <label>Name</label>
        <input class="form-control" name="name" value="${escapeAttr(c.name || '')}" required
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
      <small class="text-muted">Tip: open the location in Google Maps, long-press the pin, copy the two numbers it shows.</small>
    </form>
  `;
  const res = await Swal.fire({
    title: existing ? `Edit: ${c.name || c.phone}` : 'Add customer',
    html,
    showCancelButton: true,
    confirmButtonText: 'Save',
    width: 520,
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
      const payload = { name, phone, address };
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch]));
}
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
