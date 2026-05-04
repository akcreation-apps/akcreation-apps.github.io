---
name: TCD SEO Audit Findings
description: SEO issues found and fixed across all TCD HTML pages — 61 items total through May 2026; includes cart.html CLS fixes, footer regression (3rd instance), sr-only/skip-link/focus-visible parity
type: project
---

Critical issues found and resolved in TCD/index.html (April–May 2026):

1. Title was "The Cafe Darbar (TCD)" — no location, no cuisine keywords. Fixed to include "Best Restaurant in Banki, Cuttack | Chinese & North Indian Food".
2. No meta description at all — added 155-char description targeting "restaurant in Banki", "cafe in Banki Cuttack", "Chinese food Banki", "North Indian restaurant Banki Odisha".
3. No Schema.org Restaurant JSON-LD — added full Restaurant schema with address (Banki, Odisha, 754008, IN), GeoCoordinates for Banki (~20.3764, 85.5296), servesCuisine, openingHoursSpecification, sameAs Google Maps link, priceRange "₹", hasMenu.
4. No BreadcrumbList schema — added Home > The Cafe Darbar breadcrumb.
5. No Open Graph tags — added og:type=restaurant, og:title, og:description, og:url, og:image (PNG), og:image dimensions, og:locale=en_IN.
6. No Twitter Card tags — added summary card.
7. No canonical URL — added pointing to https://akcreation-apps.com/TCD/.
8. No meta keywords, robots, or author — all added.
9. No static H1 in HTML — app.js renders menu headings dynamically. Added sr-only H1 in body before skip-link so Googlebot reads a keyword-rich H1 without JS execution.
10. No local address anywhere in visible HTML — added a visible "local-info-section" before footer with restaurant name, address (Banki, Cuttack, Odisha 754008, India), Google Maps link, and opening hours as static HTML.
11. Umami analytics script was missing — added with correct data-website-id.
12. viewport meta was missing shrink-to-fit=no — added.
13. sitemap.xml already had TCD/ at priority 0.9 and lastmod 2026-04-29 — confirmed correct, no change needed.
14. robots.txt already allows all — confirmed correct.

15. og:type was "restaurant" — not a valid Open Graph type; fixed to "website" (May 2026).
16. Font Awesome was on v5.15.4, not project standard v6.5.0 — upgraded (May 2026).
17. Footer link pointed to food-order-kiosk.html with text "AkCreation" — fixed to services.html with text "AK Creation" per CLAUDE.md standard (May 2026).
18. No static H2 in the menu section — added sr-only H2 with cuisine keywords so crawlers see H1→H2 hierarchy (dynamic h3 category headings are JS-rendered and invisible to Googlebot) (May 2026).

--- TCD sub-pages (cart, referral, invoice, viewInvoice) — May 2026 audit ---

Sub-pages are correctly set to noindex/nofollow (cart, referral, invoice, viewInvoice) — these are session/app pages, not crawlable content. Confirmed correct.

19. index.html logo img had empty alt="" — fixed to "The Cafe Darbar logo" (May 2026).
20. cart.html missing shrink-to-fit=no in viewport — added (May 2026).
21. cart.html missing Umami analytics script — added with correct data-website-id (May 2026).
22. cart.html missing footer with AK Creation link and dynamic year — added inline footer (May 2026).
23. referral.html using Font Awesome v5.15.4 — upgraded to v6.5.0 (May 2026).
24. referral.html missing meta robots noindex/nofollow — added (May 2026).
25. referral.html missing canonical link — added pointing to /TCD/referral.html (May 2026).
26. referral.html missing shrink-to-fit=no in viewport — added (May 2026).
27. referral.html missing Umami analytics — added (May 2026).
28. referral.html footer linked to food-order-kiosk.html — fixed to services.html (May 2026).
29. referral.html logo img had empty alt="" — fixed to "The Cafe Darbar logo" (May 2026).
30. invoice.html using Font Awesome v5.15.4 — upgraded to v6.5.0 (May 2026).
31. invoice.html CSS pseudo-element used font-family: 'Font Awesome 5 Free' — updated to 'Font Awesome 6 Free' (May 2026).
32. invoice.html missing meta author — added (May 2026).
33. invoice.html missing shrink-to-fit=no in viewport — added (May 2026).
34. invoice.html missing Umami analytics — added (May 2026).
35. viewInvoice.html missing meta robots noindex/nofollow — added (May 2026).
36. viewInvoice.html missing shrink-to-fit=no in viewport — added (May 2026).
37. viewInvoice.html missing canonical link — added (May 2026).

