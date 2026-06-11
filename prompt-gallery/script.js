// ============================================================
// AI Image Prompt Gallery — render + interactions
// Catalog data lives in prompts-data.js (free prompts) + Firestore (member).
// ============================================================

import { PROMPTS } from "./prompts-data.js?v=20260611k";


// ============================================================

const $grid    = document.getElementById('grid');
const $empty   = document.getElementById('empty');
const $search  = document.getElementById('search');
const $toast   = document.getElementById('toast');
const $light   = document.getElementById('lightbox');
const $lightImg = document.getElementById('lightbox-img');

// Hoisted so cardHTML can reference it on first render (before favorites load).
const FAVORITES = new Set();

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Extract unique placeholders like {first_name} from a prompt string.
function extractPlaceholders(text) {
  const out = [];
  const seen = new Set();
  const re = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); out.push(m[1]); }
  }
  return out;
}

// Resolve placeholders for any prompt — uses metadata for member
// prompts (since their text isn't shipped to the client).
function getPlaceholders(p) {
  if (Array.isArray(p.placeholders)) return p.placeholders;
  if (typeof p.prompt === 'string') return extractPlaceholders(p.prompt);
  return [];
}

// "first_name" -> "First Name"
function prettifyLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Normalize a placeholder entry to {name, label, default}.
// Entries can be plain strings (legacy) or objects with label/default.
function phMeta(entry) {
  if (typeof entry === 'string') {
    return { name: entry, label: prettifyLabel(entry), default: '' };
  }
  return {
    name: entry.name,
    label: entry.label || prettifyLabel(entry.name),
    default: entry.default != null ? String(entry.default) : ''
  };
}

function cardHTML(p) {
  const bestIn = (p.models && p.models.length)
    ? `<div class="best-in" title="${escapeHtml('Best results in ' + p.models.join(', '))}">
         <i class="fas fa-wand-magic-sparkles"></i>
         <span>Best in <strong>${p.models.map(escapeHtml).join(', ')}</strong></span>
       </div>`
    : '';

  const hasPh = getPlaceholders(p).length > 0;
  const btnLabel = hasPh
    ? '<i class="fas fa-wand-magic-sparkles"></i> Generate Prompt'
    : '<i class="far fa-copy"></i> Copy Prompt';

  const memberBadge = p.tier === 'member'
    ? '<span class="member-badge" title="Members-only prompt" aria-label="Members-only prompt"><i class="fas fa-crown" aria-hidden="true"></i></span>'
    : '';
  const favActive = FAVORITES.has(p.id) ? ' active' : '';
  const favIcon = favActive ? 'fas' : 'far';

  return `
    <article class="card-p" data-id="${p.id}">
      <div class="card-img-wrap">
        <button class="card-img" data-img="${escapeHtml(p.image)}" data-title="Demo preview for ${escapeHtml(p.title)}" aria-label="Preview ${escapeHtml(p.title)}">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)} AI image prompt demo result" loading="lazy"
               onerror="this.style.background='linear-gradient(135deg,#ede9fe,#e0e7ff)';this.removeAttribute('src');this.alt='Demo image coming soon';">
        </button>
        ${memberBadge}
        <button type="button" class="fav-btn${favActive}" data-fav="${p.id}" aria-label="Toggle favorite" aria-pressed="${favActive ? 'true' : 'false'}">
          <i class="${favIcon} fa-heart" aria-hidden="true"></i>
        </button>
      </div>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(p.title)}</h3>
        ${bestIn}
        ${p.notes ? `<div class="card-notes" title="${escapeHtml(p.notes)}">${escapeHtml(p.notes)}</div>` : ''}
        <button class="copy-btn" data-copy="${p.id}">${btnLabel}</button>
      </div>
    </article>
  `;
}

// Apply user values to placeholder tokens.
function fillPrompt(rawPrompt, values) {
  return rawPrompt.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (_, k) =>
    values[k] !== undefined ? values[k] : `{${k}}`
  );
}

function render(list) {
  $grid.innerHTML = list.map(cardHTML).join('');
  $empty.hidden = list.length > 0;
}

let currentFilter = 'all';
function applyFilter() {
  const q = $search.value.trim().toLowerCase();
  let list = PROMPTS;
  if (currentFilter === 'member') {
    list = list.filter(p => p.tier === 'member');
  } else if (currentFilter === 'favorites') {
    list = list.filter(p => FAVORITES.has(p.id));
  }
  if (q) {
    list = list.filter(p => {
      const hay = [
        p.title,
        ...(p.tags || []),
        ...(p.models || [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  render(list);
  // Update empty-state message contextually
  if (list.length === 0) {
    if (currentFilter === 'favorites') $empty.textContent = 'No favorites yet. Tap the heart on any prompt to save it here.';
    else if (currentFilter === 'member') $empty.textContent = 'No member-only prompts match your search.';
    else $empty.textContent = 'No prompts match your search.';
  }
}

// ===== Copy =====
// Robust clipboard write. Accepts either a string OR a Promise<string>.
// When a Promise is passed, we use the deferred-ClipboardItem API so the
// user-gesture token survives awaits (Firestore reads, credit consume, etc).
// Without this, member-prompt copies fail on iOS Safari & strict browsers
// because navigator.clipboard.writeText rejects after any await boundary.
async function copyText(textOrPromise) {
  const isPromise = textOrPromise && typeof textOrPromise.then === 'function';
  const hasDeferred = typeof window.ClipboardItem !== 'undefined' &&
                      navigator.clipboard && typeof navigator.clipboard.write === 'function';

  if (isPromise && hasDeferred) {
    try {
      const blobPromise = Promise.resolve(textOrPromise).then(t =>
        new Blob([String(t == null ? '' : t)], { type: 'text/plain' })
      );
      // Browsers preserve the gesture token until this promise resolves.
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blobPromise })]);
      return true;
    } catch (err) {
      // If the inner promise rejected, propagate so the caller can show
      // a meaningful toast (e.g. "out of credits"). Plain clipboard
      // failures fall through to the legacy writeText path below.
      const innerError = await Promise.resolve(textOrPromise).catch(e => e);
      if (innerError instanceof Error) throw innerError;
      console.warn('[prompt-gallery] deferred clipboard write failed; falling back', err);
    }
  }

  const text = isPromise ? await Promise.resolve(textOrPromise) : textOrPromise;
  if (text == null) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return ok;
  }
}

let toastTimer;
function showToast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 1800);
}

// ===== Lightbox =====
function openLightbox(src, alt) {
  $lightImg.src = src;
  $lightImg.alt = alt || '';
  if (typeof $light.showModal === 'function') {
    $light.showModal();
  } else {
    $light.setAttribute('open', '');
  }
}
function closeLightbox() {
  if (typeof $light.close === 'function') $light.close();
  else $light.removeAttribute('open');
  $lightImg.removeAttribute('src');
}

$light.addEventListener('click', (e) => {
  if (e.target === $light || e.target.closest('.lightbox-close')) closeLightbox();
});

// ===== Placeholder dialog =====
const $phDialog = document.getElementById('ph-dialog');
const $phForm   = document.getElementById('ph-form');
const $phFields = document.getElementById('ph-dialog-fields');
let activePrompt = null;

function openPhDialog(p) {
  activePrompt = p;
  const placeholders = getPlaceholders(p).map(phMeta);
  $phFields.innerHTML = placeholders.map((meta, i) => `
    <label class="ph-field">
      <span>${escapeHtml(meta.label)}</span>
      <input type="text" name="${escapeHtml(meta.name)}" value="${escapeHtml(meta.default)}" placeholder="Enter ${escapeHtml(meta.label.toLowerCase())}" autocomplete="off" ${i === 0 ? 'autofocus' : ''}>
    </label>
  `).join('');
  document.getElementById('ph-dialog-title').textContent = p.title;
  if (typeof $phDialog.showModal === 'function') $phDialog.showModal();
  else $phDialog.setAttribute('open', '');
  setTimeout(() => $phFields.querySelector('input')?.focus(), 30);
}

function closePhDialog() {
  if (typeof $phDialog.close === 'function') $phDialog.close();
  else $phDialog.removeAttribute('open');
  activePrompt = null;
  $phFields.innerHTML = '';
}

$phDialog.addEventListener('click', (e) => {
  if (e.target === $phDialog) closePhDialog();
  if (e.target.closest('.ph-dialog-close') || e.target.closest('[data-cancel]')) closePhDialog();
});

// ===== How-to-use dialog (shown after a successful copy) =====
const $howto       = document.getElementById('howto-dialog');
const $howtoText   = document.getElementById('howto-prompt-text');
const $howtoNote   = document.getElementById('howto-image-note');
const $howtoSub    = document.getElementById('howto-sub');
const $howtoCopyBtn = document.getElementById('howto-copy-again');

function openHowToDialog(p, promptText, extraSub) {
  if (!p) return;
  if (!promptText) {
    // Defensive — copy succeeded but text was unexpectedly empty. Toast
    // so the user at least gets confirmation instead of total silence.
    showToast(extraSub ? `Prompt copied! ${extraSub}` : 'Prompt copied!');
    return;
  }
  $howtoText.value = promptText;
  const noteSpan = $howtoNote.querySelector('span');
  if (p.notes && p.notes.trim()) {
    noteSpan.textContent = p.notes;
    $howtoNote.hidden = false;
  } else {
    noteSpan.textContent = 'Upload a clear, well-lit photo for best results.';
    $howtoNote.hidden = false;
  }
  $howtoSub.innerHTML = (extraSub ? `<span class="howto-extra">${escapeHtml(extraSub)}</span> &middot; ` : '')
    + `Heads up — this is a <strong>prompt-only tool</strong>. We don't make the image for you. Use ChatGPT (or Gemini) to generate it from your photo + this prompt.`;
  if (typeof $howto.showModal === 'function') $howto.showModal();
  else $howto.setAttribute('open', '');
}

