/**
 * Maintenance-mode renderer.
 * The authoritative flag lives at `bankibites_meta/bankimart_maintenance`
 * in Firestore — admin toggles it from the BankiBites Admin → Grocery
 * tab. Storefront pages check a localStorage cache synchronously for
 * a flash-free repeat visit, and fetch the fresh remote state in the
 * background. If cache and remote disagree, we save the fresh copy and
 * reload so the next paint matches reality.
 *
 * Load this AFTER config.js on any page that should honor the kill
 * switch. config.js itself no longer carries the flag; it just supplies
 * vendor branding used by the maintenance screen.
 */
// ── Live remote flag (Firestore) ────────────────────────────────────
// The authoritative maintenance state lives at
// `bankibites_meta/bankimart_maintenance` in Firestore — admin toggles
// it from BankiBites Admin → Partners. Strategy:
//   1. Sync check on load: read the cached flag from localStorage. If
//      it says on, render the maintenance screen immediately (repeat
//      visits during downtime never flash the storefront).
//   2. Async check: fetch fresh state from Firestore. First-visit
//      customers (empty cache) get the body hidden until the check
//      resolves, so they never see the shop flash. Live flips promote
//      the maintenance screen in-place without a full reload.
const REMOTE_KEY = 'bb_grocery_maintenance_v1';
function readCachedMaintenance() {
  try { return JSON.parse(localStorage.getItem(REMOTE_KEY)) || null; }
  catch { return null; }
}
// First-visit hide: if we have no cached answer yet, hide the body via
// a class on <html> until the async check confirms whether we're in
// maintenance mode. Injected before any rendering happens so no paint
// slips through. Safe to leave on repeat visits too (cache-hit code
// removes it as soon as the sync render runs).
(function guardFirstPaint() {
  const cached = readCachedMaintenance();
  if (cached) return;    // repeat visit — cache decides, no guard needed
  const style = document.createElement('style');
  style.id = 'bb-mm-guard';
  style.textContent = 'html.bb-mm-guard body{visibility:hidden !important}';
  (document.head || document.documentElement).appendChild(style);
  document.documentElement.classList.add('bb-mm-guard');
  // Fail-open: never trap the customer if the async check hangs.
  setTimeout(() => document.documentElement.classList.remove('bb-mm-guard'), 4000);
})();
function revealShop() {
  document.documentElement.classList.remove('bb-mm-guard');
  const s = document.getElementById('bb-mm-guard');
  if (s) s.remove();
}
// Reusable Firebase reader — the same named app used by other modules.
async function getMaintenanceReader() {
  const [{ initializeApp, getApps }, { getFirestore, doc, getDoc, onSnapshot }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js'),
  ]);
  let app = getApps().find(a => a.name === 'bankimart-reader');
  if (!app) {
    if (typeof CryptoJS === 'undefined') throw new Error('CryptoJS unavailable');
    const res = await fetch('https://akcreation-apps.com/TCD/credentials.json?v=' + Date.now());
    if (!res.ok) throw new Error('credentials fetch failed');
    const c = await res.json();
    const decrypt = v => CryptoJS.AES.decrypt(v, ['TCD','FOOD','CAFE'].join('-'))
      .toString(CryptoJS.enc.Utf8);
    app = initializeApp({
      apiKey:            decrypt(c.API_KEY),
      authDomain:        decrypt(c.AUTH_DOMAIN),
      projectId:         decrypt(c.ID),
      storageBucket:     decrypt(c.STORAGE_BUCKET),
      messagingSenderId: decrypt(c.MESSAGING_SENDER_ID),
      appId:             decrypt(c.APP_ID),
      measurementId:     decrypt(c.MEASUREMENT_ID),
    }, 'bankimart-reader');
  }
  const db = getFirestore(app);
  return { doc: doc(db, 'bankibites_meta', 'bankimart_maintenance'), getDoc, onSnapshot };
}

// Expose a live-reading helper so cart.js (checkout guard) can call it.
// Returns the last-known state synchronously; a fresh fetch runs whenever
// the caller invokes ensureFresh().
window.bbGroceryMaintenance = {
  cached: readCachedMaintenance,
  ensureFresh: async () => {
    try {
      const { doc: ref, getDoc } = await getMaintenanceReader();
      const snap = await getDoc(ref);
      const remote = snap.exists()
        ? { enabled: snap.data().enabled === true, title: snap.data().title || '', message: snap.data().message || '', eta: snap.data().eta || '' }
        : { enabled: false };
      try { localStorage.setItem(REMOTE_KEY, JSON.stringify(remote)); } catch {}
      return remote;
    } catch (err) {
      console.warn('[maintenance] fresh fetch failed:', err.message);
      return readCachedMaintenance() || { enabled: false };
    }
  },
};

