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
    id: 'photo-quality-enhance',
    title: 'Photo Quality Enhancer',
    image: 'prompts/photo-quality-enhance.webp',
    prompt: "Perform a non-destructive, identity-preserving QUALITY ENHANCEMENT of the supplied image. Treat this as a professional photo-restoration and upscaling task — NOT a creative re-imagining.\n\nPRIMARY GOAL:\nImprove the technical image quality (resolution, sharpness, clarity, tonal range, color fidelity, noise, compression artifacts) while keeping the source image 100% faithful to its original content, composition, identity, and meaning.\n\nABSOLUTE PRESERVATION RULES (do NOT change any of these):\n- Identity: Every person's face must remain a 100% exact match to the original — same facial structure, same proportions, same skin tone, same eye color, same hair, same expression, same age. Do not beautify, slim, reshape, restyle, or alter any facial feature in any way. No retouching of moles, freckles, scars, wrinkles, glasses, jewelry, or accessories.\n- Text: Every character of every word must remain pixel-faithful to the original spelling, font, weight, color, kerning, and position. Do not add new text. Do not remove text. Do not re-letter logos. Do not \"clean up\" or rewrite blurry text — only sharpen it without changing characters. Spelling must stay byte-identical.\n- Logos & brand marks: Keep every logo's shape, color, proportion, and placement exactly as-is. No restyling, recoloring, or redrawing.\n- Composition: Same framing, same crop, same aspect ratio (unless upscaling proportionally). Same camera angle. Same object positions.\n- Colors: Same hues. Same color grading intent. You may correct slight white-balance issues if obvious, but do not shift the overall palette.\n- Background: Same background content. Do not replace, regenerate, blur, or \"improve\" the background composition.\n- Clothing & accessories: Same garments, same patterns, same logos on clothing, same jewelry, same eyewear. No re-styling.\n\nWHAT TO IMPROVE (allowed enhancements):\n- Resolution: Upscale to high resolution (target 4K / 4096 px on the longest edge, or 4× the original — whichever is smaller) using detail-preserving upscaling.\n- Sharpness: Recover crisp edges, fine textures (fabric weave, skin pores, hair strands, food garnish, paper grain) without over-sharpening halos.\n- Clarity: Reduce softness from motion blur or out-of-focus areas WITHOUT inventing new detail that wasn't suggested in the original.\n- Noise reduction: Remove digital sensor noise, ISO grain, and chroma noise — but retain natural film-grain feel if the original had it intentionally.\n- Compression artifacts: Remove JPEG blocking, banding in skies and gradients, mosquito noise around text edges, posterization.\n- Tonal range: Recover slightly crushed shadows and clipped highlights; expand dynamic range gently. No HDR look. No tone-mapped halos.\n- Color fidelity: Restore saturation lost to compression. Do not oversaturate. Do not apply a creative filter / film LUT / Instagram preset.\n- Chromatic aberration: Remove purple/green fringing on high-contrast edges.\n- Lens distortion: Correct only obvious heavy distortion; leave natural perspective alone.\n\nNEGATIVE INSTRUCTIONS — DO NOT:\n- Do not regenerate, redraw, or repaint any portion of the image.\n- Do not change faces, body shapes, ages, ethnicities, or expressions.\n- Do not \"beautify\" skin, smooth wrinkles, slim jawlines, brighten eyes, enlarge eyes, change hair color, or whiten teeth.\n- Do not add or remove any object, person, animal, text, watermark, signature, or background element.\n- Do not change the aspect ratio or crop differently.\n- Do not apply stylization (oil-paint, anime, cartoon, 3D-render, HDR look, vintage filter, sepia tone, B&W conversion).\n- Do not add bokeh, depth-of-field blur, vignettes, light leaks, film grain, or any creative effect not in the original.\n- Do not \"fix\" perceived flaws if they are part of the original intent (e.g., intentional motion blur, intentional grain).\n- Do not invent text characters where the original was illegible — leave illegible areas as cleanly-blurred illegible.\n\nOUTPUT REQUIREMENTS:\n- Format: PNG (lossless) or high-quality JPEG (quality 95+).\n- Resolution: as defined above.\n- Color space: sRGB.\n- Bit depth: 8-bit minimum, 16-bit preferred if supported.\n- No watermarks, no AI signature stamps, no metadata banners added.\n\nPOLICY-SAFE FRAMING:\nThis is a routine photo-restoration / upscaling task on legitimately owned material. The goal is technical fidelity, not content alteration. No identity changes, no synthetic re-creation of any person.",
    notes: 'Upload any photo you want enhanced — portraits, group shots, documents, posters, screenshots. Works best on lower-resolution or compressed images.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['enhance', 'restoration', 'upscale', 'quality']
  },
  {
    id: 'lofi-dusk',
    title: 'Lofi Dusk',
    image: 'prompts/lofi-dusk.webp',
    prompt: 'Keep the original image composition and framing unchanged. Only enhance lighting, color grading, atmosphere, and background mood.\nTransform the uploaded photo into a premium Instagram Lofi Dusk portrait.\n\nPreserve the exact faces, identity, pose, facial features, hairstyle, outfit, body proportions, and expression of the original subjects. Do not beautify, alter, or replace faces.\n\nCreate a cinematic dusk-to-night atmosphere with a dark muted background, subtle warm bokeh lights, and softly blurred foliage. Add a strong but controlled white backlight behind the subjects, creating a natural glowing rim light around the hair and shoulders.\n\nUse soft front flash illumination to keep facial details visible while maintaining a moody night aesthetic. Exposure should be perfectly balanced — not overexposed, not underexposed.\n\nApply:\n• Warm peach skin highlights\n• Natural skin texture\n• Soft bloom around highlights\n• Gentle atmospheric haze\n• Fine cinematic film grain\n• Shallow depth of field\n• DSLR portrait photography look\n• Realistic lens compression\n• Smooth tonal transitions\n• Rich but realistic colors\n• High dynamic range\n• Soft contrast with deep blacks\n• Instagram premium portrait aesthetic\n\nLighting ratio:\n40% soft front flash\n35% rim light\n25% ambient dusk light\n\nColor grading:\nMuted shadows, warm skin tones, soft purple-magenta accents, subtle orange highlights, dark cinematic background.\n\nAvoid:\nOverexposure, harsh flash, excessive glow, artificial skin smoothing, HDR look, cartoon effects, AI-looking faces, excessive saturation, washed-out colors, extreme darkness, unrealistic bokeh.\n\nStyle:\nProfessional DSLR portrait, 85mm lens, f/1.8, cinematic Instagram Lofi Dusk filter, realistic photography, luxury engagement photoshoot aesthetic.',
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)'],
    tags: ['portrait', 'studio', 'cinematic']
  },
  {
    id: 'triple-poster',
    tier: 'member',
    title: 'Triple Poster',
    image: 'prompts/triple-poster.webp',
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
    image: 'prompts/heroic-poster.webp',
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
    image: 'prompts/siva-poster.webp',
    prompt: 'A photorealistic full-body portrait of [REFERENCE PERSON — use uploaded image as facial identity reference with 100% face preservation, identity lock ON], a young South Asian man with curly black hair, beard, and glasses, standing barefoot with arms crossed and one leg casually crossed over the other, leaning against a large textured outdoor wall. He is wearing a slightly open-collar cream linen shirt with sleeves rolled up and ripped light-wash denim jeans.\n\nThe background is a massive, hyper-detailed painted mural covering the entire wall — depicting Lord Shiva with deep blue skin, flowing dark hair, a prominent third eye, white horizontal forehead markings with an orange bindi, large golden hoop earrings, a coiled cobra around the neck, rudraksha bead necklaces, and a golden trishul (trident) with a red cloth tied to it held in one hand. The mural has a weathered, aged paint texture with dark teal, burnt orange, and gold tones.\n\nThe subject stands confidently in front of the mural, positioned slightly left of center, gazing contemplatively to his right. The mural\'s face is directly behind and above him, creating a powerful visual alignment between the two figures.\n\nCinematic moody lighting — dark ambient with warm golden rim light. Shallow depth of field with the subject in sharp focus and the mural slightly textured but vivid. Editorial street photography style, portrait orientation, film grain, ultra-realistic, 8K.',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'krishna-poster',
    tier: 'member',
    title: 'Krishna Mural Portrait',
    image: 'prompts/krishna-poster.webp',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'ganesha-poster',
    tier: 'member',
    title: 'Ganesha Mural Portrait',
    image: 'prompts/ganesha-poster.webp',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'hanuman-poster',
    tier: 'member',
    title: 'Hanuman Mural Portrait',
    image: 'prompts/hanuman-poster.webp',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'rama-poster',
    tier: 'member',
    title: 'Rama Mural Portrait',
    image: 'prompts/rama-poster.webp',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'jagannath-poster',
    tier: 'member',
    title: 'Jagannath Mural Portrait',
    image: 'prompts/jagannath-poster.webp',
    notes: 'Upload a clear photo of a single person — full body or three-quarter shot works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'mural', 'cinematic', 'devotional']
  },
  {
    id: 'couple-poster',
    title: 'Bollywood Couple Poster',
    prompt: "A cinematic Bollywood-style romantic couple portrait poster.\n\nSUBJECT 1 — MAN (use uploaded photo 1 as facial identity reference, 100% face preservation, identity lock ON): South Asian man with neatly styled dark hair and a well-groomed beard, wearing a deep burgundy/maroon full-sleeve fitted shirt. He stands behind the woman, arms gently wrapped around her, with a calm, intense forward gaze.\n\nSUBJECT 2 — WOMAN (use uploaded photo 2 as facial identity reference, 100% face preservation, identity lock ON): Young South Asian woman with softly curled and braided hair adorned with a small floral pin. She wears a rich red embroidered lehenga or kurta with a sheer dusty-rose dupatta, traditional gold jhumka earrings, a small red bindi, and red and gold bangles. She rests one hand gently near her chin, smiling softly with a dreamy upward gaze.\n\nPOSE: The man stands slightly behind and above, his arms wrapped lovingly around the woman from behind. The woman leans gently back into him. Half-body to three-quarter shot, centered composition.\n\nBACKGROUND: Warm cream/off-white softly textured background. Behind the couple are two large dramatic dark maroon-red profile silhouettes — the man's silhouette on the left side and the woman's silhouette on the right side — both fading softly into the background like a double-exposure shadow effect. Tiny floating red heart or rose petal particles scattered lightly across the image.\n\nLIGHTING: Soft warm studio lighting with a gentle vignette. Romantic, intimate mood.\n\nSTYLE: Bollywood movie poster, high-end romantic editorial photography, ultra-realistic, 8K, cinematic color grading in deep maroon and warm gold tones.\n\nTEXT OVERLAY: Add the small script text \"{input_text_1}\" above the large elegant calligraphy text \"{input_text_2}\" at the bottom center of the image, in off-white/cream color with a soft glow. Add a small decorative swirl flourish beneath the text.",
    image: 'prompts/couple-1.webp',
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
    image: 'prompts/quater-poster.webp',
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
    image: 'prompts/3d-poster.webp',
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
    image: 'prompts/black-poster.webp',
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
    image: 'prompts/maternity-1.webp',
    prompt: "A photorealistic cinematic Indian maternity portrait with a magical fantasy womb-glow effect.\n\nSUBJECT 1 — WOMAN (use uploaded photo 1 as facial identity reference, 100% face preservation, identity lock ON):\nA pregnant South Asian woman standing upright, smiling warmly and gazing downward with joy. She wears a rich deep crimson/maroon Kanjivaram silk saree with intricate gold zari embroidery border and a matching embroidered blouse with traditional motifs. She is adorned with a layered gold long necklace (haar), maang tikka, gold jhumka earrings, a red bindi, and multiple stacked green and gold bangles on both wrists. Her dark wavy hair is styled with a white jasmine gajra flower garland pinned to the side.\n\nSUBJECT 2 — MAN (use uploaded photo 2 as facial identity reference, 100% face preservation, identity lock ON):\nA South Asian man with short curly dark hair and a light beard, wearing a clean white full-sleeve shirt and a watch. He is crouching or kneeling in front of the woman, facing toward her pregnant belly, looking at it with an expression of love and wonder. His hands gently hold the woman's hands near her belly.\n\nKEY FANTASY EFFECT — GLOWING WOMB VISUALIZATION:\nOn the woman's pregnant belly, render a magical glowing translucent orb effect — as if the womb is visible through the saree in a fantastical, non-graphic way. Inside the orb, show a beautifully rendered sleeping newborn baby in a peaceful curled fetal position, surrounded by warm golden light, swirling cosmic sparkle particles, starlight dust, and soft energy rings. The glow emanates outward from the belly in warm amber and golden tones, blending softly with the saree fabric. The effect should feel sacred, magical, and divine — like a celestial soul arriving.\n\nBACKGROUND:\nA richly decorated traditional South Indian interior space. Elements include: a large detailed Pichwai or Mughal-style painted mural on the wall featuring a colorful peacock on a flowering tree branch (cream/beige background); hanging jasmine flower garland torana on both sides; a lit traditional brass oil lamp (diya/vilakku) on a stand glowing in the background; fresh pink and white flower arrangements scattered throughout; soft bokeh background.\n\nLIGHTING: Warm golden candlelight ambiance, soft diffused studio light on subjects, glowing ember light from the womb effect, shallow depth of field.\n\nCOLOR GRADE: Deep crimson and gold tones for the woman; clean white for the man; warm amber and cream for the background; sparkling gold for the womb fantasy effect.\n\nMOOD: Sacred, tender, joyful, culturally traditional, deeply emotional.\n\nSTYLE: Ultra-realistic cinematic maternity photography with magical fantasy compositing, 8K, HDR, professional Indian wedding/maternity photography style.",
    notes: 'Upload two clear photos — one of the expectant mother and one of the partner.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['maternity', 'couple', 'cinematic', 'traditional']
  },
  {
    id: 'mass-hero-poster',
    tier: 'member',
    title: 'South Cinema Mass Hero Poster',
    image: 'prompts/sunset-poster.webp',
    notes: 'Upload a clear photo of a single person — front-facing works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'cinematic', 'action', 'poster']
  },
  {
    id: 'birthday-calendar',
    tier: 'member',
    title: 'Birthday Calendar Portrait',
    image: 'prompts/birthday-1.webp',
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
    image: 'prompts/butterfly-poster.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Your name in cursive', default: 'Pavi' }
    ],
    notes: 'Upload a clear front-facing photo — close-up portraits give the best result.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'watercolor', 'artistic', 'feminine']
  },
  {
    id: 'mirror-reflection',
    tier: 'member',
    title: 'Mirror Reflection Portrait',
    image: 'prompts/mirror-effect.webp',
    notes: 'Upload a clear front-facing photo — the face will appear in the mirror reflection.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'cinematic', 'traditional', 'editorial']
  },
  {
    id: 'dual-saree-dance',
    tier: 'member',
    title: 'Twin Saree Dance Poster',
    prompt: "A vibrant cinematic Bollywood-style editorial portrait featuring the SAME woman appearing TWICE in one frame — as two versions of herself in different colored sarees, both joyful and dancing.\n\n——————————————————————————————\nFACE & IDENTITY REFERENCE:\n——————————————————————————————\nUse the uploaded photo as the sole facial identity reference.\nPreserve 100% facial features, skin tone, bindi placement, eye shape, smile, and complete likeness with photorealistic accuracy across BOTH versions of the subject in the image.\nBoth figures must be clearly and unmistakably the same person.\nNatural warm makeup. Bright joyful smile on both faces.\nSmall traditional bindi on forehead (both versions).\n\n——————————————————————————————\nFIGURE 1 — FOREGROUND (primary, larger, closer to camera):\n——————————————————————————————\nThe woman is positioned in the foreground, slightly left of center. She appears larger due to proximity — upper body to waist visible clearly, arm extended dynamically toward the camera/viewer in a dance gesture.\n\nPOSE: Mid-dance movement — body slightly turned, one arm reaching forward toward camera, face turned to look at viewer with a radiant joyful smile. Hair is loose and windswept — flowing dramatically to one side as if blown by wind or spinning motion. Motion blur on saree fabric edges to convey movement.\n\nOUTFIT: Rich deep crimson/burgundy red silk saree with intricate heavy gold zari embroidery along the border and pallu. Saree fabric has a slight sheen and movement. Matching red-toned silk blouse with gold embroidery detailing.\n\nACCESSORIES:\n- Heavy gold choker necklace with gemstone accents\n- Long gold jhumka (bell) earrings\n- Multiple gold bangles stacked on wrist\n- Small gold waist belt/kamarband visible\n\nHAIR: Very long, dark, flowing freely — windswept and dynamic, strands catching the golden backlight.\n\n——————————————————————————————\nFIGURE 2 — BACKGROUND (same person, slightly behind, smaller):\n——————————————————————————————\nThe same woman appears again slightly behind and to the right of Figure 1 — clearly a second instance of the same person, not a different individual.\n\nPOSE: Standing in a graceful dance pose, looking upward and slightly to the side with a wide bright smile — joyful, carefree expression. Body angled three-quarter toward camera.\n\nOUTFIT: Deep forest green/emerald silk saree with gold embroidery border. Matching green blouse with gold trim.\n\nACCESSORIES: Same gold jewelry style — choker, jhumka earrings, bangles.\n\nHAIR: Long dark wavy hair, loose and flowing naturally, slightly less windswept than foreground version.\n\nSIZE RELATIONSHIP: Background figure is approximately 60-65% the size of foreground figure — natural depth perspective.\n\n——————————————————————————————\nBUTTERFLY ELEMENTS:\n——————————————————————————————\nMultiple butterflies of DIFFERENT species and colors scattered freely throughout the composition:\n\n- 4-5 BLUE MORPHO butterflies: Vivid iridescent electric blue wings, medium to large size\n- 3-4 PINK/MAGENTA butterflies: Bright hot pink with darker edge patterns\n- 2-3 smaller mixed butterflies near edges\n\nButterflies are mid-flight at various angles and distances. Some near the foreground figure's hair and hands. Some floating between the two figures. Some near background figure's shoulder. All rendered photorealistically with slight motion blur on wings.\n\n——————————————————————————————\nBACKGROUND & ATMOSPHERE:\n——————————————————————————————\nMagical, ethereal warm golden environment:\n- Soft warm amber/golden bokeh light orbs of varying sizes\n- Glowing sparkle particles floating throughout the air\n- Radiant golden backlight creating a glowing halo effect around both figures\n- Soft out-of-focus warm light — like golden hour sunlight diffused through a magical setting\n- Subtle pinkish-magenta light accents mixing with gold\n- No identifiable location — purely atmospheric and magical\n- Deep warm golden brown background that gradually brightens toward center\n\nOverall background feel: Like a Bollywood dance sequence set in a magical golden realm — festive, luminous, divine.\n\n——————————————————————————————\nCOLOR PALETTE:\n——————————————————————————————\nHero colors: Deep crimson red, forest emerald green\nGold: Rich 22k gold tone throughout jewelry and embroidery\nBackground: Warm amber gold (#D4890A), soft rose gold accents\nButterflies: Electric blue (#0066FF), vivid magenta (#FF1493)\nAtmosphere: Golden particles, warm bokeh (#FFD700, #FF8C00)\nSkin: Warm medium South Indian skin tone, natural glow\n\n——————————————————————————————\nLIGHTING:\n——————————————————————————————\nWarm cinematic golden lighting:\n- Strong warm backlight creating luminous rim/halo effect\n- Soft front fill light — warm golden tone on faces\n- Saree fabric catching light with silky sheen\n- Jewelry glinting and sparkling with light reflections\n- Overall high-key warm and radiant — no dark shadows\n\n——————————————————————————————\nTECHNICAL SPECS:\n——————————————————————————————\nAspect ratio: 3:4 portrait (mobile/Instagram)\nResolution: Ultra-detailed 8K photorealistic\nCamera simulation: 50mm lens, f/2.0 — shallow depth of field, background figure slightly softer than foreground\nStyle: High-end Bollywood movie promotional poster / Indian fashion editorial photography\nMotion: Dynamic — suggest movement through flowing fabric, windswept hair, blurred butterfly wings\nQuality: Cinema-grade color grading, professional composite\n\nCRITICAL RULES:\n— Both figures must have IDENTICAL facial identity — same person, same face, no variation\n— Do not age, alter, or modify facial features\n— Maintain warm South Indian skin tone authentically\n— Red saree = foreground, Green saree = background\n— No text or watermarks",
    image: 'prompts/slaze-pose.webp',
    notes: 'Upload a clear front-facing photo — used as identity for both versions.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'bollywood', 'dance', 'cinematic']
  },
  {
    id: 'mood-collage',
    tier: 'member',
    title: 'Lily Mood Board Collage',
    image: 'prompts/flower-effect.webp',
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
    image: 'prompts/name-pose.webp',
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
    id: 'teal-quad-portrait',
    tier: 'member',
    title: 'Teal Quad Portrait Poster',
    image: 'prompts/teal-quad-portrait.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Top-left cursive (watermark/handle)', default: '@yourhandle' },
      { name: 'input_text_2', label: 'Middle-left cursive line',            default: 'She is' },
      { name: 'input_text_3', label: 'Middle-left bold display word',       default: 'STRENGTH' },
      { name: 'input_text_4', label: 'Middle-left small-caps tagline',      default: 'IN EVERY STEP, GRACE IN EVERY MOMENT.' },
      { name: 'input_text_5', label: 'Middle-right stacked word 1',         default: 'DREAMER.' },
      { name: 'input_text_6', label: 'Middle-right stacked word 2',         default: 'BELIEVER.' },
      { name: 'input_text_7', label: 'Middle-right teal accent word',       default: 'ACHIEVER.' },
      { name: 'input_text_8', label: 'Bottom-left cursive line',            default: 'Be you. Do you. For you.' },
      { name: 'input_text_9', label: 'Bottom-right italic quote',           default: 'She creates her own world with courage and kindness.' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'editorial', 'cinematic', 'teal']
  },
  {
    id: 'maternity-orb-reveal',
    tier: 'member',
    title: 'Maternity Orb Reveal',
    image: 'prompts/maternity-orb-reveal.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Top cursive line 1',           default: 'Dear Papa,' },
      { name: 'input_text_2', label: 'Top cursive line 2',           default: "I can't wait to meet you♡" },
      { name: 'input_text_3', label: 'Speech bubble text from belly', default: 'Hi Papa... I can feel your love already!' },
      { name: 'input_text_4', label: 'Small subtitle below',         default: 'You are my first hero and forever my best friend.' }
    ],
    notes: 'Upload two clear photos — one of the expectant father and one of the expectant mother.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['maternity', 'couple', 'magical', 'announcement']
  },
  {
    id: 'kids-streetwear-trio',
    tier: 'member',
    title: 'Kids Streetwear Trio Lookbook',
    image: 'prompts/kids-streetwear-trio.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Large title line 1 (lavender-grey)', default: 'STAY' },
      { name: 'input_text_2', label: 'Large title line 2 (hot pink)',      default: 'COOL' },
      { name: 'input_text_3', label: 'Speech bubble 1 text',                default: 'GOOD VIBES' },
      { name: 'input_text_4', label: 'Speech bubble 2 text',                default: 'BE YOU' },
      { name: 'input_text_5', label: 'Scattered casual handwriting',        default: 'XOXO' }
    ],
    notes: 'Upload a clear photo of the child — front-facing works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'kids', 'streetwear', 'lookbook']
  },
  {
    id: 'enchanted-bridal-dreams',
    tier: 'member',
    title: 'Enchanted Bridal Dreams',
    image: 'prompts/enchanted-bridal-dreams.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Top small caps line',            default: 'ENCHANTED' },
      { name: 'input_text_2', label: 'Large bold display word',        default: 'BRIDAL' },
      { name: 'input_text_3', label: 'Italic/script accent word',      default: 'Dreams' }
    ],
    notes: 'Upload a clear front-facing photo — close-up portraits work best for bridal detail.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['bridal', 'portrait', 'editorial', 'luxury']
  },
  {
    id: 'speed-blur-editorial',
    tier: 'member',
    title: 'Speed Blur Fashion Editorial',
    image: 'prompts/speed-blur-editorial.webp',
    notes: 'Upload a clear full-body photo if possible — outfit and pose will be referenced.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'editorial', 'fashion', 'vfx']
  },
  {
    id: 'birthday-gold-tribute',
    tier: 'member',
    title: 'Birthday Gold Tribute Poster',
    image: 'prompts/birthday-gold-tribute.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Top small-caps line 1',          default: 'HAPPY' },
      { name: 'input_text_2', label: 'Top small-caps line 2',          default: 'BIRTHDAY' },
      { name: 'input_text_3', label: 'Large 3D gold name',             default: 'RAHUL' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['birthday', 'portrait', 'cinematic', 'luxury']
  },
  {
    id: 'birthday-pink-bloom',
    tier: 'member',
    title: 'Pink Bloom Birthday Portrait',
    image: 'prompts/birthday-pink-bloom.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Small caps greeting',         default: 'HAPPY BIRTHDAY' },
      { name: 'input_text_2', label: 'First name (cursive)',        default: 'Bhagyashree' },
      { name: 'input_text_3', label: 'Last name + ♡ (cursive)',     default: 'Bhorse ♡' }
    ],
    notes: 'Upload a clear front-facing photo — close-up portraits work best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['birthday', 'portrait', 'floral', 'feminine']
  },
  {
    id: 'mono-color-tribute',
    tier: 'member',
    title: 'Mono + Color Tribute Portrait',
    image: 'prompts/mono-color-tribute.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Large cursive name',         default: 'Priya' },
      { name: 'input_text_2', label: 'Optional small tagline',     default: 'Forever Graceful' }
    ],
    notes: 'Upload a clear front-facing photo — close-up portraits work best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'editorial', 'monochrome', 'tribute']
  },
  {
    id: 'birthday-amber-glow',
    tier: 'member',
    title: 'Amber Glow Birthday Portrait',
    image: 'prompts/birthday-amber-glow.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Large cursive name',         default: 'Aryan' },
      { name: 'input_text_2', label: 'Birthday subtext (cursive)', default: 'happy birthday' },
      { name: 'input_text_3', label: '3D glowing letters',         default: 'hb' },
      { name: 'input_text_4', label: 'Birth date (small caps)',    default: '17 - april' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['birthday', 'portrait', 'amber', 'cinematic']
  },
  {
    id: 'tiny-chocolate-hug',
    tier: 'member',
    title: 'Tiny Chocolate Bar Hug',
    image: 'prompts/tiny-chocolate-hug.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Chocolate bar brand',  default: 'KitKat' }
    ],
    notes: 'Upload a clear front-facing photo of the adult subject — face and head pose are referenced.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['fun', 'miniature', 'macro', 'whimsical']
  },
  {
    id: 'sunset-sky-merge',
    tier: 'member',
    title: 'Sunset Sky Merge Portrait',
    image: 'prompts/sunset-sky-merge.webp',
    notes: 'Upload a clear front-facing photo — face and full-body pose will be referenced.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'cinematic', 'sunset', 'double-exposure']
  },
  {
    id: 'baby-doodle-grid',
    tier: 'member',
    title: 'Baby Doodle 3x3 Grid',
    image: 'prompts/baby-doodle-grid.webp',
    placeholders: [
      { name: 'input_text_1',  label: 'Panel 1 label (Runner)',           default: 'The Runner' },
      { name: 'input_text_2',  label: 'Panel 2 label (Performer)',        default: 'The Performer' },
      { name: 'input_text_3',  label: 'Panel 3 label (Foodie)',           default: 'The Foodie' },
      { name: 'input_text_4',  label: 'Panel 4 label (Superhero)',        default: 'The Superhero' },
      { name: 'input_text_5',  label: 'Panel 5 label (Vacationer)',       default: 'The Vacationer' },
      { name: 'input_text_6',  label: 'Panel 6 label (Athlete)',          default: 'The Athlete' },
      { name: 'input_text_7',  label: 'Panel 7 label (Gymnast)',          default: 'The Gymnast' },
      { name: 'input_text_8',  label: 'Panel 8 label (Shopper)',          default: 'The Shopper' },
      { name: 'input_text_9',  label: 'Shopping bag brand (panel 8)',     default: 'FirstCry' },
      { name: 'input_text_10', label: 'Panel 9 label (Rockstar)',         default: 'The Rockstar' }
    ],
    notes: 'Upload a clear top-down photo of the baby — face fully visible works best.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['baby', 'collage', 'doodle', 'fun']
  },
  {
    id: 'personal-brand-poster',
    tier: 'member',
    title: 'Personal Brand Hero Poster',
    image: 'prompts/personal-brand-poster.webp',
    placeholders: [
      { name: 'input_text_1', label: 'Top small-caps tagline',           default: 'DRIVEN BY VISION. POWERED BY GRIT.' },
      { name: 'input_text_2', label: 'Bold center-right quote',          default: 'EVERY MOVE MATTERS.\nEVERY MOMENT MATTERS.' },
      { name: 'input_text_3', label: 'Bottom-left stacked words',        default: 'FOCUS\nDISCIPLINE\nLEGACY' },
      { name: 'input_text_4', label: 'Bottom-right stacked words',       default: 'BUILT IN SILENCE\nLEADING WITH PRIDE' },
      { name: 'input_text_5', label: 'Cursive signature',                default: 'Your Name' },
      { name: 'input_text_6', label: 'Giant background name text',       default: 'YOUR NAME' }
    ],
    notes: 'Upload a clear front-facing photo with even lighting and minimal background clutter.',
    models: ['ChatGPT (DALL·E)', 'Gemini'],
    tags: ['portrait', 'branding', 'cinematic', 'dark']
  }
];