function closeHowToDialog() {
  if (typeof $howto.close === 'function') $howto.close();
  else $howto.removeAttribute('open');
}

$howto.addEventListener('click', (e) => {
  if (e.target === $howto) closeHowToDialog();
  if (e.target.closest('[data-howto-close]') || e.target.closest('.ph-dialog-close')) closeHowToDialog();
});

const _howtoCopyOriginalHTML = $howtoCopyBtn.innerHTML;
let _howtoCopyResetTimer = null;
$howtoCopyBtn.addEventListener('click', async () => {
  const text = $howtoText.value;
  if (!text) return;
  $howtoText.select();
  try {
    const ok = await copyText(text);
    if (ok) {
      $howtoCopyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      clearTimeout(_howtoCopyResetTimer);
      _howtoCopyResetTimer = setTimeout(() => {
        $howtoCopyBtn.innerHTML = _howtoCopyOriginalHTML;
      }, 1400);
    } else {
      showToast('Could not copy — select the text and press Ctrl+C');
    }
  } catch {
    showToast('Could not copy — select the text and press Ctrl+C');
  }
});

// ---- Global body.dialog-open toggling -----------------------------
// Add a `dialog-open` class on <body> whenever ANY ph-dialog is open so
// CSS can hide overlapping fixed elements (user widget, anon counter)
// that would otherwise render on top of the dialog on older iOS Safari.
function refreshDialogOpenClass() {
  const anyOpen = !!document.querySelector('dialog.ph-dialog[open]');
  document.body.classList.toggle('dialog-open', anyOpen);
}
const _dialogObs = new MutationObserver(refreshDialogOpenClass);
document.querySelectorAll('dialog.ph-dialog').forEach(d => {
  _dialogObs.observe(d, { attributes: true, attributeFilter: ['open'] });
});
refreshDialogOpenClass();

$phForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activePrompt) return;
  const data = new FormData($phForm);
  const values = {};
  for (const [k, v] of data.entries()) values[k] = String(v).trim();
  const copiedPrompt = activePrompt;
  const phSubmitBtn = $phForm.querySelector('button[type="submit"]');
  const _phOrigLabel = phSubmitBtn ? phSubmitBtn.innerHTML : '';
  if (phSubmitBtn) {
    phSubmitBtn.classList.add('loading');
    phSubmitBtn.disabled = true;
    phSubmitBtn.innerHTML = '<span class="spinner"></span> Working…';
  }

  // Use deferred-ClipboardItem so the user-gesture survives the Firestore
  // credit-consume and prompt-fetch awaits below.
  let accessResult = null;
  let loadError = null;
  const textPromise = ensureCopyAccess(copiedPrompt).then(access => {
    accessResult = access;
    if (!access.ok) throw new Error('access-denied');
    return getPromptText(copiedPrompt);
  }).then(rawText => fillPrompt(rawText, values))
    .catch(err => {
      if (err && err.message !== 'access-denied') loadError = err;
      throw err;
    });

  let ok = false;
  try { ok = await copyText(textPromise); } catch { ok = false; }
  if (phSubmitBtn) {
    phSubmitBtn.classList.remove('loading');
    phSubmitBtn.disabled = false;
    phSubmitBtn.innerHTML = _phOrigLabel;
  }
  closePhDialog();

  if (accessResult && !accessResult.ok) return;
  if (loadError) {
    console.error('[prompt-gallery] failed to load prompt text', loadError);
    showToast('Could not load this prompt. Please try again.');
    return;
  }
  const subInfo = accessResult && accessResult.creditUsed
    ? `${accessResult.creditsLeft} credit${accessResult.creditsLeft === 1 ? '' : 's'} left`
    : '';
  let resolvedText = '';
  try { resolvedText = await Promise.resolve(textPromise); } catch {}
  if (ok) {
    openHowToDialog(copiedPrompt, resolvedText, subInfo);
    if (typeof recordCopy === 'function') recordCopy(copiedPrompt);
  } else if (resolvedText) {
    // Clipboard write failed but the prompt text loaded — still show the
    // dialog so the user can select & copy manually from the textarea.
    showToast('Auto-copy blocked — copy from the box below');
    openHowToDialog(copiedPrompt, resolvedText, subInfo);
    if (typeof recordCopy === 'function') recordCopy(copiedPrompt);
  } else {
    showToast('Could not copy — please copy manually');
  }
});

// ===== Event delegation =====
$grid.addEventListener('click', async (e) => {
  const favBtn = e.target.closest('.fav-btn');
  if (favBtn) {
    e.preventDefault();
    e.stopPropagation();
    if (typeof toggleFavorite === 'function') toggleFavorite(favBtn.dataset.fav, favBtn);
    return;
  }
  const imgBtn = e.target.closest('.card-img');
  if (imgBtn) {
    openLightbox(imgBtn.dataset.img, imgBtn.dataset.title);
    return;
  }
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const p = PROMPTS.find(x => x.id === copyBtn.dataset.copy);
    if (!p) return;
    if (getPlaceholders(p).length > 0) {
      openPhDialog(p);
      return;
    }
    // Use a stable label rather than the current innerHTML — if the user
    // re-clicks while the button is still showing "Copied!" from a previous
    // run, capturing innerHTML would lock it as "Copied!" forever.
    const _origLabel = '<i class="far fa-copy"></i> Copy Prompt';
    if (copyBtn._copyResetTimer) { clearTimeout(copyBtn._copyResetTimer); copyBtn._copyResetTimer = null; }
    copyBtn.classList.remove('copied');
    copyBtn.classList.add('loading');
    copyBtn.disabled = true;
    copyBtn.innerHTML = '<span class="spinner"></span> Working…';
    // Run access check + text fetch as a Promise that resolves with the
    // raw prompt text. Pass the *promise* (not the resolved text) into
    // copyText so the deferred-ClipboardItem API preserves the user-gesture
    // across the Firestore credit-consume and prompt-fetch awaits.
    let accessResult = null;
    let loadError = null;
    const textPromise = ensureCopyAccess(p).then(access => {
      accessResult = access;
      if (!access.ok) throw new Error('access-denied');
      return getPromptText(p);
    }).catch(err => {
      if (err && err.message !== 'access-denied') loadError = err;
      throw err;
    });

    let ok = false;
    try {
      ok = await copyText(textPromise);
    } catch {
      ok = false;
    }
    // Always clear the loading state — even on access-denied or load-error
    // early returns, otherwise the button stays stuck on "Working…".
    copyBtn.classList.remove('loading');
    copyBtn.disabled = false;
    copyBtn.innerHTML = _origLabel;

    if (accessResult && !accessResult.ok) return; // ensureCopyAccess already toasted
    if (loadError) {
      console.error('[prompt-gallery] failed to load prompt text', loadError);
      showToast('Could not load this prompt. Please try again.');
      return;
    }
    const subInfo = accessResult && accessResult.creditUsed
      ? `${accessResult.creditsLeft} credit${accessResult.creditsLeft === 1 ? '' : 's'} left`
      : '';
    let resolvedText = '';
    try { resolvedText = await Promise.resolve(textPromise); } catch {}
    if (ok) {
      openHowToDialog(p, resolvedText, subInfo);
      copyBtn.classList.add('copied');
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      copyBtn._copyResetTimer = setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = _origLabel;
        copyBtn._copyResetTimer = null;
      }, 1600);
      if (typeof recordCopy === 'function') recordCopy(p);
    } else if (resolvedText) {
      showToast('Auto-copy blocked — copy from the box below');
      openHowToDialog(p, resolvedText, subInfo);
      if (typeof recordCopy === 'function') recordCopy(p);
    } else {
      showToast('Could not copy — please copy manually');
    }
  }
});

$search.addEventListener('input', applyFilter);

// Initial render
render(PROMPTS);

// ============================================================
// ===== Signup gate: Google Sign-In (Firebase) + phone =======
// ============================================================
// Reuses the encrypted credentials in /TCD/credentials.json
// (decryption key = 'TCD-FOOD-CAFE'). Stores signups in the
// Firestore collection `prompt_gallery_users/{uid}`.
// ------------------------------------------------------------

import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut,
  reauthenticateWithPopup, deleteUser,
  setPersistence, browserLocalPersistence, indexedDBLocalPersistence, inMemoryPersistence
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, serverTimestamp, increment,
  collection, addDoc, getDocs, query, orderBy, limit, writeBatch, runTransaction
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';

const PG_COLLECTION = 'prompt_gallery_users';
const LS_KEY = 'pg_user';                  // { uid, email, phone }

// Firebase web config lives in a sibling JSON file. It's intentionally
// public — web configs are not secrets; Firestore rules + Auth are.
const FIREBASE_CONFIG_URL = './firebase-config.json';

