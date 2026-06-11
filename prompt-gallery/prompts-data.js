// ============================================================
// AI Image Prompt Gallery — prompt catalog
// ------------------------------------------------------------
// FREE prompts: full `prompt` text lives here (public anyway).
// MEMBER prompts (tier: 'member'): metadata + placeholders only.
//   The actual prompt text MUST live in Firestore at
//   `member_prompts/{id}.prompt` so it isn't exposed via DevTools.
//
// Placeholder entries support two forms:
//   - string token:    'input_text_1'
//   - object with UX:  { name: 'input_text_1',
//                        label: 'Small script line',
//                        default: 'Happy' }
// ============================================================

export const PROMPTS = [
  // ----- FREE -----
  {
    id: 'lofi-dusk',
    title: 'Lofi Dusk',
    image: 'prompts/lofi-dusk.png',
    prompt: 'Keep the original image composition and framing unchanged. Only enhance lighting, color grading, atmosphere, and background mood.\nTransform the uploaded photo into a premium Instagram Lofi Dusk portrait.\n\nPreserve the exact faces, identity, pose, facial features, hairstyle, outfit, body proportions, and expression of the original subjects. Do not beautify, alter, or replace faces.\n\nCreate a cinematic dusk-to-night atmosphere with a dark muted background, subtle warm bokeh lights, and softly blurred foliage. Add a strong but controlled white backlight behind the subjects, creating a natural glowing rim light around the hair and shoulders.\n\nUse soft front flash illumination to keep facial details visible while maintaining a moody night aesthetic. Exposure should be perfectly balanced — not overexposed, not underexposed.\n\nApply:\n• Warm peach skin highlights\n• Natural skin texture\n• Soft bloom around highlights\n• Gentle atmospheric haze\n• Fine cinematic film grain\n• Shallow depth of field\n• DSLR portrait photography look\n• Realistic lens compression\n• Smooth tonal transitions\n• Rich but realistic colors\n• High dynamic range\n• Soft contrast with deep blacks\n• Instagram premium portrait aesthetic\n\nLighting ratio:\n40% soft front flash\n35% rim light\n25% ambient dusk light\n\nColor grading:\nMuted shadows, warm skin tones, soft purple-magenta accents, subtle orange highlights, dark cinematic background.\n\nAvoid:\nOverexposure, harsh flash, excessive glow, artificial skin smoothing, HDR look, cartoon effects, AI-looking faces, excessive saturation, washed-out colors, extreme darkness, unrealistic bokeh.\n\nStyle:\nProfessional DSLR portrait, 85mm lens, f/1.8, cinematic Instagram Lofi Dusk filter, realistic photography, luxury engagement photoshoot aesthetic.',
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },
  {
    id: 'triple-poster',
    tier: 'member',
    title: 'Triple Poster',
    image: 'prompts/triple-poster.png',
    placeholders: [
      { name: 'Main_Title', label: 'Main Title', default: 'Promoted By' },
      { name: 'Subtitle', label: 'Subtitle', default: 'Anil' },
      { name: 'Signature_Text', label:'Signature Text', default: 'Anil Kumar Sahoo' },
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },

  // ----- MEMBER (text in Firestore: member_prompts/{id}.prompt) -----
  {
    id: 'heroic-poster',
    tier: 'member',
    title: 'Heroic Poster',
    image: 'prompts/heroic-poster.png',
    placeholders: [
      { name: 'name_in_background', label: 'Big background name', default: 'Anil Sahoo' },
      { name: 'front_signature',    label: 'Foreground signature/surname', default: 'Sahoo' },
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },
  {
    id: 'siva-poster',
    title: 'Shiva Mural Portrait',
    image: 'prompts/siva-poster.jpeg',
    prompt: 'A photorealistic full-body portrait of [REFERENCE PERSON — use uploaded image as facial identity reference with 100% face preservation, identity lock ON], a young South Asian man with curly black hair, beard, and glasses, standing barefoot with arms crossed and one leg casually crossed over the other, leaning against a large textured outdoor wall. He is wearing a slightly open-collar cream linen shirt with sleeves rolled up and ripped light-wash denim jeans.\n\nThe background is a massive, hyper-detailed painted mural covering the entire wall — depicting Lord Shiva with deep blue skin, flowing dark hair, a prominent third eye, white horizontal forehead markings with an orange bindi, large golden hoop earrings, a coiled cobra around the neck, rudraksha bead necklaces, and a golden trishul (trident) with a red cloth tied to it held in one hand. The mural has a weathered, aged paint texture with dark teal, burnt orange, and gold tones.\n\nThe subject stands confidently in front of the mural, positioned slightly left of center, gazing contemplatively to his right. The mural\'s face is directly behind and above him, creating a powerful visual alignment between the two figures.\n\nCinematic moody lighting — dark ambient with warm golden rim light. Shallow depth of field with the subject in sharp focus and the mural slightly textured but vivid. Editorial street photography style, portrait orientation, film grain, ultra-realistic, 8K.',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'couple-poster',
    tier: 'member',
    title: 'Bollywood Couple Poster',
    image: 'prompts/couple-1.png',
    placeholders: [
      { name: 'input_text_1', label: 'Small script line above main text', default: 'Happy' },
      { name: 'input_text_2', label: 'Main large calligraphy title',      default: 'Marriage Life' }
    ],
    notes: 'Upload two clear front-facing photos — one for each person.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['couple', 'portrait', 'cinematic', 'wedding']
  },
  {
    id: 'quarter-poster',
    tier: 'member',
    title: 'Quarter-Frame Style Poster',
    image: 'prompts/quater-poster.png',
    placeholders: [
      { name: 'input_text_1', label: 'Large center title (your name)',  default: 'ANIL (your name)' },
      { name: 'input_text_2', label: 'Top-left line 1',                 default: 'BUILT IN SILENCE' },
      { name: 'input_text_3', label: 'Top-left line 2',                 default: 'SHINES IN STYLE' },
      { name: 'input_text_4', label: 'Bottom-left cursive red text',    default: 'Not Lucky' },
      { name: 'input_text_5', label: 'Bottom-left bold white text',     default: 'JUST DISCIPLINED' },
      { name: 'input_text_6', label: 'Bottom-right caption line 1',     default: 'DISCIPLINE TODAY' },
      { name: 'input_text_7', label: 'Bottom-right caption line 2',     default: 'SUCCESS TOMORROW' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'fashion', 'editorial', 'dark']
  },
  {
    id: 'chibi-3d-poster',
    tier: 'member',
    title: '3D Chibi Squad Poster',
    image: 'prompts/3d-poster.png',
    placeholders: [
      { name: 'input_text_1', label: 'Top center cursive (with heart)', default: 'Shine 🤍' },
      { name: 'input_text_2', label: 'Top right quoted text',            default: 'Bright day' },
      { name: 'input_text_3', label: 'Middle right text (with heart)',   default: 'happy' },
      { name: 'input_text_4', label: 'Bottom left cursive',              default: 'Smile' },
      { name: 'input_text_5', label: 'Bottom right text',                default: 'Good vibes' },
      { name: 'input_text_6', label: 'Near chibi 3 small casual text',   default: 'cool!' }
    ],
    notes: 'Upload a clear full-body photo if possible — outfit and pose will be referenced.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', '3d', 'fun', 'chibi']
  },
  {
    id: 'dark-action-poster',
    tier: 'member',
    title: 'Dark Action Hero Poster',
    image: 'prompts/black-poster.png',
    placeholders: [
      { name: 'input_text_1', label: 'Top motivational quote',     default: "I DON'T FOLLOW THE CROWD, I MAKE MY OWN PATH" },
      { name: 'input_text_2', label: 'Bold center-right quote',    default: 'SILENT PEOPLE HAVE THE LOUDEST MINDS' },
      { name: 'input_text_3', label: 'Bottom left stacked words',  default: 'FOCUS / MINDSET / SUCCESS' },
      { name: 'input_text_4', label: 'Bottom right stacked words', default: 'BUILT IN SILENCE / MOVING IN LEGACY' },
      { name: 'input_text_5', label: 'Signature name',             default: '(your name in cursive)' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'action', 'cinematic', 'dark']
  },
  {
    id: 'maternity-glow',
    title: 'Maternity Glow Portrait',
    image: 'prompts/maternity-1.png',
    notes: 'Upload two clear photos — one of the expectant mother and one of the partner.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['maternity', 'couple', 'cinematic', 'traditional']
  },
  {
    id: 'mass-hero-poster',
    tier: 'member',
    title: 'South Cinema Mass Hero Poster',
    image: 'prompts/sunset-poster.png',
    notes: 'Upload a clear photo of a single person — front-facing works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'cinematic', 'action', 'poster']
  },
  {
    id: 'birthday-calendar',
    tier: 'member',
    title: 'Birthday Calendar Portrait',
    image: 'prompts/birthday-1.png',
    placeholders: [
      { name: 'input_text_1', label: 'Greeting line (small caps)',  default: 'HAPPY' },
      { name: 'input_text_2', label: 'Main calligraphy title',      default: 'Birthday' },
      { name: 'input_text_3', label: 'Subtitle / subheading',       default: 'Wishing you a day as beautiful and special as you are' },
      { name: 'input_text_4', label: 'Month name',                  default: 'JUNE' },
      { name: 'input_text_5', label: 'Year',                        default: '2026' },
      { name: 'input_text_6', label: 'Birthday date number',        default: '5' },
      { name: 'input_text_7', label: 'Footer blessing message',     default: 'May this year bring you endless joy, love and beautiful moments.' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'birthday', 'elegant', 'calendar']
  },
  {
    id: 'watercolor-butterfly',
    tier: 'member',
    title: 'Watercolor Butterfly Portrait',
    image: 'prompts/butterfly-poster.png',
    placeholders: [
      { name: 'input_text_1', label: 'Your name in cursive', default: 'Pavi' }
    ],
    notes: 'Upload a clear front-facing photo — close-up portraits give the best result.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'watercolor', 'artistic', 'feminine']
  },
  {
    id: 'mirror-reflection',
    title: 'Mirror Reflection Portrait',
    image: 'prompts/mirror-effect.png',
    notes: 'Upload a clear front-facing photo — the face will appear in the mirror reflection.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'cinematic', 'traditional', 'editorial']
  },
  {
    id: 'dual-saree-dance',
    title: 'Twin Saree Dance Poster',
    image: 'prompts/slaze-pose.png',
    notes: 'Upload a clear front-facing photo — used as identity for both versions.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'bollywood', 'dance', 'cinematic']
  },
  {
    id: 'mood-collage',
    tier: 'member',
    title: 'Lily Mood Board Collage',
    image: 'prompts/flower-effect.png',
    placeholders: [
      { name: 'input_text_1', label: 'Song name',         default: 'Vennelave' },
      { name: 'input_text_2', label: 'Artist name',       default: 'hariHarana' },
      { name: 'input_text_3', label: 'Current time',      default: '1:24' },
      { name: 'input_text_4', label: 'Total duration',    default: '4:38' }
    ],
    notes: 'Upload a clear front-facing photo — used across all four crops in the collage.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'collage', 'aesthetic', 'film']
  },
  {
    id: 'bookshelf-name',
    tier: 'member',
    title: 'Bookshelf Name Portrait',
    image: 'prompts/name-pose.png',
    placeholders: [
      { name: 'input_text_1', label: "Child's name (one letter per shelf)", default: 'KINSHA' },
      { name: 'input_text_2', label: 'Book title',                          default: 'FAIRY TALES' },
      { name: 'input_text_3', label: 'Chalkboard text',                     default: 'Coffee and Good Vibes' }
    ],
    notes: 'Upload a clear photo of the child — front-facing works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'kids', 'cozy', 'cinematic']
  },
  {
    id: 'bali-gate-mirror',
    title: 'Bali Gate Mirror Reflection',
    image: 'prompts/thailand-pose.jpeg',
    notes: 'Upload one or two photos — subjects appear as small figures in the gateway.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['travel', 'cinematic', 'symmetry', 'temple']
  }
];
