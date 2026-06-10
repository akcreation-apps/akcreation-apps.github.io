// Cross-restaurant dish search for BankiBites.
//
// When a diner searches inside one restaurant (/TCD/, /A1/, /MCH/, ...) and
// nothing matches the local menu, this module fetches active BankiBites
// partners from Firestore, scans each partner's data.json for the same dish,
// and renders clickable suggestion cards inside that restaurant's existing
// #noResults block. Clicking a suggestion writes the dish into the target
// restaurant's localStorage cart (same origin, namespaced key) and redirects
// to the partner URL.
//
// Public API: initCrossSearch({ selfPrefix, noResultsEl, getSearchTerm })

import { getDb, COL } from './firebase-config.js';
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const MIN_SEARCH_LEN = 2;
const SUGGESTION_LIMIT = 12;
const SEARCH_DEBOUNCE_MS = 220;

const menuCache = new Map();
let partnersPromise = null;

function loadActivePartners(selfPrefix) {
    if (!partnersPromise) {
        partnersPromise = (async () => {
            const db = await getDb();
            const snap = await getDocs(query(collection(db, COL.PARTNERS), orderBy('sort_order')));
            const list = [];
            snap.forEach(d => list.push(d.data()));
            return list;
        })().catch(err => {
            console.warn('[cross-search] partner load failed:', err);
            partnersPromise = null;
            return [];
        });
    }
    return partnersPromise.then(partners => partners.filter(p => {
        if (!p || p.is_active === false || !p.url) return false;
        return prefixFromUrl(p.url) !== selfPrefix.toLowerCase();
    }));
}

function prefixFromUrl(url) {
    try {
        const u = new URL(url, 'https://akcreation-apps.com');
        const seg = u.pathname.split('/').filter(Boolean)[0] || '';
        return seg.toLowerCase();
    } catch (_) {
        return '';
    }
}

function partnerDataUrl(url) {
    try {
        const u = new URL(url, 'https://akcreation-apps.com');
        u.search = '';
        u.hash = '';
        if (!u.pathname.endsWith('/')) u.pathname += '/';
        u.pathname += 'data.json';
        return u.toString();
    } catch (_) {
        return null;
    }
}

async function fetchPartnerMenu(partner) {
    const dataUrl = partnerDataUrl(partner.url);
    if (!dataUrl) return null;
    if (menuCache.has(dataUrl)) return menuCache.get(dataUrl);
    const p = fetch(dataUrl)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null);
    menuCache.set(dataUrl, p);
    return p;
}

