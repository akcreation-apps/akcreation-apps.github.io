/**
 * Categories page — sidebar + grid, filter by ?cat= + client-side search.
 * Uses data-* attributes for add-to-cart (delegated in cart.js).
 */
(function () {
  if (window.BB_MAINTENANCE) return; // Site kill switch active — skip all init.
  const CFG = window.BB_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const money = (n) => (CFG.currency || '₹') + Number(n).toFixed(0);
  const seed = (n) => {
    const r = Math.abs(Math.sin(n) * 10000);
    return r - Math.floor(r);
  };
  const brandOf = (name) => {
    const parts = (name || '').split(' ').filter(Boolean);
    const first = parts.find((p) => /^[A-Za-z]+$/.test(p)) || parts[0] || 'Brand';
    return first.charAt(0) + first.slice(1).toLowerCase();
  };
  const shortName = (name) => (name.length <= 22 ? name : name.split('&')[0].split(',')[0].trim());
  const attr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const encPath = (p) => String(p || '').split('/').map((seg) => encodeURIComponent(seg)).join('/');

  // Config injection
  $$('[data-vendor-name]').forEach((el) => (el.innerHTML = `${html(CFG.vendorShort)}<span class="accent">${html(CFG.vendorAccent || '.')}</span>`));
  $$('[data-vendor-full]').forEach((el) => (el.textContent = CFG.vendorName));
  $$('[data-location]').forEach((el) => (el.textContent = CFG.location));
  $$('[data-city]').forEach((el) => (el.textContent = CFG.city));
  $$('[data-delivery-time]').forEach((el) => (el.textContent = CFG.deliveryTimeText));
  $$('[data-parent-brand]').forEach((el) => (el.textContent = CFG.parentBrand));
  $$('[data-parent-url]').forEach((el) => (el.href = CFG.parentUrl));
  $$('[data-wa-link]').forEach((el) => {
    el.href = `https://wa.me/${(CFG.whatsappNumber || '').replace(/\D/g, '')}`;
  });
  $$('[data-ig-link]').forEach((el) => {
    if (CFG.instagramUrl) el.href = CFG.instagramUrl;
  });
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
  document.title = `Shop by Category · ${CFG.vendorName}`;

  // Mobile search toggle (simple inline expand/collapse)
  const searchToggle = document.getElementById('searchToggle');
  const searchMobile = document.getElementById('searchMobile');
  if (searchToggle && searchMobile) {
    searchToggle.addEventListener('click', () => {
      const open = searchMobile.classList.toggle('open');
      const input = searchMobile.querySelector('input');
      if (open && input) setTimeout(() => input.focus(), 60);
    });
  }

  const CATEGORY_ICONS = {
    'sauces-ketchup-jam-chutney': 'fa-jar',
    'tea-tea-products': 'fa-mug-hot',
    'personal-care-hygiene': 'fa-tooth',
    'hair-care': 'fa-shower',
    'bath-body-care': 'fa-pump-soap',
    'skin-care-cosmetics': 'fa-hand-sparkles',
    'household-cleaning': 'fa-broom',
    'laundry-care': 'fa-shirt',
    'mayonnaise-spreads': 'fa-utensils',
    'health-drinks-nutrition': 'fa-heart-pulse',
  };

  const state = { catalog: null, activeCat: null, query: '', mode: 'category' };

  fetch('data/products.json')
    .then((r) => r.json())
    .then((data) => {
      // Sort categories by their `order` field — anything without one goes to the end.
      data.categories.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      state.catalog = data;
      const params = new URLSearchParams(location.search);
      const qCat = params.get('cat');
      const qSearch = (params.get('q') || '').trim();
      state.activeCat = data.categories.find((c) => c.id === qCat) ? qCat : data.categories[0].id;
      if (qSearch) {
        state.mode = 'search';
        state.query = qSearch;
        // Prefill any visible search inputs so the user sees the term
        document.querySelectorAll('.search input').forEach((i) => (i.value = qSearch));
      }
      renderSubnav();
      renderSidebar();
      renderContent();
    })
    .catch(() => {
      $('#catContent').innerHTML = '<p class="loading-text">Unable to load catalog. Please try again.</p>';
    });

  function renderSubnav() {
    const wrap = $('#subnavInner');
    if (!wrap) return;
    wrap.innerHTML = state.catalog.categories
      .map(
        (c) => `
      <a class="subnav-item${c.id === state.activeCat ? ' active' : ''}"
         data-cat-chip="${attr(c.id)}" href="?cat=${encodeURIComponent(c.id)}">
        <i class="fa-solid ${CATEGORY_ICONS[c.id] || 'fa-basket-shopping'}"></i>${html(shortName(c.name))}
      </a>`
      )
      .join('');
    wrap.querySelectorAll('[data-cat-chip]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        setActive(el.getAttribute('data-cat-chip'));
      });
    });
  }

  function renderSidebar() {
    const list = $('#catList');
    const total = state.catalog.categories.reduce(
      (s, c) => s + c.subcategories.reduce((s2, sub) => s2 + sub.dishes.length, 0),
      0
    );
    $('#catTotalCount').textContent = total + ' items';
    list.innerHTML = state.catalog.categories
      .map((c) => {
        const count = c.subcategories.reduce((s, sub) => s + sub.dishes.length, 0);
        return `
        <button class="cat-side-item${c.id === state.activeCat ? ' active' : ''}" data-cat="${attr(c.id)}">
          <span class="csi-ico"><i class="fa-solid ${CATEGORY_ICONS[c.id] || 'fa-basket-shopping'}"></i></span>
          <span class="csi-name">${html(shortName(c.name))}</span>
          <span class="csi-count">${count}</span>
        </button>`;
      })
      .join('');
    list.querySelectorAll('[data-cat]').forEach((el) => {
      el.addEventListener('click', () => setActive(el.getAttribute('data-cat')));
    });
  }

  function setActive(id) {
    state.activeCat = id;
    state.mode = 'category';
    state.query = '';
    const url = new URL(location.href);
    url.searchParams.set('cat', id);
    url.searchParams.delete('q');
    history.replaceState({}, '', url);
    document.querySelectorAll('[data-cat-chip]').forEach((el) => el.classList.toggle('active', el.getAttribute('data-cat-chip') === id));
    document.querySelectorAll('[data-cat]').forEach((el) => el.classList.toggle('active', el.getAttribute('data-cat') === id));
    renderContent();
    if (window.innerWidth < 900) {
      document.querySelector('.cat-main')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // Shared comparator — featured items first, then cheapest → most expensive.
  const sortByFeaturedThenPrice = (a, b) => {
    const featDiff = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if (featDiff !== 0) return featDiff;
    return (Number(a.price) || 0) - (Number(b.price) || 0);
  };

  function currentProducts() {
    const q = state.query.trim().toLowerCase();
    const tokens = q.split(/\s+/).filter(Boolean);
    const matches = (name) => !tokens.length || tokens.every((t) => name.toLowerCase().includes(t));

    if (state.mode === 'search' && q) {
      // Global search — across every category
      const items = [];
      state.catalog.categories.forEach((cat) => {
        cat.subcategories.forEach((sub) =>
          sub.dishes.forEach((d) => {
            if (matches(d.name) || matches(cat.name)) {
              items.push({ ...d, categoryImage: cat.image, categoryName: cat.name });
            }
          })
        );
      });
      items.sort(sortByFeaturedThenPrice);
      return { cat: null, items };
    }

    // Default: single-category view
    const cat = state.catalog.categories.find((c) => c.id === state.activeCat);
    if (!cat) return { cat: null, items: [] };
    const items = [];
    cat.subcategories.forEach((sub) =>
      sub.dishes.forEach((d) => {
        if (matches(d.name)) items.push({ ...d, categoryImage: cat.image, categoryName: cat.name });
      })
    );
    items.sort(sortByFeaturedThenPrice);
    return { cat, items };
  }

  function renderContent() {
    const { cat, items } = currentProducts();
    const inSearch = state.mode === 'search' && state.query.trim();

    if (inSearch) {
      $('#catTitle').textContent = `Search: "${state.query}"`;
      $('#catSubtitle').innerHTML = `Showing matches across every aisle. <a href="?cat=${encodeURIComponent(state.activeCat)}" data-clear-search style="color:var(--brand-dark);font-weight:600;">Clear search →</a>`;
    } else if (cat) {
      $('#catTitle').textContent = shortName(cat.name);
      $('#catSubtitle').textContent = `Browse the full ${cat.name.toLowerCase()} aisle.`;
    }

    $('#cardCountText').textContent =
      items.length === 0 ? 'No matches' : `${items.length} product${items.length === 1 ? '' : 's'}`;
    $('#cardMetaText').textContent = inSearch ? ` matching "${state.query}"` : '';

    if (items.length === 0) {
      $('#catContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-ico"><i class="fa-solid fa-magnifying-glass"></i></div>
          <h3>Nothing matches "${html(state.query)}"</h3>
          <p>Try a different keyword — brand name, product type, or aisle.</p>
          <button class="btn btn-brand" id="clearSearchBtn">Clear search</button>
        </div>`;
      $('#clearSearchBtn')?.addEventListener('click', () => {
        state.query = '';
        state.mode = 'category';
        const url = new URL(location.href);
        url.searchParams.delete('q');
        history.replaceState({}, '', url);
        document.querySelectorAll('.search input').forEach((i) => (i.value = ''));
        renderContent();
      });
      return;
    }

    $('#catContent').innerHTML = `<div class="prod-grid">${items.map(productCard).join('')}</div>`;
    document.querySelector('[data-clear-search]')?.addEventListener('click', (e) => {
      e.preventDefault();
      state.query = '';
      state.mode = 'category';
      const url = new URL(location.href);
      url.searchParams.delete('q');
      history.replaceState({}, '', url);
      document.querySelectorAll('.search input').forEach((i) => (i.value = ''));
      renderContent();
    });
    if (window.bbRefreshInline) window.bbRefreshInline();
  }

  function productCard(p) {
    const mrp = Number(p.mrp) || Number(p.price);
    const price = Number(p.price);
    const hasDiscount = mrp > price;
    const disc = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const isDeal = p.deal === true;
    const brand = brandOf(p.name);
    const img = encPath(p.image || p.categoryImage);
    return `
      <article class="prod-card${isDeal ? ' is-deal' : ''}"
        data-product data-id="${attr(p.id)}"
        data-name="${attr(p.name)}"
        data-price="${p.price}"
        data-mrp="${mrp}"
        data-unit="${attr(p.unit)}"
        data-image="${attr(img)}">
        <div class="prod-img">
          ${hasDiscount ? `<span class="badge badge-brand prod-badge">${disc}% OFF</span>` : ''}
          ${isDeal ? `<span class="prod-deal-badge"><i class="fa-solid fa-tag"></i> BEST PRICE</span>` : ''}
          <img loading="lazy" src="${img}" alt="${attr(p.name)}" onerror="this.style.opacity=0.35">
        </div>
        <div class="prod-body">
          <span class="prod-brand">${html(brand)}</span>
          <h4 class="prod-name">${html(p.name)}</h4>
          <div class="prod-meta"><span>${html(p.unit)}</span></div>
          <div class="prod-price-row">
            <span class="prod-price">${money(price)}</span>
            ${hasDiscount ? `<span class="prod-mrp">${money(mrp)}</span>` : ''}
          </div>
          <div class="prod-add-shell" data-add-shell>
            <button type="button" class="prod-add" data-add-btn="${attr(p.id)}">
              <i class="fa-solid fa-plus"></i> Add
            </button>
          </div>
        </div>
      </article>`;
  }

  // Search is wired globally by js/search.js — it hijacks every .search input.

  // ================================================================
  // Product quick-view sheet — tap a card image inside the grid
  // to see the full name + unit + price, and add to basket.
  // Add button reuses [data-add-shell]/[data-add-btn], so cart.js
  // automatically swaps in the qty-stepper when the item is in the cart.
  // ================================================================
  function ensureQuickView() {
    if (document.getElementById('pvSheet')) return;
    const markup = `
      <div class="pv-backdrop" id="pvBackdrop" data-pv-close></div>
      <aside class="pv-sheet" id="pvSheet" role="dialog" aria-modal="true" aria-labelledby="pvName">
        <button type="button" class="pv-close" data-pv-close aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
        <div class="pv-img"><img id="pvImg" alt=""></div>
        <div class="pv-body">
          <span class="pv-brand" id="pvBrand"></span>
          <h3 class="pv-name" id="pvName"></h3>
          <div class="pv-meta">
            <span class="pv-unit" id="pvUnit"></span>
            <span class="pv-price-wrap">
              <span class="pv-price" id="pvPrice"></span>
              <span class="pv-mrp" id="pvMrp" hidden></span>
              <span class="pv-off" id="pvOff" hidden></span>
            </span>
          </div>
          <div class="pv-cta">
            <div class="prod-add-shell" data-add-shell>
              <button type="button" class="prod-add" id="pvAddBtn" data-add-btn="">
                <i class="fa-solid fa-plus"></i> Add to basket
              </button>
            </div>
          </div>
        </div>
      </aside>
    `;
    document.body.insertAdjacentHTML('beforeend', markup);
  }

  function openQuickView(card) {
    ensureQuickView();
    const id = card.dataset.id;
    const name = card.dataset.name || '';
    const price = Number(card.dataset.price) || 0;
    const unit = card.dataset.unit || '';
    const image = card.dataset.image || '';
    const mrp = Number(card.dataset.mrp) || price;
    const hasDiscount = mrp > price;
    const disc = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;

    $('#pvImg').src = image;
    $('#pvImg').alt = name;
    $('#pvBrand').textContent = brandOf(name);
    $('#pvName').textContent = name;
    $('#pvUnit').textContent = unit || '';
    $('#pvUnit').style.display = unit ? '' : 'none';
    $('#pvPrice').textContent = money(price);

    const mrpEl = $('#pvMrp');
    const offEl = $('#pvOff');
    if (hasDiscount) {
      mrpEl.textContent = money(mrp); mrpEl.hidden = false;
      offEl.textContent = `${disc}% OFF`; offEl.hidden = false;
    } else {
      mrpEl.hidden = true; offEl.hidden = true;
    }

    const btn = $('#pvAddBtn');
    btn.setAttribute('data-add-btn', id);
    btn.dataset.name = name;
    btn.dataset.price = price;
    btn.dataset.unit = unit;
    btn.dataset.image = image;
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> Add to basket`;
    // Drop any stepper left over from a previous product — cart.js will
    // recreate a fresh one for the current id if needed.
    $('#pvSheet [data-stepper]')?.remove();
    btn.style.display = '';

    $('#pvBackdrop').classList.add('open');
    $('#pvSheet').classList.add('open');
    document.body.style.overflow = 'hidden';

    if (window.bbOverlay) window.bbOverlay.open('quickview', closeQuickView);
    if (window.bbRefreshInline) window.bbRefreshInline();
  }

  function closeQuickView(fromHistory) {
    $('#pvBackdrop')?.classList.remove('open');
    $('#pvSheet')?.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromHistory && window.bbOverlay) window.bbOverlay.close('quickview');
  }

  // Delegated click on the grid — tap anywhere on the card except the
  // Add/qty-stepper/wish controls to open the quick-view.
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-pv-close]')) {
      e.preventDefault();
      closeQuickView();
      return;
    }
    // Ignore taps inside the quick-view sheet itself — controls live there.
    if (e.target.closest('#pvSheet')) return;
    const card = e.target.closest('.prod-grid .prod-card');
    if (!card) return;
    // Don't hijack interactive controls on the card.
    if (e.target.closest('[data-add-btn], [data-inc], [data-dec], .qty-stepper, .prod-wish, a, button')) return;
    e.preventDefault();
    openQuickView(card);
  });
})();
