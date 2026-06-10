// ============================================================
// AI Image Prompt Gallery — data + render + interactions
// ------------------------------------------------------------
// FREE prompt: full object lives here, including `prompt` text.
//
//   {
//     id, title, image, prompt: '...', models, tags, notes
//   }
//
// MEMBER prompt (tier: 'member'): the `prompt` text MUST NOT be
//   stored in this file (it would be visible via DevTools).
//   Instead, store only the metadata here and put the prompt text
//   in Firestore at:
//
//     member_prompts/{id}.prompt   (single string field)
//
//   If the prompt has placeholders, list them in `placeholders`
//   so the form can ask for them without revealing the text.
//
//   {
//     id, title, image, tier: 'member',
//     placeholders: ['first_name', 'tagline'],   // optional
//     models, tags, notes
//     // NO `prompt` field
//   }
// ============================================================

const PROMPTS = [
  {
    id: 'lofi-dusk',
    title: 'Lofi Dusk',
    image: 'prompts/lofi-dusk.png',
    prompt: 'Keep the original image composition and framing unchanged. Only enhance lighting, color grading, atmosphere, and background mood.\n' +
        'Transform the uploaded photo into a premium Instagram Lofi Dusk portrait.\n' +
        '\n' +
        'Preserve the exact faces, identity, pose, facial features, hairstyle, outfit, body proportions, and expression of the original subjects. Do not beautify, alter, or replace faces.\n' +
        '\n' +
        'Create a cinematic dusk-to-night atmosphere with a dark muted background, subtle warm bokeh lights, and softly blurred foliage. Add a strong but controlled white backlight behind the subjects, creating a natural glowing rim light around the hair and shoulders.\n' +
        '\n' +
        'Use soft front flash illumination to keep facial details visible while maintaining a moody night aesthetic. Exposure should be perfectly balanced — not overexposed, not underexposed.\n' +
        '\n' +
        'Apply:\n' +
        '• Warm peach skin highlights\n' +
        '• Natural skin texture\n' +
        '• Soft bloom around highlights\n' +
        '• Gentle atmospheric haze\n' +
        '• Fine cinematic film grain\n' +
        '• Shallow depth of field\n' +
        '• DSLR portrait photography look\n' +
        '• Realistic lens compression\n' +
        '• Smooth tonal transitions\n' +
        '• Rich but realistic colors\n' +
        '• High dynamic range\n' +
        '• Soft contrast with deep blacks\n' +
        '• Instagram premium portrait aesthetic\n' +
        '\n' +
        'Lighting ratio:\n' +
        '40% soft front flash\n' +
        '35% rim light\n' +
        '25% ambient dusk light\n' +
        '\n' +
        'Color grading:\n' +
        'Muted shadows, warm skin tones, soft purple-magenta accents, subtle orange highlights, dark cinematic background.\n' +
        '\n' +
        'Avoid:\n' +
        'Overexposure, harsh flash, excessive glow, artificial skin smoothing, HDR look, cartoon effects, AI-looking faces, excessive saturation, washed-out colors, extreme darkness, unrealistic bokeh.\n' +
        '\n' +
        'Style:\n' +
        'Professional DSLR portrait, 85mm lens, f/1.8, cinematic Instagram Lofi Dusk filter, realistic photography, luxury engagement photoshoot aesthetic.',
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },
    {
    id: 'heroic-poster',
    tier: 'member',
    title: 'Heroic Poster',
    image: 'prompts/heroic-poster.png',
    prompt: 'Create an ultra-realistic cinematic motivational poster using the uploaded reference photo.\n' +
        '\n' +
        'CRITICAL FACE PRESERVATION REQUIREMENTS\n' +
        '\n' +
        '* Preserve the exact face from the reference image.\n' +
        '* Maintain 100% facial identity accuracy.\n' +
        '* Do not alter facial structure, eyes, nose, lips, jawline, skin tone, beard, hairstyle, glasses, or age.\n' +
        '* Keep the exact same facial expression and head angle.\n' +
        '* No beautification, no face enhancement, no smile addition, no expression changes.\n' +
        '* Face must remain identical to the source image.\n' +
        '\n' +
        'COMPOSITION\n' +
        '\n' +
        '* Create a dramatic dual-portrait composition.\n' +
        '* Large monochrome close-up portrait in the background occupying the upper half.\n' +
        '* Full-body version of the same person standing in the foreground.\n' +
        '* Subject looking downward in a confident, focused stance.\n' +
        '* Cinematic hero poster layout.\n' +
        '\n' +
        'TYPOGRAPHY\n' +
        '\n' +
        '* Massive bold 3D red title text in the center.\n' +
        '* Use text as \'{name_in_background}\'\n' +
        '* Text should appear cracked, textured, distressed, and cinematic.\n' +
        '* Elegant handwritten signature-style surname crossing over the title.\n' +
        '* Signature as \'{front_signature}\'\n' +
        '* Professional movie-poster typography hierarchy.\n' +
        '\n' +
        'LIGHTING\n' +
        '\n' +
        '* Strong white spotlight from top-right.\n' +
        '* Intense rim lighting around hair and shoulders.\n' +
        '* High-contrast cinematic lighting.\n' +
        '* Deep shadows with dramatic highlights.\n' +
        '* Volumetric light rays and atmospheric dust particles.\n' +
        '\n' +
        'BACKGROUND\n' +
        '\n' +
        '* Dark black textured studio environment.\n' +
        '* Red neon rectangular frame behind the subject.\n' +
        '* Red paint splashes and particle explosions.\n' +
        '* Floating dust, smoke, sparks, and grunge textures.\n' +
        '* Subtle depth and cinematic atmosphere.\n' +
        '\n' +
        'FLOOR\n' +
        '\n' +
        '* Glossy reflective floor.\n' +
        '* Visible reflections of subject and typography.\n' +
        '* Long dramatic shadows stretching forward.\n' +
        '\n' +
        'COLOR GRADING\n' +
        '\n' +
        '* Black, white, and deep crimson red palette.\n' +
        '* Premium Netflix/OTT poster grading.\n' +
        '* High contrast.\n' +
        '* Sharp details.\n' +
        '* Cinematic realism.\n' +
        '\n' +
        'MOOD\n' +
        '\n' +
        '* Powerful.\n' +
        '* Ambitious.\n' +
        '* Fearless.\n' +
        '* Motivational.\n' +
        '* Premium commercial poster quality.\n' +
        '\n' +
        'TEXT ELEMENTS\n' +
        '\n' +
        '* Add small motivational quotes:\n' +
        '    “Stay Low. Build High.”\n' +
        '    “Focus. Discipline. Consistency.”\n' +
        '\n' +
        'QUALITY\n' +
        '\n' +
        '* Hyper-realistic.\n' +
        '* Ultra-detailed.\n' +
        '* 8K resolution.\n' +
        '* Professional sports-brand advertisement quality.\n' +
        '* Luxury poster design.\n' +
        '* No cartoon effect.\n' +
        '* No AI look.\n' +
        '* Real photography and real typography.\n' +
        '\n' +
        'NEGATIVE PROMPT\n' +
        '\n' +
        '* Different face\n' +
        '* Changed facial expression\n' +
        '* Smile\n' +
        '* Face beautification\n' +
        '* Different hairstyle\n' +
        '* Different beard\n' +
        '* Different glasses\n' +
        '* Different pose\n' +
        '* Extra fingers\n' +
        '* Blurry face\n' +
        '* Low quality\n' +
        '* Cartoon\n' +
        '* Anime\n' +
        '* CGI look\n' +
        '* Distorted body\n' +
        '* Overexposed skin\n' +
        '* Unrealistic proportions\n' +
        '* Identity change\n' +
        '\n' +
        'IMAGE STRENGTH\n' +
        '\n' +
        '* Face preservation: Maximum\n' +
        '* Identity preservation: Maximum\n' +
        '* Style transfer only: Yes\n' +
        '* Facial modification: None',
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },
    {
    id: 'triple-poster',
    title: 'Triple Poster',
    image: 'prompts/triple-poster.png',
    prompt: 'Use the uploaded image as the sole facial identity reference.\n' +
        '\n' +
        'CRITICAL IDENTITY LOCK REQUIREMENTS\n' +
        '\n' +
        '* Preserve the exact face from the uploaded image.\n' +
        '* Maintain 100% facial identity accuracy.\n' +
        '* Do not change facial structure, eyes, nose, lips, jawline, forehead, ears, skin texture, beard, mustache, hairstyle, hairline, age, or ethnicity.\n' +
        '* Preserve the exact natural appearance of the person.\n' +
        '* No beautification.\n' +
        '* No face enhancement.\n' +
        '* No AI-generated facial modifications.\n' +
        '* No face swapping.\n' +
        '* No identity reinterpretation.\n' +
        '* Face consistency must remain identical across all portrait variations.\n' +
        '* Identity lock strength: maximum.\n' +
        '* Face preservation priority: highest.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'COMPOSITION\n' +
        '\n' +
        'Create a premium cinematic social-media poster featuring three versions of the same person:\n' +
        '\n' +
        '1. Large front-facing portrait on the left side.\n' +
        '2. Full-body standing portrait in the center.\n' +
        '3. Large side-profile portrait on the right side.\n' +
        '\n' +
        'All three subjects must be the same person from the uploaded image with perfect facial consistency.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'POSE & STYLING\n' +
        '\n' +
        '* Confident and charismatic personality.\n' +
        '* Natural smile.\n' +
        '* Fashionable casual outfit.\n' +
        '* Modern lifestyle aesthetic.\n' +
        '* Relaxed body language.\n' +
        '* Premium influencer-style appearance.\n' +
        '* Editorial magazine quality.\n' +
        '\n' +
        'For the center full-body version:\n' +
        '\n' +
        '* Walking pose.\n' +
        '* Hands in pockets.\n' +
        '* Standing on a floating wooden platform.\n' +
        '* Realistic body proportions.\n' +
        '* Natural perspective.\n' +
        '\n' +
        'For the side profile:\n' +
        '\n' +
        '* Stylish sunglasses.\n' +
        '* Sharp profile angle.\n' +
        '* Realistic facial details.\n' +
        '* Natural expression.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'BACKGROUND DESIGN\n' +
        '\n' +
        'Create an artistic monochrome luxury background:\n' +
        '\n' +
        '* Light gray gradient backdrop.\n' +
        '* White paint splash textures.\n' +
        '* Brush stroke effects.\n' +
        '* Ink splash details.\n' +
        '* Soft smoke and mist elements.\n' +
        '* Atmospheric depth.\n' +
        '* Minimalist premium composition.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'LIGHTING\n' +
        '\n' +
        '* Professional studio lighting.\n' +
        '* Cinematic soft light.\n' +
        '* High dynamic range.\n' +
        '* Soft shadows.\n' +
        '* Realistic skin rendering.\n' +
        '* Premium editorial lighting.\n' +
        '* Volumetric atmosphere.\n' +
        '* Ultra-clean highlights.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'EFFECTS\n' +
        '\n' +
        '* Floating cloud effects.\n' +
        '* Subtle fog around the lower area.\n' +
        '* Artistic paint textures.\n' +
        '* High-end poster design.\n' +
        '* Luxury branding aesthetic.\n' +
        '* Modern social media campaign style.\n' +
        '* Depth layering.\n' +
        '* Professional photo manipulation quality.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'TEXT PLACEMENT\n' +
        '\n' +
        'Bottom-right typography:\n' +
        '\n' +
        'Main Title:\n' +
        '{Main_Title}\n' +
        '\n' +
        'Subtitle:\n' +
        '{Subtitle}\n' +
        '\n' +
        'Signature Text:\n' +
        '{Signature_Text}\n' +
        '\n' +
        'Text styling:\n' +
        '\n' +
        '* Modern condensed typography.\n' +
        '* Large bold title.\n' +
        '* Premium cinematic poster design.\n' +
        '* White typography.\n' +
        '* Professional branding layout.\n' +
        '* Elegant hierarchy.\n' +
        '* Clean spacing.\n' +
        '* Editorial composition.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'QUALITY\n' +
        '\n' +
        '* Ultra realistic.\n' +
        '* Hyper detailed.\n' +
        '* 8K resolution.\n' +
        '* Professional poster artwork.\n' +
        '* Adobe Photoshop quality.\n' +
        '* Commercial advertising quality.\n' +
        '* Premium social media banner.\n' +
        '* Sharp focus.\n' +
        '* Perfect facial details.\n' +
        '* Realistic textures.\n' +
        '* High-end color grading.\n' +
        '* Award-winning poster design.\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'NEGATIVE PROMPT\n' +
        '\n' +
        'Do not alter identity, face shape, eyes, nose, lips, beard, hairstyle, skin tone, age, expression, body proportions, ethnicity, or facial details.\n' +
        '\n' +
        'Avoid:\n' +
        '\n' +
        '* face swap\n' +
        '* AI face generation\n' +
        '* extra fingers\n' +
        '* duplicate limbs\n' +
        '* distorted anatomy\n' +
        '* blurry face\n' +
        '* low quality\n' +
        '* cartoon look\n' +
        '* over-smoothing\n' +
        '* plastic skin\n' +
        '* excessive sharpening\n' +
        '* asymmetrical face\n' +
        '* facial artifacts\n' +
        '* incorrect sunglasses\n' +
        '* warped body\n' +
        '* text distortion\n' +
        '* watermark\n' +
        '* logo\n' +
        '* cropped head\n' +
        '* stretched proportions\n' +
        '* identity drift\n' +
        '\n' +
        '⸻\n' +
        '\n' +
        'BEST SETTINGS (for most AI editors)\n' +
        '\n' +
        '* Face Strength / Identity Weight: 100%\n' +
        '* Character Reference Weight: 1.5–2.0\n' +
        '* Stylization: Low\n' +
        '* Creativity: Medium\n' +
        '* Structure Preservation: High\n' +
        '* Detail Preservation: Maximum\n' +
        '* CFG: 6–8\n' +
        '* Quality: Maximum\n' +
        '* Upscale: 2x–4x\n' +
        '\n' +
        'This template is generic enough to work well in ChatGPT Images, Midjourney (with reference image), Flux, Ideogram, Recraft, Leonardo AI, Krea, Freepik AI, and most modern image editing models.',
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  }
];

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
    ? '<span class="member-badge" title="Members-only prompt" aria-label="Members-only prompt"><i class="fas fa-crown"></i></span>'
    : '';
  const favActive = FAVORITES.has(p.id) ? ' active' : '';
  const favIcon = favActive ? 'fas' : 'far';

  return `
    <article class="card-p" data-id="${p.id}">
      <div class="card-img-wrap">
        <button class="card-img" data-img="${escapeHtml(p.image)}" data-title="${escapeHtml(p.title)}" aria-label="Preview ${escapeHtml(p.title)}">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)} demo" loading="lazy"
               onerror="this.style.background='linear-gradient(135deg,#ede9fe,#e0e7ff)';this.removeAttribute('src');this.alt='Demo image coming soon';">
        </button>
        ${memberBadge}
        <button type="button" class="fav-btn${favActive}" data-fav="${p.id}" aria-label="Toggle favorite" aria-pressed="${favActive ? 'true' : 'false'}">
          <i class="${favIcon} fa-heart"></i>
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
async function copyText(text) {
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
  const placeholders = getPlaceholders(p);
  $phFields.innerHTML = placeholders.map((ph, i) => `
    <label class="ph-field">
      <span>${escapeHtml(prettifyLabel(ph))}</span>
      <input type="text" name="${escapeHtml(ph)}" placeholder="Enter ${escapeHtml(prettifyLabel(ph).toLowerCase())}" autocomplete="off" required ${i === 0 ? 'autofocus' : ''}>
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
  const access = await ensureCopyAccess(copiedPrompt);
  if (!access.ok) { closePhDialog(); return; }
  let rawText;
  try {
    rawText = await getPromptText(copiedPrompt);
  } catch (err) {
    console.error('[prompt-gallery] failed to load prompt text', err);
    closePhDialog();
    showToast('Could not load this prompt. Please try again.');
    return;
  }
  const text = fillPrompt(rawText, values);
  const ok = await copyText(text);
  closePhDialog();
  if (ok) {
    showToast(access.creditUsed
      ? `Prompt copied! ${access.creditsLeft} credit${access.creditsLeft === 1 ? '' : 's'} left.`
      : 'Prompt generated & copied!');
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
        ? `Prompt copied! ${access.creditsLeft} credit${access.creditsLeft === 1 ? '' : 's'} left.`
        : 'Prompt copied — paste into your AI image tool');
      copyBtn.classList.add('copied');
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = original;
      }, 1600);
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
  collection, addDoc, getDocs, query, orderBy, limit, writeBatch
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

