/**
 * Deals page — renders every product flagged `deal: true` in products.json
 * as a grid. Mirrors the card/quick-view behaviour of categories.js so the
 * add-to-cart + variant picker work identically.
 */
(function () {
  if (window.BB_MAINTENANCE) return;
  const CFG = window.BB_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const money = (n) => (CFG.currency || '₹') + Number(n).toFixed(0);
  const brandOf = (name) => {
    const parts = (name || '').split(' ').filter(Boolean);
    const first = parts.find((p) => /^[A-Za-z]+$/.test(p)) || parts[0] || 'Brand';
    return first.charAt(0) + first.slice(1).toLowerCase();
  };
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
  $$('[data-family-brand]').forEach((el) => (el.textContent = CFG.familyBrand || ''));
  $$('[data-family-url]').forEach((el) => { if (CFG.familyUrl) el.href = CFG.familyUrl; });
  $$('[data-wa-link]').forEach((el) => {
    el.href = `https://wa.me/${(CFG.whatsappNumber || '').replace(/\D/g, '')}`;
  });
  $$('[data-ig-link]').forEach((el) => { if (CFG.instagramUrl) el.href = CFG.instagramUrl; });
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
  document.title = `All Deals · ${CFG.vendorName}${CFG.familyBrand ? ' (' + CFG.familyBrand + ' family)' : ''}`;

  // Mobile search toggle
  const searchToggle = document.getElementById('searchToggle');
  const searchMobile = document.getElementById('searchMobile');
  if (searchToggle && searchMobile) {
    searchToggle.addEventListener('click', () => {
      const open = searchMobile.classList.toggle('open');
      const input = searchMobile.querySelector('input');
      if (open && input) setTimeout(() => input.focus(), 60);
    });
  }

  const shortName = (name) => (name.length <= 22 ? name : name.split('&')[0].split(',')[0].trim());

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

  function renderSubnav(data) {
    const wrap = $('#subnavInner');
    if (!wrap) return;
    const hasDeals = data.categories.some((cat) =>
      cat.subcategories.some((sub) =>
        sub.dishes.some((d) => d.deal === true && (d.variants || []).some((v) => v.inStock !== false))
      )
    );
    const offerChip = hasDeals
      ? `<a class="subnav-item offer active" href="deals.html"><i class="fa-solid fa-fire"></i>Offers</a>`
      : '';
    const catChips = data.categories
      .map(
        (c) => `
      <a class="subnav-item" href="categories.html?cat=${encodeURIComponent(c.id)}">
        <i class="fa-solid ${CATEGORY_ICONS[c.id] || 'fa-basket-shopping'}"></i>${html(shortName(c.name))}
      </a>`
      )
      .join('');
    wrap.innerHTML = offerChip + catChips;
  }

  const displayVariant = (p) => {
    const vs = p.variants || [];
    return vs.find((v) => v.inStock !== false) || vs[0] || {};
  };
  const sortByFeaturedThenPrice = (a, b) => {
    const featDiff = (b.featured ? 1 : 0) - (a.featured ? 1 : 0);
    if (featDiff !== 0) return featDiff;
    return (displayVariant(a).price || 0) - (displayVariant(b).price || 0);
  };

  fetch('data/products.json')
    .then((r) => r.json())
    .then((data) => {
      data.categories.sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999));
      const map = new Map();
      data.categories.forEach((cat) => {
        cat.subcategories.forEach((sub) => {
          sub.dishes.forEach((p) => map.set(String(p.id), { ...p, categoryName: cat.name, categoryId: cat.id, categoryImage: cat.image }));
        });
      });
      window.bbCatalogById = map;
      renderSubnav(data);

      const deals = [];
      data.categories.forEach((cat) => {
        cat.subcategories.forEach((sub) => {
          sub.dishes.forEach((d) => {
            if (d.deal === true && (d.variants || []).some((v) => v.inStock !== false)) {
              deals.push({ ...d, categoryImage: cat.image, categoryName: cat.name, categoryId: cat.id });
            }
          });
        });
      });
      deals.sort(sortByFeaturedThenPrice);
      renderContent(deals);
      if (window.bbRefreshInline) window.bbRefreshInline();
    })
    .catch(() => {
      $('#dealsContent').innerHTML = '<p class="loading-text">Unable to load deals. Please try again.</p>';
    });

  function renderContent(items) {
    $('#dealsCountText').textContent = items.length === 0
      ? 'No deals right now'
      : `${items.length} deal${items.length === 1 ? '' : 's'}`;
    $('#dealsMetaText').textContent = items.length ? ' across every aisle' : '';

    if (items.length === 0) {
      $('#dealsContent').innerHTML = `
        <div class="empty-state">
          <div class="empty-ico"><i class="fa-solid fa-tag"></i></div>
          <h3>No deals are live right now</h3>
          <p>Check back soon — we rotate offers every week.</p>
          <a class="btn btn-brand" href="categories.html">Browse all categories</a>
        </div>`;
      return;
    }

    $('#dealsContent').innerHTML = `<div class="prod-grid">${items.map(productCard).join('')}</div>`;
  }

  function productCard(p) {
    const dv = displayVariant(p);
    const price = Number(dv.price) || 0;
    const mrp = Number(dv.mrp) || price;
    const hasDiscount = mrp > price;
    const disc = hasDiscount ? Math.round(((mrp - price) / mrp) * 100) : 0;
    const isDeal = p.deal === true;
    const brand = brandOf(p.name);
    const img = encPath(dv.image || p.image || p.categoryImage);
    const multi = (p.variants || []).length > 1;
    const unitLabel = multi
      ? `${html(dv.unit)} <span class="prod-size-chip">${p.variants.length} sizes</span>`
      : html(dv.unit || '');
    const addBtn = multi
      ? `<button type="button" class="prod-add" data-open-variant="${attr(p.id)}">
           <i class="fa-solid fa-plus"></i> Add
         </button>`
      : `<button type="button" class="prod-add" data-add-btn="${attr(dv.id)}"
             data-name="${attr(p.name)}" data-price="${price}"
             data-unit="${attr(dv.unit)}" data-image="${attr(img)}">
           <i class="fa-solid fa-plus"></i> Add
         </button>`;
    return `
      <article class="prod-card${isDeal ? ' is-deal' : ''}"
        data-product data-id="${attr(dv.id)}"
        data-product-key="${attr(p.id)}"
        data-name="${attr(p.name)}"
        data-price="${price}"
        data-mrp="${mrp}"
        data-unit="${attr(dv.unit)}"
        data-image="${attr(img)}">
        <div class="prod-img">
          ${hasDiscount ? `<span class="badge badge-brand prod-badge">${disc}% OFF</span>` : ''}
          ${isDeal ? `<span class="prod-deal-badge"><i class="fa-solid fa-tag"></i> BEST PRICE</span>` : ''}
          <img loading="lazy" src="${img}" alt="${attr(p.name)}" onerror="this.style.opacity=0.35">
        </div>
        <div class="prod-body">
          <span class="prod-brand">${html(brand)}</span>
          <h4 class="prod-name">${html(p.name)}</h4>
          <div class="prod-meta"><span>${unitLabel}</span></div>
          <div class="prod-price-row">
            <span class="prod-price">${multi ? 'From ' : ''}${money(price)}</span>
            ${hasDiscount ? `<span class="prod-mrp">${money(mrp)}</span>` : ''}
          </div>
          <div class="prod-add-shell" data-add-shell>${addBtn}</div>
        </div>
      </article>`;
  }
})();