let _fbPromise = null;
function getFirebase() {
  if (_fbPromise) return _fbPromise;
  _fbPromise = (async () => {
    const r = await fetch(`${FIREBASE_CONFIG_URL}?v=${Date.now()}`);
    if (!r.ok) throw new Error('Failed to load Firebase config (' + r.status + ')');
    const raw = await r.json();
    // Strip the optional _comment field and any unfilled placeholders so we
    // fail loudly if the file was deployed without real values.
    const cfg = {
      apiKey:            raw.apiKey,
      authDomain:        raw.authDomain,
      projectId:         raw.projectId,
      storageBucket:     raw.storageBucket,
      messagingSenderId: raw.messagingSenderId,
      appId:             raw.appId,
      measurementId:     raw.measurementId,
    };
    for (const [k, v] of Object.entries(cfg)) {
      if (!v || String(v).startsWith('REPLACE_ME')) {
        throw new Error(`Firebase config field "${k}" is not set — edit prompt-gallery/firebase-config.json`);
      }
    }
    const app = getApps().find(a => a.name === 'prompt-gallery')
              || initializeApp(cfg, 'prompt-gallery');
    const auth = getAuth(app);
    for (const opt of [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence]) {
      try { await setPersistence(auth, opt); break; } catch {}
    }
    return { app, auth, db: getFirestore(app) };
  })().catch(err => { _fbPromise = null; throw err; });
  return _fbPromise;
}

function readSavedUser() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw);
    return (u && u.uid && u.phone) ? u : null;
  } catch { return null; }
}

function saveUser(u) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(u)); } catch {}
}

// ----- Dialog elements -----
const $authDialog  = document.getElementById('auth-dialog');
const $authForm    = document.getElementById('auth-form');
const $authGoogle  = document.getElementById('auth-google-btn');
const $authSubmit  = document.getElementById('auth-submit');
const $authPhone   = document.getElementById('auth-phone');
const $authError   = document.getElementById('auth-error');
const $stepGoogle  = document.getElementById('auth-step-google');
const $stepPhone   = document.getElementById('auth-step-phone');
const $authAvatar  = document.getElementById('auth-avatar');
const $authName    = document.getElementById('auth-name');
const $authEmail   = document.getElementById('auth-email');

let pendingResolve = null;
let signedInUser = null; // { uid, email, name, photoURL }

function openAuthDialog() {
  if (typeof $authDialog.showModal === 'function') $authDialog.showModal();
  else $authDialog.setAttribute('open', '');
}
function closeAuthDialog(result) {
  if (typeof $authDialog.close === 'function') $authDialog.close();
  else $authDialog.removeAttribute('open');
  if (pendingResolve) { pendingResolve(result === true); pendingResolve = null; }
}

function showAuthError(msg) {
  $authError.textContent = msg;
  $authError.hidden = false;
}
function clearAuthError() {
  $authError.textContent = '';
  $authError.hidden = true;
}

$authDialog.addEventListener('click', (e) => {
  if (e.target === $authDialog) closeAuthDialog(false);
  if (e.target.closest('[data-auth-cancel]')) closeAuthDialog(false);
});
$authDialog.addEventListener('close', () => {
  if (pendingResolve) { pendingResolve(false); pendingResolve = null; }
});
$authDialog.addEventListener('cancel', (e) => {
  // ESC key — let it close, our 'close' handler resolves
});

$authPhone.addEventListener('input', () => {
  $authPhone.value = $authPhone.value.replace(/\D/g, '').slice(0, 10);
  $authSubmit.disabled = !(signedInUser && /^[6-9]\d{9}$/.test($authPhone.value));
  if (!$authError.hidden) clearAuthError();
});

$authGoogle.addEventListener('click', async () => {
  clearAuthError();
  $authGoogle.disabled = true;
  $authGoogle.querySelector('span').textContent = 'Opening Google…';
  try {
    const { auth, db } = await getFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const u = cred.user;
    signedInUser = {
      uid: u.uid,
      email: u.email || '',
      name: u.displayName || '',
      photoURL: u.photoURL || ''
    };

    // Returning user? If a doc with a phone already exists, skip the phone
    // step entirely — log them straight in and close the dialog.
    try {
      const snap = await getDoc(doc(db, PG_COLLECTION, u.uid));
      if (snap.exists() && snap.data()?.phone) {
        const data = snap.data();
        saveUser({
          uid: u.uid,
          email: u.email || '',
          name: data.name || u.displayName || '',
          photoURL: data.photoURL || u.photoURL || '',
          phone: data.phone,
        });
        // Touch last_seen, but don't block the UI on it
        setDoc(doc(db, PG_COLLECTION, u.uid), { last_seen: serverTimestamp() }, { merge: true })
          .catch(() => {});
        renderUserWidget();
        if (typeof loadCredits === 'function') loadCredits();
        if (typeof loadFavorites === 'function') loadFavorites();
        if (typeof renderAnonCounter === 'function') renderAnonCounter();
        closeAuthDialog(true);
        showToast(`Welcome back, ${(data.name || u.displayName || '').split(' ')[0] || 'friend'}!`);
        return;
      }
    } catch (err) {
      // If the lookup fails (e.g., transient network), fall through to the
      // phone step. Worst case the user re-enters their existing phone, and
      // the merge-write will be idempotent.
      console.warn('[prompt-gallery] returning-user lookup failed; showing phone step', err);
    }

    // First-time signup — collect phone.
    $authAvatar.src = signedInUser.photoURL || '';
    $authName.textContent = signedInUser.name || 'Signed in';
    $authEmail.textContent = signedInUser.email;
    $stepGoogle.hidden = true;
    $stepPhone.hidden = false;
    setTimeout(() => $authPhone.focus(), 30);
  } catch (err) {
    console.error('[prompt-gallery] Google sign-in failed', err);
    showAuthError(err?.code === 'auth/popup-closed-by-user'
      ? 'Sign-in cancelled. Please try again.'
      : 'Could not sign in. Please try again.');
    $authGoogle.disabled = false;
    $authGoogle.querySelector('span').textContent = 'Sign in with Google';
  }
});

$authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!signedInUser) return;
  const phone10 = $authPhone.value.trim();
  if (!/^[6-9]\d{9}$/.test(phone10)) {
    showAuthError('Enter a valid 10-digit Indian mobile number.');
    return;
  }
  $authSubmit.disabled = true;
  $authSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
  try {
    const phoneE164 = '+91' + phone10;
    // Phone uniqueness: refuse if another uid already owns this phone.
    const claimed = await claimPhoneIndex(phoneE164, signedInUser.uid);
    if (!claimed) {
      showAuthError('This phone number is already linked to another account. Please log in with that Google account, or use a different phone.');
      $authSubmit.disabled = false;
      $authSubmit.innerHTML = '<i class="fas fa-unlock"></i> Unlock prompts';
      return;
    }
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, signedInUser.uid);
    const existing = await getDoc(ref);
    const payload = {
      email: signedInUser.email,
      name: signedInUser.name,
      photoURL: signedInUser.photoURL,
      phone: '+91' + phone10,
      last_seen: serverTimestamp(),
    };
    if (!existing.exists()) {
      payload.created_at = serverTimestamp();
      payload.copy_count = 0;
      payload.free_credits = FREE_CREDITS_PER_MONTH;
      payload.paid_credits = 0;
      payload.credits_reset_at = serverTimestamp();
      payload.signup_day = new Date().getDate();
    }
    await setDoc(ref, payload, { merge: true });
    saveUser({
      uid: signedInUser.uid,
      email: signedInUser.email,
      name: signedInUser.name,
      photoURL: signedInUser.photoURL,
      phone: '+91' + phone10,
    });
    renderUserWidget();
    if (typeof loadCredits === 'function') loadCredits();
    if (typeof loadFavorites === 'function') loadFavorites();
    if (typeof renderAnonCounter === 'function') renderAnonCounter();
    closeAuthDialog(true);
  } catch (err) {
    console.error('[prompt-gallery] save signup failed', err);
    showAuthError('Could not save your details. Please check your connection and try again.');
    $authSubmit.disabled = false;
    $authSubmit.innerHTML = '<i class="fas fa-unlock"></i> Unlock prompts';
  }
});

// Reset dialog to step 1 every time it opens fresh
function resetAuthDialog() {
  clearAuthError();
  signedInUser = null;
  $stepGoogle.hidden = false;
  $stepPhone.hidden = true;
  $authGoogle.disabled = false;
  $authGoogle.querySelector('span').textContent = 'Sign in with Google';
  $authPhone.value = '';
  $authSubmit.disabled = true;
  $authSubmit.innerHTML = '<i class="fas fa-unlock"></i> Unlock prompts';
}

// Public gate — call before revealing/copying any prompt.
function ensureAuthed() {
  if (readSavedUser()) return Promise.resolve(true);
  return new Promise((resolve) => {
    pendingResolve = resolve;
    resetAuthDialog();
    openAuthDialog();
  });
}

// Expose for any future callers
window.ensureAuthed = ensureAuthed;

// Best-effort: if the user is already auth'd in this browser but localStorage
// got cleared, restore their record (without re-asking for phone) on next
// copy attempt. We refresh `last_seen` quietly when auth state resolves.
getFirebase().then(({ auth, db }) => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const ref = doc(db, PG_COLLECTION, user.uid);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.phone) {
        const data = snap.data();
        saveUser({
          uid: user.uid,
          email: user.email || '',
          name: data.name || user.displayName || '',
          photoURL: data.photoURL || user.photoURL || '',
          phone: data.phone,
        });
        renderUserWidget();
        setDoc(ref, { last_seen: serverTimestamp() }, { merge: true }).catch(() => {});
      }
    } catch {}
  });
}).catch(err => console.warn('[prompt-gallery] firebase init deferred', err));