function findMatchesInMenu(partner, menuJson, term, currentHour) {
    const matches = [];
    const menu = Array.isArray(menuJson?.menu) ? menuJson.menu : [];
    for (const category of menu) {
        const subcats = Array.isArray(category?.subcategories) ? category.subcategories : [];
        for (const subcategory of subcats) {
            const dishes = Array.isArray(subcategory?.dishes) ? subcategory.dishes : [];
            for (const dish of dishes) {
                if (!dish?.name) continue;
                if (typeof dish.available_time === 'number' && currentHour < dish.available_time) continue;
                if (typeof dish.not_available_time === 'number' && currentHour >= dish.not_available_time) continue;
                if (!dish.name.toLowerCase().includes(term)) continue;
                matches.push({ partner, subcategory, dish });
                if (matches.length >= SUGGESTION_LIMIT) return matches;
            }
        }
    }
    return matches;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function imageSrcFor(dishName) {
    return `/food_src/${dishName.split(' ').join('_')}.webp`;
}

function injectStyles() {
    if (document.getElementById('crossSearchStyles')) return;
    const style = document.createElement('style');
    style.id = 'crossSearchStyles';
    style.textContent = `
        /* ---- token layer: inherits host restaurant theme, degrades gracefully ---- */
        .cross-search-suggestions {
            --cs-primary:      var(--primary,      #4f46e5);
            --cs-primary-dark: var(--primary-dark,  #4338ca);
            --cs-text:         var(--text-main,     #1f2937);
            --cs-text-muted:   var(--text-muted,    #6b7280);
            --cs-surface:      var(--surface-card,  #fff);
            --cs-border:       var(--border-color,  #e5e7eb);
            --cs-green:        #047857;
        }
        @media (prefers-color-scheme: dark) {
            .cross-search-suggestions {
                --cs-text:       #f3f4f6;
                --cs-text-muted: #9ca3af;
                --cs-surface:    #1f2937;
                --cs-border:     #374151;
                --cs-green:      #34d399;
            }
        }

        /* ---- collapse host .no-results padding so suggestions sit close to the search bar ---- */
        #noResults.cs-active {
            padding: 8px 12px 24px !important;
            text-align: left !important;
        }
        @media (min-width: 768px) {
            #noResults.cs-active { padding: 10px 16px 28px !important; }
        }

        /* ---- section wrapper ---- */
        .cross-search-wrap { margin-top: 4px; text-align: left; }

        /* ---- heading row ---- */
        .cross-search-heading {
            font-size: 1rem; font-weight: 700; margin: 0 0 4px;
            color: var(--cs-text); display: flex; align-items: center; gap: 8px;
        }
        .cross-search-heading .cs-icon { color: var(--cs-primary); flex-shrink: 0; }
        .cross-search-sub {
            font-size: 0.82rem; color: var(--cs-text-muted); margin: 0 0 14px;
            padding-left: 1px;
        }

        /* ---- responsive grid ---- */
        .cross-search-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 576px) { .cross-search-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 992px) { .cross-search-grid { grid-template-columns: 1fr 1fr 1fr; } }

        /* ---- suggestion card ---- */
        .cross-search-card {
            display: flex; align-items: center; gap: 12px;
            padding: 12px 14px; border: 1.5px solid var(--cs-border); border-radius: 14px;
            background: var(--cs-surface); cursor: pointer; text-align: left; width: 100%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.06);
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
            min-height: 72px; /* safe touch target floor */
        }
        .cross-search-card:hover, .cross-search-card:focus-visible {
            transform: translateY(-2px);
            border-color: var(--cs-primary);
            box-shadow: 0 6px 18px rgba(0,0,0,0.12);
            outline: none;
        }
        .cross-search-card:focus-visible {
            outline: 2px solid var(--cs-primary);
            outline-offset: 2px;
        }

        /* ---- dish thumbnail ---- */
        .cross-search-card .csc-thumb {
            width: 52px; height: 52px; border-radius: 10px; object-fit: cover;
            background: var(--cs-border); flex-shrink: 0;
        }
        .cross-search-card .csc-thumb-placeholder {
            width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0;
            background: var(--cs-border); display: flex; align-items: center;
            justify-content: center; color: var(--cs-text-muted); font-size: 1.3rem;
        }

        /* ---- card body ---- */
        .cross-search-card .csc-body { flex: 1; min-width: 0; }
        .cross-search-card .csc-dish {
            font-weight: 700; font-size: 0.95rem; color: var(--cs-text);
            margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .cross-search-card .csc-price {
            font-size: 0.9rem; font-weight: 700; color: var(--cs-green);
            margin: 0 0 3px; display: block;
        }
        .cross-search-card .csc-restaurant-row {
            display: flex; align-items: center; gap: 5px;
        }
        .cross-search-card .csc-logo {
            width: 18px; height: 18px; border-radius: 4px; object-fit: cover;
            flex-shrink: 0; background: var(--cs-border);
        }
        .cross-search-card .csc-restaurant {
            font-size: 0.78rem; font-weight: 600; color: var(--cs-primary);
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        /* ---- arrow affordance ---- */
        .cross-search-card .csc-arrow {
            color: var(--cs-text-muted); font-size: 0.75rem; flex-shrink: 0;
            transition: transform 0.15s ease, color 0.15s ease;
        }
        .cross-search-card:hover .csc-arrow,
        .cross-search-card:focus-visible .csc-arrow {
            color: var(--cs-primary); transform: translateX(3px);
        }

        /* ---- loading state ---- */
        .cross-search-loading {
            display: flex; align-items: center; gap: 10px;
            font-size: 0.88rem; color: var(--cs-text-muted); padding: 16px 0;
        }
        @keyframes cs-spin { to { transform: rotate(360deg); } }
        .cross-search-loading .cs-spinner {
            width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
            border: 2px solid var(--cs-border);
            border-top-color: var(--cs-primary);
            animation: cs-spin 0.7s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
            .cross-search-loading .cs-spinner { animation: none; opacity: 0.5; }
        }

        /* ---- empty state ---- */
        .cross-search-empty {
            display: flex; align-items: flex-start; gap: 10px;
            font-size: 0.88rem; color: var(--cs-text-muted); padding: 14px 0;
            line-height: 1.5;
        }
        .cross-search-empty .cs-empty-icon {
            color: var(--cs-primary); font-size: 1.1rem; flex-shrink: 0; margin-top: 1px;
        }
    `;
    document.head.appendChild(style);
}

function ensureContainer(noResultsEl) {
    let container = noResultsEl.querySelector('#crossSearchSuggestions');
    if (!container) {
        container = document.createElement('div');
        container.id = 'crossSearchSuggestions';
        container.className = 'cross-search-suggestions';
        noResultsEl.appendChild(container);
    }
    return container;
}

function setActive(container, on) {
    const host = container.closest('#noResults');
    if (host) host.classList.toggle('cs-active', !!on);
}

function renderLoading(container) {
    setActive(container, true);
    container.innerHTML = `
        <div class="cross-search-loading" role="status" aria-live="polite" aria-label="Searching other BankiBites restaurants">
            <span class="cs-spinner" aria-hidden="true"></span>
            Searching other BankiBites restaurants&hellip;
        </div>`;
}

function renderEmpty(container) {
    setActive(container, true);
    // Hide the host page's no-results image when we have our own message to show;
    // reveal it again if/when the container is cleared via clear().
    const hostImg = container.closest('#noResults')?.querySelector(':scope > img');
    if (hostImg) hostImg.style.display = 'none';
    container.innerHTML = `
        <div class="cross-search-empty" role="status" aria-live="polite">
            <i class="fas fa-map-marker-alt cs-empty-icon" aria-hidden="true"></i>
            <span>This dish isn't available at any nearby BankiBites restaurant right now. Try a different search or check back later.</span>
        </div>`;
}

function renderMatches(container, matches, onPick) {
    if (!matches.length) { renderEmpty(container); return; }
    setActive(container, true);

    // Suppress the host no-results image — our cards replace it visually.
    const hostImg = container.closest('#noResults')?.querySelector(':scope > img');
    if (hostImg) hostImg.style.display = 'none';

    const total = matches.length;
    const cards = matches.map((m, i) => {
        const name    = escapeHtml(m.partner.name || 'Restaurant');
        const dish    = escapeHtml(m.dish.name);
        const price   = escapeHtml(String(m.dish.price));
        const logoUrl = m.partner.logo ? escapeHtml(m.partner.logo) : '';
        const logoHtml = logoUrl
            ? `<img class="csc-logo" src="${logoUrl}" alt="" loading="lazy" onerror="this.style.display='none'">`
            : '';
        return `
        <button type="button" class="cross-search-card" data-idx="${i}"
                aria-label="Order ${dish} from ${name} — ₹${price}">
            <img class="csc-thumb" src="${escapeHtml(imageSrcFor(m.dish.name))}" alt="" loading="lazy"
                 onerror="this.style.display='none'; this.nextElementSibling && (this.nextElementSibling.style.display='flex')" />
            <span class="csc-thumb-placeholder" aria-hidden="true" style="display:none">
                <i class="fas fa-utensils"></i>
            </span>
            <div class="csc-body">
                <p class="csc-dish">${dish}</p>
                <span class="csc-price">&#8377;${price}</span>
                <div class="csc-restaurant-row">
                    ${logoHtml}
                    <span class="csc-restaurant">${name}</span>
                </div>
            </div>
            <i class="fas fa-chevron-right csc-arrow" aria-hidden="true"></i>
        </button>`;
    }).join('');

    container.innerHTML = `
        <div class="cross-search-wrap">
            <p class="cross-search-heading" aria-live="polite">
                <i class="fas fa-store cs-icon" aria-hidden="true"></i>
                Found at ${total} nearby BankiBites restaurant${total === 1 ? '' : 's'}
            </p>
            <p class="cross-search-sub">Not on this menu — tap a card to add the dish and switch over.</p>
            <div class="cross-search-grid" role="list">${cards}</div>
        </div>`;

    container.querySelectorAll('.cross-search-card').forEach(btn => {
        // Restore fallback placeholder on img error (onerror only fires once;
        // we use sibling toggling for reliability — already in the inline handler).
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.idx);
            if (Number.isFinite(idx) && matches[idx]) onPick(matches[idx]);
        });
    });
}

