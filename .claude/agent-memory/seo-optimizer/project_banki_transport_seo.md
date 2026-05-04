---
name: Banki Transport SEO Audit Findings
description: Key SEO issues found and fixed in banki-transport/index.html during April 2026 audit
type: project
---

Critical issues found and resolved in banki-transport/index.html (April 2026):

1. og:image was SVG — replaced with og-banner.png (generated via PIL, 1200x630). Facebook/WhatsApp/LinkedIn crawlers do not render SVG og images.
2. H1 was Odia-only (populated by JS at runtime) — default text changed to English so Googlebot sees keyword-rich H1 even before JS execution.
3. banki-transport was not linked from index.html at all — added to quick-links section and footer.
4. LocalBusiness schema missing `streetAddress` and `openingHoursSpecification` — both added.
5. No `sameAs` in schema — added Google Maps links.
6. No `BreadcrumbList` schema — added.
7. No `AggregateRating` + `Review` schema despite testimonials section — added all three customer reviews.
8. Footer copyright year hardcoded as 2026 — fixed with `new Date().getFullYear()`.
9. Duplicate `theme-color` meta tags (`#4f46e5` and `#1a2a4a`) — deduplicated to `#1a2a4a`.
10. Umami analytics script was missing — added.
11. sitemap.xml lacked TCD/ and services.html entries — both added.

**Why:** Page was not appearing in Google local search for Banki, Cuttack transport queries.

**How to apply:** When auditing local business pages, always verify: og:image is PNG not SVG, H1 is in static HTML not only JS-rendered, page is internally linked from parent domain, schema has streetAddress + openingHoursSpecification + sameAs + AggregateRating.