function toggleUserMenu(force) {
  const open = force ?? $userMenu.hidden;
  $userMenu.hidden = !open;
  $chipBtn.setAttribute('aria-expanded', String(open));
}

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
  if (!e.target.closest('#user-chip')) toggleUserMenu(false);
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
  creditState = { free: 0, paid: 0, resetAt: 0, loaded: false };
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
          <button type="button" class="history-copy" data-copy-history="${escapeHtml(data.promptId)}" ${stillExists ? '' : 'disabled title="Prompt removed"'}>
            <i class="far fa-copy"></i> ${stillExists ? 'Copy' : 'Gone'}
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
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const BIZ_WHATSAPP = '917749984274'; // BankiBites / AK Creation contact
let creditState = { free: 0, paid: 0, resetAt: 0, loaded: false };

function totalCredits() { return (creditState.free || 0) + (creditState.paid || 0); }

async function loadCredits() {
  const u = readSavedUser();
  if (!u) { creditState = { free: 0, paid: 0, resetAt: 0, loaded: false }; renderCreditUI(); return; }
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, u.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    let free = (typeof data.free_credits === 'number') ? data.free_credits : FREE_CREDITS_PER_MONTH;
    const paid = (typeof data.paid_credits === 'number') ? data.paid_credits : 0;
    const resetAt = data.credits_reset_at?.toMillis?.() || 0;
    // Monthly reset: if last reset was >30 days ago (or never), bump free to allowance.
    if (!resetAt || Date.now() - resetAt > MONTH_MS) {
      free = FREE_CREDITS_PER_MONTH;
      await setDoc(ref, {
        free_credits: free,
        credits_reset_at: serverTimestamp(),
      }, { merge: true });
      creditState = { free, paid, resetAt: Date.now(), loaded: true };
    } else {
      creditState = { free, paid, resetAt, loaded: true };
    }
  } catch (err) {
    console.warn('[prompt-gallery] loadCredits failed', err);
    creditState.loaded = true; // best-effort — keep going so UI doesn't hang
  }
  renderCreditUI();
}

