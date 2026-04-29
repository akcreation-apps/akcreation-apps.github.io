# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML/CSS/JavaScript website hosted on GitHub Pages at `akcreation-apps.com`. It serves as a multi-app hub containing BPUT (Biju Patnaik University of Technology) student tools, a restaurant POS system, a stock portfolio tracker, and several other mini-apps. There is no build process — files are served as-is.

## Development

No build, lint, or test commands exist. To develop:
- Open any `.html` file directly in a browser, or serve locally with any static file server (e.g., `python -m http.server 8080` or VS Code Live Server).
- The TCD restaurant app (`/TCD/`) requires Firebase connectivity; credentials are in `/TCD/credentials.json`.

Deployment is via git push to `main` — GitHub Pages serves directly from the repo root.

## Architecture

### Tech Stack
- Vanilla HTML5, CSS3, JavaScript — no frameworks, no bundler
- Bootstrap 4.6.2 + jQuery 3.5.1 (loaded from CDN or `/assets/`)
- Font Awesome 6.5.0, Google Fonts (Inter, Poppins)

### Sub-Applications

| Directory | Description |
|-----------|-------------|
| `/` (root) | BPUT academic calculators (SGPA, CGPA, percentage, marks, grade sheet, resume builder, seminar reports) |
| `/TCD/` | "The Cafe Darbar" — a Firebase-backed restaurant POS: ordering, cart, invoice generation, admin panel |
| `/ak-stocks/` | Stock portfolio tracker with Chart.js charts |
| `/foodelo/` | Restaurant menu board display (menu data inline in `script.js`) |
| `/anil-kr/` | Personal resume/portfolio for Anil Kumar Sahoo |
| `/friendsXI/` | NGO/charity website for FriendsXI |
| `/banki-transport/` | Transport service landing page |

### TCD App (most complex sub-app)
- Uses Firebase Firestore for live data (`/TCD/credentials.json` holds the config)
- Menu data lives in `/TCD/data.json` (~430 lines: Chinese, North Indian, Beverages, etc.)
- Cart state is stored in `localStorage`
- ES module imports (`import` syntax) used in `/TCD/app.js` — the only file using modules

### Shared Assets
- `/assets/css/` — shared stylesheets
- `/assets/js/` — jQuery plugins, Bootstrap init, and `script.min.js`
- `/assets/img/` — favicons, logos, banners

## HTML Conventions

### Mobile-First Design (with full responsiveness)
All HTML pages — new and existing — must be designed **mobile-first** while remaining fully responsive across all screen sizes. This means:
- Base styles target small screens; scale up with `min-width` media queries (`md`, `lg`, `xl`).
- Always include `<meta name="viewport" content="width=device-width, initial-scale=1">` in `<head>`.
- Use Bootstrap's responsive grid: `col-12` as the mobile default, then `col-md-*` for tablets, `col-lg-*` for desktop.
- Touch targets (buttons, links) must be large enough for thumbs (min 44×44px).
- Test at 375px (mobile) first, then verify at 768px (tablet) and 1280px (desktop) before considering a layout done.
- On desktop, use the extra space to improve readability: wider containers, multi-column layouts, larger typography — don't just stretch the mobile layout.

### `<head>` Boilerplate
Every new HTML file must include the following standard `<head>` block (adjust `<title>`, description, and canonical URL per page):

```html
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, shrink-to-fit=no">
<meta name="theme-color" content="#4f46e5">

<!-- Favicons -->
<link rel="apple-touch-icon" sizes="180x180" href="/assets/img/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/img/favicon-16x16.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="icon" href="/favicon.ico">

<!-- Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">

<!-- Bootstrap 4 -->
<link rel="stylesheet" href="https://akcreation-apps.com/assets/bootstrap/css/bootstrap.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.5.1/jquery.min.js" crossorigin="anonymous"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@4.6.2/dist/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>

<!-- Icons -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<!-- Analytics -->
<script defer src="https://cloud.umami.is/script.js" data-website-id="36497ef4-1185-47b9-bcfb-24598a1a29d3"></script>
```

### Footer
Every new HTML file must include a footer with a dynamically updated copyright year and a linked brand name. Use this exact pattern:

```html
<footer>
  <p>&copy; <span id="footer-year"></span> <a href="https://akcreation-apps.com/services.html">AK Creation</a>. All rights reserved. &nbsp;|&nbsp; Made in Odisha ❤️</p>
</footer>
<script>
  document.getElementById('footer-year').textContent = new Date().getFullYear();
</script>
```

The year must never be hardcoded — always set via `new Date().getFullYear()` so it stays current without any manual edits.

## UI/UX Review Workflow

After completing **any** HTML/CSS/JS changes to UI components — new pages, modified sections, layout changes, interactive components — always run the `ui-ux-reviewer` agent to audit the result before reporting the task as done. Do this proactively without waiting for the user to ask.

## SEO Workflow

After completing **any** changes to files inside `/banki-transport/` or `/TCD/` — always run the `seo-optimizer` agent before reporting the task as done. Do this proactively without waiting for the user to ask.

Both `/banki-transport/` and `/TCD/` are local businesses physically located in **Banki, Cuttack, Odisha, 754008, India**. All SEO work on these pages must use hyper-local signals targeting that specific location.

### Hosting / Routing
- `CNAME` → `akcreation-apps.com` (GitHub Pages)
- `_redirects` + `netlify.toml` handle `netlify.app` → custom domain redirect and asset caching headers
- `sitemap.xml` and `robots.txt` cover SEO
- Umami analytics script embedded in `index.html`