// ============================================================
// ===== User widget (Login / Signup / Logout / Profile) ======
// ============================================================
const $widget        = document.getElementById('user-widget');
const $signinBtn     = document.getElementById('user-signin-btn');
const $userChip      = document.getElementById('user-chip');
const $chipBtn       = document.getElementById('user-chip-btn');
const $chipAvatar    = document.getElementById('user-chip-avatar');
const $chipName      = document.getElementById('user-chip-name');
const $userMenu      = document.getElementById('user-menu');
// Move the menu out of .user-widget so it sits as a direct child of <body>.
// Otherwise its z-index is trapped inside the widget's stacking context,
// which the sticky search bar can occasionally render over on certain
// viewport widths.
if ($userMenu && $userMenu.parentElement !== document.body) {
  document.body.appendChild($userMenu);
}
const $menuAvatar    = document.getElementById('user-menu-avatar');
const $menuName      = document.getElementById('user-menu-name');
const $menuEmail     = document.getElementById('user-menu-email');

function renderUserWidget() {
  const u = readSavedUser();
  $widget.dataset.state = u ? 'in' : 'out';
  if (u) {
    $signinBtn.hidden = true;
    $userChip.hidden = false;
    const initial = (u.name || u.email || '?').charAt(0).toUpperCase();
    const fallback = `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="%237c3aed"/><text x="50%" y="55%" font-family="Inter, sans-serif" font-size="28" font-weight="700" fill="white" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`
    )}`;
    const photo = u.photoURL || fallback;
    $chipAvatar.src = photo;
    $menuAvatar.src = photo;
    const displayName = u.name || u.email || 'Account';
    $chipName.textContent = displayName.split(' ')[0];
    $menuName.textContent = displayName;
    $menuEmail.textContent = u.email || '';
  } else {
    $signinBtn.hidden = false;
    $userChip.hidden = true;
    $userMenu.hidden = true;
    $chipBtn.setAttribute('aria-expanded', 'false');
  }
}

function positionUserMenu() {
  // Anchor below the chip button so the dropdown tracks the actual widget
  // bounds (not a hardcoded top:60px that breaks if the chip grows).
  const rect = $chipBtn.getBoundingClientRect();
  $userMenu.style.top = `${rect.bottom + 8}px`;
  $userMenu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
}

function toggleUserMenu(force) {
  const open = force ?? $userMenu.hidden;
  $userMenu.hidden = !open;
  $chipBtn.setAttribute('aria-expanded', String(open));
  if (open) {
    positionUserMenu();
    // Focus the first menuitem so keyboard users land inside the menu.
    const firstItem = $userMenu.querySelector('[role="menuitem"]');
    requestAnimationFrame(() => firstItem?.focus());
  }
}
// Keep the menu anchored to the chip if the window resizes while it's open.
window.addEventListener('resize', () => { if (!$userMenu.hidden) positionUserMenu(); });

$signinBtn.addEventListener('click', () => {
  // Manual sign-in — bypasses gating; opens the same auth dialog.
  resetAuthDialog();
  openAuthDialog();
});

$chipBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleUserMenu();
});

document.addEventListener('click', (e) => {
  if ($userMenu.hidden) return;
  // The menu was moved to <body>, so it's NOT inside #user-chip anymore.
  // Check both ancestors before deciding it's an outside click.
  if (e.target.closest('#user-chip') || e.target.closest('#user-menu')) return;
  toggleUserMenu(false);
});

// Escape closes the menu and returns focus to the trigger.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$userMenu.hidden) {
    toggleUserMenu(false);
    $chipBtn?.focus();
    return;
  }
  // Arrow-key navigation within the menu (ARIA menu pattern).
  if (!$userMenu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End')) {
    const items = Array.from($userMenu.querySelectorAll('[role="menuitem"]'));
    if (!items.length) return;
    const active = document.activeElement;
    const idx = items.indexOf(active);
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % items.length;
    else /* ArrowUp */ next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length;
    items[next]?.focus();
    e.preventDefault();
  }
});

$userMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;
  toggleUserMenu(false);
  const action = item.dataset.action;
  if (action === 'edit-profile') openProfileDialog();
  else if (action === 'logout') await logoutUser();
});

async function logoutUser() {
  try {
    const { auth } = await getFirebase();
    await signOut(auth);
  } catch (err) {
    console.warn('[prompt-gallery] signOut failed', err);
  }
  try { localStorage.removeItem(LS_KEY); } catch {}
  FAVORITES.clear();
  creditState = { free: 0, paid: 0, resetAt: 0, nextRefillAt: 0, signupDay: 0, loaded: false, loading: false };
  if (typeof memberTextCache !== 'undefined') memberTextCache.clear();
  if (typeof renderCreditUI === 'function') renderCreditUI();
  if (currentFilter === 'favorites') {
    currentFilter = 'all';
    document.querySelectorAll('.filter-chip').forEach(c => {
      const isAll = c.dataset.filter === 'all';
      c.classList.toggle('active', isAll);
      c.setAttribute('aria-selected', String(isAll));
    });
  }
  renderUserWidget();
  updateFavoritesUI();
  applyFilter();
  if (typeof renderAnonCounter === 'function') renderAnonCounter();
  showToast('Logged out');
}

// ----- Profile edit dialog -----
const $profileDialog       = document.getElementById('profile-dialog');
const $profileForm         = document.getElementById('profile-form');
const $profileAvatar       = document.getElementById('profile-avatar');
const $profileNameRO       = document.getElementById('profile-name-readonly');
const $profileEmailRO      = document.getElementById('profile-email-readonly');
const $profileName         = document.getElementById('profile-name');
const $profilePhone        = document.getElementById('profile-phone');
const $profileError        = document.getElementById('profile-error');
const $profileSubmit       = document.getElementById('profile-submit');

function openProfileDialog() {
  const u = readSavedUser();
  if (!u) { resetAuthDialog(); openAuthDialog(); return; }
  $profileError.hidden = true;
  $profileError.textContent = '';
  $profileAvatar.src = u.photoURL || '';
  $profileNameRO.textContent = u.name || '';
  $profileEmailRO.textContent = u.email || '';
  $profileName.value = u.name || '';
  // Strip the +91 prefix for editing
  $profilePhone.value = (u.phone || '').replace(/^\+91/, '');
  $profileSubmit.disabled = false;
  $profileSubmit.innerHTML = '<i class="fas fa-save"></i> Save changes';
  if (typeof $profileDialog.showModal === 'function') $profileDialog.showModal();
  else $profileDialog.setAttribute('open', '');
}

function closeProfileDialog() {
  if (typeof $profileDialog.close === 'function') $profileDialog.close();
  else $profileDialog.removeAttribute('open');
}

$profileDialog.addEventListener('click', (e) => {
  if (e.target === $profileDialog) closeProfileDialog();
  if (e.target.closest('[data-profile-cancel]')) closeProfileDialog();
});

$profilePhone.addEventListener('input', () => {
  $profilePhone.value = $profilePhone.value.replace(/\D/g, '').slice(0, 10);
  if (!$profileError.hidden) { $profileError.hidden = true; $profileError.textContent = ''; }
});

$profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = readSavedUser();
  if (!u) { closeProfileDialog(); return; }
  const name = $profileName.value.trim();
  const phone10 = $profilePhone.value.trim();
  if (name.length < 2) {
    $profileError.textContent = 'Please enter your name (min 2 characters).';
    $profileError.hidden = false;
    return;
  }
  if (!/^[6-9]\d{9}$/.test(phone10)) {
    $profileError.textContent = 'Enter a valid 10-digit Indian mobile number.';
    $profileError.hidden = false;
    return;
  }
  $profileSubmit.disabled = true;
  $profileSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, u.uid);
    await setDoc(ref, {
      name,
      phone: '+91' + phone10,
      last_seen: serverTimestamp(),
    }, { merge: true });
    saveUser({ ...u, name, phone: '+91' + phone10 });
    renderUserWidget();
    closeProfileDialog();
    showToast('Profile updated');
  } catch (err) {
    console.error('[prompt-gallery] profile save failed', err);
    $profileError.textContent = 'Could not save changes. Check your connection and try again.';
    $profileError.hidden = false;
    $profileSubmit.disabled = false;
    $profileSubmit.innerHTML = '<i class="fas fa-save"></i> Save changes';
  }
});

// Initial render of the widget
renderUserWidget();

// ============================================================
// ===== Favorites (subcollection: favorites/{promptId}) ======
// ============================================================
// (FAVORITES is declared near the top so cardHTML can read it.)

async function loadFavorites() {
  const u = readSavedUser();
  if (!u) { FAVORITES.clear(); return; }
  try {
    const { db } = await getFirebase();
    const snap = await getDocs(collection(db, PG_COLLECTION, u.uid, 'favorites'));
    FAVORITES.clear();
    snap.forEach(d => FAVORITES.add(d.id));
    updateFavoritesUI();
  } catch (err) {
    console.warn('[prompt-gallery] loadFavorites failed', err);
  }
}

function updateFavoritesUI() {
  // Re-render grid so heart states match
  applyFilter();
  // Update the favorites chip count + visibility
  const chip = document.querySelector('.filter-chip[data-filter="favorites"]');
  const countEl = document.getElementById('filter-fav-count');
  const signedIn = !!readSavedUser();
  if (chip) chip.hidden = !signedIn;
  if (countEl) {
    countEl.textContent = String(FAVORITES.size);
    countEl.hidden = FAVORITES.size === 0;
  }
}

async function toggleFavorite(promptId, btnEl) {
  if (!promptId) return;
  const u = readSavedUser();
  if (!u) {
    const allowed = await ensureAuthed();
    if (!allowed) return;
  }
  const user = readSavedUser();
  if (!user) return;
  if (btnEl) btnEl.classList.add('busy');
  const wasOn = FAVORITES.has(promptId);
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, user.uid, 'favorites', promptId);
    if (wasOn) {
      await deleteDoc(ref);
      FAVORITES.delete(promptId);
    } else {
      const p = PROMPTS.find(x => x.id === promptId);
      await setDoc(ref, {
        promptId,
        title: p?.title || '',
        addedAt: serverTimestamp(),
      });
      FAVORITES.add(promptId);
    }
    // Inline DOM update for instant feedback (no full re-render needed unless on Favorites tab)
    document.querySelectorAll(`.fav-btn[data-fav="${cssEscape(promptId)}"]`).forEach(el => {
      el.classList.toggle('active', !wasOn);
      el.classList.add('pop');
      el.setAttribute('aria-pressed', String(!wasOn));
      const icon = el.querySelector('i');
      if (icon) { icon.classList.toggle('fas', !wasOn); icon.classList.toggle('far', wasOn); }
      setTimeout(() => el.classList.remove('pop'), 350);
    });
    if (currentFilter === 'favorites') applyFilter();
    updateFavoritesUI();
    showToast(wasOn ? 'Removed from favorites' : 'Added to favorites');
  } catch (err) {
    console.error('[prompt-gallery] toggleFavorite failed', err);
    showToast('Could not update favorite. Try again.');
  } finally {
    if (btnEl) btnEl.classList.remove('busy');
  }
}

// Minimal CSS.escape polyfill for the data-fav selector
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`);
}

