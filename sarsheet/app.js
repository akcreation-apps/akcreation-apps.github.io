(function () {
  'use strict';

  // ============================================
  // Config — single source of truth
  // ============================================
  // Fallbacks used only if config.json fails to load
  let WEDDING_DATE = new Date('2026-12-13T00:00:00+05:30').getTime();
  let PHONE = '919861039566';
  let SHARE_TEXT = "You're invited to Sarbeswar & Sheetal's wedding 💍 — 13 Dec 2026";

  const params = new URLSearchParams(location.search);
  const side = (params.get('invited') || 'groom').toLowerCase() === 'bride' ? 'bride' : 'groom';
  document.documentElement.setAttribute('data-side', side);
  // Legacy data-side blocks (fallback) — hide the side that doesn't match
  document.querySelectorAll('[data-side]').forEach((el) => {
    if (el === document.documentElement) return;
    const show = el.getAttribute('data-side') === side;
    el.hidden = !show;
  });
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const setText = (id, html) => {
    const el = document.getElementById(id);
    if (el != null && html != null) el.innerHTML = html;
  };
  const setAttr = (id, attr, val) => {
    const el = document.getElementById(id);
    if (el != null && val != null) el.setAttribute(attr, val);
  };

  function renderTimeline(events) {
    const root = document.getElementById('timeline');
    if (!root) return;
    root.innerHTML = '';
    (events || []).forEach((ev) => {
      const li = document.createElement('li');
      li.className = 't-item' + (ev.highlight ? ' highlight' : '');
      const chip = ev.dressCode
        ? `<span class="dress-chip ${ev.dressCode.chip}"><i class="fas fa-tshirt"></i>&nbsp; ${ev.dressCode.label}</span>`
        : '';
      li.innerHTML = `
        <div class="t-dot"><i class="fas ${ev.icon || 'fa-star'}"></i></div>
        <div class="t-card">
          <p class="t-date">${ev.date || ''}</p>
          <h3 class="t-title">${ev.title || ''}</h3>
          <p class="t-detail">${ev.detail || ''}</p>
          ${chip}
        </div>`;
      root.appendChild(li);
    });
  }

  function renderVenues(venues) {
    const root = document.getElementById('venueGrid');
    if (!root) return;
    root.innerHTML = '';
    const single = (venues || []).length === 1;
    root.classList.toggle('venue-grid--single', single);
    (venues || []).forEach((v) => {
      const a = document.createElement('article');
      a.className = 'venue-card';
      const mapsUrl = v.mapsUrl
        ? v.mapsUrl
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.mapsQuery || v.name || '')}`;
      a.innerHTML = `
        <div class="venue-icon"><i class="fas ${v.icon || 'fa-map-marker-alt'}"></i></div>
        <h3 class="venue-name">${v.name || ''}</h3>
        <p class="venue-detail">${v.role || ''}<br><span class="venue-date">${v.when || ''}</span></p>
        <a class="venue-btn" href="${mapsUrl}" target="_blank" rel="noopener">
          <i class="fas fa-location-arrow"></i>&nbsp; Get Directions
        </a>`;
      root.appendChild(a);
    });
  }

  function applyConfig(cfg) {
    if (!cfg) { wireCalendarLinks(null); return; }
    const c = cfg.common || {};
    const s = (cfg[side] || cfg.groom || {});
    const other = side === 'groom' ? (cfg.bride || {}) : (cfg.groom || {});

    if (c.weddingDateTime) WEDDING_DATE = new Date(c.weddingDateTime).getTime();
    // Phone: per-side override, falls back to common.contactPhone
    const sidePhone = (s && s.contactPhone) || c.contactPhone;
    if (sidePhone) PHONE = String(sidePhone);
    if (c.shareText) SHARE_TEXT = c.shareText;

    // (page title is set further down, once we know name priority)

    // Deity invocation
    setText('deitySanskrit', c.deityInvocationSanskrit);
    setText('deityEnglish',  c.deityInvocationEnglish);
    setText('deityOdia',     c.deityInvocationOdia);

    // Post-wedding transform (shows Thank You, hides pre-wedding sections)
    //   side-specific `postWeddingActiveFrom` takes precedence over common
    setupPostWedding(c, s);

    // Geofenced welcome (wedding day, near venue)
    setupGeofenceWelcome(c);

    setText('landingTag', c.landingTag);
    setText('landingHintText', c.landingHint);
    setText('letterScript', c.letterScript);
    setText('letterSub', c.letterSub);
    setText('eyebrow', c.eyebrow);
    setText('blessingLine', c.blessingLine);
    setText('requestLine', c.requestLine);
    setText('saveTitle', c.saveTitle);
    setText('saveSub', c.saveSub);
    setText('revealEyebrow', c.revealEyebrow);
    setText('revealDate', c.revealDate);
    setText('revealVenue', c.revealVenue);
    setText('celebrationsTitle', c.celebrationsTitle);
    setText('celebrationsSub', c.celebrationsSub);
    setText('venuesTitle', c.venuesTitle);
    setText('venuesSub', c.venuesSub);
    setText('closingLine', c.closingLine);

    // Portraits — always both. DOM order stays (groom DOM-left, bride DOM-right);
    // CSS `order` swaps visually when html[data-side="bride"].
    const groomCfg = cfg.groom || {};
    const brideCfg = cfg.bride || {};
    if (groomCfg.image) setAttr('groomImg', 'src', groomCfg.image);
    if (brideCfg.image) setAttr('brideImg', 'src', brideCfg.image);
    setText('groomName', groomCfg.firstName);
    setText('brideName', brideCfg.firstName);
    setText('groomRole', groomCfg.role);
    setText('brideRole', brideCfg.role);

    // Couple name in the hero — bride first when invited from bride side
    const firstPerson  = side === 'bride' ? brideCfg : groomCfg;
    const secondPerson = side === 'bride' ? groomCfg : brideCfg;
    setText('coupleGroom',  firstPerson.firstName);   // DOM "first slot"
    setText('coupleBride',  secondPerson.firstName);  // DOM "second slot"

    // Parents block — both families shown. Groom is DOM-left (visually swapped by CSS on bride side).
    setText('groomParentRel', groomCfg.parentRel);
    setText('groomFather',   groomCfg.father);
    setText('groomMother',   groomCfg.mother);
    setText('brideParentRel', brideCfg.parentRel);
    setText('brideFather',   brideCfg.father);
    setText('brideMother',   brideCfg.mother);

    // Closing signature — use the inviting family's name
    const familyName = s.familyName
      || (side === 'bride' ? 'Pradhan Family' : 'Pani Family');
    setText('closingSignature', `— With love, ${familyName}`);

    // Page title + OG / Twitter meta — reflect invited side's name priority.
    // (WhatsApp's crawler reads static HTML and won't see these runtime changes
    //  on first crawl, but JS-aware scrapers pick it up on cache-refresh.)
    const prioritisedNames = `${firstPerson.firstName} & ${secondPerson.firstName}`;
    const titleSuffix = c.pageTitleSuffix || 'Wedding Invitation';
    document.title = `${prioritisedNames} — ${titleSuffix}`;

    const ogTitleText = `You're Invited — ${prioritisedNames}`;
    const setMeta = (sel, val) => {
      const el = document.querySelector(sel);
      if (el && val) el.setAttribute('content', val);
    };
    setMeta('meta[property="og:title"]',    ogTitleText);
    setMeta('meta[name="twitter:title"]',   ogTitleText);

    // Timeline + Venues come from the selected side
    renderTimeline(s.events);
    renderVenues(s.venues);

    // Update audio src if different
    const bgm = document.getElementById('bgMusic');
    if (bgm && c.music && bgm.getAttribute('src') !== c.music) {
      bgm.setAttribute('src', c.music);
      try { bgm.load(); } catch (_) {}
    }

    // Phone-sensitive controls
    const callBtn = document.getElementById('callBtn');
    if (callBtn) {
      callBtn.setAttribute('href', 'tel:' + PHONE);
      callBtn.addEventListener('click', () => vibrate(12), { once: false });
    }

    // Calendar actions
    wireCalendarLinks(cfg);
    setText('calActionsLabel', c.calActionsLabel);
  }

  // ============================================
  // Calendar — build Apple (.ics data URL) + Google links
  // ============================================
  function pad2(n) { return String(n).padStart(2, '0'); }
  function toYMD(d) { return `${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}`; }
  function stripTags(s) { return (s || '').replace(/<[^>]+>/g, '').trim(); }
  function escapeICS(s) {
    return String(s || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function wireCalendarLinks(cfg) {
    const common = (cfg && cfg.common) || {};
    const groomCfg = (cfg && cfg.groom)  || {};
    const brideCfg = (cfg && cfg.bride)  || {};

    const title = common.calEventTitle
      || `${groomCfg.firstName || 'Groom'} & ${brideCfg.firstName || 'Bride'} — Wedding`;
    const venue = common.calEventVenue || stripTags(common.revealVenue) || '';
    const dateIso = common.calEventDate
      || (common.weddingDateTime || '').slice(0, 10)
      || '2026-12-13';

    const start = new Date(dateIso + 'T00:00:00');
    const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const startYMD = toYMD(start);
    const endYMD   = toYMD(end);

    const descriptionPlain = [
      stripTags(common.blessingLine),
      stripTags(common.requestLine)
    ].filter(Boolean).join(' ');

    // Build Google Calendar URL
    const googleParams = new URLSearchParams({
      action:   'TEMPLATE',
      text:     title,
      dates:    `${startYMD}/${endYMD}`,
      details:  descriptionPlain,
      location: venue
    });
    const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

    // Build Apple/iCal/Outlook .ics data URL
    const nowStamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = `sarsheet-wedding-${startYMD}@akcreation-apps.com`;
    const icsText = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sarbeswar Sheetal Wedding//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;VALUE=DATE:${startYMD}`,
      `DTEND;VALUE=DATE:${endYMD}`,
      `SUMMARY:${escapeICS(title)}`,
      `DESCRIPTION:${escapeICS(descriptionPlain)}`,
      `LOCATION:${escapeICS(venue)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(title)} — tomorrow`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
    const icsDataUrl = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(icsText);
    const icsFileName = (title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Wedding') + '.ics';

    // Single routed button — detect device at click time
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
      || (/Mac/i.test(ua) && 'ontouchend' in document); // iPadOS 13+
    const isAndroid = /Android/i.test(ua);

    const remind = document.getElementById('calRemind');
    if (!remind) return;

    // Pre-set href so right-click / long-press "copy link" is useful too
    remind.setAttribute('href', isIOS ? icsDataUrl : googleUrl);
    if (isIOS) remind.setAttribute('download', icsFileName);
    else { remind.removeAttribute('download'); remind.setAttribute('target', '_blank'); remind.setAttribute('rel', 'noopener'); }

    // Replace the node to purge any old listeners, then wire a fresh click handler
    const fresh = remind.cloneNode(true);
    remind.parentNode.replaceChild(fresh, remind);
    fresh.addEventListener('click', (e) => {
      if (isIOS) {
        // Let the download attribute do its thing — iOS Safari prompts to open in Calendar.
        return;
      }
      if (isAndroid) {
        e.preventDefault();
        window.location.href = googleUrl;
        return;
      }
      // Desktop / unknown: open Google Calendar in a new tab
      e.preventDefault();
      window.open(googleUrl, '_blank', 'noopener');
    });
  }

  // ============================================
  // Post-wedding — after the wedding day, flip to Thank You mode
  // ============================================
  function setupPostWedding(c, sideCfg) {
    if (!c) return;
    // side wins over common for the activation date
    const activeFromStr =
      (sideCfg && sideCfg.postWeddingActiveFrom) ||
      (c.postWedding && c.postWedding.activeFrom) ||
      null;
    if (!activeFromStr) return;
    const activeFrom = new Date(activeFromStr + 'T00:00:00');
    if (isNaN(activeFrom.getTime())) return;
    if (Date.now() < activeFrom.getTime()) return; // not yet
    document.body.classList.add('is-post-wedding');
    const pwSection = document.getElementById('postWedding');
    if (pwSection) pwSection.setAttribute('aria-hidden', 'false');
    const title = (sideCfg && sideCfg.postWeddingTitle) || c.postWeddingTitle || (c.postWedding && c.postWedding.title);
    const msg   = (sideCfg && sideCfg.postWeddingMessage) || c.postWeddingMessage || (c.postWedding && c.postWedding.message);
    setText('pwTitle', title);
    setText('pwMsg', msg);
  }

  // ============================================
  // Geofenced welcome — only on the wedding day, only if near venue
  // ============================================
  function setupGeofenceWelcome(c) {
    if (!c || !c.geofence || !c.geofence.enabled) return;
    const g = c.geofence;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    const activeDates = Array.isArray(g.activeDates) ? g.activeDates : [];
    if (!activeDates.includes(todayStr)) return;

    if (!('geolocation' in navigator) || !g.venueCoords) return;

    const overlay = document.getElementById('geoWelcome');
    const closeBtn = document.getElementById('geoWelcomeClose');
    if (!overlay || !closeBtn) return;

    setText('geoWelcomeTitle', g.welcomeTitle);
    setText('geoWelcomeMsg', g.welcomeMessage);

    const DISMISS_KEY = 'sarsheet-geo-dismissed-' + todayStr;
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

    closeBtn.addEventListener('click', () => {
      overlay.hidden = true;
      sessionStorage.setItem(DISMISS_KEY, '1');
    });

    // Haversine distance in metres
    const toRad = (deg) => deg * Math.PI / 180;
    const distanceM = (a, b) => {
      const R = 6371000;
      const dLat = toRad(b.lat - a.lat);
      const dLng = toRad(b.lng - a.lng);
      const lat1 = toRad(a.lat);
      const lat2 = toRad(b.lat);
      const s = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
      return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    };

    navigator.geolocation.getCurrentPosition((pos) => {
      const guest = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const dist = distanceM(guest, g.venueCoords);
      if (dist <= (g.radiusMeters || 500)) {
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
      }
    }, () => {
      // permission denied or unavailable — silently skip
    }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 });
  }

  fetch('config.json', { cache: 'no-cache' })
    .then((r) => r.ok ? r.json() : null)
    .then(applyConfig)
    .catch(() => { wireCalendarLinks(null); });

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ============================================
  // Opening — parchment scroll
  // ============================================
  const envelope = document.getElementById('envelope');
  const landing  = $('#landing');
  const letter   = $('#letter');
  const rsvpDock = $('#rsvpDock');

  let opened = false;
  const openEnvelope = () => {
    if (opened) return;
    opened = true;

    // Auto-start soft background music on the opening gesture
    try {
      bgMusic.volume = 0.25;
      const p = bgMusic.play();
      if (p && typeof p.then === 'function') {
        p.then(() => musicBtn.classList.add('is-playing')).catch(() => {});
      } else {
        musicBtn.classList.add('is-playing');
      }
    } catch (_) {}

    envelope.classList.add('is-open');
    vibrate(20);
    // One-shot shankha chime on the opening gesture (silently ignored if asset missing)
    try {
      const sfx = document.getElementById('shankhaSfx');
      if (sfx) { sfx.volume = 0.45; sfx.currentTime = 0; sfx.play().catch(() => {}); }
    } catch (_) {}
    if (!prefersReduced) burstConfetti(window.innerWidth / 2, window.innerHeight / 2, 40);

    setTimeout(finishOpen, prefersReduced ? 200 : 2800);
  };

  const finishOpen = () => {
    landing.classList.add('is-gone');
    letter.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => letter.classList.add('is-visible'));
    document.body.style.overflow = 'auto';
    rsvpDock.setAttribute('aria-hidden', 'false');
    initReveals();
  };

  document.body.style.overflow = 'hidden';
  envelope.addEventListener('click', openEnvelope);
  envelope.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEnvelope(); }
  });

  // ============================================
  // Scroll-reveal
  // ============================================
  function initReveals() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.18 });
    items.forEach((el) => io.observe(el));
  }

  // ============================================
  // Pull-to-reveal save-the-date
  // ============================================
  const pullCard = $('#pullCard');
  const pullTag  = $('#pullTag');
  const pullTagText = $('#pullTagText');
  const THRESHOLD = 170;
  const MAX_PULL = 240;
  let drag = null;
  let pullOpen = false;

  const setPullTransform = (dy, animated) => {
    pullTag.style.transition = animated ? '' : 'none';
    pullTag.style.transform  = `translateY(${dy}px)`;
  };

  const onPointerDown = (e) => {
    // When already open, don't start a drag and don't capture — let the browser scroll.
    // A collapse now happens only via the explicit click handler below.
    if (pullOpen) return;
    pullTag.setPointerCapture?.(e.pointerId);
    drag = { startY: e.clientY, dy: 0, moved: false };
    setPullTransform(0, false);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dy = Math.max(0, Math.min(MAX_PULL, drag.startY - e.clientY));
    if (dy > 4) drag.moved = true;
    drag.dy = dy;
    setPullTransform(-dy, false);
    pullTag.style.opacity = String(1 - dy / (MAX_PULL * 1.6));
  };
  const onPointerUp = () => {
    if (!drag) return;
    const settled = drag.dy;
    drag = null;
    if (settled >= THRESHOLD) {
      openPull();
    } else {
      setPullTransform(0, true);
      pullTag.style.opacity = '1';
    }
  };
  // Tap-to-collapse (only when open, and only a true tap — ignore the synthetic
  // click that follows a successful pull-to-open, and ignore if the pointer moved)
  pullTag.addEventListener('click', (e) => {
    if (!pullOpen) return;
    if (Date.now() - justOpened < 500) return;
    e.preventDefault();
    closePull();
  });

  let justOpened = 0;
  const openPull = () => {
    pullOpen = true;
    justOpened = Date.now();
    pullCard.classList.add('is-open');
    pullTag.style.transform = '';
    pullTag.style.opacity = '';
    vibrate(30);
    if (!prefersReduced) {
      const r = pullCard.getBoundingClientRect();
      burstConfetti(r.left + r.width / 2, r.top + r.height / 2, 28);
    }
    pullTagText.innerHTML = '<i class="fas fa-check"></i>&nbsp; Date revealed — tap to collapse';
    pullTag.setAttribute('aria-label', 'Tap to collapse the date card');
    const cal = document.getElementById('calActions');
    if (cal) { cal.classList.add('is-visible'); cal.setAttribute('aria-hidden', 'false'); }
    document.body.classList.add('date-revealed');
    // Any newly-visible sections should fade in as they scroll into view
    initReveals();
  };
  const closePull = () => {
    pullOpen = false;
    pullCard.classList.remove('is-open');
    pullTagText.innerHTML = '<i class="fas fa-angle-double-up"></i>&nbsp; Pull up to reveal&nbsp; <i class="fas fa-angle-double-up"></i>';
    pullTag.setAttribute('aria-label', 'Drag up to reveal the date');
    const cal = document.getElementById('calActions');
    if (cal) { cal.classList.remove('is-visible'); cal.setAttribute('aria-hidden', 'true'); }
  };

  if (prefersReduced) {
    // tap-to-reveal fallback
    pullTag.addEventListener('click', () => pullOpen ? closePull() : openPull());
    pullTag.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullOpen ? closePull() : openPull(); }
    });
  } else {
    pullTag.addEventListener('pointerdown', onPointerDown);
    pullTag.addEventListener('pointermove', onPointerMove);
    pullTag.addEventListener('pointerup',   onPointerUp);
    pullTag.addEventListener('pointercancel', onPointerUp);
    pullTag.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pullOpen ? closePull() : openPull(); }
    });
  }

  // ============================================
  // Countdown
  // ============================================
  const cdMap = {
    d: document.querySelector('[data-cd="d"]'),
    h: document.querySelector('[data-cd="h"]'),
    m: document.querySelector('[data-cd="m"]'),
    s: document.querySelector('[data-cd="s"]'),
  };
  const pad = (n) => String(Math.max(0, n)).padStart(2, '0');
  const setCd = (el, val) => {
    if (!el || el.textContent === val) return;
    el.textContent = val;
    el.classList.remove('is-tick');
    void el.offsetWidth;
    el.classList.add('is-tick');
  };
  const tickCountdown = () => {
    const diff = WEDDING_DATE - Date.now();
    if (diff <= 0) {
      setCd(cdMap.d, '00'); setCd(cdMap.h, '00');
      setCd(cdMap.m, '00'); setCd(cdMap.s, '00');
      return;
    }
    const days = Math.floor(diff / 86400000);
    const hrs  = Math.floor(diff % 86400000 / 3600000);
    const mins = Math.floor(diff % 3600000 / 60000);
    const secs = Math.floor(diff % 60000 / 1000);
    setCd(cdMap.d, pad(days));
    setCd(cdMap.h, pad(hrs));
    setCd(cdMap.m, pad(mins));
    setCd(cdMap.s, pad(secs));
  };
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ============================================
  // Scroll progress ribbon
  // ============================================
  const ribbon = $('#scrollRibbon');
  let ribbonRaf = null;
  const onScroll = () => {
    if (ribbonRaf) return;
    ribbonRaf = requestAnimationFrame(() => {
      ribbonRaf = null;
      const h = document.documentElement;
      const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
      ribbon.style.width = Math.max(0, Math.min(100, pct)) + '%';
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  // ============================================
  // Confetti (lightweight canvas)
  // ============================================
  const canvas = $('#confetti');
  const ctx = canvas.getContext('2d');
  let dpr = Math.min(2, window.devicePixelRatio || 1);
  const resizeCanvas = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const particles = [];
  const PETAL_COLORS = ['#e8c4c4', '#f5dcdc', '#c9a86a', '#f0d879', '#b8c9a8'];

  function burstConfetti(x, y, count) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * -8 - 2,
        g: 0.18,
        r: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25,
        life: 0,
        max: 140 + Math.random() * 80,
        color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)]
      });
    }
    if (!confettiRunning) requestAnimationFrame(renderConfetti);
  }

  let confettiRunning = false;
  function renderConfetti() {
    confettiRunning = true;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life++;
      const alpha = Math.max(0, 1 - p.life / p.max);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      // petal shape
      ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (p.life > p.max || p.y > innerHeight + 50) particles.splice(i, 1);
    }
    if (particles.length) requestAnimationFrame(renderConfetti);
    else { confettiRunning = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }

  // ============================================
  // Music toggle (hides if file missing)
  // ============================================
  const musicBtn = $('#musicBtn');
  const bgMusic = $('#bgMusic');
  let musicReady = false;
  bgMusic.volume = 0.25;
  bgMusic.addEventListener('canplaythrough', () => { musicReady = true; musicBtn.hidden = false; });
  bgMusic.addEventListener('loadeddata',     () => { musicReady = true; musicBtn.hidden = false; });
  bgMusic.addEventListener('error',          () => { musicBtn.hidden = true; });
  bgMusic.addEventListener('play',           () => musicBtn.classList.add('is-playing'));
  bgMusic.addEventListener('pause',          () => musicBtn.classList.remove('is-playing'));
  try { bgMusic.load(); } catch (_) { /* no-op */ }

  musicBtn.addEventListener('click', () => {
    if (bgMusic.paused) {
      bgMusic.volume = 0.25;
      bgMusic.play().catch(() => {});
    } else {
      bgMusic.pause();
    }
  });

  // ============================================
  // Share
  // ============================================
  const shareBtn = $('#shareBtn');
  shareBtn.addEventListener('click', async () => {
    vibrate(12);
    const url = location.href;
    const payload = `${SHARE_TEXT}\n\n${url}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Wedding Invitation', text: payload }); return; }
      catch (_) { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(payload);
      showToast('Message copied — share it with love');
    } catch (_) {
      showToast(url);
    }
  });

  // ============================================
  // Theme toggle — light / dark (overrides OS pref)
  // ============================================
  const THEME_KEY = 'sarsheet-theme';
  const themeBtn = $('#themeBtn');
  const themeIcon = themeBtn ? themeBtn.querySelector('i') : null;

  const systemPrefersDark = () =>
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  const applyTheme = (mode) => {
    document.documentElement.setAttribute('data-theme', mode);
    if (themeIcon) {
      themeIcon.className = mode === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
    if (themeBtn) {
      themeBtn.setAttribute('aria-label',
        mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
    // Keep the browser chrome colour in sync
    const chrome = mode === 'dark' ? '#1a0810' : '#fdf6f0';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.setAttribute('content', chrome);
      m.removeAttribute('media');
    });
  };

  // Initial: saved preference wins; else follow OS
  const savedTheme = (() => {
    try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
  })();
  applyTheme(savedTheme === 'dark' || savedTheme === 'light'
    ? savedTheme
    : (systemPrefersDark() ? 'dark' : 'light'));

  // Follow OS changes only if the user hasn't overridden
  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        let s = null;
        try { s = localStorage.getItem(THEME_KEY); } catch (_) {}
        if (s !== 'dark' && s !== 'light') applyTheme(e.matches ? 'dark' : 'light');
      });
    } catch (_) {}
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      vibrate(12);
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
    });
  }

  // ============================================
  // Toast
  // ============================================
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-show'), 2600);
  }

  function vibrate(ms) {
    if (!prefersReduced && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  // ============================================
  // Continuous drifting petals + diya motes
  // ============================================
  (function initPetals() {
    if (prefersReduced) return;
    const pCanvas = document.getElementById('petals');
    if (!pCanvas) return;
    const pCtx = pCanvas.getContext('2d');
    let pDpr = Math.min(2, window.devicePixelRatio || 1);
    const resizeP = () => {
      pDpr = Math.min(2, window.devicePixelRatio || 1);
      pCanvas.width  = innerWidth  * pDpr;
      pCanvas.height = innerHeight * pDpr;
      pCanvas.style.width  = innerWidth  + 'px';
      pCanvas.style.height = innerHeight + 'px';
      pCtx.setTransform(pDpr, 0, 0, pDpr, 0, 0);
    };
    resizeP();
    window.addEventListener('resize', resizeP);

    const PETAL_PALETTE = ['#f5c8d0', '#f3b2bf', '#e8c4c4', '#f5dcdc', '#e9a8b8'];
    const DIYA_PALETTE  = ['#ffd57a', '#ffb347', '#f0d879', '#ffcf6b'];
    const mobile = innerWidth < 720;
    const TARGET = mobile ? 14 : 26;

    const motes = [];
    function spawn(kind) {
      const isDiya = kind === 'diya';
      motes.push({
        kind: isDiya ? 'diya' : 'petal',
        x: Math.random() * innerWidth,
        y: -20 - Math.random() * 120,
        vy: isDiya ? 0.25 + Math.random() * 0.4 : 0.6 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * (isDiya ? 0.25 : 0.9),
        sway: 0.6 + Math.random() * 1.4,
        swaySpeed: 0.008 + Math.random() * 0.012,
        phase: Math.random() * Math.PI * 2,
        r: isDiya ? 2.2 + Math.random() * 2.4 : 5 + Math.random() * 5,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.03,
        color: isDiya
          ? DIYA_PALETTE[Math.floor(Math.random() * DIYA_PALETTE.length)]
          : PETAL_PALETTE[Math.floor(Math.random() * PETAL_PALETTE.length)],
        alpha: isDiya ? 0.65 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35
      });
    }

    // seed initial spread so there's no empty frame
    for (let i = 0; i < TARGET; i++) {
      spawn(Math.random() < 0.3 ? 'diya' : 'petal');
      const m = motes[motes.length - 1];
      m.y = Math.random() * innerHeight;
    }

    let last = performance.now();
    function loop(now) {
      const dt = Math.min(2, (now - last) / 16.7);
      last = now;
      pCtx.clearRect(0, 0, innerWidth, innerHeight);

      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i];
        m.phase += m.swaySpeed * dt;
        m.x += (m.vx + Math.sin(m.phase) * m.sway * 0.4) * dt;
        m.y += m.vy * dt;
        m.rot += m.vr * dt;

        pCtx.save();
        pCtx.translate(m.x, m.y);
        pCtx.globalAlpha = m.alpha;

        if (m.kind === 'diya') {
          // glowing diya mote — soft radial glow
          const g = pCtx.createRadialGradient(0, 0, 0, 0, 0, m.r * 4);
          g.addColorStop(0, m.color);
          g.addColorStop(0.4, m.color + 'aa');
          g.addColorStop(1, 'rgba(255,180,80,0)');
          pCtx.fillStyle = g;
          pCtx.beginPath();
          pCtx.arc(0, 0, m.r * 4, 0, Math.PI * 2);
          pCtx.fill();
          pCtx.fillStyle = '#fff6cc';
          pCtx.globalAlpha = Math.min(1, m.alpha + 0.1);
          pCtx.beginPath();
          pCtx.arc(0, 0, m.r * 0.7, 0, Math.PI * 2);
          pCtx.fill();
        } else {
          // petal — rotated ellipse with gradient
          pCtx.rotate(m.rot);
          pCtx.fillStyle = m.color;
          pCtx.beginPath();
          pCtx.ellipse(0, 0, m.r, m.r * 0.55, 0, 0, Math.PI * 2);
          pCtx.fill();
          pCtx.strokeStyle = 'rgba(122,30,45,0.25)';
          pCtx.lineWidth = 0.5;
          pCtx.stroke();
        }
        pCtx.restore();

        if (m.y > innerHeight + 30 || m.x < -40 || m.x > innerWidth + 40) {
          motes.splice(i, 1);
        }
      }

      // top up to target count
      while (motes.length < TARGET) {
        spawn(Math.random() < 0.3 ? 'diya' : 'petal');
      }

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  })();
})();
