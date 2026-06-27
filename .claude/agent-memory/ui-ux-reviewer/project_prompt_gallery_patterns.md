---
name: Prompt Gallery Design Patterns and Known Issues
description: Recurring design/a11y issues found in the prompt-gallery sub-app; violet+amber brand, Firebase auth, credit system, WhatsApp buy flow
type: project
---

First full audit of `/prompt-gallery/` (2026-06-10).

**Brand / palette:** Primary `#7c3aed` (--primary), `#4f46e5` (--primary-dark), amber for credits/anon-counter, red for danger zone.

**Architecture notes:**
- ES module script.js (type="module"); all dialogs use native `<dialog>` with showModal()
- User menu DOM-transplanted to `<body>` via JS to escape stacking context issues
- Firebase 9.20.0 from gstatic CDN; config loaded at runtime from `firebase-config.json` (intentionally public)
- Anonymous daily cap (3 copies) in localStorage; signed-in users get unlimited free + monthly credits
- Member prompts stored in Firestore only; text not shipped to client

**Critical recurring issues (must fix before next release):**
- No `@media (prefers-color-scheme: dark)` block anywhere in style.css — all colors hardcoded
- No `<meta name="color-scheme" content="light dark">` in head
- No dual `<meta name="theme-color" media="...">` variants
- `fav-btn` is 38x38px — 6px below the 44px minimum touch target
- `filter-chip` min-height is 36px — below 44px minimum
- `credit-line-buy` min-height is 30px — significantly below 44px minimum
- `history-copy` min-height is 36px — below 44px minimum
- `anon-counter-cta` min-height is 36px — below 44px minimum
- `ph-dialog-close` is 36x36px — below 44px minimum
- `user-menu` close-on-outside-click tests `#user-chip` but menu is now a body child; keyboard users cannot close with Escape
- No `aria-label` on `.member-badge` element despite having `title` and `aria-label` on the span (OK) — but the icon inside has no accessible text fallback

**UX patterns that work well:**
- Returning-user Google sign-in skips phone step cleanly
- `body.dialog-open` CSS class hides widget/anon-counter on iOS to prevent z-index bleed
- `ensureCopyAccess` handles all three access tiers (anon free, signed-in free, member credit) in one function
- WhatsApp buy message pre-fills user name/email/phone/uid — good for manual fulfilment
- `dvh` + `safe-area-inset-bottom` on dialogs correctly handles iOS Safari toolbar

**Why:** First audit to build baseline. These should be verified/fixed before adding more prompts or launching paid credits.
**How to apply:** Reference when reviewing future prompt-gallery changes or when building similar gated gallery pages in this repo.