// ============================================================
// ===== Copy history (subcollection: history/{autoId}) =======
// ============================================================
async function recordCopy(p) {
  const u = readSavedUser();
  if (!u || !p) return;
  try {
    const { db } = await getFirebase();
    await addDoc(collection(db, PG_COLLECTION, u.uid, 'history'), {
      promptId: p.id,
      title: p.title || '',
      copiedAt: serverTimestamp(),
    });
    // Bump per-user lifetime copy counter
    setDoc(doc(db, PG_COLLECTION, u.uid), {
      copy_count: increment(1),
      last_seen: serverTimestamp(),
    }, { merge: true }).catch(() => {});
    // Bump GLOBAL per-prompt copy counter — used for "trending" badges
    // and sorting / analytics. Fire-and-forget; not blocking the copy.
    setDoc(doc(db, 'prompt_stats', p.id), {
      title: p.title || '',
      tier: p.tier || 'free',
      copy_count: increment(1),
      last_copied_at: serverTimestamp(),
    }, { merge: true }).then(() => {
      // Optimistically bump local cache so the badge updates without refetch
      const prev = PROMPT_STATS.get(p.id) || { copy_count: 0 };
      PROMPT_STATS.set(p.id, { ...prev, copy_count: (prev.copy_count || 0) + 1 });
      updateCardStat(p.id);
    }).catch(err => console.warn('[prompt-gallery] prompt_stats bump failed', err));
  } catch (err) {
    console.warn('[prompt-gallery] recordCopy failed', err);
  }
}

// ============================================================
// ===== Global per-prompt copy stats (trending) ==============
// ============================================================
const PROMPT_STATS = new Map();   // promptId -> { copy_count }
const TRENDING_THRESHOLD = 5;     // show "used N times" once a prompt
                                  //   has been copied at least this much

async function loadPromptStats() {
  try {
    const { db } = await getFirebase();
    const snap = await getDocs(collection(db, 'prompt_stats'));
    PROMPT_STATS.clear();
    snap.forEach(d => PROMPT_STATS.set(d.id, d.data() || {}));
    // Re-render every card so the "used N times" tag appears
    document.querySelectorAll('.card-p').forEach(card => {
      updateCardStat(card.dataset.id);
    });
  } catch (err) {
    // Failing silently is acceptable — stats are a nice-to-have, not critical.
    console.warn('[prompt-gallery] loadPromptStats failed', err);
  }
}

function updateCardStat(promptId) {
  if (!promptId) return;
  const card = document.querySelector(`.card-p[data-id="${cssEscape(promptId)}"]`);
  if (!card) return;
  const count = (PROMPT_STATS.get(promptId)?.copy_count) || 0;
  let tag = card.querySelector('.copy-stat');
  if (count < TRENDING_THRESHOLD) {
    if (tag) tag.remove();
    return;
  }
  const label = `<i class="fas fa-fire"></i> Used ${count.toLocaleString('en-IN')} time${count === 1 ? '' : 's'}`;
  if (tag) { tag.innerHTML = label; return; }
  tag = document.createElement('div');
  tag.className = 'copy-stat';
  tag.innerHTML = label;
  // Insert right after the title for a natural reading flow
  const title = card.querySelector('.card-title');
  if (title) title.insertAdjacentElement('afterend', tag);
  else card.querySelector('.card-body')?.prepend(tag);
}

// Initial fetch — works for both signed-in and anonymous visitors thanks to
// the public read rule on prompt_stats.
loadPromptStats();

const $historyDialog = document.getElementById('history-dialog');
const $historyList   = document.getElementById('history-list');
const $historyClear  = document.getElementById('history-clear-btn');

async function openHistoryDialog() {
  const u = readSavedUser();
  if (!u) { resetAuthDialog(); openAuthDialog(); return; }
  $historyList.innerHTML = '<p class="history-empty">Loading…</p>';
  if (typeof $historyDialog.showModal === 'function') $historyDialog.showModal();
  else $historyDialog.setAttribute('open', '');
  try {
    const { db } = await getFirebase();
    const q = query(
      collection(db, PG_COLLECTION, u.uid, 'history'),
      orderBy('copiedAt', 'desc'),
      limit(25)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      $historyList.innerHTML = '<p class="history-empty">No copies yet. Start exploring the gallery!</p>';
      return;
    }
    const rows = [];
    snap.forEach(d => {
      const data = d.data();
      const when = data.copiedAt?.toDate?.() || null;
      const stillExists = PROMPTS.some(p => p.id === data.promptId);
      rows.push(`
        <div class="history-item">
          <div class="history-meta">
            <div class="history-title">${escapeHtml(data.title || data.promptId)}</div>
            <div class="history-time">${escapeHtml(formatRelative(when))}</div>
          </div>
          <button type="button" class="history-copy" data-copy-history="${escapeHtml(data.promptId)}" ${stillExists ? '' : 'disabled title="This prompt is no longer available" aria-label="Prompt no longer available"'}>
            <i class="${stillExists ? 'far fa-copy' : 'fas fa-ban'}" aria-hidden="true"></i> ${stillExists ? 'Copy' : 'Removed'}
          </button>
        </div>
      `);
    });
    $historyList.innerHTML = rows.join('');
  } catch (err) {
    console.error('[prompt-gallery] history load failed', err);
    $historyList.innerHTML = '<p class="history-empty">Could not load history. Try again later.</p>';
  }
}

function closeHistoryDialog() {
  if (typeof $historyDialog.close === 'function') $historyDialog.close();
  else $historyDialog.removeAttribute('open');
}

$historyDialog.addEventListener('click', async (e) => {
  if (e.target === $historyDialog) return closeHistoryDialog();
  if (e.target.closest('[data-history-close]')) return closeHistoryDialog();
  const copyBtn = e.target.closest('[data-copy-history]');
  if (copyBtn && !copyBtn.disabled) {
    const id = copyBtn.dataset.copyHistory;
    const p = PROMPTS.find(x => x.id === id);
    if (!p) return;
    if (getPlaceholders(p).length > 0) {
      closeHistoryDialog();
      openPhDialog(p);
      return;
    }
    const access = await ensureCopyAccess(p);
    if (!access.ok) return;
    let rawText;
    try {
      rawText = await getPromptText(p);
    } catch (err) {
      console.error('[prompt-gallery] failed to load prompt text', err);
      showToast('Could not load this prompt. Please try again.');
      return;
    }
    const ok = await copyText(rawText);
    if (ok) {
      showToast(access.creditUsed
        ? `Copied again! ${access.creditsLeft} credit${access.creditsLeft === 1 ? '' : 's'} left.`
        : 'Prompt copied again!');
      recordCopy(p);
    } else {
      showToast('Could not copy — please copy manually');
    }
  }
});

$historyClear.addEventListener('click', async () => {
  const u = readSavedUser();
  if (!u) return;
  const result = await Swal.fire({
    title: 'Clear copy history?',
    text: 'All entries will be permanently removed. This cannot be undone.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Yes, clear',
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#6b6890',
    reverseButtons: true,
    focusCancel: true,
  });
  if (!result.isConfirmed) return;
  $historyClear.disabled = true;
  try {
    const { db } = await getFirebase();
    const snap = await getDocs(collection(db, PG_COLLECTION, u.uid, 'history'));
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
    $historyList.innerHTML = '<p class="history-empty">History cleared.</p>';
    showToast('History cleared');
  } catch (err) {
    console.error('[prompt-gallery] clear history failed', err);
    showToast('Could not clear history');
  } finally {
    $historyClear.disabled = false;
  }
});