// Kick off a LIVE subscription. Any admin flip pushes down in ~200 ms and
// we react in-place — go offline instantly, or reload back into the shop.
(function subscribeRemoteMaintenance() {
  const cached = readCachedMaintenance();
  const cachedOn = !!(cached && cached.enabled);
  getMaintenanceReader().then(({ doc: ref, onSnapshot }) => {
    let firstSnap = true;
    onSnapshot(ref, snap => {
      const remote = snap.exists()
        ? { enabled: snap.data().enabled === true, title: snap.data().title || '', message: snap.data().message || '', eta: snap.data().eta || '' }
        : { enabled: false };
      try { localStorage.setItem(REMOTE_KEY, JSON.stringify(remote)); } catch {}
      if (firstSnap) {
        firstSnap = false;
        if (remote.enabled && !window.BB_MAINTENANCE) {
          renderMaintenanceScreen(remote);
        } else if (!remote.enabled && cachedOn) {
          setTimeout(() => location.reload(), 200);
        } else {
          revealShop();
        }
        return;
      }
      // Subsequent snapshots — live flips.
      if (remote.enabled && !window.BB_MAINTENANCE) {
        renderMaintenanceScreen(remote);
      } else if (!remote.enabled && window.BB_MAINTENANCE) {
        location.reload();
      }
    }, err => {
      console.warn('[maintenance] subscribe failed:', err.message);
      revealShop();
    });
  }).catch(() => { revealShop(); });
})();

