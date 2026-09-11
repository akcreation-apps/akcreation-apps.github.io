/**
 * Shared search — attaches a live-suggest dropdown to every `.search input`,
 * navigates to categories.html?q=… on Enter / submit.
 *
 * Load AFTER config.js + cart.js on any page that has a search input.
 */
(function () {
  const CFG = window.BB_CONFIG || {};
  const money = (n) => (CFG.currency || '₹') + Number(n).toFixed(0);
  const html = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const attr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const encPath = (p) => String(p || '').split('/').map((seg) => encodeURIComponent(seg)).join('/');

  // Shared catalog cache (fetched once per page)
  let catalogPromise = null;
  function loadCatalog() {
    if (window.__bbCatalog) return Promise.resolve(window.__bbCatalog);
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch('data/products.json')
      .then((r) => r.json())
      .then((data) => {
        window.__bbCatalog = flatten(data);
        return window.__bbCatalog;
      });
    return catalogPromise;
  }
  function flatten(data) {
    const all = [];
    data.categories.forEach((cat) => {
      cat.subcategories.forEach((sub) => {
        sub.dishes.forEach((d) => {
          all.push({
            ...d,
            image: d.image || cat.image,
            categoryId: cat.id,
            categoryName: cat.name,
          });
        });
      });
    });
    return all;
  }

  function match(list, q) {
    q = q.trim().toLowerCase();
    if (!q) return [];
    // Split into tokens — every token must be substring-matched
    const tokens = q.split(/\s+/);
    return list.filter((p) => {
      const hay = (p.name + ' ' + p.categoryName).toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  function highlight(text, q) {
    const tokens = q.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return html(text);
    let out = html(text);
    tokens.forEach((t) => {
      const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }

  function attachDropdown(input) {
    if (input._bbSearchAttached) return;
    input._bbSearchAttached = true;

    // The dropdown floats absolutely — anchor it to the .search parent
    const parent = input.closest('.search') || input.parentElement;
    if (!parent) return;
    parent.classList.add('has-suggest');

    const dd = document.createElement('div');
    dd.className = 'search-suggest';
    dd.setAttribute('role', 'listbox');
    parent.appendChild(dd);

    let currentMatches = [];
    let currentQuery = '';

    const close = () => {
      dd.classList.remove('open');
      dd.innerHTML = '';
    };

    const goToResults = (q) => {
      if (!q || !q.trim()) return;
      const url = `categories.html?q=${encodeURIComponent(q.trim())}`;
      window.location.href = url;
    };

    input.addEventListener('input', () => {
      const q = input.value;
      currentQuery = q;
      if (!q.trim()) {
        close();
        return;
      }
      loadCatalog().then((all) => {
        if (currentQuery !== q) return; // stale
        currentMatches = match(all, q).slice(0, 40);
        renderDropdown(dd, currentMatches, q, goToResults);
      });
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        goToResults(input.value);
      } else if (e.key === 'Escape') {
        close();
        input.blur();
      }
    });

    input.addEventListener('focus', () => {
      if (input.value.trim()) input.dispatchEvent(new Event('input'));
    });

    // Search icon-right on the desktop input acts as submit
    const iconRight = parent.querySelector('.icon-right');
    if (iconRight) {
      iconRight.style.pointerEvents = 'auto';
      iconRight.style.cursor = 'pointer';
      iconRight.addEventListener('click', () => goToResults(input.value));
    }
    // The search-box on categories page has a plain button
    const submitBtn = parent.querySelector('button[aria-label="Search"]');
    if (submitBtn) submitBtn.addEventListener('click', () => goToResults(input.value));

    // Click outside closes
    document.addEventListener('click', (e) => {
      if (!parent.contains(e.target)) close();
    });
    // Clicking a suggestion that adds to cart shouldn't close the dropdown so the user can keep adding
    dd.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add-btn]');
      // If it's an "add" click, cart.js will handle it; keep dropdown open
      if (add) return;
      const row = e.target.closest('[data-go]');
      if (row) {
        window.location.href = row.getAttribute('data-go');
      }
    });
  }

  function renderDropdown(dd, matches, q, goToResults) {
    if (matches.length === 0) {
      dd.innerHTML = `
        <div class="search-empty">
          <i class="fa-solid fa-magnifying-glass"></i>
          <div>
            <strong>No matches for "${html(q)}"</strong>
            <span>Try a brand name — Dove, Kissan, Horlicks…</span>
          </div>
        </div>`;
      dd.classList.add('open');
      return;
    }
    const shown = matches.slice(0, 8);
    dd.innerHTML =
      shown
        .map(
          (p) => `
      <div class="search-row" data-go="categories.html?cat=${encodeURIComponent(p.categoryId)}#products">
        <div class="search-row-img"><img loading="lazy" src="${encPath(p.image)}" alt="" onerror="this.style.opacity=0.35"></div>
        <div class="search-row-info">
          <span class="search-row-name">${highlight(p.name, q)}</span>
          <span class="search-row-meta">${html(p.categoryName)} · ${html(p.unit)}</span>
        </div>
        <div class="search-row-price">${money(p.price)}</div>
        <button type="button"
          class="search-row-add"
          data-add-btn="${attr(p.id)}"
          data-name="${attr(p.name)}"
          data-price="${p.price}"
          data-unit="${attr(p.unit)}"
          data-image="${attr(encPath(p.image))}">
          <i class="fa-solid fa-plus"></i>
        </button>
      </div>`
        )
        .join('') +
      `<button type="button" class="search-all" data-go="categories.html?q=${encodeURIComponent(q)}">
         View all ${matches.length} result${matches.length === 1 ? '' : 's'}
         <i class="fa-solid fa-arrow-right"></i>
       </button>`;
    dd.classList.add('open');
  }

  // Wire every existing .search input on the page
  function wireAll() {
    document.querySelectorAll('.search input').forEach(attachDropdown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAll);
  } else {
    wireAll();
  }
})();