function formatRelative(d) {
  if (!d) return '';
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
  return d.toLocaleDateString();
}

// ============================================================
// ===== Profile stats + delete account =======================
// ============================================================
async function loadProfileStats() {
  const u = readSavedUser();
  if (!u) return;
  const $copies = document.getElementById('stat-copies');
  const $favs   = document.getElementById('stat-favs');
  const $since  = document.getElementById('stat-since');
  try {
    const { db } = await getFirebase();
    const snap = await getDoc(doc(db, PG_COLLECTION, u.uid));
    const data = snap.exists() ? snap.data() : {};
    $copies.textContent = String(data.copy_count || 0);
    $favs.textContent   = String(FAVORITES.size);
    const created = data.created_at?.toDate?.();
    if (created) {
      $since.textContent = created.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    } else {
      $since.textContent = '—';
    }
  } catch (err) {
    console.warn('[prompt-gallery] loadProfileStats failed', err);
  }
}

const $confirmDialog = document.getElementById('confirm-dialog');
const $confirmOk     = document.getElementById('confirm-dialog-ok');
const $confirmMsg    = document.getElementById('confirm-dialog-msg');
let confirmHandler = null;

function openConfirm(message, onConfirm) {
  if (message) $confirmMsg.textContent = message;
  confirmHandler = onConfirm;
  $confirmOk.disabled = false;
  $confirmOk.innerHTML = '<i class="fas fa-trash-can"></i> Yes, delete';
  if (typeof $confirmDialog.showModal === 'function') $confirmDialog.showModal();
  else $confirmDialog.setAttribute('open', '');
}
function closeConfirm() {
  if (typeof $confirmDialog.close === 'function') $confirmDialog.close();
  else $confirmDialog.removeAttribute('open');
  confirmHandler = null;
}
$confirmDialog.addEventListener('click', (e) => {
  if (e.target === $confirmDialog) return closeConfirm();
  if (e.target.closest('[data-confirm-cancel]')) return closeConfirm();
});
$confirmOk.addEventListener('click', async () => {
  if (!confirmHandler) return;
  $confirmOk.disabled = true;
  $confirmOk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
  try { await confirmHandler(); } finally { closeConfirm(); }
});

document.getElementById('profile-delete-btn').addEventListener('click', () => {
  openConfirm(
    "This will permanently erase your profile, favorites and copy history. You'll be asked to re-confirm with Google for security.",
    deleteAccount
  );
});

async function deleteAccount() {
  const u = readSavedUser();
  if (!u) return;
  try {
    const { auth, db } = await getFirebase();
    let current = auth.currentUser;
    if (!current) {
      // No live session — a fresh signIn satisfies the recent-login requirement.
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      current = cred.user;
    } else {
      // Live session — refresh credentials to clear the recent-login requirement.
      await reauthenticateWithPopup(current, new GoogleAuthProvider());
    }
    // Delete subcollections (favorites, history) in batches
    for (const sub of ['favorites', 'history']) {
      const snap = await getDocs(collection(db, PG_COLLECTION, current.uid, sub));
      if (!snap.empty) {
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
    }
    // Release the phone-uniqueness claim so the user can re-signup later
    const savedPhone = readSavedUser()?.phone;
    if (savedPhone) {
      try { await deleteDoc(doc(db, 'phone_index', savedPhone)); } catch (e) { /* ignore */ }
    }
    // Delete user doc
    await deleteDoc(doc(db, PG_COLLECTION, current.uid));
    // Delete auth user
    await deleteUser(current);
    // Clear local state
    try { localStorage.removeItem(LS_KEY); } catch {}
    FAVORITES.clear();
    memberTextCache.clear();
    closeProfileDialog();
    renderUserWidget();
    updateFavoritesUI();
    applyFilter();
    showToast('Account deleted');
  } catch (err) {
    console.error('[prompt-gallery] deleteAccount failed', err);
    if (err?.code === 'auth/popup-closed-by-user') {
      showToast('Cancelled — account not deleted');
    } else {
      showToast('Could not delete account. Please try again.');
    }
  }
}

// ============================================================
// ===== Filter chip wiring + menu actions wiring =============
// ============================================================
document.querySelector('.filter-row').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  const filter = chip.dataset.filter;
  if (filter === 'favorites' && !readSavedUser()) {
    resetAuthDialog();
    openAuthDialog();
    return;
  }
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.classList.toggle('active', c === chip);
    c.setAttribute('aria-selected', String(c === chip));
  });
  currentFilter = filter;
  applyFilter();
});

// Extend the dropdown actions to handle favorites + history
$userMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;
  if (item.dataset.action === 'favorites') {
    // Switch to favorites filter
    const chip = document.querySelector('.filter-chip[data-filter="favorites"]');
    if (chip) chip.click();
    // scroll to grid
    document.querySelector('.gallery-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (item.dataset.action === 'history') {
    openHistoryDialog();
  }
});

// Kick off stats load when "Edit profile" is clicked (the dialog itself
// is opened by an earlier listener registered above on $userMenu).
$userMenu.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="edit-profile"]')) loadProfileStats();
});

// Hydrate favorites + UI any time we detect a fresh login (auth state change)
getFirebase().then(({ auth }) => {
  onAuthStateChanged(auth, () => {
    loadFavorites();
  });
});

// Initial hydration if user is already saved locally
if (readSavedUser()) loadFavorites();
updateFavoritesUI();

// ============================================================
// ===== Credits (member-tier prompts cost 1 credit) ==========
// ============================================================
const FREE_CREDITS_PER_MONTH = 10;
const BIZ_WHATSAPP = '917749984274'; // BankiBites / AK Creation contact
let creditState = { free: 0, paid: 0, resetAt: 0, nextRefillAt: 0, signupDay: 0, loaded: false, loading: false };

function totalCredits() { return (creditState.free || 0) + (creditState.paid || 0); }

// Coerce a Firestore field value into a safe non-negative integer.
// Handles both numbers and numeric strings (in case wallet credits were
// added via the Firebase Console as a string instead of a number).
function asCreditNumber(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

// Returns the next monthly anniversary date AFTER fromMs, anchored to signupDay.
// Handles short months: e.g. signupDay 31 → 30/29/28 in shorter months.
function nextAnniversaryAfter(signupDay, fromMs) {
  const from = new Date(fromMs);
  let y = from.getFullYear();
  let m = from.getMonth();
  for (let i = 0; i < 25; i++) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const day = Math.min(signupDay, daysInMonth);
    const candidate = new Date(y, m, day, 0, 0, 0, 0);
    if (candidate.getTime() > fromMs) return candidate;
    m++; if (m > 11) { m = 0; y++; }
  }
  return null;
}

