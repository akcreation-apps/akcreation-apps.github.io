// "My Orders" — reads bb_grocery_orders_v1 (populated by cart.js placeOrder),
// pulls each order's live status from Firestore, and shows every order
// that's been confirmed by admin (order_confirmed / assigned /
// out_for_delivery / delivered). New unconfirmed and cancelled orders are
// hidden. The linked bill.html gates the itemised bill on delivered status
// — for earlier states the customer sees a status tracker only.
(function () {
  if (window.BB_MAINTENANCE) return;
  const HKEY = 'bb_grocery_orders_v1';
  const CFG = window.BB_CONFIG || {};
  const money = n => (CFG.currency || '₹') + Number(n || 0).toFixed(0);

  // Statuses that show in My Orders. `cancelled` / `fake` are hidden.
  const VISIBLE_STATUSES = new Set(['new', 'order_confirmed', 'approved', 'assigned', 'out_for_delivery', 'delivered']);
  // Terminal states — once an order lands here, it never changes again, so
  // we cache the last-seen status locally and skip future Firestore reads.
  // `fake` is intentionally NOT terminal: the customer might reach out
  // afterwards and admin can un-flag it, so we keep polling those.
  const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);

  const STATUS_META = {
    new:              { label: 'Placed',       tone: 'pending'   },
    order_confirmed:  { label: 'Confirmed',    tone: 'confirmed' },
    approved:         { label: 'Confirmed',    tone: 'confirmed' },
    assigned:         { label: 'Dispatching',  tone: 'confirmed' },
    out_for_delivery: { label: 'On the way',   tone: 'active'    },
    delivered:        { label: 'Delivered',    tone: 'done'      },
  };

  // Firebase reader — lazy-loaded on first panel open so it doesn't drag
  // Firebase into the storefront initial paint.
  const APP_NAME = 'bankimart-reader';
  const COLLECTION = 'bankibites_grocery_orders';
  const ENC_KEY = ['TCD', 'FOOD', 'CAFE'].join('-');
  let _fbReady = null;
  async function getReaderDb() {
    if (_fbReady) return _fbReady;
    _fbReady = (async () => {
      const [{ initializeApp, getApps }, { getFirestore, doc, getDoc }] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js'),
      ]);
      const existing = getApps().find(a => a.name === APP_NAME);
      let app = existing;
      if (!app) {
        const res = await fetch('https://akcreation-apps.com/TCD/credentials.json?v=' + Date.now());
        if (!res.ok) throw new Error('credentials fetch failed');
        const c = await res.json();
        const decrypt = v => CryptoJS.AES.decrypt(v, ENC_KEY).toString(CryptoJS.enc.Utf8);
        app = initializeApp({
          apiKey:            decrypt(c.API_KEY),
          authDomain:        decrypt(c.AUTH_DOMAIN),
          projectId:         decrypt(c.ID),
          storageBucket:     decrypt(c.STORAGE_BUCKET),
          messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
          appId:             decrypt(c.APP_ID),
          measurementId:     decrypt(c.MEASUREMENT_ID),
        }, APP_NAME);
      }
      return { db: getFirestore(app), doc, getDoc };
    })();
    return _fbReady;
  }

  // Terminal-status cache: { <orderId>: 'delivered' | 'cancelled' | 'fake' }.
  // These states never change, so any order in this map skips the Firestore
  // read entirely — delivered ones still render from local payload, while
  // cancelled/fake are silently dropped without a network round-trip.
  // (Legacy `bb_grocery_delivered_v1` is migrated on first read.)
  const TERMINAL_KEY = 'bb_grocery_terminal_v1';
  const LEGACY_DELIVERED_KEY = 'bb_grocery_delivered_v1';
  function loadTerminalMap() {
    let map = {};
    try { map = JSON.parse(localStorage.getItem(TERMINAL_KEY)) || {}; } catch {}
    // One-time migration: older versions stored a bare array of delivered ids.
    try {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_DELIVERED_KEY));
      if (Array.isArray(legacy)) {
        legacy.forEach(id => { if (!map[id]) map[id] = 'delivered'; });
        localStorage.setItem(TERMINAL_KEY, JSON.stringify(map));
        localStorage.removeItem(LEGACY_DELIVERED_KEY);
      }
    } catch {}
    return map;
  }
  function saveTerminalMap(map) {
    try { localStorage.setItem(TERMINAL_KEY, JSON.stringify(map)); } catch {}
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { return []; }
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function ago(ts) {
    const d = Math.max(0, Date.now() - (ts || 0));
    const m = Math.round(d / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    const dd = Math.round(h / 24);
    return dd + ' day' + (dd === 1 ? '' : 's') + ' ago';
  }

  function ensurePanel() {
    if (document.getElementById('bbOrdersPanel')) return;
    const html = `
      <div class="cart-backdrop" id="bbOrdersBackdrop" data-close-orders></div>
      <aside class="cart-drawer" id="bbOrdersPanel" aria-label="My Orders">
        <header class="cart-head">
          <div>
            <h3><i class="fa-solid fa-receipt"></i> My Orders</h3>
            <span class="cart-head-sub" id="bbOrdersSub">Loading…</span>
          </div>
          <button class="icon-btn" data-close-orders aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="cart-body" id="bbOrdersBody"></div>
      </aside>
      <style>
        /* Clean carded list — one card per order, breathing gap between,
           status accent on the left edge as the primary visual grouping. */
        #bbOrdersPanel .cart-body {
          padding: 12px !important;
          background: #f1f5f9;
        }
        #bbOrdersPanel .bb-list { display: flex; flex-direction: column; gap: 10px; }

        #bbOrdersPanel .bb-row {
          position: relative;
          display: flex; align-items: center; gap: 12px;
          padding: 14px 14px 14px 18px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 2px rgba(15, 23, 42, .04);
        }
        /* Left status accent bar — colour-codes the whole card at a glance
           without needing to read the pill. */
        #bbOrdersPanel .bb-row::before {
          content: '';
          position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
          border-radius: 999px;
          background: #cbd5e1;
        }
        #bbOrdersPanel .bb-row.tone-confirmed::before { background: #16a34a; }
        #bbOrdersPanel .bb-row.tone-active::before    { background: #2563eb; }
        #bbOrdersPanel .bb-row.tone-done::before      { background: #16a34a; }
        #bbOrdersPanel .bb-row.tone-pending::before   { background: #d97706; }

        /* Main info column */
        #bbOrdersPanel .bb-info { flex: 1; min-width: 0; }
        #bbOrdersPanel .bb-line-1 {
          display: flex; align-items: baseline; gap: 8px;
          margin-bottom: 4px;
        }
        #bbOrdersPanel .bb-total {
          font-size: 1.05rem; font-weight: 800; color: #0f172a;
          font-variant-numeric: tabular-nums; letter-spacing: -.01em;
        }
        #bbOrdersPanel .bb-id {
          font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
          font-size: .75rem; font-weight: 600; letter-spacing: .04em;
          color: #94a3b8;
        }
        #bbOrdersPanel .bb-line-2 {
          font-size: .78rem; color: #64748b; line-height: 1.4;
          font-variant-numeric: tabular-nums;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          margin-bottom: 6px;
        }
        #bbOrdersPanel .bb-line-2 .sep { margin: 0 5px; opacity: .5; }
        #bbOrdersPanel .bb-status {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: .68rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: .05em;
          color: #64748b;
        }
        #bbOrdersPanel .bb-status .dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: currentColor;
        }
        #bbOrdersPanel .bb-row.tone-confirmed .bb-status { color: #15803d; }
        #bbOrdersPanel .bb-row.tone-active .bb-status    { color: #1d4ed8; }
        #bbOrdersPanel .bb-row.tone-done .bb-status      { color: #15803d; }
        #bbOrdersPanel .bb-row.tone-pending .bb-status   { color: #b45309; }

        /* Action icons — stacked vertically on the right, feel like a
           utility rail rather than horizontal chrome. */
        #bbOrdersPanel .bb-actions {
          display: flex; flex-direction: column; gap: 6px;
          flex-shrink: 0;
        }
        #bbOrdersPanel .bb-action-btn {
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          border-radius: 8px; border: 0; background: transparent;
          color: #64748b; cursor: pointer; font-size: .8rem;
          transition: background .12s, color .12s;
        }
        #bbOrdersPanel .bb-action-btn:hover { background: #f1f5f9; }
        #bbOrdersPanel .bb-action-btn:active { transform: scale(.94); }
        #bbOrdersPanel .bb-action-btn.view:hover { background: #dcfce7; color: #15803d; }
        #bbOrdersPanel .bb-action-btn.del:hover  { background: #fee2e2; color: #b91c1c; }

        #bbOrdersPanel .bb-empty {
          padding: 40px 24px; text-align: center; color: #64748b;
        }
        #bbOrdersPanel .bb-empty .bb-empty-icon {
          width: 56px; height: 56px; border-radius: 50%;
          background: rgba(22, 163, 74, .1); color: #16a34a;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 1.3rem; margin-bottom: 14px;
        }
        #bbOrdersPanel .bb-empty h4 { margin: 0 0 6px; font-size: 1rem; color: #0f172a; font-weight: 700; }
        #bbOrdersPanel .bb-empty p { margin: 0; font-size: .85rem; line-height: 1.5; }

        @media (prefers-color-scheme: dark) {
          #bbOrdersPanel .cart-body { background: #0b0d12; }
          #bbOrdersPanel .bb-row {
            background: #14171d;
            border-color: #262a33;
            box-shadow: 0 1px 2px rgba(0, 0, 0, .3);
          }
          #bbOrdersPanel .bb-total { color: #f1f5f9; }
          #bbOrdersPanel .bb-id { color: #94a3b8; }
          #bbOrdersPanel .bb-line-2 { color: #94a3b8; }
          #bbOrdersPanel .bb-status { color: #94a3b8; }
          #bbOrdersPanel .bb-row.tone-confirmed .bb-status,
          #bbOrdersPanel .bb-row.tone-done .bb-status      { color: #4ade80; }
          #bbOrdersPanel .bb-row.tone-active .bb-status    { color: #60a5fa; }
          #bbOrdersPanel .bb-row.tone-pending .bb-status   { color: #fbbf24; }
          #bbOrdersPanel .bb-row.tone-confirmed::before,
          #bbOrdersPanel .bb-row.tone-done::before      { background: #22c55e; }
          #bbOrdersPanel .bb-row.tone-active::before    { background: #3b82f6; }
          #bbOrdersPanel .bb-row.tone-pending::before   { background: #f59e0b; }
          #bbOrdersPanel .bb-action-btn { color: #94a3b8; }
          #bbOrdersPanel .bb-action-btn:hover { background: #1c1f27; }
          #bbOrdersPanel .bb-action-btn.view:hover { background: rgba(22,163,74,.15); color: #86efac; }
          #bbOrdersPanel .bb-action-btn.del:hover  { background: rgba(220,38,38,.15); color: #fca5a5; }
          #bbOrdersPanel .bb-empty h4 { color: #f1f5f9; }
          #bbOrdersPanel .bb-empty .bb-empty-icon { background: rgba(34, 197, 94, .12); color: #4ade80; }
        }
      </style>`;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function renderLoading() {
    ensurePanel();
    document.getElementById('bbOrdersBody').innerHTML = `
      <div class="bb-empty">
        <div class="bb-empty-icon"><i class="fa-solid fa-circle-notch fa-spin"></i></div>
        <h4>Loading your orders</h4>
        <p>Fetching the latest status.</p>
      </div>`;
  }

  function renderEmpty() {
    document.getElementById('bbOrdersBody').innerHTML = `
      <div class="bb-empty">
        <div class="bb-empty-icon"><i class="fa-solid fa-receipt"></i></div>
        <h4>No confirmed orders yet</h4>
        <p>Once we confirm your order, it will show up here. Only delivered orders show the itemised bill.</p>
      </div>`;
  }

  function renderList(entries) {
    const body = document.getElementById('bbOrdersBody');
    body.innerHTML = `<div class="bb-list">${entries.map(entry => {
      const p = entry.payload || {};
      const nItems = (p.items || []).reduce((s, i) => s + (i.qty || 0), 0);
      const total = money(p.total_estimated);
      const shortId = (entry.orderId || '').slice(-6).toUpperCase();
      const meta = STATUS_META[entry.status] || STATUS_META.order_confirmed;
      const place = p.place || '';
      const line2Parts = [
        `${nItems} item${nItems === 1 ? '' : 's'}`,
        esc(ago(entry.savedAt)),
      ];
      if (place) line2Parts.push(esc(place));
      const orderId = esc(entry.orderId);
      return `
        <div class="bb-row tone-${meta.tone}">
          <div class="bb-info">
            <div class="bb-line-1">
              <span class="bb-total">${esc(total)}</span>
              <span class="bb-id">#${esc(shortId)}</span>
            </div>
            <div class="bb-line-2">${line2Parts.join('<span class="sep">·</span>')}</div>
            <span class="bb-status"><span class="dot"></span>${esc(meta.label)}</span>
          </div>
          <div class="bb-actions">
            <button type="button" class="bb-action-btn view" data-act="view" data-id="${orderId}" title="View bill" aria-label="View bill"><i class="fa-solid fa-eye"></i></button>
            <button type="button" class="bb-action-btn del" data-act="delete" data-id="${orderId}" title="Delete bill" aria-label="Delete bill"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>`;
    }).join('')}</div>`;
    wireRowActions();
  }

  function wireRowActions() {
    const body = document.getElementById('bbOrdersBody');
    body.querySelectorAll('[data-act="view"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        // Flag so bill.html's back button returns to the list, not the
        // storefront homepage. Cleared by the order-history bootstrap once
        // the panel actually reopens.
        try { sessionStorage.setItem('bbReopenOrders', '1'); } catch {}
        window.location.href = `bill.html?id=${encodeURIComponent(id)}`;
      });
    });
    body.querySelectorAll('[data-act="delete"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        // Swal confirmation — matches the storefront's checkout dialogs.
        // Falls back to native confirm if Swal isn't loaded for any reason.
        let confirmed = false;
        if (typeof Swal !== 'undefined') {
          const res = await Swal.fire({
            icon: 'warning',
            title: 'Delete this bill?',
            html: `
              <div style="text-align:left;font-size:.92rem;line-height:1.5;color:#475569">
                This bill will be <strong>permanently removed</strong> from your
                device and cannot be recovered.
              </div>`,
            showCancelButton: true,
            confirmButtonText: 'Delete permanently',
            cancelButtonText: 'Keep it',
            confirmButtonColor: '#dc2626',
            reverseButtons: true,
            focusCancel: true,
          });
          confirmed = res.isConfirmed;
        } else {
          confirmed = window.confirm('Permanently delete this bill? It cannot be recovered.');
        }
        if (!confirmed) return;
        removeLocalOrder(id);
        refreshAndRender();
        if (typeof Swal !== 'undefined') {
          Swal.fire({ icon: 'success', title: 'Bill removed', timer: 1200, showConfirmButton: false });
        }
      });
    });
  }

  // Remove an order from the customer's browser: strips it from both the
  // saved-orders list and the terminal-status cache. Mirrors bill.js.
  function removeLocalOrder(id) {
    try {
      const arr = load().filter(x => x.orderId !== id);
      localStorage.setItem(HKEY, JSON.stringify(arr));
    } catch {}
    try {
      const map = loadTerminalMap();
      delete map[id];
      saveTerminalMap(map);
    } catch {}
  }

  async function refreshAndRender() {
    ensurePanel();
    const sub = document.getElementById('bbOrdersSub');
    const arr = load();
    if (!arr.length) {
      sub.textContent = '0 orders';
      renderEmpty();
      return;
    }
    renderLoading();
    sub.textContent = 'Checking…';

    const terminalMap = loadTerminalMap();
    // Anything cached as delivered renders immediately without a fetch;
    // anything cached as cancelled is silently dropped. Everything else —
    // including `fake` orders — is re-fetched so admin's later flag flips
    // (e.g. un-marking a wrongly-flagged fake back to `new`) surface here.
    const cachedDelivered = [];
    const toFetch = [];
    for (const e of arr) {
      const cached = terminalMap[e.orderId];
      if (cached === 'delivered') { cachedDelivered.push({ ...e, status: 'delivered' }); continue; }
      if (cached === 'cancelled') continue;  // permanently hidden
      toFetch.push(e);
    }

    // Order ids the current fetch confirmed are gone from Firestore, so we
    // strip them from local storage too — no point holding orphaned refs.
    const missingIds = [];

    let fetched = [];
    if (toFetch.length) {
      try {
        const { db, doc, getDoc } = await getReaderDb();
        const results = await Promise.all(toFetch.map(async e => {
          try {
            const snap = await getDoc(doc(db, COLLECTION, e.orderId));
            if (!snap.exists()) {
              // Admin permanently deleted this order → clear it from local.
              missingIds.push(e.orderId);
              return null;
            }
            const status = snap.data().status || 'new';
            if (TERMINAL_STATUSES.has(status)) terminalMap[e.orderId] = status;
            return { ...e, status };
          } catch { return null; }
        }));
        saveTerminalMap(terminalMap);
        fetched = results.filter(Boolean);
      } catch (err) {
        console.warn('[my-orders] status fetch failed:', err.message);
      }
    }

    // Purge any orders that no longer exist server-side so future opens
    // don't keep re-fetching them.
    if (missingIds.length) {
      try {
        const arr2 = load().filter(x => !missingIds.includes(x.orderId));
        localStorage.setItem(HKEY, JSON.stringify(arr2));
      } catch {}
      try {
        const map = loadTerminalMap();
        missingIds.forEach(id => { delete map[id]; });
        saveTerminalMap(map);
      } catch {}
    }

    const combined = [...cachedDelivered, ...fetched];
    const visible = combined.filter(e => VISIBLE_STATUSES.has(e.status));

    // Preserve the original save order (newest first — pushLocalOrder unshifts).
    const orderMap = new Map(arr.map((e, i) => [e.orderId, i]));
    visible.sort((a, b) => orderMap.get(a.orderId) - orderMap.get(b.orderId));

    sub.textContent = visible.length === 1 ? '1 order' : `${visible.length} orders`;
    if (!visible.length) { renderEmpty(); return; }
    renderList(visible);
  }

  function open() {
    ensurePanel();
    document.getElementById('bbOrdersBackdrop').classList.add('open');
    document.getElementById('bbOrdersPanel').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.bbOverlay) window.bbOverlay.open('myOrders', close.bind(null, true));
    refreshAndRender();
  }
  function close(fromHistory) {
    document.getElementById('bbOrdersBackdrop')?.classList.remove('open');
    document.getElementById('bbOrdersPanel')?.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromHistory && window.bbOverlay) window.bbOverlay.close('myOrders');
  }

  document.addEventListener('click', e => {
    if (e.target.closest('[data-open-orders]')) { e.preventDefault(); open(); return; }
    if (e.target.closest('[data-close-orders]')) { e.preventDefault(); close(); return; }
  });

  // Auto-inject a "My Orders" button next to the cart button on the header
  // if none exists yet. Idempotent so both index.html and categories.html work.
  document.addEventListener('DOMContentLoaded', () => {
    // Auto-reopen the panel when we're returning from bill.html (either
    // via the sessionStorage flag or the ?openOrders=1 fallback the bill
    // topbar back button uses).
    let shouldOpen = false;
    try {
      if (sessionStorage.getItem('bbReopenOrders') === '1') {
        sessionStorage.removeItem('bbReopenOrders');
        shouldOpen = true;
      }
    } catch {}
    try {
      const params = new URLSearchParams(location.search);
      if (params.get('openOrders') === '1') {
        shouldOpen = true;
        // Strip the param so refreshes don't keep re-opening the drawer.
        params.delete('openOrders');
        const qs = params.toString();
        const newUrl = location.pathname + (qs ? '?' + qs : '') + location.hash;
        history.replaceState(null, '', newUrl);
      }
    } catch {}

    if (load().length > 0) {
      const cartBtn = document.querySelector('.header-icons [data-open-cart]');
      if (cartBtn && !document.querySelector('[data-open-orders]')) {
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        btn.setAttribute('data-open-orders', '');
        btn.setAttribute('aria-label', 'My orders');
        btn.title = 'My orders';
        btn.innerHTML = '<i class="fa-solid fa-receipt"></i>';
        cartBtn.parentNode.insertBefore(btn, cartBtn);
      }
    }

    if (shouldOpen) {
      // Delay one tick so the storefront's own DOMContentLoaded finishes
      // painting first — otherwise the panel opens over a blank frame.
      setTimeout(open, 0);
    }
  });
})();