// Extract the maintenance-screen renderer so both the sync (cache-hit)
// path and the async (live-flip / first-visit) path can call it.
function renderMaintenanceScreen(M) {
  const CFG = window.BB_CONFIG || {};

  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const title = M.title || 'Restocking the shelves';
  const message = M.message || "We'll be back shortly.";
  const eta = M.eta || '';
  const vendor = CFG.vendorName || 'BankiBites Groceries';
  const family = CFG.familyBrand || '';
  const whatsappNumber = String(CFG.whatsappNumber || '').replace(/\D/g, '');
  const igUrl = CFG.instagramUrl || '';

  document.title = title + ' · ' + vendor;

  const css = `
    :root.mm-active,:root.mm-active body{margin:0;padding:0;height:100%;overflow:hidden;}
    :root.mm-active{
      --mm-bg:#F8FAFC;--mm-surface:#FFFFFF;--mm-ink:#0F172A;--mm-muted:#64748B;
      --mm-brand:#16A34A;--mm-brand-dark:#15803D;--mm-brand-soft:#DCFCE7;--mm-line:#E5E7EB;
    }
    @media (prefers-color-scheme:dark){
      :root.mm-active{
        --mm-bg:#0A0B0F;--mm-surface:#111318;--mm-ink:#F1F5F9;--mm-muted:#94A3B8;
        --mm-brand:#22C55E;--mm-brand-dark:#16A34A;--mm-brand-soft:rgba(34,197,94,.18);--mm-line:#26262B;
      }
    }
    .mm-stage{position:fixed;inset:0;overflow:hidden;background:var(--mm-bg);color:var(--mm-ink);
      display:grid;place-items:center;padding:24px;z-index:2147483647;
      font-family:'Manrope','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;}
    .mm-blobs{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
    .mm-blob{position:absolute;width:520px;height:520px;border-radius:50%;filter:blur(90px);opacity:.55;}
    @media (prefers-color-scheme:dark){.mm-blob{opacity:.32;}}
    .mm-blob-1{background:radial-gradient(circle,#86EFAC,transparent 70%);top:-180px;left:-160px;animation:mm-drift1 22s ease-in-out infinite;}
    .mm-blob-2{background:radial-gradient(circle,#93C5FD,transparent 70%);bottom:-220px;right:-200px;animation:mm-drift2 26s ease-in-out infinite;}
    .mm-blob-3{background:radial-gradient(circle,#FDE68A,transparent 70%);top:35%;left:42%;animation:mm-drift3 30s ease-in-out infinite;}
    @keyframes mm-drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(70px,90px) scale(1.15)}}
    @keyframes mm-drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-80px,-70px) scale(1.2)}}
    @keyframes mm-drift3{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-42%,-62%) scale(1.1)}}
    .mm-card{position:relative;z-index:1;max-width:480px;width:100%;
      padding:36px 28px 30px;border:1px solid var(--mm-line);border-radius:24px;
      background:color-mix(in srgb,var(--mm-surface) 78%,transparent);
      backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
      box-shadow:0 24px 70px rgba(15,23,42,.10);text-align:center;
      animation:mm-in .55s cubic-bezier(.2,.7,.2,1) both;}
    @media (prefers-color-scheme:dark){.mm-card{box-shadow:0 24px 70px rgba(0,0,0,.45);}}
    @keyframes mm-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    .mm-status{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;
      background:var(--mm-brand-soft);color:var(--mm-brand-dark);
      font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;margin-bottom:26px;}
    .mm-dot{width:7px;height:7px;border-radius:50%;background:var(--mm-brand);position:relative;}
    .mm-dot::after{content:"";position:absolute;inset:0;border-radius:50%;background:var(--mm-brand);
      animation:mm-pulse 1.8s ease-out infinite;}
    @keyframes mm-pulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.8);opacity:0}}
    .mm-visual{position:relative;width:132px;height:132px;margin:0 auto 26px;
      display:grid;place-items:center;}
    /* Concentric ripple rings — expand from the logo outward and fade. */
    .mm-ripple{position:absolute;top:50%;left:50%;width:100%;height:100%;
      border-radius:50%;border:2px solid var(--mm-brand);
      transform:translate(-50%,-50%) scale(.55);opacity:0;
      animation:mm-ripple 2.8s cubic-bezier(.2,.7,.2,1) infinite;}
    .mm-r-2{animation-delay:.9s;}
    .mm-r-3{animation-delay:1.8s;}
    @keyframes mm-ripple{
      0%{transform:translate(-50%,-50%) scale(.55);opacity:.55;border-width:2px;}
      70%{opacity:.15;}
      100%{transform:translate(-50%,-50%) scale(1.6);opacity:0;border-width:1px;}
    }
    .mm-basket{position:relative;z-index:1;width:72%;height:72%;border-radius:50%;
      background:var(--mm-brand-soft);
      display:grid;place-items:center;overflow:hidden;
      box-shadow:0 8px 24px rgba(22,163,74,.18);
      animation:mm-bob 2.6s ease-in-out infinite;}
    @media (prefers-color-scheme:dark){.mm-basket{box-shadow:0 8px 24px rgba(0,0,0,.4);}}
    .mm-basket img{width:74%;height:74%;object-fit:contain;display:block;}
    @keyframes mm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
    .mm-title{font-size:clamp(1.55rem,5.8vw,2.15rem);font-weight:800;letter-spacing:-.02em;line-height:1.15;
      margin:0 0 12px;background:linear-gradient(90deg,var(--mm-ink) 0%,var(--mm-brand-dark) 45%,var(--mm-ink) 90%);
      background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;
      animation:mm-sheen 5s linear infinite;}
    @keyframes mm-sheen{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .mm-lede{font-size:.94rem;line-height:1.55;color:var(--mm-muted);margin:0 auto 22px;max-width:38ch;}
    .mm-eta{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:12px;
      border:1px solid var(--mm-line);background:color-mix(in srgb,var(--mm-surface) 88%,transparent);
      font-size:.86rem;font-weight:600;color:var(--mm-ink);margin-bottom:22px;}
    .mm-eta i{color:var(--mm-brand);}
    .mm-support{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:20px;}
    .mm-support a{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:999px;
      background:var(--mm-brand-soft);color:var(--mm-brand-dark);font-size:.82rem;font-weight:700;
      text-decoration:none;transition:transform .15s,background .15s;}
    .mm-support a:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--mm-brand) 25%,var(--mm-brand-soft));}
    .mm-signoff{font-size:.68rem;color:var(--mm-muted);letter-spacing:.14em;text-transform:uppercase;
      display:flex;align-items:center;justify-content:center;gap:6px;}
    .mm-signoff strong{color:var(--mm-ink);font-weight:700;}
    .mm-signoff .mm-heart{color:#EF4444;}
    /* Mobile default — the two wrappers act as pass-through containers so
       the status pill, visual, and content flow top-to-bottom exactly as
       before. Overridden below at >=780px to become grid columns. */
    .mm-card-visual, .mm-card-content { display: contents; }
    @media (prefers-reduced-motion:reduce){
      .mm-blob,.mm-basket,.mm-ripple,.mm-title,.mm-dot::after,.mm-card{animation:none!important;}
      .mm-ripple{opacity:.2;}
    }
    @media (max-width:400px){
      .mm-visual{width:112px;height:112px;}
      .mm-card{padding:30px 22px 24px;border-radius:20px;}
    }
    /* ── Desktop / large tablet — two-column hero layout ─────────────
       Above 780px the card stretches wide with the animated visual on the
       left and the message column on the right. Typography scales up,
       spacing breathes, and a subtle dot grid sits behind everything for
       polish. Mobile styles (default) stay untouched. */
    @media (min-width:780px){
      .mm-stage{
        padding:40px;
        background:
          radial-gradient(circle at 20% 20%, rgba(134,239,172,.12), transparent 40%),
          radial-gradient(circle at 80% 80%, rgba(147,197,253,.10), transparent 40%),
          var(--mm-bg);
      }
      .mm-stage::before{
        content:"";position:absolute;inset:0;pointer-events:none;
        background-image:radial-gradient(rgba(15,23,42,.05) 1px, transparent 1px);
        background-size:24px 24px;
        mask-image:radial-gradient(ellipse at center, black 40%, transparent 80%);
        -webkit-mask-image:radial-gradient(ellipse at center, black 40%, transparent 80%);
      }
      @media (prefers-color-scheme:dark){
        .mm-stage::before{background-image:radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px);}
      }
      .mm-card{
        max-width:920px;
        display:grid;grid-template-columns:minmax(280px,380px) 1fr;
        gap:56px;align-items:center;text-align:left;
        padding:56px 60px;border-radius:32px;
      }
      .mm-card-visual{display:flex;flex-direction:column;align-items:flex-start;gap:24px;}
      .mm-card-content{display:block;min-width:0;}
      .mm-visual{
        width:220px;height:220px;margin:0;
      }
      .mm-card-visual .mm-status{margin-bottom:0;font-size:12px;padding:8px 14px;}
      .mm-title{
        font-size:clamp(2.4rem,3.6vw,3.2rem);
        line-height:1.1;
        margin:0 0 18px;
      }
      .mm-lede{
        font-size:1.05rem;line-height:1.65;
        margin:0 0 28px;max-width:52ch;
      }
      .mm-eta{
        font-size:.95rem;padding:11px 18px;margin-bottom:28px;
      }
      .mm-support{
        justify-content:flex-start;gap:10px;margin-bottom:24px;
      }
      .mm-support a{padding:10px 16px;font-size:.86rem;}
      .mm-signoff{
        justify-content:flex-start;font-size:.72rem;letter-spacing:.16em;
      }
    }
    /* Extra-wide screens — a touch more max-width, no other changes. */
    @media (min-width:1200px){
      .mm-card{max-width:1040px;padding:64px 72px;gap:72px;}
      .mm-visual{width:240px;height:240px;}
    }
  `;

  const support = [
    whatsappNumber
      ? `<a href="https://wa.me/${esc(whatsappNumber)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> Chat on WhatsApp</a>`
      : '',
    igUrl
      ? `<a href="${esc(igUrl)}" target="_blank" rel="noopener"><i class="fa-brands fa-instagram"></i> Instagram</a>`
      : '',
  ]
    .filter(Boolean)
    .join('');

  const markup = `
    <style id="mmStyles">${css}</style>
    <div class="mm-stage" role="status" aria-live="polite">
      <div class="mm-blobs" aria-hidden="true">
        <span class="mm-blob mm-blob-1"></span>
        <span class="mm-blob mm-blob-2"></span>
        <span class="mm-blob mm-blob-3"></span>
      </div>
      <main class="mm-card">
        <div class="mm-card-visual">
          <div class="mm-status"><span class="mm-dot"></span> System restocking · Live</div>
          <div class="mm-visual" aria-hidden="true">
            <span class="mm-ripple mm-r-1"></span>
            <span class="mm-ripple mm-r-2"></span>
            <span class="mm-ripple mm-r-3"></span>
            <div class="mm-basket"><img src="images/logo.png" alt="${esc(vendor)}"></div>
          </div>
        </div>
        <div class="mm-card-content">
          <h1 class="mm-title">${esc(title)}</h1>
          <p class="mm-lede">${esc(message)}</p>
          ${eta ? `<div class="mm-eta"><i class="fa-solid fa-clock"></i> ${esc(eta)}</div>` : ''}
          ${support ? `<div class="mm-support">${support}</div>` : ''}
          <div class="mm-signoff">
            <strong>${esc(vendor)}</strong>${family ? ` · A ${esc(family)} family brand` : ''} · Made in Odisha <span class="mm-heart">❤</span>
          </div>
        </div>
      </main>
    </div>
  `;

  const apply = () => {
    document.documentElement.classList.add('mm-active');
    document.body.innerHTML = markup;
    // Prevent later scripts (cart.js, main.js, search.js) from touching state
    // or fetching data — they will still execute, but this flag lets us guard
    // side-effects that might be expensive or noisy.
    window.BB_MAINTENANCE = true;
    // The maintenance markup is our new visible content — drop the first-
    // visit guard so it can render.
    revealShop();
  };

  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
}

// Sync entry — repeat visits during downtime render the maintenance
// screen instantly from the cached flag, no fetch needed.
(function renderMaintenanceIfCached() {
  const M = readCachedMaintenance() || {};
  if (M.enabled) renderMaintenanceScreen(M);
})();
