/**
 * Homepage renderer — product-first layout.
 * No ratings. Add buttons use data-* attributes read by cart.js delegate.
 */
(function () {
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
  // URL-encode every path segment so filenames with dots, spaces, +, &, [, ]
  // reliably resolve on both GitHub Pages and local static servers.
  const encPath = (p) => String(p || '').split('/').map((seg) => encodeURIComponent(seg)).join('/');

  // ---------- Config injection ----------
  $$('[data-vendor-name]').forEach((el) => (el.innerHTML = `${html(CFG.vendorShort)}<span class="accent">${html(CFG.vendorAccent || '.')}</span>`));
  $$('[data-vendor-full]').forEach((el) => (el.textContent = CFG.vendorName));
  $$('[data-location]').forEach((el) => (el.textContent = CFG.location));
  $$('[data-city]').forEach((el) => (el.textContent = CFG.city));
  $$('[data-delivery-time]').forEach((el) => (el.textContent = CFG.deliveryTimeText));
  $$('[data-free-thresh]').forEach((el) => (el.textContent = money(CFG.freeDeliveryThreshold || 0)));
  $$('[data-support-phone]').forEach((el) => (el.textContent = CFG.supportPhone));
  $$('[data-support-email]').forEach((el) => (el.textContent = CFG.supportEmail));
  $$('[data-parent-brand]').forEach((el) => (el.textContent = CFG.parentBrand));
  $$('[data-parent-url]').forEach((el) => (el.href = CFG.parentUrl));
  $$('[data-wa-link]').forEach((el) => {
    el.href = `https://wa.me/${(CFG.whatsappNumber || '').replace(/\D/g, '')}`;
  });
  $$('[data-ig-link]').forEach((el) => {
    if (CFG.instagramUrl) el.href = CFG.instagramUrl;
  });
  const H = CFG.hero || {};
  $$('[data-hero-eyebrow]').forEach((el) => (el.textContent = H.eyebrow || ''));
  $$('[data-hero-eyebrow-prefix]').forEach((el) => (el.textContent = H.eyebrowPrefix || 'Arriving'));
  $$('[data-hero-t1]').forEach((el) => (el.textContent = H.titleLine1 || ''));
  $$('[data-hero-t2]').forEach((el) => (el.textContent = H.titleLine2 || ''));
  $$('[data-hero-lede]').forEach((el) => (el.textContent = H.lede || ''));
  $$('[data-hero-cta-primary]').forEach((el) => (el.textContent = H.ctaPrimary || 'Start shopping'));
  $$('[data-hero-cta-secondary]').forEach((el) => (el.textContent = H.ctaSecondary || 'View deals'));

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

  fetch('data/products.json')
    .then((r) => r.json())
    .then((data) => {
      renderSubnav(data);
      renderCategoryRows(data);
      renderDeals(data);
      if (window.bbRefreshInline) window.bbRefreshInline();
      // Observer must attach AFTER sections are in the DOM
      setupScrollSpy();
    })
    .catch(() => {});

  function collectAll(data) {
    const all = [];
    data.categories.forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.dishes.forEach((d) => all.push({ ...d, categoryName: cat.name, categoryId: cat.id, categoryImage: cat.image }));
      });
    });
    return all;
  }

  function renderSubnav(data) {
    const wrap = $('#subnavInner');
    if (!wrap) return;
    wrap.innerHTML = data.categories
      .map(
        (c, i) => `
      <a class="subnav-item${i === 0 ? ' active' : ''}" data-cat-nav="${attr(c.id)}" href="#cat-${attr(c.id)}">
        <i class="fa-solid ${CATEGORY_ICONS[c.id] || 'fa-basket-shopping'}"></i>${html(shortName(c.name))}
      </a>`
      )
      .join('') + `<a class="subnav-item offer" data-cat-nav="deals" href="#deals">Offers</a>`;

    // Click a chip → smooth-scroll to the matching rail (native scroll-padding-top
    // handles the offset for the sticky header stack).
    wrap.querySelectorAll('[data-cat-nav]').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const id = chip.getAttribute('data-cat-nav');
        const target = document.getElementById(id === 'deals' ? 'deals' : 'cat-' + id);
        if (!target) return;
        e.preventDefault();
        setActiveChip(id);
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + target.id);
      });
    });
  }

  // Single-source-of-truth for chip active state; also horizontally centres
  // the active chip inside the subnav on mobile.
  function setActiveChip(id) {
    const wrap = $('#subnavInner');
    if (!wrap) return;
    let active = null;
    wrap.querySelectorAll('[data-cat-nav]').forEach((c) => {
      const is = c.getAttribute('data-cat-nav') === id;
      c.classList.toggle('active', is);
      if (is) active = c;
    });
    if (!active) return;
    // Bring the active chip into view within the horizontal-scroll subnav
    const wrapRect = wrap.getBoundingClientRect();
    const chipRect = active.getBoundingClientRect();
    if (chipRect.left < wrapRect.left + 20 || chipRect.right > wrapRect.right - 20) {
      wrap.scrollTo({
        left: active.offsetLeft - (wrap.clientWidth - active.clientWidth) / 2,
        behavior: 'smooth',
      });
    }
  }

  // Scroll-spy: highlight whichever rail is currently under the sticky header.
  function setupScrollSpy() {
    const sections = document.querySelectorAll('.prod-row-section[id]');
    if (!sections.length || !('IntersectionObserver' in window)) return;

    // Detection band: a narrow strip near the top of the viewport, just below
    // the sticky header stack (~140px on mobile with the loc-strip).
    const observer = new IntersectionObserver(
      (entries) => {
        // Prefer the section closest to the top of the detection band.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length === 0) return;
        const id = visible[0].target.id === 'deals' ? 'deals' : visible[0].target.id.replace(/^cat-/, '');
        setActiveChip(id);
      },
      {
        // Shrink viewport: top 130px (header stack) + keep only top 30% for detection.
        rootMargin: '-130px 0px -70% 0px',
        threshold: 0,
      }
    );
    sections.forEach((s) => observer.observe(s));

    // Handle direct load with a hash — scroll after render, then activate.
    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) {
        setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    }
  }

  // The main event: one horizontal-scroll row of products PER category.
  // Featured products float to the front of each rail (stable sort — order within
  // featured/non-featured groups is preserved).
  function renderCategoryRows(data) {
    const wrap = $('#categoryRows');
    if (!wrap) return;
    wrap.innerHTML = data.categories
      .map((c) => {
        const items = c.subcategories.flatMap((sub) => sub.dishes).filter((d) => d.inStock);
        if (items.length === 0) return '';
        items.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        const previews = items.slice(0, 10).map((p) => productCard({ ...p, categoryImage: c.image })).join('');
        return `
          <section class="prod-row-section" id="cat-${c.id}">
            <div class="prod-row-head">
              <div>
                <span class="eyebrow"><i class="fa-solid ${CATEGORY_ICONS[c.id] || 'fa-basket-shopping'}"></i> ${html(c.name)}</span>
                <h2>${html(shortName(c.name))}</h2>
              </div>
              <a class="row-see-all" href="categories.html?cat=${encodeURIComponent(c.id)}">See all ${items.length} <i class="fa-solid fa-arrow-right"></i></a>
            </div>
            <div class="prod-row">${previews}</div>
          </section>`;
      })
      .join('');
  }

  function productCard(p) {
    const s = seed(p.id + 99);
    const disc = 5 + Math.floor(s * 20);
    const mrp = Math.round(p.price / (1 - disc / 100));
    const brand = brandOf(p.name);
    const img = encPath(p.image || p.categoryImage);
    return `
      <article class="prod-card"
        data-product data-id="${attr(p.id)}"
        data-name="${attr(p.name)}"
        data-price="${p.price}"
        data-unit="${attr(p.unit)}"
        data-image="${attr(img)}">
        <div class="prod-img">
          <span class="badge badge-brand prod-badge">${disc}% OFF</span>
          <img loading="lazy" src="${img}" alt="${attr(p.name)}" onerror="this.style.opacity=0.35">
        </div>
        <div class="prod-body">
          <span class="prod-brand">${html(brand)}</span>
          <h4 class="prod-name">${html(p.name)}</h4>
          <div class="prod-meta"><span>${html(p.unit)}</span></div>
          <div class="prod-price-row">
            <span class="prod-price">${money(p.price)}</span>
            <span class="prod-mrp">${money(mrp)}</span>
          </div>
          <div class="prod-add-shell" data-add-shell>
            <button type="button" class="prod-add" data-add-btn="${attr(p.id)}">
              <i class="fa-solid fa-plus"></i> Add
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // Deals rail:
  //   - Only shows products with `"deal": true` in products.json.
  //   - If no product is flagged, the whole section hides itself.
  function renderDeals(data) {
    const wrap = $('#dealsScroll');
    if (!wrap) return;
    const deals = collectAll(data).filter((p) => p.inStock && p.deal === true);
    const section = document.getElementById('deals');
    if (deals.length === 0) {
      if (section) section.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    if (section) section.style.display = '';
    wrap.innerHTML = deals.slice(0, 12).map((p) => productCard({ ...p })).join('');
  }

  // Footer year
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();
  document.title = `${CFG.vendorName} · ${CFG.tagline}`;
})();
