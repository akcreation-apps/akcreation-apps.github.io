---
name: Anvisha Travels Landing Page — Design Patterns and Known Issues
description: Design and accessibility patterns from the anvisha-travels/index.html cab booking landing page
type: project
---

Anvisha Travels is a local cab booking page (Banki, Cuttack, Odisha) with a bespoke dark-theme design (no Bootstrap): amber/gold #f5a623, bg #0b0a09, Fraunces serif + DM Sans. Intentionally diverges from site-wide #4f46e5 palette — this is correct brand behaviour.

Key design facts:
- Two-column layout on >=768px: services (col-left) | sticky booking form (col-right at top:62px)
- Hero banner image hidden on mobile, shown on desktop at 340px height
- Booking form sends pre-filled WhatsApp message to +919114191989
- Flatpickr used for date input (disableMobile:true — keeps consistent dark styling)
- Custom 30-min time slots populated by JS; past slots hidden for today
- Destination field uses progressive disclosure (opt-wrap, reveals on valid date+time+pax selection)
- Service rows animate in via IntersectionObserver with staggered transitionDelay

Issues identified in first review (2026-05-30):
- No `<meta name="color-scheme" content="light dark">` — Critical a11y/theme gap
- `<meta name="theme-color">` has no separate light/dark media variants
- No `@media (prefers-color-scheme: dark)` block — page is dark-only; light-mode users with no system override get the dark theme regardless (technically acceptable for a branded dark design, but `color-scheme` meta still required)
- `prefers-reduced-motion` not guarded: fadeUp animations (.au), svc-row entrance animations, btn hover translateY, header-book-btn translateY
- `<header>` "Book a Ride" button uses `onclick="scrollToForm()"` — works but no `type="button"` attribute; form-contained buttons without type default to `type="submit"`; this one is outside a form so it's safe but best practice is explicit
- `.header-book-btn` focus state uses browser default only — no `:focus-visible` ring defined
- `.btn-wa` focus state: no `:focus-visible` ring
- `<section class="hero">` has no accessible name (no aria-label or heading inside the section landmark)
- Trust chips use `<span>` not `<li>` — they are list items semantically
- Service rows rendered as `<div>` not `<li>` — list semantics missing
- `eyebrow` and `opt-head` use `<p>` — no semantic heading; fine for decorative labels but .form-head-title should be `<h2>` not `<p>`
- `<div class="step-num">` uses raw number text with no sr-only label — screen readers read "1 Pick your date & time" which is acceptable but "Step 1 of 3" would be clearer
- No skip-to-content link — consistent with site-wide recurring gap
- `#f0ece3` (--text) on `#0b0a09` (--bg): approximately 14.8:1 — excellent
- `#c4bbaf` (--text-2) on `#0b0a09`: approximately 8.5:1 — passes AA
- `#76706a` (--muted) on `#0b0a09`: approximately 4.12:1 — FAILS AA for small text (< 18px, < 14px bold); muted is used at 10px (eyebrow), 12px (helper, svc-text p, step p) — all fail
- `#f5a623` (--gold) on `#0b0a09`: approximately 9.5:1 — passes AA
- `#22c55e` (--green) on `#fff` (btn-wa color:#fff): approximately 2.77:1 — FAILS AA; white text on green button is the most visible CTA and fails contrast
- `.f-input::placeholder` color `#3e3830` on `#141210` (--surface): approximately 1.35:1 — Critical; placeholder text is nearly invisible
- `.pax-custom` input uses inline style — not respecting .f-input class; contrast issues same as above
- Flatpickr `disableMobile: true` prevents native date picker on iOS/Android — user sees a desktop calendar UI; acceptable for brand consistency but note the trade-off
- `<section class="hero">` and `<section class="services">` are both landmark regions without accessible names
- Service badge emojis have no aria-hidden — screen readers will announce "racing car emoji" for 🚗

**Why:** First full review of anvisha-travels/index.html conducted 2026-05-30.
**How to apply:** Reference when making future updates to the booking form, service section, or adding any new pages to this sub-site.
