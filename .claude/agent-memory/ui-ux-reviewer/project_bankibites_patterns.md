---
name: BankiBites Landing Page and Dashboard Patterns
description: Recurring design, a11y, and UX patterns found in banki-bites/index.html and dashboard.html
type: project
---

BankiBites uses `#FF6B35` as primary orange, `#1A1A2E` navy, Poppins font only (no Inter). Both pages implement `@media (prefers-color-scheme: dark)` with CSS variable overrides and separate `<meta name="theme-color" media="...">` variants.

**Known intentional decisions:**
- Hero is a 2-column split (`.hero-split`) stacking on mobile below 760px breakpoint
- Restaurant picker is a bottom-sheet (`#restBackdrop`) with dark-mode patch placed AFTER base styles in cascade
- install banner uses `display:none` / `.show { display:flex }` toggle; also uses `hidden` attribute — these must not conflict
- Grow cards are full-card `<a>` anchors deep-linking to wa.me WhatsApp

**Recurring gaps to watch:**
- `.ib-close` is 32×32px — below 44×44px touch target minimum; consistently flagged
- `.filter-chip` on dashboard uses `role="tab"` without a `role="tabpanel"` — incomplete ARIA tablist pattern
- `hero-sub` paragraph removed in split redesign but class still defined in CSS
- No `site.webmanifest` in banki-bites/ directory — PWA meta tags reference a manifest that may not be scoped correctly
- Banki Locals promo strip uses inline styles exclusively — not consistent with rest of codebase CSS conventions
- `#restBackdrop` dark-mode contrast was previously broken (names invisible); now patched with explicit dark block after base styles
- `grid-auto-rows: 1fr` on dashboard cards forces equal height which can look awkward with 1 card per row on mobile

**Why:** BankiBites is Banki, Cuttack, Odisha 754008's first food delivery platform. Local business context means hyper-local SEO and WhatsApp ordering are core UX patterns.
