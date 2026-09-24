/* ═══════════════════════════════════════════════════════════════════
   Anvisha Travels — app.js
   Booking logic (preserved verbatim from prior index.html) +
   scroll-linked scene, reveals, counters, micro-interactions.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Scroll to form ────────────────────────────────────────── */
  window.scrollToForm = function () {
    document.getElementById('booking-form').scrollIntoView({
      behavior: REDUCED_MOTION ? 'auto' : 'smooth',
      block: 'start'
    });
  };

  /* ── DOM refs (identical to original file) ─────────────────── */
  var custName        = document.getElementById('cust-name');
  var custPhone       = document.getElementById('cust-phone');
  var phoneMsg        = document.getElementById('phone-msg');
  var dateInput       = document.getElementById('ride-date');
  var timeSelect      = document.getElementById('ride-time');
  var passengerSelect = document.getElementById('passengers');
  var locationSection = document.getElementById('location-section');
  var waBtn           = document.getElementById('wa-btn');
  var helperText      = document.getElementById('helper-text');
  var paxCustomWrap   = document.getElementById('pax-custom-wrap');
  var paxCustom       = document.getElementById('pax-custom');
  var timeMsg         = document.getElementById('time-msg');
  var waPreview       = document.getElementById('wa-preview');
  var summaryChip     = document.getElementById('book-summary-chip');

  var PHONE_RE = /^[6-9]\d{9}$/;

  /* ── 1-hour time slots ─────────────────────────────────────── */
  (function () {
    for (var h = 0; h < 24; h++) {
      var h12  = (h % 12) || 12;
      var ampm = h < 12 ? 'AM' : 'PM';
      var opt  = document.createElement('option');
      opt.value = (h < 10 ? '0' + h : h) + ':00';
      opt.dataset.label = h12 + ':00 ' + ampm;
      opt.textContent = opt.dataset.label;
      timeSelect.appendChild(opt);
    }
  })();

  function getNextHourValue() {
    var h = new Date().getHours() + 1;
    if (h >= 24) return null;
    return (h < 10 ? '0' + h : h) + ':00';
  }

  function ymd(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  function isToday(dateStr) { return dateStr === ymd(new Date()); }

  function filterTimeForToday() {
    var now = new Date();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var firstFuture = null;
    Array.prototype.forEach.call(timeSelect.options, function (opt) {
      var p = opt.value.split(':');
      var slotMin = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
      var past = slotMin <= nowMin;
      opt.disabled = past;
      opt.hidden = false;
      opt.textContent = past ? (opt.dataset.label + '  ·  Past') : opt.dataset.label;
      if (!past && !firstFuture) firstFuture = opt.value;
    });
    return firstFuture;
  }

  function enableAllTimeOptions() {
    Array.prototype.forEach.call(timeSelect.options, function (opt) {
      opt.disabled = false;
      opt.hidden = false;
      opt.textContent = opt.dataset.label;
    });
  }

  function applySmartTimeSelect() {
    var nextHour = getNextHourValue();
    if (nextHour) timeSelect.value = nextHour;
    if (!timeSelect.value || (timeSelect.options[timeSelect.selectedIndex] && timeSelect.options[timeSelect.selectedIndex].disabled)) {
      var fe = Array.prototype.find.call(timeSelect.options, function (o) { return !o.disabled; });
      timeSelect.value = fe ? fe.value : '';
    }
  }

  function ensureBookableDate() {
    if (!isToday(dateInput.value)) return;
    var future = Array.prototype.some.call(timeSelect.options, function (o) { return !o.disabled; });
    if (!future) {
      var tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      dateInput.value = ymd(tomorrow);
      if (dateInput._flatpickr) dateInput._flatpickr.setDate(tomorrow, false);
      enableAllTimeOptions();
      applySmartTimeSelect();
    }
  }

  function isBookingInFuture() {
    if (!dateInput.value || !timeSelect.value) return false;
    var d = dateInput.value.split('-');
    var t = timeSelect.value.split(':');
    var picked = new Date(+d[0], +d[1] - 1, +d[2], +t[0], +t[1], 0, 0);
    return picked.getTime() > Date.now();
  }

  /* ── Flatpickr (graceful fallback if CDN blocked) ──────────── */
  if (typeof window.flatpickr === 'function') {
    window.flatpickr(dateInput, {
      minDate:       'today',
      defaultDate:   'today',
      dateFormat:    'Y-m-d',
      disableMobile: true,
      onChange: function (selectedDates, dateStr) {
        if (isToday(dateStr)) {
          filterTimeForToday();
          if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) {
            applySmartTimeSelect();
          }
        } else {
          enableAllTimeOptions();
        }
        update();
      }
    });
  } else {
    dateInput.min = ymd(new Date());
    dateInput.value = ymd(new Date());
    dateInput.addEventListener('change', function () {
      if (isToday(dateInput.value)) {
        filterTimeForToday();
        if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) applySmartTimeSelect();
      } else {
        enableAllTimeOptions();
      }
      update();
    });
  }

  filterTimeForToday();
  applySmartTimeSelect();
  ensureBookableDate();

  setInterval(function () {
    if (isToday(dateInput.value)) {
      filterTimeForToday();
      if (timeSelect.selectedOptions[0] && timeSelect.selectedOptions[0].disabled) {
        applySmartTimeSelect();
      }
      ensureBookableDate();
      update();
    }
  }, 60 * 1000);

  function formatDate(val) {
    if (!val) return '';
    var p      = val.split('-');
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return p[2] + ' ' + months[+p[1] - 1] + ' ' + p[0];
  }

  function getPax() {
    if (passengerSelect.value === '8+') {
      var n = parseInt(paxCustom.value, 10);
      return (n >= 8) ? String(n) : '';
    }
    return passengerSelect.value;
  }

  /* ── Name / Phone ──────────────────────────────────────────── */
  custName.addEventListener('input', update);

  custPhone.addEventListener('input', function () {
    var cleaned = this.value.replace(/\D/g, '').slice(0, 10);
    if (cleaned !== this.value) this.value = cleaned;
    if (this.value === '') {
      this.classList.remove('invalid');
      phoneMsg.classList.remove('show');
    } else if (!PHONE_RE.test(this.value)) {
      this.classList.add('invalid');
      if (this.value.length === 10) phoneMsg.classList.add('show');
      else phoneMsg.classList.remove('show');
    } else {
      this.classList.remove('invalid');
      phoneMsg.classList.remove('show');
    }
    update();
  });

  /* ── Passenger events ──────────────────────────────────────── */
  passengerSelect.addEventListener('change', function () {
    if (this.value === '8+') {
      paxCustomWrap.style.display = 'block';
      paxCustom.focus();
    } else {
      paxCustomWrap.style.display = 'none';
      paxCustom.value = '';
      paxCustom.classList.remove('invalid');
      document.getElementById('pax-error').classList.remove('show');
    }
    update();
  });

  paxCustom.addEventListener('input', function () {
    var n = parseInt(this.value, 10);
    var paxError = document.getElementById('pax-error');
    if (this.value === '') {
      this.classList.remove('invalid');
      paxError.classList.remove('show');
    } else if (n < 8) {
      this.classList.add('invalid');
      paxError.classList.add('show');
    } else {
      this.classList.remove('invalid');
      paxError.classList.remove('show');
    }
    update();
  });

  /* ── WhatsApp URL builder ─────────────────────────────────── */
  function buildWAUrl() {
    var time  = timeSelect.options[timeSelect.selectedIndex].text;
    var pax   = getPax();
    var name  = custName.value.trim();
    var phone = custPhone.value.trim();
    var dest  = document.getElementById('destination').value.trim();

    var text = '%F0%9F%9A%97 *Anvisha Travels - Ride Request*%0A%0A'
      + '%F0%9F%91%A4 *Name:* '       + encodeURIComponent(name)  + '%0A'
      + '%F0%9F%93%9E *Phone:* '      + encodeURIComponent(phone) + '%0A'
      + '%F0%9F%93%85 *Date:* '       + encodeURIComponent(formatDate(dateInput.value)) + '%0A'
      + '%F0%9F%95%9B *Time:* '       + encodeURIComponent(time)  + '%0A'
      + '%F0%9F%91%A5 *Passengers:* ' + encodeURIComponent(pax)   + '%0A';
    if (dest) text += '%F0%9F%8E%AF *Destination:* ' + encodeURIComponent(dest) + '%0A';
    text += '%0A%E2%9C%85 Please confirm my booking. Thank you!';

    return 'https://wa.me/919658141900?text=' + text;
  }

  function buildBookingPayload() {
    return {
      date:        dateInput.value,
      time:        timeSelect.value,
      timeLabel:   timeSelect.options[timeSelect.selectedIndex].text,
      passengers:  getPax(),
      destination: document.getElementById('destination').value.trim() || null,
      customer:    { name: custName.value.trim(), phone: custPhone.value.trim() },
      source:      'web',
      status:      'new'
    };
  }

  window.openWhatsApp = function () {
    if (waBtn.disabled) return;
    if (isToday(dateInput.value)) {
      filterTimeForToday();
      if (timeSelect.options[timeSelect.selectedIndex] && timeSelect.options[timeSelect.selectedIndex].disabled) {
        applySmartTimeSelect();
        update();
      }
    }
    if (!isBookingInFuture()) {
      timeMsg.classList.add('show');
      timeSelect.classList.add('invalid');
      update();
      return;
    }
    try {
      if (typeof window.saveBookingDraft === 'function') {
        window.saveBookingDraft(buildBookingPayload());
      }
    } catch (_) {}

    var openLink = function () {
      var a = document.createElement('a');
      a.href = buildWAUrl();
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    if (REDUCED_MOTION) {
      openLink();
    } else {
      waBtn.classList.add('driving');
      setTimeout(openLink, 480);
      setTimeout(function () { waBtn.classList.remove('driving'); }, 1400);
    }
  };

  /* ── Form gate ─────────────────────────────────────────────── */
  function update() {
    var nameOk   = custName.value.trim().length >= 2;
    var phoneOk  = PHONE_RE.test(custPhone.value.trim());
    var futureOk = isBookingInFuture();

    if (dateInput.value && timeSelect.value && !futureOk) {
      timeMsg.classList.add('show');
      timeSelect.classList.add('invalid');
    } else {
      timeMsg.classList.remove('show');
      timeSelect.classList.remove('invalid');
    }

    var ok = nameOk && phoneOk && futureOk && getPax();
    if (ok) {
      locationSection.classList.add('visible');
      waBtn.disabled = false;
      waBtn.classList.remove('disabled');
      helperText.innerHTML = '<i class="fab fa-whatsapp" style="color:var(--success)"></i> Tap below — we\'ll confirm on WhatsApp within minutes';
    } else {
      waBtn.disabled = true;
      waBtn.classList.add('disabled');
      if (dateInput.value && timeSelect.value && !futureOk) {
        helperText.innerHTML = '<i class="fas fa-clock-rotate-left"></i> Please choose a future date &amp; time';
      } else {
        helperText.innerHTML = '<i class="fas fa-info-circle"></i> Fill in all required fields to continue';
      }
    }

    updatePreviewAndSummary(ok, nameOk, phoneOk);
  }

  /* ── Live WhatsApp preview + sticky summary chip ───────────── */
  function updatePreviewAndSummary(allOk, nameOk, phoneOk) {
    if (!waPreview) return;
    var name  = custName.value.trim();
    var phone = custPhone.value.trim();
    var pax   = getPax();
    var date  = dateInput.value ? formatDate(dateInput.value) : '';
    var time  = timeSelect.value ? timeSelect.options[timeSelect.selectedIndex].text : '';
    var dest  = document.getElementById('destination').value.trim();
    var bubble = waPreview.querySelector('.bubble');

    if (allOk) {
      waPreview.classList.add('ready');
      var line = '<b>🚗 Anvisha Travels — Ride Request</b><br>'
        + (name ? '👤 ' + escapeHtml(name) + ' · 📞 ' + escapeHtml(phone) + '<br>' : '')
        + (date ? '📅 ' + escapeHtml(date) + ' · 🕛 ' + escapeHtml(time) + '<br>' : '')
        + (pax  ? '👥 ' + escapeHtml(pax)  + ' passengers' : '')
        + (dest ? '<br>🎯 ' + escapeHtml(dest) : '');
      bubble.innerHTML = line;
    } else {
      waPreview.classList.remove('ready');
      var hint = '<b>Message preview</b><br>Fill the fields — we\'ll compose your WhatsApp message here as you type.'
        + '<span class="dots"><span></span><span></span><span></span></span>';
      bubble.innerHTML = hint;
    }

    if (summaryChip) {
      if (nameOk && phoneOk) {
        var parts = ['For ' + (name.split(' ')[0] || 'you')];
        if (date) parts.push(date);
        if (time) parts.push(time.replace(/\s+/g, ' '));
        if (pax)  parts.push(pax + (pax === '1' ? ' passenger' : ' passengers'));
        summaryChip.textContent = parts.join(' · ');
        summaryChip.classList.add('show');
      } else {
        summaryChip.classList.remove('show');
      }
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  timeSelect.addEventListener('change', update);
  document.getElementById('destination').addEventListener('input', update);

  /* ── Reveal-on-scroll (single observer for all classes) ────── */
  var revealSel = '.route-card, .fleet-car, .counter, .postcard, .step';
  var revealNodes = document.querySelectorAll(revealSel);
  if ('IntersectionObserver' in window) {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          revealIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    revealNodes.forEach(function (el, i) {
      el.style.transitionDelay = ((i % 4) * 0.06) + 's';
      revealIO.observe(el);
    });
  } else {
    revealNodes.forEach(function (el) { el.classList.add('in'); });
  }

  /* ── Odometer counters ─────────────────────────────────────── */
  var counterNodes = document.querySelectorAll('.counter .num[data-target]');
  if ('IntersectionObserver' in window && counterNodes.length) {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          animateCounter(e.target);
          countIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    counterNodes.forEach(function (n) { countIO.observe(n); });
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-target'));
    var decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';

    if (REDUCED_MOTION) {
      el.textContent = prefix + formatNumber(target, decimals) + suffix;
      return;
    }
    var dur = 1100, t0 = null;
    function tick(t) {
      if (t0 == null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var value = target * eased;
      el.textContent = prefix + formatNumber(value, decimals) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function formatNumber(n, decimals) {
    if (decimals > 0) return n.toFixed(decimals);
    var rounded = Math.round(n);
    return rounded.toLocaleString('en-IN');
  }

  /* ── Hero mini-stats also tick ─────────────────────────────── */
  var heroStatNums = document.querySelectorAll('.hero-stat .num[data-target]');
  if ('IntersectionObserver' in window && heroStatNums.length) {
    var heroCountIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          animateCounter(e.target);
          heroCountIO.unobserve(e.target);
        }
      });
    }, { threshold: 0.4 });
    heroStatNums.forEach(function (n) { heroCountIO.observe(n); });
  }

  /* ── Nav opacity toggle on scroll ──────────────────────────── */
  var siteNav = document.querySelector('.site-nav');
  var waFab   = document.querySelector('.wa-fab');
  function onScrollNav() {
    var y = window.scrollY || window.pageYOffset;
    if (siteNav) siteNav.classList.toggle('scrolled', y > 40);
    if (waFab)   waFab.classList.toggle('show', y > 260);
  }
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ── Scroll-linked scene RAF (car drives, sky shifts) ──────── */
  var rootStyle = document.documentElement.style;
  var lastY = -1, ticking = false;
  function updateScrollVars() {
    var y = window.scrollY || window.pageYOffset;
    var vh = window.innerHeight || 700;
    var heroEl = document.getElementById('hero');
    var heroH = heroEl ? heroEl.offsetHeight : vh;
    // Scene progress: 0 at top, 1 by the end of the hero (+viewport buffer)
    var progress = Math.max(0, Math.min(1, y / (heroH + vh * 0.5)));
    rootStyle.setProperty('--scroll-y', y);
    rootStyle.setProperty('--car-t', progress.toFixed(4));
    rootStyle.setProperty('--sky-t', progress.toFixed(4));
    ticking = false;
  }
  function onScrollScene() {
    var y = window.scrollY || window.pageYOffset;
    if (y === lastY) return;
    lastY = y;
    if (!ticking) {
      requestAnimationFrame(updateScrollVars);
      ticking = true;
    }
  }
  if (!REDUCED_MOTION) {
    window.addEventListener('scroll', onScrollScene, { passive: true });
    updateScrollVars();
  } else {
    rootStyle.setProperty('--car-t', '0.45');
    rootStyle.setProperty('--sky-t', '0.15');
  }

  /* ── Fleet card → passengers + scroll to booking ───────────── */
  document.querySelectorAll('.fleet-car').forEach(function (card) {
    card.addEventListener('click', onFleetPick);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFleetPick.call(card); }
    });
  });
  function onFleetPick() {
    var pax = this.getAttribute('data-pax');
    if (pax && passengerSelect) {
      var options = Array.prototype.map.call(passengerSelect.options, function (o) { return o.value; });
      if (options.indexOf(pax) !== -1) {
        passengerSelect.value = pax;
        passengerSelect.dispatchEvent(new Event('change'));
      } else if (parseInt(pax, 10) >= 8) {
        passengerSelect.value = '8+';
        passengerSelect.dispatchEvent(new Event('change'));
        setTimeout(function () { paxCustom.value = pax; paxCustom.dispatchEvent(new Event('input')); }, 40);
      }
    }
    window.scrollToForm();
  }

  /* ── Route card → highlight map route + destination hint ───── */
  document.querySelectorAll('.route-card').forEach(function (card) {
    var routeId = card.getAttribute('data-route');
    var dest    = card.getAttribute('data-dest') || '';
    card.addEventListener('mouseenter', function () { activateRoute(routeId); });
    card.addEventListener('focus',      function () { activateRoute(routeId); });
    card.addEventListener('mouseleave', function () { activateRoute(null); });
    card.addEventListener('blur',       function () { activateRoute(null); });
    card.addEventListener('click', function () {
      if (dest) {
        var destInput = document.getElementById('destination');
        if (!destInput.value.trim()) { destInput.value = dest; destInput.dispatchEvent(new Event('input')); }
      }
      window.scrollToForm();
    });
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
    });
  });
  function activateRoute(id) {
    document.querySelectorAll('.map-route').forEach(function (r) { r.classList.remove('active'); });
    document.querySelectorAll('.map-pin').forEach(function (p) { p.classList.remove('strong'); });
    if (!id) return;
    var route = document.querySelector('.map-route[data-route="' + id + '"]');
    if (route) route.classList.add('active');
    document.querySelectorAll('.map-pin').forEach(function (p) {
      var v = p.getAttribute('data-pin') || '';
      if (v === id || v.split('-')[0] === id) p.classList.add('strong');
    });
  }

  /* ── How-it-works: trigger road car animation on scroll ────── */
  var howRoad = document.querySelector('.how-road');
  if (howRoad && 'IntersectionObserver' in window) {
    var howIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          howRoad.classList.add('in-view');
          howIO.unobserve(howRoad);
        }
      });
    }, { threshold: 0.4 });
    howIO.observe(howRoad);
  }

  /* ── Logo horn easter egg (3 taps in 1s) ───────────────────── */
  var logoTaps = [];
  var brandMark = document.querySelector('.brand-mark');
  if (brandMark) {
    brandMark.addEventListener('click', function (e) {
      var now = Date.now();
      logoTaps = logoTaps.filter(function (t) { return now - t < 1000; });
      logoTaps.push(now);
      if (logoTaps.length >= 3) {
        logoTaps = [];
        e.preventDefault();
        playHorn();
        brandMark.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }],
          { duration: 380, easing: 'cubic-bezier(0.16,1,0.30,1)' }
        );
      }
    });
  }
  function playHorn() {
    if (REDUCED_MOTION) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = new Ctx();
      var now = ctx.currentTime;
      [440, 587, 440].forEach(function (freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.14 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.14 + 0.12);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.14);
        osc.stop(now + i * 0.14 + 0.14);
      });
      setTimeout(function () { try { ctx.close(); } catch (_) {} }, 800);
    } catch (_) {}
  }

  /* ── Nav data-scroll-to attribute (progressive enhancement) ── */
  document.querySelectorAll('[data-scroll-to]').forEach(function (el) {
    el.addEventListener('click', function (e) {
      var sel = el.getAttribute('data-scroll-to');
      var target = sel && document.querySelector(sel);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });

  /* ── Footer year ───────────────────────────────────────────── */
  var yr = document.getElementById('footer-year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* Initial paint */
  update();
})();
