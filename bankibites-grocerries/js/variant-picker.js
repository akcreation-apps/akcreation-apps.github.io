/**
 * Size-picker sheet — shown when the shopper taps "Add" on a product that has
 * more than one pack variant. Renders a radio list of {unit, price, mrp} and
 * calls back with the chosen variant so cart.js can add it as if the user had
 * clicked the single-variant Add button directly.
 *
 * Exposed as window.bbVariantPicker.open(product, onPick).
 * Product shape:  { id, name, image, variants: [{id, unit, price, mrp, image, inStock}] }
 */
(function () {
  if (window.BB_MAINTENANCE) return;
  const CFG = window.BB_CONFIG || {};
  const money = (n) => (CFG.currency || '₹') + Number(n).toFixed(0);
  const escAttr = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const escHTML = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const encPath = (p) => String(p || '').split('/').map((seg) => encodeURIComponent(seg)).join('/');

  function ensureStyles() {
    if (document.getElementById('bb-variant-picker-css')) return;
    const css = `
      .vp-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.55); opacity: 0; pointer-events: none; transition: opacity .18s ease; z-index: 1080; }
      .vp-backdrop.open { opacity: 1; pointer-events: auto; }
      .vp-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: var(--surface); color: var(--text); border-top-left-radius: 20px; border-top-right-radius: 20px; box-shadow: 0 -20px 60px rgba(15,23,42,.25); padding: 18px 16px 22px; max-height: 88vh; overflow-y: auto; transform: translateY(102%); transition: transform .22s cubic-bezier(.2,.7,.2,1); z-index: 1090; }
      .vp-sheet.open { transform: translateY(0); }
      .vp-handle { width: 44px; height: 4px; border-radius: 2px; background: var(--line); margin: 0 auto 12px; }
      .vp-head { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
      .vp-thumb { flex: 0 0 56px; width: 56px; height: 56px; border-radius: 12px; background: var(--surface-2); overflow: hidden; display: grid; place-items: center; }
      .vp-thumb img { width: 100%; height: 100%; object-fit: contain; }
      .vp-title { flex: 1; min-width: 0; }
      .vp-title h4 { margin: 0; font-size: 1.02rem; font-weight: 700; color: var(--ink); line-height: 1.25; }
      .vp-title p { margin: 3px 0 0; font-size: 0.78rem; color: var(--muted); }
      .vp-close { flex: 0 0 auto; background: transparent; border: 0; color: var(--muted); font-size: 1.25rem; cursor: pointer; padding: 4px 6px; }
      .vp-list { display: flex; flex-direction: column; gap: 10px; margin: 0 0 16px; padding: 0; list-style: none; }
      .vp-opt { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 10px 14px; border: 1.5px solid var(--line); border-radius: 14px; background: var(--surface); cursor: pointer; transition: border-color .15s ease, background .15s ease; }
      .vp-opt:hover { border-color: var(--brand); }
      .vp-opt.is-selected { border-color: var(--brand); background: var(--brand-soft); }
      .vp-opt.is-oos { opacity: 0.55; cursor: not-allowed; }
      .vp-opt input { position: absolute; opacity: 0; pointer-events: none; }
      .vp-radio { flex: 0 0 22px; width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--line); display: grid; place-items: center; background: var(--surface); }
      .vp-opt.is-selected .vp-radio { border-color: var(--brand); }
      .vp-opt.is-selected .vp-radio::after { content: ''; width: 10px; height: 10px; border-radius: 50%; background: var(--brand); }
      .vp-opt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
      .vp-opt-unit { font-size: 0.95rem; font-weight: 700; color: var(--ink); }
      .vp-opt-sub { font-size: 0.72rem; color: var(--muted); }
      .vp-opt-price { display: flex; align-items: baseline; gap: 6px; flex: 0 0 auto; }
      .vp-price { font-size: 1rem; font-weight: 800; color: var(--ink); }
      .vp-mrp { font-size: 0.78rem; color: var(--muted); text-decoration: line-through; }
      .vp-off { font-size: 0.66rem; font-weight: 700; color: var(--brand-dark); background: var(--brand-soft); padding: 2px 6px; border-radius: 6px; }
      .vp-oos-badge { font-size: 0.65rem; font-weight: 700; color: #b45309; background: #fef3c7; padding: 2px 6px; border-radius: 6px; }
      .vp-actions { position: sticky; bottom: 0; background: linear-gradient(180deg, transparent, var(--surface) 30%); padding-top: 10px; margin: 0 -16px -22px; padding-left: 16px; padding-right: 16px; padding-bottom: 22px; }
      .vp-add { width: 100%; min-height: 48px; border: 0; border-radius: 12px; background: var(--brand); color: #fff; font-weight: 700; font-size: 0.98rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 10px 24px rgba(22,163,74,.22); }
      .vp-add:hover { background: var(--brand-dark); }
      .vp-add:disabled { background: var(--line); color: var(--muted); box-shadow: none; cursor: not-allowed; }
      @media (min-width: 768px) {
        .vp-sheet { left: 50%; right: auto; bottom: auto; top: 50%; transform: translate(-50%, calc(-50% + 20px)); max-width: 440px; width: calc(100% - 32px); border-radius: 20px; opacity: 0; transition: opacity .18s ease, transform .22s cubic-bezier(.2,.7,.2,1); }
        .vp-sheet.open { transform: translate(-50%, -50%); opacity: 1; }
        .vp-actions { margin: 0; padding: 10px 0 0; background: transparent; position: static; }
        .vp-handle { display: none; }
      }
      @media (prefers-color-scheme: dark) {
        .vp-backdrop { background: rgba(0, 0, 0, 0.65); }
        .vp-oos-badge { color: #fde68a; background: rgba(180, 83, 9, 0.25); }
      }
    `;
    const style = document.createElement('style');
    style.id = 'bb-variant-picker-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureDom() {
    if (document.getElementById('vpSheet')) return;
    const html = `
      <div class="vp-backdrop" id="vpBackdrop" data-vp-close></div>
      <aside class="vp-sheet" id="vpSheet" role="dialog" aria-modal="true" aria-labelledby="vpTitle">
        <div class="vp-handle" aria-hidden="true"></div>
        <header class="vp-head">
          <div class="vp-thumb"><img id="vpThumb" alt=""></div>
          <div class="vp-title">
            <h4 id="vpTitle"></h4>
            <p id="vpSub">Choose a size</p>
          </div>
          <button type="button" class="vp-close" data-vp-close aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </header>
        <ul class="vp-list" id="vpList"></ul>
        <div class="vp-actions">
          <button type="button" class="vp-add" id="vpAddBtn">
            <i class="fa-solid fa-plus"></i> Add to basket
          </button>
        </div>
      </aside>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  }

  let currentProduct = null;
  let currentPick = null;
  let currentOnPick = null;

  function optionRow(v, isSelected) {
    const hasDisc = v.mrp > v.price;
    const disc = hasDisc ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0;
    const oos = v.inStock === false;
    return `
      <li class="vp-opt${isSelected ? ' is-selected' : ''}${oos ? ' is-oos' : ''}" data-variant-id="${escAttr(v.id)}">
        <span class="vp-radio" aria-hidden="true"></span>
        <div class="vp-opt-body">
          <span class="vp-opt-unit">${escHTML(v.unit)}</span>
          <span class="vp-opt-sub">${oos ? 'Currently out of stock' : (hasDisc ? `You save ${money(v.mrp - v.price)}` : 'Best value')}</span>
        </div>
        <div class="vp-opt-price">
          ${hasDisc ? `<span class="vp-off">${disc}% OFF</span>` : ''}
          <span class="vp-price">${money(v.price)}</span>
          ${hasDisc ? `<span class="vp-mrp">${money(v.mrp)}</span>` : ''}
          ${oos ? `<span class="vp-oos-badge">OOS</span>` : ''}
        </div>
      </li>
    `;
  }

  function renderList() {
    const list = document.getElementById('vpList');
    if (!list || !currentProduct) return;
    list.innerHTML = currentProduct.variants
      .map((v) => optionRow(v, currentPick && String(currentPick.id) === String(v.id)))
      .join('');
    const btn = document.getElementById('vpAddBtn');
    if (btn) btn.disabled = !currentPick || currentPick.inStock === false;
  }

  function open(product, onPick, opts) {
    if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return;
    ensureStyles();
    ensureDom();
    currentProduct = product;
    currentOnPick = onPick;
    const preferId = opts && opts.selectVariantId;
    currentPick =
      product.variants.find((v) => preferId && String(v.id) === String(preferId)) ||
      product.variants.find((v) => v.inStock !== false) ||
      product.variants[0];

    const thumb = document.getElementById('vpThumb');
    thumb.src = encPath(currentPick.image || product.image || '');
    thumb.alt = product.name;
    document.getElementById('vpTitle').textContent = product.name;
    document.getElementById('vpSub').textContent =
      product.variants.length === 1 ? 'Confirm to add' : `${product.variants.length} sizes available`;

    renderList();

    document.getElementById('vpBackdrop').classList.add('open');
    document.getElementById('vpSheet').classList.add('open');
    document.body.style.overflow = 'hidden';
    if (window.bbOverlay) window.bbOverlay.open('variant', close);
  }

  function close(fromHistory) {
    document.getElementById('vpBackdrop')?.classList.remove('open');
    document.getElementById('vpSheet')?.classList.remove('open');
    document.body.style.overflow = '';
    if (!fromHistory && window.bbOverlay) window.bbOverlay.close('variant');
    currentProduct = null;
    currentPick = null;
    currentOnPick = null;
  }

  // Delegated events
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-vp-close]')) {
      e.preventDefault();
      close();
      return;
    }
    const opt = e.target.closest('#vpList .vp-opt');
    if (opt && currentProduct) {
      if (opt.classList.contains('is-oos')) return;
      const id = opt.getAttribute('data-variant-id');
      const v = currentProduct.variants.find((x) => String(x.id) === String(id));
      if (v) {
        currentPick = v;
        const thumb = document.getElementById('vpThumb');
        if (thumb) thumb.src = encPath(v.image || currentProduct.image || '');
        renderList();
      }
      return;
    }
    if (e.target.closest('#vpAddBtn')) {
      e.preventDefault();
      if (!currentPick || currentPick.inStock === false) return;
      const cb = currentOnPick;
      const product = currentProduct;
      const pick = currentPick;
      close();
      if (typeof cb === 'function') cb(pick, product);
      return;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('vpSheet')?.classList.contains('open')) close();
  });

  window.bbVariantPicker = { open, close };
})();
