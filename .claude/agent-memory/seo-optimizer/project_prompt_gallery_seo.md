---
name: Prompt Gallery SEO Implementation
description: SEO audit and implementation for prompt-gallery/index.html — a global content/utility page (not local business), June 2026
type: project
---

First SEO pass on `prompt-gallery/index.html` completed 2026-06-10.

**What was already in place:**
- Canonical URL correctly set to `https://akcreation-apps.com/prompt-gallery/`
- Sitemap entry present with `lastmod: 2026-06-10`, `priority: 0.8`
- `robots.txt` already `Allow: /` — no blocking
- `<html lang="en">` set
- Standard CLAUDE.md head boilerplate (favicons, fonts, Bootstrap, FA, Umami)
- Correct footer with dynamic year
- `loading="lazy"` on all card images (rendered in JS)
- `services.html` already linked to `/prompt-gallery/` via port-link

**What was missing and fixed:**
- `<title>` — was generic; changed to include ChatGPT, Gemini, DALL·E keywords (54 chars)
- `<meta name="description">` — made keyword-rich, named specific prompts (Lofi Dusk, Heroic Poster, Triple Poster)
- `<meta name="keywords">` — added (was completely absent)
- `<meta name="robots">` — added `index, follow`
- `<meta name="author">` — added
- Open Graph block — fully absent; added og:type, og:site_name, og:title, og:description, og:url, og:image, og:image:width/height, og:image:alt
- Twitter Card block — fully absent; added all 5 tags
- JSON-LD structured data — fully absent; added `CollectionPage` with `ItemList` (3 prompts) + `BreadcrumbList`
- H1 — changed from "Copy. Paste. Transform." (tagline) to "AI Image Prompt Gallery" (keyword-primary)
- Hero sub paragraph — rewritten to include "ChatGPT (DALL·E)", "Gemini", "Midjourney", "prompts" naturally
- Firebase preconnect — added `gstatic.com`, `firestore.googleapis.com`, `securetoken.googleapis.com`, `dns-prefetch` for identitytoolkit
- Image alt text in JS card render — improved from `"${title} demo"` to `"${title} AI image prompt demo result"`
- Internal linking — added `index.html` quick-links "More from AK Creation" section with link to `/prompt-gallery/`

**OG image used:** `prompts/lofi-dusk.png` (first real prompt image; not a dedicated OG banner — noted as a future improvement)

**Schema type chosen:** `CollectionPage` (content/utility, not local business). `ItemList` as `mainEntity` with each prompt as a `ListItem`. This is appropriate for a gallery pattern.

**Why:** This is a global content page, not a local business. No geo/NAP signals needed.

**How to apply:** When adding new prompts to `PROMPTS` array in `script.js`, update `numberOfItems` in the JSON-LD and add a new `ListItem` entry. Consider a dedicated OG image (1200x630 branded banner) in the future.
