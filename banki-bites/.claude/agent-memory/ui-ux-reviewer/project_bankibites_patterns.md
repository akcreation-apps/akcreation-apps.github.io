---
name: BankiBites recurring patterns
description: Recurring a11y and UX gaps found in the admin/delivery portal during the 2026-06-05 audit
type: project
---

Audit performed on: 2026-06-05

## Patterns to watch on future changes

- `<meta name="color-scheme" content="light dark">` must be in every new HTML file in this project — it was missing from both admin/index.html and delivery/index.html at audit time.
- `<meta name="theme-color">` needs TWO tags with `media` attributes (light/dark variants) — single-value tag was used in both files.
- `role="tab"` buttons must carry `aria-selected` toggled by the JS `activateTab` / seg-btn click handler. Pattern was missing in both admin tabbar and delivery segmented control.
- `chartPalette()` in analytics.js must NOT be cached as a singleton — it was, which meant dark-mode chart colors staled after an OS theme switch. Fixed by removing the `_palette` cache.
- `icon-btn` (32×32px) is below the 44×44px touch target minimum — fixed with `min-width/min-height: 44px`.
- `whenChartReady()` previously silently dropped the Promise on CDN timeout — callers now get a rejection they can catch and log.
- `window.location.href` for WhatsApp deep-links navigates away from the delivery PWA — must use `window.open(..., '_blank', 'noopener,noreferrer')`.
- `<summary>` elements inside `.stats-block` and `.payouts-block` had no `:focus-visible` style — added to match `.tab-btn` focus ring pattern.
- Every new page/shell needs a visible or `.sr-only` `<h1>` — both shells were missing one.

**Why:** Discovered during structured WCAG 2.1 AA audit of the recently-added dashboard charts, per-tab stats blocks, and payout workflow.

**How to apply:** Run these checks as a checklist on every new page/feature added to banki-bites/admin or banki-bites/delivery.
