---
name: TCD App Design Patterns and Known Issues
description: Recurring design and accessibility patterns found in The Cafe Darbar (TCD) restaurant POS app
type: project
---

TCD uses its own design language (navy #1A1A2E, orange #FF6B35) separate from the site-wide #4f46e5 primary — this is intentional for the restaurant brand.

Key architectural facts:
- app.js is an ES module; common.js is a plain script. Both loaded in <head> without defer.
- Menu grid: 3 cols (mobile) → 4 (480px) → 5 (768px) → 6 (1024px) → 8 (1400px)
- Cart state lives in localStorage with a nested category/dish_details structure
- Veg/NonVeg indicator is a colored bottom strip on .menu-item (inline bg set by JS): #f1c2c2 = NonVeg, #c2e6c2 = Veg
- Font Awesome 5.15.4 used in TCD (NOT the site-wide FA 6.5.0)

Known issues identified in first review (2026-04-26):
- add-to-cart button is 28x28px — below the 44x44px touch target minimum
- Nav icons (.nav-icon) have no minimum tap area defined — raw icon size only
- Cart count badge (0.6rem font, 16px badge) reads as color-only for screen readers — no aria-label on cart icon
- Logo uses onclick="redirect_to_home()" on a div — not keyboard accessible
- searchIcon, invoiceIcon, and cart div all use div/onclick instead of <button> — keyboard trap risk
- refer-btn blinking dot animation has no prefers-reduced-motion guard
- No aria-label on search input (placeholder only)
- No skip-to-content link
- scroll-margin-top on .category-block uses hardcoded 144px for sticky bar height — fragile
- scripts loaded in <head> without defer — blocks HTML parsing
- clearSearch button has duplicate click event listeners (lines 499 and 506 of app.js)
- No visible focus indicators overriding browser defaults (outline: none on search input without replacement)
- .dish-name and .price text rendered at 0.7rem and 0.65rem — below readable minimum on small cards

**Why:** First full audit of TCD index.html conducted by ui-ux-reviewer agent.
**How to apply:** Reference these when reviewing cart.html, invoice.html, or referral.html — many of these patterns likely repeat across TCD pages.

Confirmed recurring issues found in referral.html review (2026-05-01):
- --muted (#888) on white fails WCAG AA (3.54:1) — affects step descriptions, T&C list, footer. Fix: --muted: #666666
- FA icon elements missing aria-hidden="true" (back-btn arrow, card-title icons) — screen readers announce icon names
- No skip-to-content link — confirmed pattern across TCD pages
- No prefers-reduced-motion guard on hover transforms — .share-btn:hover uses translateY
- External asset dependency: WhatsApp SVG loaded from Wikimedia Commons; FA 5.15.4 fab fa-whatsapp is available locally
- Font sizes below 0.7rem used in UI components (.sub-text: 0.63rem, .reward-pill .label: 0.65rem, .notes li: 0.73rem)
- Fixed bottom bar (full viewport width) with inner max-width constraint creates visual disconnect on desktop — shadow/border span full width while button is centered at 680px; prefer moving shadow/border to .share-bar-inner