let _loadCreditsInFlight = null;
async function loadCredits() {
  if (_loadCreditsInFlight) return _loadCreditsInFlight;
  _loadCreditsInFlight = (async () => {
  const u = readSavedUser();
  if (!u) {
    creditState = { free: 0, paid: 0, resetAt: 0, nextRefillAt: 0, signupDay: 0, loaded: false, loading: false };
    renderCreditUI();
    return;
  }
  creditState.loading = true;
  renderCreditUI();
  const loadingForUid = u.uid;
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, u.uid);
    const snap = await getDoc(ref);
    // Bail out if the user signed out (or switched) while we were waiting.
    const currentUser = readSavedUser();
    if (!currentUser || currentUser.uid !== loadingForUid) {
      creditState.loading = false;
      renderCreditUI();
      return;
    }
    const data = snap.exists() ? snap.data() : {};
    let free = (data.free_credits === undefined) ? FREE_CREDITS_PER_MONTH : asCreditNumber(data.free_credits);
    const paid = asCreditNumber(data.paid_credits);
    const createdAtMs = data.created_at?.toMillis?.() || Date.now();
    // For legacy accounts that predate this field, treat the cycle as
    // starting NOW — otherwise we'd back-fill every anniversary since
    // they signed up (potentially +60, +120 credits).
    const hasResetAtField = !!data.credits_reset_at?.toMillis;
    let resetAt = hasResetAtField ? data.credits_reset_at.toMillis() : Date.now();
    const signupDay = (typeof data.signup_day === 'number' && data.signup_day >= 1 && data.signup_day <= 31)
      ? data.signup_day
      : new Date(createdAtMs).getDate();

    // Monthly free-credit refill, "top-up" semantics: at each missed
    // anniversary we ensure free is at least FREE_CREDITS_PER_MONTH (10).
    // If the user already has more than 10 free credits, no top-up happens
    // (so users never feel punished by the refill). Paid (wallet) credits
    // are never touched here — they accumulate separately via Buy.
    // Persist via a transaction so two tabs / devices can't double-grant.
    let creditsAdded = 0;
    let next = nextAnniversaryAfter(signupDay, resetAt);
    const needsSignupDay = typeof data.signup_day !== 'number';
    const needsSeed = !hasResetAtField;
    if ((next && next.getTime() <= Date.now()) || needsSignupDay || needsSeed) {
      try {
        const txResult = await runTransaction(db, async (tx) => {
          const fresh = await tx.get(ref);
          const fd = fresh.exists() ? fresh.data() : {};
          let fResetAt = fd.credits_reset_at?.toMillis?.() || resetAt;
          let fFree = (fd.free_credits === undefined) ? free : asCreditNumber(fd.free_credits);
          let cyclesPassed = 0;
          let n = nextAnniversaryAfter(signupDay, fResetAt);
          const t = Date.now();
          while (n && n.getTime() <= t) {
            cyclesPassed++;
            fResetAt = n.getTime();
            n = nextAnniversaryAfter(signupDay, fResetAt);
          }
          // Apply top-up once if any cycle passed — repeating it is the
          // same as doing it once because the floor is FREE_CREDITS_PER_MONTH.
          let added = 0;
          if (cyclesPassed > 0 && fFree < FREE_CREDITS_PER_MONTH) {
            added = FREE_CREDITS_PER_MONTH - fFree;
            fFree = FREE_CREDITS_PER_MONTH;
          }
          const patch = {};
          if (typeof fd.signup_day !== 'number') patch.signup_day = signupDay;
          if (cyclesPassed > 0) {
            if (added > 0) patch.free_credits = increment(added);
            patch.credits_reset_at = new Date(fResetAt);
          } else if (!fd.credits_reset_at?.toMillis) {
            patch.credits_reset_at = new Date(fResetAt);
          }
          if (Object.keys(patch).length > 0) tx.set(ref, patch, { merge: true });
          return { added, fResetAt, fFree, nextAfter: n };
        });
        creditsAdded = txResult.added;
        free = txResult.fFree;
        resetAt = txResult.fResetAt;
        next = txResult.nextAfter;
      } catch (e) {
        console.warn('[prompt-gallery] persist refill failed', e);
        // Fall back to client-computed numbers.
        const t = Date.now();
        let cyclesPassed = 0;
        while (next && next.getTime() <= t) {
          cyclesPassed++;
          resetAt = next.getTime();
          next = nextAnniversaryAfter(signupDay, resetAt);
        }
        if (cyclesPassed > 0 && free < FREE_CREDITS_PER_MONTH) {
          creditsAdded = FREE_CREDITS_PER_MONTH - free;
          free = FREE_CREDITS_PER_MONTH;
        }
      }
    }

    creditState = {
      free, paid,
      resetAt,
      nextRefillAt: next ? next.getTime() : 0,
      signupDay,
      loaded: true,
      loading: false,
      justAdded: creditsAdded,
    };

    if (creditsAdded > 0) {
      showToast(`Monthly free credits topped up to ${FREE_CREDITS_PER_MONTH} (+${creditsAdded})`);
    }
  } catch (err) {
    console.warn('[prompt-gallery] loadCredits failed', err);
    creditState.loaded = true;
    creditState.loading = false;
  }
  renderCreditUI();
  })();
  try { await _loadCreditsInFlight; } finally { _loadCreditsInFlight = null; }
}

async function consumeCredit() {
  const u = readSavedUser();
  if (!u) return false;
  if (!creditState.loaded) await loadCredits();
  if (totalCredits() <= 0) return false;
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, u.uid);
    // Use a transaction so two tabs / devices can't decrement below zero.
    // The transaction re-reads inside the critical section and bails if
    // credits have already been spent elsewhere.
    const result = await runTransaction(db, async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists()) return { ok: false, free: 0, paid: 0 };
      const fd = fresh.data();
      const freeNow = asCreditNumber(fd.free_credits);
      const paidNow = asCreditNumber(fd.paid_credits);
      if (freeNow + paidNow <= 0) return { ok: false, free: freeNow, paid: paidNow };
      const patch = {};
      let newFree = freeNow, newPaid = paidNow;
      if (freeNow > 0) {
        patch.free_credits = increment(-1);
        newFree = freeNow - 1;
      } else {
        patch.paid_credits = increment(-1);
        newPaid = paidNow - 1;
      }
      tx.set(ref, patch, { merge: true });
      return { ok: true, free: newFree, paid: newPaid };
    });
    if (!result.ok) {
      // Re-sync local state — another tab spent our last credit.
      creditState.free = result.free;
      creditState.paid = result.paid;
      renderCreditUI();
      return false;
    }
    creditState.free = result.free;
    creditState.paid = result.paid;
    renderCreditUI();
    return true;
  } catch (err) {
    console.error('[prompt-gallery] consumeCredit failed', err);
    return false;
  }
}

// Central access check used by every copy path.
// Returns { ok: boolean, creditUsed: boolean, creditsLeft: number }.
//   - Free prompt + signed in : always allowed, no credit
//   - Free prompt + anonymous  : up to 3 copies/day (tracked in localStorage)
//   - Member prompt           : require signup + consume 1 credit
async function ensureCopyAccess(p) {
  // Free prompts
  if (!p || p.tier !== 'member') {
    if (readSavedUser()) {
      return { ok: true, creditUsed: false, creditsLeft: 0 };
    }
    // Anonymous daily cap — if exceeded, push them through signup so the
    // copy can complete in one flow instead of two clicks.
    if (anonCopiesLeftToday() <= 0) {
      showToast(`Daily free limit reached (${ANON_DAILY_LIMIT}). Sign up free to keep copying.`);
      const signedUp = await ensureAuthed();
      if (!signedUp) return { ok: false, creditUsed: false, creditsLeft: 0 };
      // Now signed-in → unlimited free prompts
      return { ok: true, creditUsed: false, creditsLeft: 0 };
    }
    incrementAnonCounter();
    if (anonCopiesLeftToday() === 0) {
      setTimeout(() => showToast("That was your last free copy today. Sign up free for unlimited!"), 800);
    }
    return { ok: true, creditUsed: false, creditsLeft: 0 };
  }
  // Member prompts
  const allowed = await ensureAuthed();
  if (!allowed) return { ok: false, creditUsed: false, creditsLeft: 0 };
  if (!creditState.loaded) await loadCredits();
  if (totalCredits() <= 0) {
    openBuyDialog();
    showToast("You're out of credits — buy more to keep copying.");
    return { ok: false, creditUsed: false, creditsLeft: 0 };
  }
  const ok = await consumeCredit();
  if (!ok) {
    // Transaction-safe consumeCredit refused — another tab/device likely
    // spent our last credit. Tell the user instead of silently failing.
    showToast("Out of credits — open a new tab? Refresh to re-sync.");
    openBuyDialog();
  }
  return { ok, creditUsed: ok, creditsLeft: totalCredits() };
}

