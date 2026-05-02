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

Patterns from add-to-cart stepper review (2026-05-02):
- qty-btn is 26x26px — same touch target failure as previous circular cart button; use ::before pseudo-element with inset: -9px to expand hit area to 44x44px without changing visual size
- .item-control positioned inside .dish-card which has overflow:hidden — stepper can clip on narrow 3-col cards; fix by moving .item-control outside .dish-card but inside .menu-item-container
- renderControl replaces innerHTML entirely — keyboard focus is lost on every qty change; must explicitly call .focus() on the newly rendered button after re-render
- .qty-display has no aria-live="polite" — screen readers cannot hear quantity changes after button press
- aria-label on generic div without role is ignored by screen readers (.menu-item at app.js line 242 gets aria-label but no role — add role="article" or remove the aria-label)
- No quantity upper cap in updateItemQty — values above 99 overflow the .qty-display pill visually; cap at 20 or 99
- .cart-count.pop (badgePop animation) has no prefers-reduced-motion guard — extend existing reduced-motion block
- toast fires on add and increment but not on the 1→0 removal transition — users get no feedback when a dish is fully removed from cart

Patterns from in-cart orange bar + slim View Cart bar review (2026-05-02):
- .item-control min-height is 34px — below 44px touch target on the primary ADD action; critical pre-existing issue, orange recolor does not fix it
- .view-cart-bar padding: 10px 16px with single line of text produces ~52–58px natural height on mobile — acceptable, but only because Poppins line-height pushes it above 44px; if font is unavailable/fallback renders smaller the bar could drop below 44px; safer to set min-height: 56px explicitly
- .vcb-count pill uses rgba(255,255,255,0.15) — white text on semi-transparent white overlay on navy: approximately 1.5:1 contrast — fails WCAG AA (needs 4.5:1 for small text); fix: use rgba(255,255,255,0.25) background + slightly larger font, or switch to a solid low-opacity white for the pill text
- Orange "View Cart" CTA text (#FF6B35) on navy (#1A1A2E) background: contrast ratio ~3.2:1 — fails WCAG AA 4.5:1 for small text (0.78rem); passes 3:1 for large text only; fix: increase font weight to 800+ and/or use #fff for the CTA label with orange only as accent
- Toast CSS and DOM element retained in index.html (lines 613–650, 952–956) even though toasts are no longer triggered — dead code; should be cleaned up to reduce payload
- showCartToast function remains in app.js (lines 12–19) and is never called — dead code
- Removing toasts creates a discoverability gap: the only feedback when adding an item is the orange .in-cart background + navbar badge pop; this is adequate for sighted users but insufficient for screen reader users who cannot perceive the color change — an aria-live announcement is now mandatory
- Bestseller badge always shown (no threshold) means all top-5 appear from first load even with zero orders; if tcd_order_data.json returns empty or 404, bestsellerNames stays an empty Set and no badge shows — this is safe fallback behavior
- .view-cart-bar role="complementary" is semantically incorrect for a sticky action bar; use role="region" with aria-label or a plain <nav> element; also onclick on a div means keyboard Enter/Space do not work — the bar must be a <button> or have tabindex="0" + keydown handler
