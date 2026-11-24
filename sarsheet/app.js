(function () {
  'use strict';

  // ============================================
  // Config — single source of truth
  // ============================================
  // Fallbacks used only if config.json fails to load
  let WEDDING_DATE = new Date('2026-12-13T00:00:00+05:30').getTime();
  let PHONE = '919861039566';
  let SHARE_TEXT = "You're invited to Sarbeswar & Sheetal's wedding 💍 — 13 Dec 2026";
  let WHATSAPP_MESSAGE = "Hello! I'd like to RSVP for Sarbeswar & Sheetal's wedding. 💍";

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
    if (c.contactPhone) PHONE = String(c.contactPhone);
    if (c.shareText) SHARE_TEXT = c.shareText;
    if (c.whatsappMessage) WHATSAPP_MESSAGE = c.whatsappMessage;

    if (c.pageTitle) document.title = c.pageTitle;

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
    setText('closingSignature', c.closingSignature);

    // Portraits — always both, groom on left / bride on right
    const groomCfg = cfg.groom || {};
    const brideCfg = cfg.bride || {};
    if (groomCfg.image) setAttr('groomImg', 'src', groomCfg.image);
    if (brideCfg.image) setAttr('brideImg', 'src', brideCfg.image);
    setText('groomName', groomCfg.firstName);
    setText('brideName', brideCfg.firstName);
    setText('groomRole', groomCfg.role);
    setText('brideRole', brideCfg.role);
    setText('coupleGroom', groomCfg.firstName);
    setText('coupleBride', brideCfg.firstName);

    // Parents block — always both (invitation convention)
    setText('groomParentRel', groomCfg.parentRel);
    setText('groomFather',   groomCfg.father);
    setText('groomMother',   groomCfg.mother);
    setText('brideParentRel', brideCfg.parentRel);
    setText('brideFather',   brideCfg.father);
    setText('brideMother',   brideCfg.mother);

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
    if (callBtn) callBtn.setAttribute('href', 'tel:' + PHONE);

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
    if (pullOpen) { closePull(); return; }
    pullTag.setPointerCapture?.(e.pointerId);
    drag = { startY: e.clientY, dy: 0 };
    setPullTransform(0, false);
  };
  const onPointerMove = (e) => {
    if (!drag) return;
    const dy = Math.max(0, Math.min(MAX_PULL, drag.startY - e.clientY));
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

  const openPull = () => {
    pullOpen = true;
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
  const onScroll = () => {
    const h = document.documentElement;
    const pct = (h.scrollTop) / (h.scrollHeight - h.clientHeight) * 100;
    ribbon.style.width = Math.max(0, Math.min(100, pct)) + '%';
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
    const url = location.href;
    if (navigator.share) {
      try { await navigator.share({ title: 'Wedding Invitation', text: SHARE_TEXT, url }); return; }
      catch (_) { /* fall through */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied — share it with love');
    } catch (_) {
      showToast(url);
    }
  });

  // ============================================
  // WhatsApp RSVP
  // ============================================
  const waBtn = $('#waBtn');
  waBtn.addEventListener('click', () => {
    const msg = encodeURIComponent(WHATSAPP_MESSAGE);
    const url = `https://wa.me/${PHONE}?text=${msg}`;
    window.location.href = url;
  });

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
})();
