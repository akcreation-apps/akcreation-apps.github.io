import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

let _appPromise = null;
let _tableName = '';

function _initApp() {
    if (_appPromise) return _appPromise;
    _appPromise = get_credentials().then(credentials => {
        const firebaseConfig = {
            apiKey: decrypt_values(credentials.API_KEY, _cfg),
            authDomain: decrypt_values(credentials.AUTH_DOMAIN, _cfg),
            projectId: decrypt_values(credentials.ID, _cfg),
            storageBucket: decrypt_values(credentials.STORAGE_BUCKET, _cfg),
            messagingSenderId: decrypt_values(credentials.MESSAGING_SENDER_ID, _cfg),
            appId: decrypt_values(credentials.APP_ID, _cfg),
            measurementId: decrypt_values(credentials.MEASUREMENT_ID, _cfg)
        };
        _tableName = decrypt_values(credentials.ORDER_TABLE_NAME, _cfg);
        return getApps().length ? getApp() : initializeApp(firebaseConfig);
    });
    return _appPromise;
}

// Reconcile localStorage order_history: for every "Initiated" order belonging
// to this restaurant, query Firestore and update api_call to Approved/Rejected/
// Deleted so downstream readers (home-screen Favourite Picks, invoice page)
// see the real status without having to open the bill page first.
export async function syncOrderHistoryStatuses() {
    const raw = localStorage.getItem(lsKey('order_history'));
    if (!raw) return false;
    let orders;
    try { orders = JSON.parse(raw) || []; } catch { return false; }
    if (!Array.isArray(orders) || orders.length === 0) return false;

    const pending = orders.filter(o =>
        o && o.order_id && o.admin_id === _cfg && (!o.api_call || o.api_call === 'Initiated')
    );
    if (pending.length === 0) return false;

    const app = await _initApp();
    const db = getFirestore(app);
    let changed = false;

    for (const order of pending) {
        try {
            const snap = await getDoc(doc(db, _tableName, order.order_id));
            let next = null;
            if (snap.exists()) {
                const data = snap.data();
                if (data.status === 'Approved') next = 'Approved';
                else if (data.status === 'Rejected') next = 'Rejected';
            } else {
                next = 'Deleted';
            }
            if (next) {
                const current = JSON.parse(localStorage.getItem(lsKey('order_history'))) || [];
                const updated = current.map(o =>
                    o.order_id === order.order_id ? { ...o, api_call: next } : o
                );
                localStorage.setItem(lsKey('order_history'), JSON.stringify(updated));
                changed = true;
            }
        } catch (e) {
            console.error('syncOrderHistoryStatuses: failed for', order.order_id, e);
        }
    }
    return changed;
}
