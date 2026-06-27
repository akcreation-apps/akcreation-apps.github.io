---
name: BankiBites SEO Implementation
description: SEO patterns and structured data schema implemented for banki-bites/index.html and banki-bites/dashboard.html
type: project
---

BankiBites is a food delivery aggregator at /banki-bites/ serving Banki, Cuttack, Odisha, 754008, India within a 5 km radius. Partner restaurants: The Cafe Darbar (/TCD/) and A1 Amul Fast Food (/A1/).

**Why:** Business goal is to rank #1 for "food delivery Banki", "order food Banki", "food delivery 754008", "home delivery Banki Odisha" - highly local intent keywords.

**Schema types implemented (as of 2026-06-06):**
- index.html: `["LocalBusiness", "FoodEstablishment"]` (not `Organization` — food delivery businesses should use LocalBusiness), `MobileApplication` (Play Store: com.akcreation_apps.tcdbanki), `WebSite`, `BreadcrumbList`, `FAQPage` (8 questions with Banki long-tail answers)
- dashboard.html: `["LocalBusiness", "FoodEstablishment"]`, `CollectionPage`, `ItemList` with `Restaurant` items, `BreadcrumbList`

**Key local signals present on both pages:**
- geo.region: IN-OR, geo.placename: Banki, Cuttack, Odisha, geo.position: 20.3700;85.5300, ICBM
- postalCode: 754008, addressLocality: Banki, addressRegion: Odisha, addressCountry: IN
- hreflang: en-IN declared on index.html
- areaServed as named City/Place objects with `containedInPlace` hierarchy (Banki -> Cuttack -> Odisha)
- aggregateRating on both LocalBusiness and MobileApplication nodes

**Canonical telephone:** +917749984274 (WhatsApp contact — verified June 2026). Schema previously had stale +918920042482, now corrected.

**MobileApplication schema pattern (June 2026):**
- `subjectOf` on LocalBusiness node references `#android-app` ID
- Standalone `MobileApplication` node in `@graph` with `@id` matching the reference
- Fields: operatingSystem, applicationCategory, installUrl, downloadUrl, offers (price: 0), author (AkCreation org)
- `potentialAction` on LocalBusiness includes both `OrderAction` (target: dashboard.html) and `SearchAction`

**FAQPage long-tail questions added (June 2026):**
- "What is the delivery charge on BankiBites in Banki?" — answers with ₹50/<₹200 / free/>₹200 detail
- "Is there a BankiBites Android app for food delivery in Banki?" — Play Store URL in answer
- "Is BankiBites available in Cuttack district villages near Banki?" — answers all 10 delivery localities
- "How do I get my restaurant listed on BankiBites for online orders in Banki?" — restaurant onboarding WhatsApp

**Original gaps found (now fixed):**
- index.html used `Organization` schema type — wrong for a LocalBusiness food delivery service
- index.html missing aggregateRating/review schema, WebSite schema, ItemList schema
- index.html missing og:image:alt, og:image:type, twitter:image:alt
- index.html missing PWA meta, sitemap link, preconnect for cdnjs, dns-prefetch for wa.me/maps.google.com
- dashboard.html had no keywords, author, geo meta, Twitter Card, or any JSON-LD structured data at all
- dashboard.html robots directive was weak (no max-snippet)
- dashboard.html h1 was "Partner Restaurants" — no location context; updated to "Restaurants in Banki, Cuttack"

**How to apply:** For any new BankiBites pages, always use `["LocalBusiness", "FoodEstablishment"]` schema with full PostalAddress. Always include geo meta tags. Partner restaurant addresses in PostalAddress format (not plain strings). hreflang en-IN required. Telephone must be +917749984274.