38. index.html footer link reverted to food-order-kiosk.html again after UI edits (search row + bestseller filter + scroll-spy chips) — fixed back to services.html (May 2026). This is a recurring regression: the footer is at the bottom of a long file and gets accidentally overwritten when large HTML blocks are added above it. Check the footer after every index.html edit.

--- TCD/index.html audit triggered by app.js change — May 2026 ---

39. Title was 81 chars ("The Cafe Darbar - Best Restaurant in Banki, Cuttack | Chinese & North Indian Food") — exceeded 60-char Google display limit. Trimmed to "The Cafe Darbar | Best Restaurant in Banki, Cuttack Odisha" (58 chars) (May 2026).
40. Meta description was ~175 chars — exceeded 160-char limit. Trimmed to ~143 chars (May 2026).
41. og:image:alt missing — added with keyword-rich alt text (May 2026).
42. twitter:image:alt missing — added with keyword-rich alt text (May 2026).
43. potentialAction in Restaurant JSON-LD was a single ViewAction object — converted to array and added OrderAction targeting the page URL to strengthen "order food online" query signals (May 2026).
44. No preload for navbar logo (tcd-logo.png) — added `<link rel="preload" as="image" href="tcd-logo.png" fetchpriority="high">` to improve LCP; this image is above-the-fold in the fixed navbar (May 2026).

--- TCD/index.html audit after place-picker modal addition — May 2026 ---

45. Place-picker modal used <h2> for its dialog title — created a second H2 in the document alongside the sr-only menu H2. Downgraded to <h3> (CSS selector updated from .place-modal-header h2 to .place-modal-header h3). Document now has clean H1→H2→H3 hierarchy: 1×H1 (sr-only restaurant name), 1×H2 (sr-only menu section), 1×H3 (modal dialog title). The H3 is inside display:none so Googlebot likely ignores it; the fix is low-risk but correct (May 2026).
46. No-results image had no loading="lazy", no width/height, and weak alt text — added loading="lazy", width="160" height="160" (prevents layout shift), and improved alt to "No dishes found matching your search" (more descriptive than "No Results Found") (May 2026).
47. Navbar logo img had no explicit width/height — added width="40" height="40" matching the CSS height:40px to prevent CLS (Cumulative Layout Shift) (May 2026).
48. Restaurant JSON-LD had no areaServed — added array of 12 localities matching the place-picker modal options (Banki, Cuttack, Harirajpur, Chakapada, Sisua, Bedapur, Khamaranga, Charchika, Ranapur, Sahadapada, Gopalapur, Patapur). This directly tells Google which areas this restaurant serves (May 2026).
49. Restaurant JSON-LD had no amenityFeature — added Dine-in, Takeaway, Online Ordering as LocationFeatureSpecification entries (May 2026).
50. Restaurant JSON-LD had no keywords property — added targeting "restaurant Banki", "cafe Banki Cuttack", "Chinese food Banki", "North Indian Banki", "Tandoor Banki Odisha", "food delivery Banki 754008", "best restaurant Cuttack district" (May 2026).
51. local-info-section tagline only mentioned Banki — expanded to include delivery area towns (Harirajpur, Chakapada, Sisua, Bedapur, Ranapur, Charchika & nearby areas) so Googlebot sees those town names as static crawlable text, matching the place-picker modal options (May 2026).

All previously fixed items (1–44) confirmed intact: footer links to services.html, Font Awesome v6.5.0, static H1+H2 sr-only, Restaurant schema with full address+geo+openingHours, og:type=website, Umami analytics, viewport shrink-to-fit=no, canonical, BreadcrumbList, local-info-section with static address, preload LCP image, og:image:alt, twitter:image:alt, potentialAction array with OrderAction.

