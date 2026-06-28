import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

import { renderDriverTripPanel } from '../admin/trips.js';

const APP_NAME = 'anvisha-driver';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);

const $ = sel => document.querySelector(sel);

// Same busy overlay contract as admin so trips.js (shared) can call avBusy/avDone.
window.avBusy = function (message = 'Working…') {
  if (!window.Swal) return;
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
};
window.avDone = function () {
  if (!window.Swal) return;
  if (Swal.isLoading && Swal.isLoading()) Swal.close();
};

const authGate = $('#authGate');
const appShell = $('#appShell');
const authError = $('#authError');

(async function init() {
  try {
    const auth = await getAuthInstance();

    $('#signInForm').addEventListener('submit', async e => {
      e.preventDefault();
      authError.hidden = true;
      const email = $('#emailInput').value.trim();
      const password = $('#passwordInput').value;
      if (!email || !password) {
        authError.textContent = 'Email and password are required.';
        authError.hidden = false;
        return;
      }
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e2) {
        authError.textContent = (e2.code ? e2.code + ': ' : '') + (e2.message || 'Sign-in failed.');
        authError.hidden = false;
      }
    });

    $('#signOutBtn').addEventListener('click', async () => {
      await signOut(auth);
      location.reload();
    });

    onAuthStateChanged(auth, async user => {
      if (!user) {
        authGate.hidden = false;
        appShell.hidden = true;
        return;
      }
      const db = await getDb();
      let drivers;
      try {
        drivers = await getDoc(doc(db, COL.META, 'drivers'));
      } catch (err) {
        authError.innerHTML = `Lookup failed: <code>${err.code || ''}</code> ${err.message}<br><small>UID: <code>${user.uid}</code></small>`;
        authError.hidden = false;
        await signOut(auth);
        return;
      }
      const driverUids = drivers.exists() ? (drivers.data().uids || []) : [];
      const driverProfiles = drivers.exists() ? (drivers.data().profile || {}) : {};

      if (!driverUids.includes(user.uid)) {
        authError.innerHTML = `
          Account <strong>${user.email}</strong> is not authorised as a driver.<br>
          <small>UID: <code>${user.uid}</code></small><br>
          <small>Ask the admin to add this UID to <code>${COL.META}/drivers</code>.</small>
        `;
        authError.hidden = false;
        await signOut(auth);
        return;
      }

      const profile = driverProfiles[user.uid] || {};
      const driver = {
        uid:   user.uid,
        name:  profile.name  || user.displayName || user.email,
        phone: profile.phone || '',
      };

      $('#userEmail').textContent = user.email;
      authGate.hidden = true;
      appShell.hidden = false;

      const panel = document.getElementById('driverPanel');
      try {
        await renderDriverTripPanel({ panel, db, user, driver, role: 'driver', appName: APP_NAME });
      } catch (e) {
        panel.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed to load: ${e.message || e}</div>`;
      }
    });

  } catch (e) {
    authError.textContent = 'Initialisation failed: ' + e.message;
    authError.hidden = false;
  }
})();
