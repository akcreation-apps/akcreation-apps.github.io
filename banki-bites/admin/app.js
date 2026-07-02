import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';

const APP_NAME = 'bankibites-admin';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import { doc, getDoc, collection, query, where, limit, getDocs } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

import { renderPartners } from './partners.js';
import { renderOrders }   from './orders.js';
import { renderStaff }    from './staff.js';
import { renderDashboard } from './dashboard.js';
import { renderBroadcast } from './broadcast.js';
import { renderCustomers } from './customers-tab.js';

const $ = sel => document.querySelector(sel);

// Global busy overlay — used by every Firestore write/action-read in admin
// so users always see a spinner during DB I/O instead of a frozen UI.
// Pages share SweetAlert2 (loaded in admin/index.html), so we piggy-back on
// its dialog. Window-attached so submodules (orders.js, staff.js, etc.) can
// call it without an explicit import.
window.bbBusy = function (message = 'Working…') {
  if (!window.Swal) return;
  Swal.fire({
    title: message,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
};
window.bbDone = function () {
  if (!window.Swal) return;
  // Only close if the busy dialog is the currently open one — avoids
  // accidentally dismissing a confirm/error dialog the caller showed next.
  if (Swal.isLoading && Swal.isLoading()) Swal.close();
};

const authLoading = $('#authLoading');
const authGate = $('#authGate');
const appShell = $('#appShell');
const authError = $('#authError');

function showSignIn() {
  if (authLoading) authLoading.hidden = true;
  authGate.hidden = false;
  appShell.hidden = true;
}
function showShell() {
  if (authLoading) authLoading.hidden = true;
  authGate.hidden = true;
  appShell.hidden = false;
}

let currentUser = null;
let renderedTabs = {};

(async function init() {
  try {
    const auth = await getAuthInstance();

    $('#googleSignInBtn').addEventListener('click', async () => {
      authError.hidden = true;
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (e) {
        authError.textContent = (e.code ? e.code + ': ' : '') + (e.message || 'Sign-in failed.');
        authError.hidden = false;
      }
    });

    $('#signOutBtn').addEventListener('click', async () => {
      await signOut(auth);
      location.reload();
    });

    window.addEventListener('beforeunload', () => console.warn('[admin] page is about to unload'));

    onAuthStateChanged(auth, async user => {
      console.log('[admin] auth state changed:', user?.email, user?.uid, 'at', new Date().toISOString());
      if (!user) {
        currentUser = null;
        showSignIn();
        return;
      }
      let admins;
      try {
        const db = await getDb();
        admins = await getDoc(doc(db, COL.META, 'admins'));
      } catch (err) {
        console.error('[admin] admins doc fetch failed', err);
        authError.innerHTML = `Lookup failed: <code>${err.code || ''}</code> ${err.message}<br><small>UID: <code>${user.uid}</code></small>`;
        authError.hidden = false;
        showSignIn();
        await signOut(auth);
        return;
      }
      const allowedUids = admins.exists() ? (admins.data().uids || []) : [];
      console.log('[admin] my uid:', user.uid, '| allowed uids:', allowedUids);
      if (!allowedUids.includes(user.uid)) {
        authError.innerHTML = `
          Account <strong>${user.email}</strong> is not authorised.<br>
          <small>Your UID: <code>${user.uid}</code></small><br>
          <small>Allowlist: <code>${JSON.stringify(allowedUids)}</code></small>
        `;
        authError.hidden = false;
        showSignIn();
        await signOut(auth);
        return;
      }
      currentUser = user;
      $('#userEmail').textContent = user.email;
      showShell();
      // Land on Orders when there are active deliveries to triage; otherwise
      // open the Dashboard for a high-level read of the business.
      const landing = await pickLandingTab(await getDb());
      activateTab(landing);
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

  } catch (e) {
    authError.textContent = 'Initialisation failed: ' + e.message;
    authError.hidden = false;
    showSignIn();
  }
})();

async function pickLandingTab(db) {
  // "Active" = anything not yet delivered or cancelled. We probe each non-terminal
  // status with a 1-doc limit query so we bail out as soon as the first match is
  // found — no full collection scan.
  const ACTIVE = ['new', 'assigned', 'out_for_delivery'];
  try {
    for (const s of ACTIVE) {
      const snap = await getDocs(query(collection(db, COL.ORDERS), where('status', '==', s), limit(1)));
      if (!snap.empty) return 'orders';
    }
  } catch (err) {
    console.warn('[admin] landing-tab probe failed, defaulting to dashboard:', err.message);
  }
  return 'dashboard';
}

async function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === name;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  const panel = document.getElementById(`tab-${name}`);
  if (renderedTabs[name]) return;
  renderedTabs[name] = true;
  const db = await getDb();
  if (name === 'dashboard') await renderDashboard(panel, db, APP_NAME);
  if (name === 'orders')    await renderOrders(panel, db, APP_NAME);
  if (name === 'partners')  await renderPartners(panel, db, APP_NAME);
  if (name === 'staff')     await renderStaff(panel, db, APP_NAME);
  if (name === 'customers') await renderCustomers(panel, db, APP_NAME);
  if (name === 'broadcast') await renderBroadcast(panel, db, APP_NAME);
}