// ===== Credit UI rendering =====
function formatRefillDate(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function renderCreditUI() {
  const total = totalCredits();
  const $stack  = document.querySelector('.credit-stack');
  const $line   = document.querySelector('.credit-line');
  const $wallet = document.querySelector('.wallet-line');
  const $count  = document.getElementById('credit-line-count');
  const $wcount = document.getElementById('wallet-line-count');
  const $next   = document.getElementById('credit-line-next');
  const $nextDate = document.getElementById('credit-line-next-date');
  const $buyNow = document.getElementById('buy-credits-now');
  const $buyMonthly = document.getElementById('buy-monthly-now');
  const $chipName = document.getElementById('user-chip-name');
  document.querySelector('.user-chip-credit')?.remove();
  if (!readSavedUser()) {
    if ($stack) $stack.style.display = 'none';
    return;
  }
  if ($stack) $stack.style.display = 'flex';
  if ($line) {
    $line.style.display = 'flex';
    // "Low" highlight on the monthly row: free credits at/below 3 = low.
    $line.classList.toggle('low', !creditState.loading && (creditState.free || 0) <= 3);
  }
  if ($wallet) $wallet.style.display = 'flex';
  const spinner = '<span class="spinner credit-loading" aria-label="Loading credits"></span>';
  if ($count) {
    $count.innerHTML = creditState.loading ? spinner : String(creditState.free || 0);
  }
  if ($wcount) {
    $wcount.innerHTML = creditState.loading ? spinner : String(creditState.paid || 0);
  }
  if ($buyMonthly) {
    $buyMonthly.innerHTML = creditState.loading ? spinner : String(creditState.free || 0);
  }
  if ($buyNow) {
    $buyNow.innerHTML = creditState.loading ? spinner : String(creditState.paid || 0);
  }
  if ($next && $nextDate) {
    if (!creditState.loading && creditState.nextRefillAt) {
      $nextDate.textContent = formatRefillDate(creditState.nextRefillAt);
      $next.hidden = false;
    } else {
      $next.hidden = true;
    }
  }
  // Tiny credit pill next to the user-chip name (visible in hero).
  // Shows TOTAL — tooltip breaks down the split.
  if ($chipName) {
    const pill = document.createElement('span');
    pill.className = 'user-chip-credit' + (!creditState.loading && total <= 3 ? ' low' : '');
    if (creditState.loading) {
      pill.innerHTML = '<span class="spinner" aria-label="Loading credits"></span>';
      pill.title = 'Loading credits…';
    } else {
      pill.innerHTML = `<i class="fas fa-bolt"></i> ${total}`;
      const refillNote = creditState.nextRefillAt
        ? ` · refills on ${formatRefillDate(creditState.nextRefillAt)}`
        : '';
      pill.title = `Monthly ${creditState.free || 0}/${FREE_CREDITS_PER_MONTH} · Wallet ${creditState.paid || 0}${refillNote}`;
    }
    $chipName.insertAdjacentElement('afterend', pill);
  }
}

// ===== Buy credits dialog =====
const $buyDialog       = document.getElementById('buy-dialog');
const $buyCreditsNow   = document.getElementById('buy-credits-now');

function openBuyDialog() {
  if (!readSavedUser()) { resetAuthDialog(); openAuthDialog(); return; }
  // Refresh credits in case admin just topped up after a WhatsApp payment.
  // The single-flight guard inside loadCredits prevents duplicate work.
  loadCredits();
  // renderCreditUI keeps both #buy-monthly-now and #buy-credits-now in sync
  // with the split state, including the loading spinner.
  renderCreditUI();
  // Reset the dynamic foot text to its default each time we open.
  const foot = $buyDialog.querySelector('.buy-foot');
  if (foot) foot.dataset.default = foot.textContent;
  if (typeof $buyDialog.showModal === 'function') $buyDialog.showModal();
  else $buyDialog.setAttribute('open', '');
}

// Micro-confirmation: as the user hovers/focuses a pack, the foot text
// shows exactly what tapping that pack will do — without breaking the
// single-gesture WhatsApp commit pattern.
function setBuyFootForPack(pack) {
  const foot = $buyDialog.querySelector('.buy-foot');
  if (!foot) return;
  if (!pack) {
    foot.innerHTML = foot.dataset.default || foot.textContent;
    foot.classList.remove('active');
    return;
  }
  const amount  = parseInt(pack.dataset.amount, 10);
  const credits = parseInt(pack.dataset.credits, 10);
  if (!amount || !credits) return;
  foot.innerHTML = `<i class="fab fa-whatsapp" aria-hidden="true"></i> Tap to send <strong>₹${amount}</strong> request for <strong>${credits} credits</strong>`;
  foot.classList.add('active');
}
function closeBuyDialog() {
  if (typeof $buyDialog.close === 'function') $buyDialog.close();
  else $buyDialog.removeAttribute('open');
}

function whatsappBuyHref(amount, credits) {
  const u = readSavedUser() || {};
  const lines = [
    `Hi! I'd like to buy *${credits} credits* for the Prompt Gallery.`,
    `Amount: *₹${amount}*`,
    ``,
    `Name: ${u.name || '(not set)'}`,
    `Email: ${u.email || '(not set)'}`,
    `Phone: ${u.phone || '(not set)'}`,
    `User ID: ${u.uid || '(not set)'}`,
    ``,
    `Please share payment instructions. Thanks!`,
  ];
  const text = encodeURIComponent(lines.join('\n'));
  return `https://wa.me/${BIZ_WHATSAPP}?text=${text}`;
}

$buyDialog.addEventListener('click', (e) => {
  if (e.target === $buyDialog) return closeBuyDialog();
  if (e.target.closest('[data-buy-close]')) return closeBuyDialog();
  const pack = e.target.closest('.pack-card');
  if (pack) {
    const amount  = parseInt(pack.dataset.amount, 10);
    const credits = parseInt(pack.dataset.credits, 10);
    if (amount > 0 && credits > 0) {
      // Single user gesture → wa.me via location.href (no await between click and nav)
      window.location.href = whatsappBuyHref(amount, credits);
    }
  }
});
// Micro-confirmation: update the foot text as the user previews a pack.
$buyDialog.addEventListener('mouseover', (e) => {
  const pack = e.target.closest('.pack-card');
  if (pack) setBuyFootForPack(pack);
});
$buyDialog.addEventListener('mouseout', (e) => {
  if (e.target.closest('.pack-card')) setBuyFootForPack(null);
});
$buyDialog.addEventListener('focusin', (e) => {
  const pack = e.target.closest('.pack-card');
  if (pack) setBuyFootForPack(pack);
});
$buyDialog.addEventListener('focusout', (e) => {
  if (e.target.closest('.pack-card')) setBuyFootForPack(null);
});

// Menu action wiring for "Buy"
$userMenu.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="buy-credits"]')) {
    toggleUserMenu(false);
    openBuyDialog();
  }
});

// Load credits whenever user state changes
getFirebase().then(({ auth }) => {
  onAuthStateChanged(auth, () => loadCredits());
});
if (readSavedUser()) loadCredits();

// Refresh credits when the tab regains focus — so admin top-ups (after a
// WhatsApp purchase) show up without the user having to hard-refresh.
// Rate-limited to one fetch per 5 seconds.
let _lastCreditsRefreshAt = 0;
function maybeRefreshCredits() {
  if (document.visibilityState !== 'visible') return;
  if (!readSavedUser()) return;
  const now = Date.now();
  if (now - _lastCreditsRefreshAt < 5000) return;
  _lastCreditsRefreshAt = now;
  loadCredits();
}
document.addEventListener('visibilitychange', maybeRefreshCredits);
window.addEventListener('focus', maybeRefreshCredits);
renderCreditUI();

// ============================================================
// ===== Member-prompt text fetch (server-side stored) =========
// ============================================================
// Member prompts have their `prompt` text stored only in Firestore
// (`member_prompts/{id}.prompt`). The client receives them only
// after the user is signed in. Cache in memory for the session.
const memberTextCache = new Map();

async function getPromptText(p) {
  if (!p) throw new Error('prompt missing');
  if (p.tier !== 'member' || typeof p.prompt === 'string') {
    return p.prompt;
  }
  if (memberTextCache.has(p.id)) return memberTextCache.get(p.id);
  const { db } = await getFirebase();
  const snap = await getDoc(doc(db, 'member_prompts', p.id));
  if (!snap.exists()) throw new Error('Member prompt content not found in Firestore: ' + p.id);
  const text = snap.data().prompt;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Empty prompt content for ' + p.id);
  }
  memberTextCache.set(p.id, text);
  return text;
}

// ============================================================
// ===== Anonymous daily copy cap (3/day for free prompts) =====
// ============================================================
const ANON_DAILY_LIMIT = 3;
const ANON_LS_KEY = 'pg_anon_copies';

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function readAnonCounter() {
  try {
    const raw = localStorage.getItem(ANON_LS_KEY);
    if (!raw) return { date: todayKey(), count: 0 };
    const obj = JSON.parse(raw);
    if (obj.date !== todayKey()) return { date: todayKey(), count: 0 };
    return obj;
  } catch { return { date: todayKey(), count: 0 }; }
}

function writeAnonCounter(c) {
  try { localStorage.setItem(ANON_LS_KEY, JSON.stringify(c)); } catch {}
}

function anonCopiesUsedToday() {
  return readAnonCounter().count;
}
function anonCopiesLeftToday() {
  return Math.max(0, ANON_DAILY_LIMIT - anonCopiesUsedToday());
}
function incrementAnonCounter() {
  const c = readAnonCounter();
  c.count += 1;
  writeAnonCounter(c);
  renderAnonCounter();
}

// ----- Visible daily-counter strip -----
const $anonCounter      = document.getElementById('anon-counter');
const $anonCounterNum   = document.getElementById('anon-counter-num');
const $anonCounterLabel = document.getElementById('anon-counter-label');
const $anonCounterBar   = document.getElementById('anon-counter-bar-fill');
const $anonCounterCta   = document.getElementById('anon-counter-cta');

function renderAnonCounter() {
  if (!$anonCounter) return;
  // Hide for signed-in users — they have unlimited free-prompt copies.
  if (readSavedUser()) { $anonCounter.hidden = true; return; }
  $anonCounter.hidden = false;
  const left = anonCopiesLeftToday();
  $anonCounterNum.textContent = String(left);
  // Tone the strip based on remaining count
  $anonCounter.classList.remove('warn', 'gone');
  if (left === 0) {
    $anonCounter.classList.add('gone');
    $anonCounterLabel.textContent = 'free copies left today — sign up to keep copying';
    $anonCounterCta.innerHTML = '<i class="fas fa-arrow-right"></i> <span class="cta-long">Sign up free now</span><span class="cta-short">Sign up</span>';
  } else if (left === 1) {
    $anonCounter.classList.add('warn');
    $anonCounterLabel.textContent = 'free copy left today';
    $anonCounterCta.innerHTML = '<i class="fas fa-arrow-right"></i> <span class="cta-long">Sign up free for unlimited</span><span class="cta-short">Sign up</span>';
  } else {
    $anonCounterLabel.textContent = 'free copies left today';
    $anonCounterCta.innerHTML = '<i class="fas fa-arrow-right"></i> <span class="cta-long">Sign up free for unlimited</span><span class="cta-short">Sign up</span>';
  }
  // Progress bar reflects remaining ratio (full → empty)
  const pct = Math.max(0, Math.min(100, (left / ANON_DAILY_LIMIT) * 100));
  $anonCounterBar.style.width = pct + '%';
}

$anonCounterCta?.addEventListener('click', () => {
  resetAuthDialog();
  openAuthDialog();
});

// Initial render + re-render on auth changes
renderAnonCounter();
getFirebase().then(({ auth }) => {
  onAuthStateChanged(auth, () => renderAnonCounter());
}).catch(() => {});

// ============================================================
// ===== Phone uniqueness: one phone per account ==============
// ============================================================
// Uses `phone_index/{phone}` doc as a uniqueness ledger.
// On signup we attempt to claim it; if another uid already owns it,
// we reject the signup so the user can log in with the original
// Google account instead.
async function claimPhoneIndex(phoneE164, uid) {
  const { db } = await getFirebase();
  const ref = doc(db, 'phone_index', phoneE164);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const owner = snap.data()?.uid;
    return owner === uid;       // true only if THIS user already owns it
  }
  await setDoc(ref, { uid, claimed_at: serverTimestamp() });
  return true;
}