function addToPartnerCartAndGo(match) {
    const prefix = prefixFromUrl(match.partner.url);
    if (!prefix) { window.location.href = match.partner.url; return; }
    const key = `${prefix}_cart`;
    let cart = [];
    try {
        const raw = localStorage.getItem(key);
        cart = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(cart)) cart = [];
    } catch (_) { cart = []; }

    const subcatName = match.subcategory?.name || 'Other';
    const subcatType = match.subcategory?.type || '';
    const dish = match.dish;
    const dishEntry = {
        id: dish.id,
        name: dish.name,
        type: subcatType,
        price: dish.price,
        quantity: 1,
        image_src: imageSrcFor(dish.name)
    };

    const existingCategory = cart.find(item => item?.category?.name === subcatName);
    if (existingCategory) {
        const existingDish = existingCategory.category.dish_details.find(d => d.id === dish.id);
        if (existingDish) {
            existingDish.quantity += 1;
        } else {
            existingCategory.category.dish_details.push(dishEntry);
        }
    } else {
        cart.push({ category: { name: subcatName, dish_details: [dishEntry] } });
    }

    try { localStorage.setItem(key, JSON.stringify(cart)); } catch (_) { /* quota — proceed anyway */ }
    window.location.href = match.partner.url;
}

function currentPagePrefix() {
    try {
        return (window.location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
    } catch (_) {
        return '';
    }
}

export function initCrossSearch({ selfPrefix, noResultsEl, getSearchTerm } = {}) {
    if (!noResultsEl || typeof getSearchTerm !== 'function') return { update: () => {}, clear: () => {} };
    const prefix = (selfPrefix || currentPagePrefix()).toLowerCase();
    injectStyles();
    const container = ensureContainer(noResultsEl);

    let debounceTimer = null;
    let currentToken = 0;

    async function runSearch(term) {
        const token = ++currentToken;
        renderLoading(container);
        const partners = await loadActivePartners(prefix);
        if (token !== currentToken) return;
        if (!partners.length) { renderEmpty(container); return; }
        const currentHour = new Date().getHours();
        const menus = await Promise.all(partners.map(p =>
            fetchPartnerMenu(p).then(menu => ({ partner: p, menu }))
        ));
        if (token !== currentToken) return;
        const allMatches = [];
        for (const { partner, menu } of menus) {
            if (!menu) continue;
            const found = findMatchesInMenu(partner, menu, term, currentHour);
            for (const m of found) {
                allMatches.push(m);
                if (allMatches.length >= SUGGESTION_LIMIT) break;
            }
            if (allMatches.length >= SUGGESTION_LIMIT) break;
        }
        renderMatches(container, allMatches, addToPartnerCartAndGo);
    }

    function restoreHostImg() {
        const hostImg = noResultsEl.querySelector(':scope > img');
        if (hostImg) hostImg.style.display = '';
        noResultsEl.classList.remove('cs-active');
    }

    function update() {
        const raw = getSearchTerm();
        const term = (raw || '').trim().toLowerCase();
        if (term.length < MIN_SEARCH_LEN) {
            currentToken++;
            container.innerHTML = '';
            restoreHostImg();
            return;
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => runSearch(term), SEARCH_DEBOUNCE_MS);
    }

    function clear() {
        currentToken++;
        clearTimeout(debounceTimer);
        container.innerHTML = '';
        restoreHostImg();
    }

    return { update, clear };
}