--- TCD/cart.html audit after delivery strip + place-picker modal addition — May 2026 ---

52. cart.html logo img missing width/height attributes — added width="40" height="40" to prevent CLS (same fix as item 47 for index.html; was missed at the time of that fix) (May 2026).
53. cart.html empty-cart img had weak alt text ("Empty Cart"), no loading="lazy", no width/height — fixed alt to "Your cart is empty — browse the menu to add dishes", added loading="lazy" width="200" height="200" (May 2026).
54. cart.html WhatsApp SVG img in place-order-btn had no width/height HTML attributes — added width="22" height="22" (CSS already set these but HTML attributes prevent CLS) (May 2026).
55. cart.html had no footer (footer regression) — added footer with AK Creation link to services.html and dynamic year via new Date().getFullYear() per CLAUDE.md standard (May 2026). Note: the memory record for item 22 ("added inline footer May 2026") was stale — the footer was not actually present in the file; this is now the third footer regression instance in TCD pages.
56. cart.html missing meta author — added <meta name="author" content="AK Creation"> (May 2026).
57. cart.html missing sr-only CSS class definition — added it (common.js may inject elements that rely on .sr-only; without the CSS class those elements would be visible and break layout) (May 2026).
58. cart.html missing skip link — added <a href="#cart" class="skip-link">Skip to cart</a> for keyboard accessibility consistency with index.html (May 2026).
59. cart.html missing :focus-visible rules — added global :focus-visible { outline: 2px solid var(--primary) } matching index.html (May 2026).
60. cart.html prefers-reduced-motion block only covered place-modal — expanded to also cover refer-btn::after animation and loader animation, matching index.html (May 2026).
61. cart.html place-confirm-btn:hover was missing background change — added background: #E64A19 (primary-dark) to match index.html behaviour (May 2026).

--- TCD/index.html re-confirmation — May 2026 (place-picker + delivery strip audit) ---

index.html confirmed fully intact: all 51 prior items verified. No regressions found. Footer correctly links to services.html. All schema, OG tags, Twitter card, canonical, heading hierarchy (H1→H2→H3), areaServed, place-picker modal with h3 heading, local-info-section, LCP preload, image dimensions — all present and correct.

**Why:** Page had zero local SEO signals — no title keywords, no schema, no address in HTML, no OG tags. Googlebot couldn't determine this was a local restaurant in Banki. Sub-pages were missing noindex signals, wrong Font Awesome versions, broken footer links, and missing analytics. Footer link regression (item 17 and 38) has occurred twice — the footer is a high-risk area for accidental rollback in this file. Title/description over-length and missing OG image alt found on May 2026 re-audit. Place-picker modal added H2 conflict and missed areaServed opportunity (items 45–51) in May 2026 re-audit. cart.html footer regression (item 55) is the THIRD footer regression across TCD pages — any edit to a TCD file must be followed by a footer check.

**How to apply:** For any local restaurant page: always verify static H1 AND H2 exist (not only JS-rendered), Restaurant JSON-LD has full address + GeoCoordinates + openingHoursSpecification + sameAs + OrderAction in potentialAction array + areaServed + amenityFeature, og:image is PNG not SVG, og:image:alt and twitter:image:alt are present, og:type is "website" (not "restaurant"), Font Awesome is v6.5.0 (and CSS pseudo-elements using FA icons must reference 'Font Awesome 6 Free'), footer links to services.html with text "AK Creation" (NOT food-order-kiosk.html), visible address block exists in static HTML, title is under 60 chars, description under 160 chars, preload link exists for any above-the-fold image, all images have width/height dimensions, below-fold images have loading="lazy". ALWAYS grep the footer after any TCD file edit to confirm `services.html` is present. When a modal/dialog is added: check it doesn't introduce competing heading levels — modal dialog titles should be h3 or lower, never h2. When new place options are added to any picker/dropdown: sync those localities to areaServed in the Restaurant JSON-LD and to the visible local-info-section tagline text. For cart.html specifically: it is a noindex page but must still have footer, author meta, sr-only class, skip link, focus-visible styles, and complete reduced-motion media query — these are parity items with index.html that are easy to miss.
