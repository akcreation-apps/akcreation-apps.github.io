import { getDb, getAuthInstance, COL } from '../firebase-config.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

import { renderPartners } from './partners.js';
import { renderOrders }   from './orders.js';
import { renderStaff }    from './staff.js';

const $ = sel => document.querySelector(sel);

const authGate = $('#authGate');
const appShell = $('#appShell');
const authError = $('#authError');

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
        authGate.hidden = false;
        appShell.hidden = true;
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
        await signOut(auth);
        return;
      }
      currentUser = user;
      $('#userEmail').textContent = user.email;
      authGate.hidden = true;
      appShell.hidden = false;
      activateTab('orders');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });

  } catch (e) {
    authError.textContent = 'Initialisation failed: ' + e.message;
    authError.hidden = false;
  }
})();

async function activateTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  const panel = document.getElementById(`tab-${name}`);
  if (renderedTabs[name]) return;
  renderedTabs[name] = true;
  const db = await getDb();
  if (name === 'orders')   await renderOrders(panel, db);
  if (name === 'partners') await renderPartners(panel, db);
  if (name === 'staff')    await renderStaff(panel, db);
}
