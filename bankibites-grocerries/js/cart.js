/**
 * Cart + WhatsApp checkout.
 * All add/inc/dec/remove use event delegation on data-attributes
 * (no inline onclick — avoids escaping issues in product names).
 */
(function () {
  if (window.BB_MAINTENANCE) return; // Site kill switch active — skip all init.
  const CFG = window.BB_CONFIG || {};
  const KEY = CFG.cartStorageKey || 'bb_grocery_cart_v1';
  const money = (n) => (CFG.currency || '₹') + Number(n).toFixed(0);

  // ================================================================
  // Overlay history stack — makes the Android/browser back button
  // close whatever's on top (cart, place picker, search) instead of
  // leaving the site.  Every openable overlay uses openOverlay / closeOverlay.
  // ================================================================
  const OVERLAY_STACK = [];   // [{ name, closeFn }]
  let popping = false;        // guard: closes triggered by popstate mustn't re-push

  function openOverlay(name, closeFn) {
    // If the same overlay is already open, no-op
    if (OVERLAY_STACK.some((o) => o.name === name)) return;
    OVERLAY_STACK.push({ name, closeFn });
    history.pushState({ bbOverlay: name, depth: OVERLAY_STACK.length }, '');
  }

  function closeOverlay(name) {
    const idx = OVERLAY_STACK.findIndex((o) => o.name === name);
    if (idx === -1) return;
    // Close everything from here to the top (deepest first)
    const removed = OVERLAY_STACK.splice(idx);
    removed.slice().reverse().forEach((o) => o.closeFn(true));
    if (!popping) {
      // Sync history by popping the corresponding entries
      history.go(-removed.length);
    }
  }

  window.addEventListener('popstate', () => {
    if (OVERLAY_STACK.length === 0) return;
    popping = true;
    const o = OVERLAY_STACK.pop();
    try { o.closeFn(true); } finally { popping = false; }
  });

  window.bbOverlay = { open: openOverlay, close: closeOverlay };

  // ---------- Delivery ETA ----------
  // Rule: order before CFG.delivery.cutoffHour local time → tomorrow's window.
  // Order at/after cutoff → day-after-tomorrow's window.
  function computeEta(now) {
    now = now || new Date();
    const d = CFG.delivery;
    const target = new Date(now);
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + (now.getHours() >= d.cutoffHour ? 2 : 1));

    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today0) / 86400000);
    const dayLabel =
      diff === 0 ? 'Today' :
      diff === 1 ? 'Tomorrow' :
      diff === 2 ? 'Day after tomorrow' :
      target.toLocaleDateString(undefined, { weekday: 'long' });

    // Compact date used in the short label — "Sep 13" (no weekday, no comma)
    const shortDate = target.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    // Long date used in the drawer / WhatsApp message — "Sat, Sep 13"
    const dateLabel = target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

    const fmtHour = (h) => {
      const suf = h >= 12 ? 'PM' : 'AM';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return hh + ' ' + suf;
    };
    const win = fmtHour(d.windowStart) + ' – ' + fmtHour(d.windowEnd);
    const cutoff = `Order by ${fmtHour(d.cutoffHour)} for next-day delivery`;

    return {
      day: dayLabel,
      date: dateLabel,
      shortDate,
      window: win,
      cutoff,
      // Always includes the date so "Day after tomorrow" isn't ambiguous.
      // e.g. "Tomorrow, Sep 13 · 10 AM – 12 PM" or "Sun, Sep 14 · 10 AM – 12 PM"
      short: (diff === 1 ? `Tomorrow, ${shortDate}` : dateLabel) + ` · ${win}`,
      long: `Delivery ${dayLabel.toLowerCase()}, ${dateLabel}, ${win}`,
      target,
    };
  }
  window.bbEta = computeEta;

  function paintEta() {
    const eta = computeEta();
    document.querySelectorAll('[data-eta-short]').forEach((el) => (el.textContent = eta.short));
    document.querySelectorAll('[data-eta-long]').forEach((el) => (el.textContent = eta.long));
    document.querySelectorAll('[data-eta-day]').forEach((el) => (el.textContent = eta.day));
    document.querySelectorAll('[data-eta-window]').forEach((el) => (el.textContent = eta.window));
    document.querySelectorAll('[data-eta-date]').forEach((el) => (el.textContent = eta.date));
    document.querySelectorAll('[data-eta-cutoff]').forEach((el) => (el.textContent = eta.cutoff));
  }
  window.bbPaintEta = paintEta;
  // Safe path encoder — idempotent (skips paths that already look encoded).
  const encPath = (p) => {
    const s = String(p || '');
    if (!s) return '';
    if (s.includes('%')) return s;
    return s.split('/').map((seg) => encodeURIComponent(seg)).join('/');
  };

  let cart = [];
  try {
    cart = JSON.parse(localStorage.getItem(KEY)) || [];
  } catch (e) {
    cart = [];
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(cart));
    renderCount();
    renderDrawer();
    renderInlineControls();
  }

  const findItem = (id) => cart.find((it) => String(it.id) === String(id));

  function addItem({ id, name, price, unit, image }) {
    const existing = findItem(id);
    if (existing) existing.qty += 1;
    else cart.push({ id, name, price: Number(price), unit, image, qty: 1 });
    save();
  }
  function inc(id) {
    const it = findItem(id);
    if (!it) return;
    it.qty += 1;
    save();
  }
  function dec(id) {
    const it = findItem(id);
    if (!it) return;
    it.qty -= 1;
    if (it.qty <= 0) cart = cart.filter((x) => String(x.id) !== String(id));
    save();
  }
  function remove(id) {
    cart = cart.filter((x) => String(x.id) !== String(id));
    save();
  }

  const subtotal = () => cart.reduce((s, it) => s + it.price * it.qty, 0);
  const totalCount = () => cart.reduce((s, it) => s + it.qty, 0);

  // Expose for other scripts
  window.bbRefreshInline = renderInlineControls;

  function renderCount() {
    const c = totalCount();
    document.querySelectorAll('[data-cart-count]').forEach((el) => {
      el.textContent = c;
      el.style.display = c > 0 ? 'inline-flex' : 'none';
    });
    // Toggle body class so CSS can pad only when the floating cart bar is up
    document.body.classList.toggle('cart-has-items', c > 0);

    const bar = document.getElementById('viewCartBar');
    if (bar) {
      bar.classList.toggle('visible', c > 0);
      const cn = document.getElementById('viewCartCount');
      const st = document.getElementById('viewCartTotal');
      if (cn) cn.textContent = c + (c === 1 ? ' item' : ' items');
      if (st) st.textContent = money(subtotal());
    }
  }

  function renderInlineControls() {
    document.querySelectorAll('[data-add-shell]').forEach((shell) => {
      const btn = shell.querySelector('[data-add-btn]');
      if (!btn) return;
      const id = btn.getAttribute('data-add-btn');
      const it = findItem(id);
      let stepper = shell.querySelector('[data-stepper]');
      if (it) {
        btn.style.display = 'none';
        if (!stepper) {
          stepper = document.createElement('div');
          stepper.setAttribute('data-stepper', id);
          stepper.className = 'qty-stepper';
          stepper.innerHTML = `
            <button type="button" data-dec="${id}" aria-label="Decrease">−</button>
            <span data-qty="${id}">${it.qty}</span>
            <button type="button" data-inc="${id}" aria-label="Increase">+</button>
          `;
          shell.appendChild(stepper);
        } else {
          const q = stepper.querySelector('[data-qty]');
          if (q) q.textContent = it.qty;
        }
      } else {
        btn.style.display = '';
        if (stepper) stepper.remove();
      }
    });
  }

  // ---------- Drawer ----------
  function ensureDrawer() {
    if (document.getElementById('cartDrawer')) return;
    const html = `
      <div class="cart-backdrop" id="cartBackdrop" data-close-cart></div>
      <aside class="cart-drawer" id="cartDrawer" aria-label="Cart">
        <header class="cart-head">
          <div>
            <h3><i class="fa-solid fa-basket-shopping"></i> Your Basket</h3>
            <span class="cart-head-sub" id="cartHeadSub">0 items</span>
          </div>
          <button class="icon-btn" data-close-cart aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <button type="button" class="cart-loc-strip" data-open-place>
          <i class="fa-solid fa-location-dot"></i>
          <span class="ms-text">Delivering to <strong data-location-value>Select area</strong></span>
          <span class="ms-change">Change <i class="fa-solid fa-chevron-right"></i></span>
        </button>
        <div class="cart-body" id="cartBody"></div>
        <footer class="cart-foot" id="cartFoot"></footer>
      </aside>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  function openDrawer() {
    ensureDrawer();
    renderDrawer();
    document.getElementById('cartBackdrop').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
    openOverlay('cart', closeDrawer);
  }
  function closeDrawer(fromHistory) {
    document.getElementById('cartBackdrop')?.classList.remove('open');
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromHistory) closeOverlay('cart');
  }

  function renderDrawer() {
    ensureDrawer();
    const body = document.getElementById('cartBody');
    const foot = document.getElementById('cartFoot');
    const sub = document.getElementById('cartHeadSub');
    if (!body || !foot) return;

    if (sub) sub.textContent = totalCount() === 1 ? '1 item' : `${totalCount()} items`;

    if (cart.length === 0) {
      body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon"><i class="fa-solid fa-basket-shopping"></i></div>
          <h4>Your basket is empty</h4>
          <p>Add essentials from the shelves and they'll show up here.</p>
          <button class="btn btn-brand" data-close-cart>Browse essentials</button>
        </div>`;
      foot.innerHTML = '';
      return;
    }

    body.innerHTML = cart
      .map(
        (it) => `
      <div class="cart-item">
        <div class="cart-item-img"><img src="${encPath(it.image)}" alt="" loading="lazy"
            onerror="if(!this.dataset.tried){this.dataset.tried=1;this.src=this.src.replace(/\\.(jpg|jpeg|png)$/i,'.webp');}else if(this.dataset.tried==='1'){this.dataset.tried=2;this.src=this.src.replace(/\\.webp$/i,'.jpg');}else{this.style.visibility='hidden';this.parentNode.classList.add('is-empty');}"></div>
        <div class="cart-item-info">
          <h5>${escapeHTML(it.name)}</h5>
          <div class="cart-item-meta">${escapeHTML(it.unit)} · <span class="cart-item-price">${money(it.price)}</span></div>
          <div class="qty-stepper">
            <button type="button" data-dec="${it.id}" aria-label="Decrease"${it.qty <= 1 ? ' disabled aria-disabled="true"' : ''}>−</button>
            <span>${it.qty}</span>
            <button type="button" data-inc="${it.id}" aria-label="Increase">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-remove="${it.id}" aria-label="Remove"><i class="fa-solid fa-trash-can"></i></button>
      </div>`
      )
      .join('');

    const sub2 = subtotal();
    const threshold = CFG.freeDeliveryThreshold || 0;
    const flatFee = Number(CFG.deliveryFee) || 0;
    const minOrder = Number(CFG.minOrder) || 0;
    const diffToFree = threshold - sub2;
    const belowMin = sub2 < minOrder;
    const deliveryFee = sub2 >= threshold ? 0 : flatFee;
    const eta = computeEta();

    // Free-delivery / min-order banner (min-order takes priority)
    let banner = '';
    if (belowMin) {
      banner = `<div class="cart-free-line warn">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span>Minimum order <strong>${money(minOrder)}</strong> — add ${money(minOrder - sub2)} more to place order.</span>
      </div>`;
    } else if (threshold > 0 && diffToFree > 0) {
      banner = `<div class="cart-free-line">
        <i class="fa-solid fa-truck-fast"></i>
        <span>Add ${money(diffToFree)} more for <strong>FREE delivery</strong></span>
      </div>`;
    } else if (threshold > 0) {
      banner = `<div class="cart-free-line success">
        <i class="fa-solid fa-circle-check"></i>
        <span>You've unlocked <strong>FREE delivery</strong></span>
      </div>`;
    }

    const placeOrderAttrs = belowMin
      ? 'disabled aria-disabled="true"'
      : 'data-place-order="1"';
    const placeOrderClass = belowMin ? 'btn btn-wa is-disabled' : 'btn btn-wa';
    const placeOrderLabel = belowMin
      ? `Add ${money(minOrder - sub2)} more to place order`
      : 'Place Order via WhatsApp';

    foot.innerHTML = `
      ${banner}
      <div class="cart-foot-grid">
        <div class="cart-eta">
          <i class="fa-solid fa-truck-fast"></i>
          <div>
            <strong>${escapeHTML(eta.day)}, ${escapeHTML(eta.date)}</strong>
            <em>${escapeHTML(eta.window)}</em>
            <small class="cart-eta-cutoff" data-eta-cutoff>${escapeHTML(eta.cutoff)}</small>
          </div>
        </div>
        <div class="cart-summary">
          <div class="row"><span>Items (${totalCount()})</span><span>${money(sub2)}</span></div>
          <div class="row"><span>Delivery</span><span>${deliveryFee === 0 ? 'FREE' : money(deliveryFee)}</span></div>
          <div class="row total"><span>Total</span><strong>${money(sub2 + deliveryFee)}</strong></div>
        </div>
      </div>
      <p class="cart-disclaimer">
        <i class="fa-solid fa-circle-info"></i>
        Product images are illustrative — actual pack may vary.
      </p>
      <button type="button" class="${placeOrderClass}" ${placeOrderAttrs}>
        <i class="fa-brands fa-whatsapp"></i> ${placeOrderLabel}
      </button>
    `;
  }

  // ---------- Location (delivery place) — persisted across visits ----------
  const LKEY = CFG.locationStorageKey || 'bb_grocery_place_v1';
  function getPlace() {
    try {
      return JSON.parse(localStorage.getItem(LKEY) || 'null');
    } catch (e) {
      return null;
    }
  }
  function setPlace(place) {
    localStorage.setItem(LKEY, JSON.stringify(place));
    renderLocationChip();
  }
  window.bbGetPlace = getPlace;

  function renderLocationChip() {
    const place = getPlace();
    document.querySelectorAll('[data-location-value]').forEach((el) => {
      el.textContent = place ? place.label : (CFG.location || 'Select area');
    });
    document.querySelectorAll('[data-location-hint]').forEach((el) => {
      el.textContent = place && place.hint ? place.hint : 'Tap to change';
    });
  }

  function ensurePlaceModal() {
    if (document.getElementById('placeModal')) return;
    const places = CFG.deliveryPlaces || [];
    const cur = getPlace() || {};
    const chips = places
      .map(
        (label) => `
      <button type="button" class="place-chip${cur.label === label ? ' active' : ''}"
        data-place="${escapeAttr(label)}" aria-pressed="${cur.label === label ? 'true' : 'false'}">
        ${escapeHTML(label)}
      </button>`
      )
      .join('');

    const isOther = cur.id === 'custom';
    const modal = `
      <div class="cart-backdrop" id="placeBackdrop" data-close-place></div>
      <aside class="place-modal" id="placeModal" role="dialog" aria-labelledby="placeTitle">
        <header class="place-head">
          <div>
            <h3 id="placeTitle"><i class="fa-solid fa-location-dot"></i> Where should we deliver?</h3>
            <span>Pick your area. Choose <b>Other</b> if we should deliver outside this list.</span>
          </div>
          <button class="icon-btn" data-close-place aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
        </header>
        <div class="place-body">
          <div class="place-list" id="placeList">
            ${chips}
            <button type="button" class="place-chip other-chip${isOther ? ' active' : ''}"
              data-place="__other__" aria-pressed="${isOther ? 'true' : 'false'}">
              <i class="fa-solid fa-pen" aria-hidden="true"></i> Other
            </button>
          </div>
          <div class="place-custom${isOther ? ' visible' : ''}" id="placeCustom">
            <label>
              <span>Enter your full address / landmark</span>
              <textarea id="placeCustomInput" rows="3" maxlength="200"
                placeholder="House / area / landmark — e.g. Ward 4, near HS School, Banki"></textarea>
            </label>
            <button type="button" class="btn btn-brand btn-block" id="placeCustomSave">
              <i class="fa-solid fa-check"></i> Save this address
            </button>
          </div>
        </div>
      </aside>
    `;
    document.body.insertAdjacentHTML('beforeend', modal);

    // Prefill custom input if the saved place is a custom one
    if (isOther && cur.label) {
      document.getElementById('placeCustomInput').value = cur.label;
    }

    // Preset chip → save + close.  "Other" chip → reveal input.
    document.querySelectorAll('#placeModal [data-place]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const val = btn.getAttribute('data-place');
        if (val === '__other__') {
          // Toggle Other-mode; highlight the chip; show input
          document.querySelectorAll('#placeModal [data-place]').forEach((b) =>
            b.classList.toggle('active', b === btn)
          );
          document.querySelectorAll('#placeModal [data-place]').forEach((b) =>
            b.setAttribute('aria-pressed', b === btn ? 'true' : 'false')
          );
          const custom = document.getElementById('placeCustom');
          custom.classList.add('visible');
          setTimeout(() => document.getElementById('placeCustomInput').focus(), 60);
          return;
        }
        // Preset — save immediately and close
        setPlace({ id: val.toLowerCase().replace(/\s+/g, '-'), label: val });
        closePlace();
      });
    });

    document.getElementById('placeCustomSave').addEventListener('click', () => {
      const val = (document.getElementById('placeCustomInput').value || '').trim();
      if (!val) {
        document.getElementById('placeCustomInput').focus();
        return;
      }
      setPlace({ id: 'custom', label: val });
      closePlace();
    });
  }

  function openPlace() {
    // Rebuild each time so active state / custom input reflect current storage
    const existing = document.getElementById('placeModal');
    if (existing) {
      existing.remove();
      document.getElementById('placeBackdrop')?.remove();
    }
    ensurePlaceModal();
    requestAnimationFrame(() => {
      document.getElementById('placeBackdrop').classList.add('open');
      document.getElementById('placeModal').classList.add('open');
    });
    openOverlay('place', closePlace);
  }
  function closePlace(fromHistory) {
    document.getElementById('placeBackdrop')?.classList.remove('open');
    document.getElementById('placeModal')?.classList.remove('open');
    if (!fromHistory) closeOverlay('place');
  }
  window.bbOpenPlace = openPlace;

  // Storefront-offline check. Uses the cached maintenance flag first
  // (instant) and then confirms with a fresh Firestore read so a stale
  // "online" cache can't let an order slip through after admin flipped
  // the switch. Returns true when the storefront is offline.
  async function isStorefrontOffline() {
    const M = window.bbGroceryMaintenance;
    if (!M) return false;
    try {
      const cached = M.cached && M.cached();
      if (cached && cached.enabled === true) return true;
      if (typeof M.ensureFresh === 'function') {
        const fresh = await M.ensureFresh();
        return !!(fresh && fresh.enabled === true);
      }
    } catch { /* fail-open — don't block on a failed check */ }
    return false;
  }

  const HKEY = 'bb_grocery_orders_v1';
  function pushLocalOrder(entry) {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(HKEY)) || []; } catch (e) { arr = []; }
    arr.unshift(entry);
    if (arr.length > 20) arr.length = 20;
    try { localStorage.setItem(HKEY, JSON.stringify(arr)); } catch {}
  }

  // Called by cart drawer's "Place Order" button.
  // Flow (matches BankiBites restaurant pattern): write order to Firestore
  // (best-effort, silent), save to localStorage so the customer can re-open
  // the bill, then redirect straight to WhatsApp so the customer can share
  // their name/address there. Admin fills in customer details from the WA
  // message.
  async function placeOrder() {
    if (cart.length === 0) return;
    const sub2 = subtotal();
    const minOrder = Number(CFG.minOrder) || 0;
    if (sub2 < minOrder) return;

    // Storefront-offline guard — verify the maintenance flag before
    // touching the cart or WhatsApp handoff. Uses the cache first for
    // instant blocking, then confirms with a fresh Firestore read so a
    // customer who cached "online" earlier can't slip an order through
    // after admin just flipped to offline.
    if (await isStorefrontOffline()) {
      if (typeof Swal !== 'undefined') {
        await Swal.fire({
          icon: 'info',
          title: 'We\'re taking a short break',
          html: 'BankiBites Groceries is temporarily offline and not accepting new orders right now. Please try again in a little while.',
          confirmButtonText: 'Got it',
          confirmButtonColor: '#16A34A',
        });
      } else {
        alert("BankiBites Groceries is temporarily offline. Please try again in a little while.");
      }
      // Force a reload so maintenance.js repaints the maintenance screen
      // — the customer shouldn't stay staring at a cart they can't submit.
      location.reload();
      return;
    }

    const place = getPlace();
    if (!place) { openPlace(); return; }

    const threshold = CFG.freeDeliveryThreshold || 0;
    const flatFee = Number(CFG.deliveryFee) || 0;
    const deliveryFee = sub2 >= threshold ? 0 : flatFee;
    const total = sub2 + deliveryFee;
    const eta = computeEta();
    const pad = n => String(n).padStart(2, '0');
    const etaDate = `${eta.target.getFullYear()}-${pad(eta.target.getMonth()+1)}-${pad(eta.target.getDate())}`;

    const payload = {
      items: cart.map(it => ({
        id: it.id, name: it.name, price: Number(it.price) || 0,
        unit: it.unit || '', image: it.image || '', qty: Number(it.qty) || 0,
      })),
      subtotal: sub2,
      delivery_fee_estimated: deliveryFee,
      total_estimated: total,
      place: place.label,
      place_custom: place.id === 'custom',
      customer: { name: '', phone: '' },
      eta_date: etaDate,
      eta_window: eta.window,
    };

    // Build the WhatsApp message up-front so we can redirect immediately in
    // the user's click gesture. The DB write races the tab handoff — most of
    // the time it wins (mobile Chrome keeps the tab alive during the WA
    // handoff), but even if it doesn't, the write is retried inside
    // order-write.js.
    const lines = cart.map((it, i) => {
      const unit = it.unit ? ` (${it.unit})` : '';
      const lineTotal = money(it.price * it.qty);
      return `${i + 1}. ${it.name}${unit} — ${it.qty} × ${money(it.price)} = *${lineTotal}*`;
    });
    const msg = [
      `*New Order · ${CFG.vendorName}*`,
      `━━━━━━━━━━━━━━`,
      ...lines,
      `━━━━━━━━━━━━━━`,
      `*Subtotal:* ${money(sub2)}`,
      `*Delivery:* ${deliveryFee === 0 ? 'FREE' : money(deliveryFee)}`,
      `*Total:* *${money(total)}*`,
      `━━━━━━━━━━━━━━`,
      `*Deliver to:* ${place.label}`,
      `*Delivery:* ${eta.date} · ${eta.window}`,
      ``,
      `Please confirm the order.`,
    ].join('\n');
    const phone = (CFG.whatsappNumber || '').replace(/\D/g, '');
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    // Single-step flow: after the "Saving your order…" loader closes, we
    // navigate straight to wa.me — no second confirm click.
    const goToWhatsApp = () => {
      // Silent safety net for vivo / older Android where the wa.me Intent
      // sometimes drops `text` — the customer can long-press → Paste.
      try { navigator.clipboard && navigator.clipboard.writeText(msg).catch(() => {}); } catch {}
      // Clear cart optimistically at the moment of hand-off.
      cart = [];
      save();
      // Force a clean reload the moment the customer returns to this tab —
      // otherwise the "Order placed" Swal (and the hidden cart drawer) stay
      // frozen on top of the storefront. Matches TCD's post-checkout behaviour.
      try {
        const onReturn = () => {
          if (document.visibilityState !== 'visible') return;
          document.removeEventListener('visibilitychange', onReturn);
          window.removeEventListener('pageshow', onReturn);
          location.reload();
        };
        document.addEventListener('visibilitychange', onReturn);
        window.addEventListener('pageshow', onReturn);
      } catch {}
      try { window.location.href = waUrl; return; } catch {}
      try { window.location.assign(waUrl); return; } catch {}
      try { window.open(waUrl, '_self'); return; } catch {}
      try { window.open(waUrl, '_blank'); } catch {}
    };

    // Step 1 — open the loader immediately. Swal.fire() inserts the popup
    // into the DOM synchronously; we then yield one animation frame so the
    // browser paints BEFORE the Firestore write kicks off. Without the frame
    // yield the write can finish faster than the paint on a good connection
    // and the customer never sees the loader flash in.
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Saving your order…',
        html: '<div style="font-size:.9rem;color:#6b7280">Hang tight, this only takes a moment.</div>',
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        didOpen: () => Swal.showLoading(),
      });
    }
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    const writeOrder = async () => {
      if (typeof window.bbWriteGroceryOrder !== 'function') {
        const mod = await import('./order-write.js');
        window.bbWriteGroceryOrder = mod.writeGroceryOrder;
      }
      const { id } = await window.bbWriteGroceryOrder(payload);
      pushLocalOrder({ orderId: id, payload, savedAt: Date.now() });
    };

    // Bounded write — never trap the customer on the loader.
    try {
      await Promise.race([
        writeOrder().catch(err => console.warn('[bankimart] order write failed:', err)),
        new Promise(resolve => setTimeout(resolve, 10000)),
      ]);
    } catch (err) {
      console.warn('[bankimart] save flow error:', err);
    }

    // Step 2 — close the loader cleanly. Calling Swal.fire back-to-back can
    // race and instantly dismiss the follow-up modal on some devices, so
    // explicit close + tiny delay lets the DOM settle before we show the
    // confirm.
    if (typeof Swal !== 'undefined') {
      try { Swal.close(); } catch {}
      await new Promise(r => setTimeout(r, 80));
    }

    goToWhatsApp();
  }
  window.bbPlaceOrder = placeOrder;

  function escapeAttr(v) {
    return String(v == null ? '' : v).replace(/"/g, '&quot;').replace(/&/g, '&amp;');
  }

  // ---------- Event delegation (single global listener) ----------
  document.addEventListener('click', (e) => {
    const openCartEl = e.target.closest('[data-open-cart]');
    if (openCartEl) {
      e.preventDefault();
      openDrawer();
      return;
    }
    if (e.target.closest('[data-close-cart]')) {
      e.preventDefault();
      closeDrawer();
      return;
    }
    if (e.target.closest('[data-place-order]')) {
      e.preventDefault();
      placeOrder();
      return;
    }
    if (e.target.closest('[data-open-place]')) {
      e.preventDefault();
      openPlace();
      return;
    }
    if (e.target.closest('[data-close-place]')) {
      e.preventDefault();
      closePlace();
      return;
    }

    // Multi-variant product: open the size picker instead of adding directly.
    const pickBtn = e.target.closest('[data-open-variant]');
    if (pickBtn) {
      e.preventDefault();
      const key = pickBtn.getAttribute('data-open-variant');
      const product = window.bbCatalogById?.get(String(key));
      if (!product || !window.bbVariantPicker) return;
      window.bbVariantPicker.open(product, (variant) => {
        addItem({
          id: variant.id,
          name: product.name,
          price: Number(variant.price),
          unit: variant.unit,
          image: variant.image || product.image,
        });
      });
      return;
    }

    const addBtn = e.target.closest('[data-add-btn]');
    if (addBtn) {
      e.preventDefault();
      const card = addBtn.closest('[data-product]') || addBtn;
      const payload = {
        id: addBtn.dataset.addBtn || card.dataset.id,
        name: addBtn.dataset.name || card.dataset.name,
        price: parseFloat(addBtn.dataset.price || card.dataset.price),
        unit: addBtn.dataset.unit || card.dataset.unit,
        image: addBtn.dataset.image || card.dataset.image,
      };
      if (!payload.id || !payload.name || isNaN(payload.price)) return;
      addItem(payload);
      return;
    }

    const incEl = e.target.closest('[data-inc]');
    if (incEl) {
      e.preventDefault();
      inc(incEl.dataset.inc);
      return;
    }
    const decEl = e.target.closest('[data-dec]');
    if (decEl) {
      e.preventDefault();
      if (decEl.disabled) return;
      dec(decEl.dataset.dec);
      return;
    }
    const rmEl = e.target.closest('[data-remove]');
    if (rmEl) {
      e.preventDefault();
      const id = rmEl.dataset.remove;
      const it = cart.find((x) => String(x.id) === String(id));
      const name = it ? it.name : 'this item';
      if (window.Swal) {
        Swal.fire({
          title: 'Remove from cart?',
          text: `“${name}” will be removed from your cart.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Yes, remove',
          cancelButtonText: 'Keep',
          confirmButtonColor: '#e11d48',
        }).then((res) => { if (res.isConfirmed) remove(id); });
      } else {
        remove(id);
      }
      return;
    }
  });

  // Close drawers on ESC
  document.addEventListener('keydown', (e) => {
    // ESC closes whichever overlay is on top (delegates to popstate handler)
    if (e.key === 'Escape' && OVERLAY_STACK.length) {
      history.back();
    }
  });

  function escapeHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initial paint
  document.addEventListener('DOMContentLoaded', () => {
    ensureDrawer();
    renderCount();
    renderDrawer();
    renderInlineControls();
    renderLocationChip();
    paintEta();
    // Refresh the ETA once a minute so a page left open through the cutoff hour
    // updates without a reload.
    setInterval(paintEta, 60 * 1000);
    // First visit — no saved place → prompt user (TCD-style entry picker)
    if (!getPlace()) {
      setTimeout(openPlace, 350);
    }
  });
})();
