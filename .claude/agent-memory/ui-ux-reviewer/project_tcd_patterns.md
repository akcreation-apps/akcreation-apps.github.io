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

Patterns from search-row / bestseller button / badge + cart padding review (2026-05-02):
- .bestseller-filter-btn is 40×40px — same recurring touch target failure; all new circular icon buttons in TCD should be 44×44px minimum
- Active state using background #FFF3EE (warm white) on page background #F5F0EB (warm beige) has very low visual distinction; active circular toggle buttons should use dual ring (outer glow + inset border) not just a background shift
- Toggle buttons with emoji content have no toggle affordance without additional indicator; use ::after pseudo-element orange dot (matching refer-btn notification dot pattern) to signal active state
- cart.html logo remains a <div> with onclick (not a <button>) — index.html was fixed but the fix was not propagated to cart.html; watch for same divergence between pages on future fixes
- 160px cart bottom padding on mobile is correct (accommodates fixed WhatsApp button) and is overridden correctly to 30px at ≥900px breakpoint — no issue, but the large value is surprising without a comment
- bestseller filter toggle: aria-pressed is managed correctly in app.js (String(bestsellerOnly)) — this pattern is working and should be used on any future toggle buttons

Patterns from place selector bottom sheet review (2026-05-04):
- Chips use `<div role="option">` inside a `role="listbox"` — ARIA listbox pattern requires roving tabindex (only one tabindex="0" at a time, arrow-key navigation) and `aria-selected`; current markup gives every chip tabindex="0" simultaneously which violates the pattern; simplest correct fix is to switch chips to `<button>` elements and use `role="group"` on the grid
- `aria-selected` attribute is absent on all place chips — screen readers have no way to announce which area is selected
- Modal overlay has `role="dialog"` but focus is never explicitly moved into the dialog on open — keyboard users start outside the modal; `app.js` must call `placeConfirmBtn.focus()` (or the first chip's focus) immediately after `placeModal.style.display = 'block'`
- No `aria-describedby` connecting `.place-modal-sub` paragraph to the dialog — assistive tech won't read the subtitle when the dialog is announced
- Overlay click-to-dismiss is missing — clicking the dark backdrop does not close the sheet; users with no other way to dismiss are trapped if they change their mind (also fails pointer/touch UX expectations)
- Keyboard Escape key is not handled — pressing Escape while the sheet is open must close it (WCAG 2.1 SC 2.1.2 — no keyboard trap); must be added in `app.js`
- `sheetUp` animation is NOT guarded in the `prefers-reduced-motion` block (lines 1034–1041) — same recurring gap seen across all TCD modals; add `.place-modal { animation: none; }` inside the `@media (prefers-reduced-motion: reduce)` block
- `.place-error` uses `display:none` toggled to `display:flex` — this is correct for `role="alert"` live regions ONLY if the element is already in the DOM when the error text is injected; the current pattern is fine but must not use `innerHTML` swap after first render or the alert won't re-fire
- `.place-modal-sub` at `0.74rem` and `.place-error` at `0.74rem` are on the cusp of the 0.75rem readable floor used elsewhere in TCD; acceptable but worth noting as a recurring micro-font pattern
- `.place-modal` has `max-width: 560px` centered on desktop — good desktop handling; the sheet will render as a card-style modal centered on wide screens
- Chip touch targets: `padding: 11px 10px` with `font-size: 0.82rem` yields approximately 38–40px natural height — slightly below 44px minimum; increasing vertical padding to `13px 10px` resolves this without layout change
- `maxlength="60"` on `placeOtherInput` is good practice; no character counter shown — users do not know the limit until they hit it; a small counter (e.g. `12/60`) would reduce frustration on long area names
- `.place-modal-handle` drag handle is purely decorative (no drag-to-dismiss JS) — the visual affordance implies a behavior that does not exist; either implement drag-to-dismiss or remove the handle
- Landscape + small screen edge case: `.place-modal` has no `max-height` — on landscape 667px height (iPhone SE landscape), the full sheet + safe area may exceed the viewport and cut off the Confirm button; add `max-height: 90dvh; overflow-y: auto;` to `.place-modal`

---

## Site-wide recurring patterns (non-TCD pages)

Patterns from birth.html (Baby Announcement Frame Designer) review (2026-05-03, updated on second pass):
- ALL form <label> elements lack for= attributes — screen readers cannot associate label text with inputs; recurring critical a11y gap
- Two <h1> elements on same page (form panel + preview panel) — breaks document outline; preview header must be <h2>
- Gender toggle uses plain <div onclick> with no tabindex, role, or keydown handler — completely keyboard-inaccessible; requires role="radio", tabindex="0", keydown handler, and aria-checked state management
- html2canvas lazy-loaded on first download click with no .catch() — fails silently on network error; always add .catch() with user-visible message
- Browser alert() used for form validation — jarring on iOS Safari (shows domain name); replace with inline border/focus validation
- Download and Print buttons shown as always-visible (.download-btn.visible hardcoded in HTML) — no empty state; show only after generateFrame() is called
- .corner flourishes at opacity:0.18 + 15px are nearly invisible — raise to opacity:0.38 + 20px for intended decorative effect
- outline: none on focus without sufficient replacement — .form-group input uses 10% rgba box-shadow; action buttons (.generate-btn, .download-btn) have NO :focus-visible style at all
- #aaa / #bbb used for muted text at 10–13px — fails WCAG AA contrast; minimum safe color is #767676 on white
- prefers-reduced-motion not guarded on translateY hover effects (.upload-box, .generate-btn, .download-btn)
- aria-live missing on live-preview card region — screen reader users cannot perceive real-time updates
- img alt="baby" / alt="parents" non-descriptive for dynamically uploaded user photos — update alt dynamically from the name input
- theme-color meta is #c2187b (intentional pink brand) — differs from site-wide #4f46e5; document as intentional if keeping
