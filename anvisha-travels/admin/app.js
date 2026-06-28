import { getDb as getDbBase, getAuthInstance as getAuthBase, COL } from '../firebase-config.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

import { renderDashboard } from './dashboard.js';
import { renderBookings }  from './bookings.js';
import { renderTrips }     from './trips.js';
import { renderCustomers } from './customers.js';
import { renderDrivers }   from './drivers.js';
import { renderExpenses }  from './expenses.js';
import { renderBroadcast } from './broadcast.js';

const APP_NAME = 'anvisha-admin';
const getDb = () => getDbBase(APP_NAME);
const getAuthInstance = () => getAuthBase(APP_NAME);

const $ = sel => document.querySelector(sel);

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

const ADMIN_TABS = [
  { key: 'dashboard',  label: 'Dashboard',  icon: 'fa-chart-line',  render: renderDashboard },
  { key: 'bookings',   label: 'Bookings',   icon: 'fa-calendar',    render: renderBookings },
  { key: 'trips',      label: 'Trips',      icon: 'fa-road',        render: ctx => renderTrips(ctx, 'admin') },
  { key: 'expenses',   label: 'Expenses',   icon: 'fa-receipt',     render: renderExpenses },
  { key: 'customers',  label: 'Customers',  icon: 'fa-users',       render: renderCustomers },
  { key: 'drivers',    label: 'Drivers',    icon: 'fa-id-card',     render: renderDrivers },
  { key: 'broadcast',  label: 'Broadcast',  icon: 'fa-bullhorn',    render: renderBroadcast },
];

const authGate = $('#authGate');
const appShell = $('#appShell');
const authError = $('#authError');
const tabbar = $('#tabbar');

let currentUser = null;
let renderedTabs = {};

(async function init() {
  try {
    const auth = await getAuthInstance();

    $('#googleSignInBtn').addEventListener('click', async () => {
      authError.hidden = true;
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try {
        await signInWithPopup(auth, provider);
      } catch (e) {
        authError.textContent = (e.code ? e.code + ': ' : '') + (e.message || 'Sign-in failed.');
        authError.hidden = false;
      }
    });

    $('#signOutBtn').addEventListener('click', async () => {
      await signOut(auth);
      location.reload();
    });

    onAuthStateChanged(auth, async user => {
      if (!user) {
        currentUser = null;
        authGate.hidden = false;
        appShell.hidden = true;
        return;
      }
      const db = await getDb();
      let admins, drivers;
      try {
        admins  = await getDoc(doc(db, COL.META, 'admins'));
        drivers = await getDoc(doc(db, COL.META, 'drivers'));
      } catch (err) {
        authError.textContent = 'Sign-in lookup failed. Please contact support.';
        authError.hidden = false;
        await signOut(auth);
        return;
      }
      const adminUids  = admins.exists()  ? (admins.data().uids  || []) : [];
      const driverUids = drivers.exists() ? (drivers.data().uids || []) : [];

      if (!adminUids.includes(user.uid)) {
        const isDriver = driverUids.includes(user.uid);
        authError.innerHTML = isDriver
          ? `Drivers should use the <a href="../driver/">Driver portal</a>.`
          : `This account is not authorised to access the admin panel.`;
        authError.hidden = false;
        await signOut(auth);
        return;
      }

      currentUser = user;
      $('#userEmail').textContent = user.email;
      authGate.hidden = true;
      appShell.hidden = false;

      mountTabs();
      activateTab('bookings');
    });

  } catch (e) {
    authError.textContent = 'Initialisation failed: ' + e.message;
    authError.hidden = false;
  }
})();

function mountTabs() {
  tabbar.innerHTML = '';
  ADMIN_TABS.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.id = `tab-btn-${t.key}`;
    btn.dataset.tab = t.key;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-controls', `tab-${t.key}`);
    btn.innerHTML = `<i class="fas ${t.icon}" aria-hidden="true"></i><span>${t.label}</span>`;
    btn.addEventListener('click', () => activateTab(t.key));
    tabbar.appendChild(btn);
  });
}

async function activateTab(key) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isActive = b.dataset.tab === key;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${key}`));

  if (renderedTabs[key]) return;
  renderedTabs[key] = true;
  const panel = document.getElementById(`tab-${key}`);
  const db = await getDb();
  const ctx = {
    panel, db,
    user: currentUser,
    role: 'admin',
    appName: APP_NAME,
    activateTab,
    invalidate: tabKey => { if (tabKey) delete renderedTabs[tabKey]; },
  };
  const def = ADMIN_TABS.find(t => t.key === key);
  if (!def) return;
  try {
    await def.render(ctx);
  } catch (e) {
    console.error('[admin] render failed:', key, e);
    panel.innerHTML = `<div class="empty"><i class="fas fa-triangle-exclamation"></i> Failed to load this section: ${e.message || e}</div>`;
  }
}

window.avActivateTab = activateTab;