async function consumeCredit() {
  const u = readSavedUser();
  if (!u) return false;
  if (!creditState.loaded) await loadCredits();
  if (totalCredits() <= 0) return false;
  try {
    const { db } = await getFirebase();
    const ref = doc(db, PG_COLLECTION, u.uid);
    const updates = {};
    if (creditState.free > 0) {
      updates.free_credits = increment(-1);
      creditState.free = Math.max(0, creditState.free - 1);
    } else {
      updates.paid_credits = increment(-1);
      creditState.paid = Math.max(0, creditState.paid - 1);
    }
    await setDoc(ref, updates, { merge: true });
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
  return { ok, creditUsed: ok, creditsLeft: totalCredits() };
}

// ===== Credit UI rendering =====
function renderCreditUI() {
  const total = totalCredits();
  const $line   = document.querySelector('.credit-line');
  const $count  = document.getElementById('credit-line-count');
  const $chipName = document.getElementById('user-chip-name');
  // Drop any existing pill so we re-render cleanly
  document.querySelector('.user-chip-credit')?.remove();
  if (!readSavedUser()) {
    if ($line) $line.style.display = 'none';
    return;
  }
  if ($line) {
    $line.style.display = 'flex';
    $line.classList.toggle('low', total <= 3);
  }
  if ($count) $count.textContent = String(total);
  // Add a tiny credit pill next to the user-chip name (visible in hero)
  if ($chipName) {
    const pill = document.createElement('span');
    pill.className = 'user-chip-credit' + (total <= 3 ? ' low' : '');
    pill.innerHTML = `<i class="fas fa-bolt"></i> ${total}`;
    pill.title = `${total} credits remaining`;
    $chipName.insertAdjacentElement('afterend', pill);
  }
}

// ===== Buy credits dialog =====
const $buyDialog       = document.getElementById('buy-dialog');
const $buyCreditsNow   = document.getElementById('buy-credits-now');
const $buyCustomAmount = document.getElementById('buy-custom-amount');
const $buyCustomBtn    = document.getElementById('buy-custom-btn');

function openBuyDialog() {
  if (!readSavedUser()) { resetAuthDialog(); openAuthDialog(); return; }
  $buyCreditsNow.textContent = String(totalCredits());
  $buyCustomAmount.value = '';
  if (typeof $buyDialog.showModal === 'function') $buyDialog.showModal();
  else $buyDialog.setAttribute('open', '');
}
function closeBuyDialog() {
  if (typeof $buyDialog.close === 'function') $buyDialog.close();
  else $buyDialog.removeAttribute('open');
}

function whatsappBuyHref(amount) {
  const u = readSavedUser() || {};
  const credits = Math.floor(amount / 5);
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
    const amount = parseInt(pack.dataset.amount, 10);
    if (amount >= 50) {
      // Single user gesture → wa.me via location.href (no await between click and nav)
      window.location.href = whatsappBuyHref(amount);
    }
  }
});

$buyCustomBtn.addEventListener('click', () => {
  const amt = parseInt($buyCustomAmount.value, 10);
  if (!amt || amt < 50) {
    $buyCustomAmount.focus();
    showToast('Minimum amount is ₹50');
    return;
  }
  if (amt % 5 !== 0) {
    showToast('Amount must be a multiple of ₹5');
    return;
  }
  window.location.href = whatsappBuyHref(amt);
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
