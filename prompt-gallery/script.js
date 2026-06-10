// ============================================================
// AI Image Prompt Gallery — data + render + interactions
// ------------------------------------------------------------
// To add a new prompt: append a new object to PROMPTS below.
// `models` accepts any free-text labels — add the AI tools where
// the prompt is known to work well.
// `image` is a relative path; place demo images in /prompts/.
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

// "first_name" -> "First Name"
function prettifyLabel(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cardHTML(p) {
  const chips = (p.models || []).map(m =>
    `<span class="chip"><i class="fas fa-robot"></i>${escapeHtml(m)}</span>`
  ).join('');

  const hasPh = extractPlaceholders(p.prompt).length > 0;
  const btnLabel = hasPh
    ? '<i class="fas fa-wand-magic-sparkles"></i> Generate Prompt'
    : '<i class="far fa-copy"></i> Copy Prompt';

  return `
    <article class="card-p" data-id="${p.id}">
      <button class="card-img" data-img="${escapeHtml(p.image)}" data-title="${escapeHtml(p.title)}" aria-label="Preview ${escapeHtml(p.title)}">
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)} demo" loading="lazy"
             onerror="this.style.background='linear-gradient(135deg,#ede9fe,#e0e7ff)';this.removeAttribute('src');this.alt='Demo image coming soon';">
      </button>
      <div class="card-body">
        <h3 class="card-title">${escapeHtml(p.title)}</h3>
        <div class="chip-row">${chips}</div>
        <div class="card-notes" title="${escapeHtml(p.notes || '')}"><strong>Note:</strong> ${escapeHtml(p.notes || '')}</div>
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

function applyFilter() {
  const q = $search.value.trim().toLowerCase();
  if (!q) return render(PROMPTS);

  const filtered = PROMPTS.filter(p => {
    const hay = [
      p.title,
      ...(p.tags || []),
      ...(p.models || [])
    ].join(' ').toLowerCase();
    return hay.includes(q);
  });
  render(filtered);
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
  const placeholders = extractPlaceholders(p.prompt);
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

$phForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activePrompt) return;
  const data = new FormData($phForm);
  const values = {};
  for (const [k, v] of data.entries()) values[k] = String(v).trim();
  const text = fillPrompt(activePrompt.prompt, values);
  const ok = await copyText(text);
  closePhDialog();
  showToast(ok ? 'Prompt generated & copied!' : 'Could not copy — please copy manually');
});

// ===== Event delegation =====
$grid.addEventListener('click', async (e) => {
  const imgBtn = e.target.closest('.card-img');
  if (imgBtn) {
    openLightbox(imgBtn.dataset.img, imgBtn.dataset.title);
    return;
  }
  const copyBtn = e.target.closest('.copy-btn');
  if (copyBtn) {
    const p = PROMPTS.find(x => x.id === copyBtn.dataset.copy);
    if (!p) return;
    if (extractPlaceholders(p.prompt).length > 0) {
      openPhDialog(p);
      return;
    }
    const ok = await copyText(p.prompt);
    if (ok) {
      showToast('Prompt copied — paste into your AI image tool');
      copyBtn.classList.add('copied');
      const original = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = original;
      }, 1600);
    } else {
      showToast('Could not copy — please copy manually');
    }
  }
});

$search.addEventListener('input', applyFilter);

// Initial render
render(PROMPTS);
