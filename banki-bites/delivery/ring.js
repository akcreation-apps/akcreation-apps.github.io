/* ===========================================================================
   BankiBites — Delivery new-order alert engine
   ---------------------------------------------------------------------------
   Self-contained module that fires a loud, long, multi-channel alert when a
   new order lands in the partner's queue:

     • Web Audio two-tone siren (880 Hz ↔ 1200 Hz, 400 ms each) at max gain,
       looping until stopRinging() is called.
     • navigator.vibrate pattern on mobile, re-fired every tick.
     • OS-level Notification (desktop banner / Android lock-screen) when
       permission is granted, so the partner is reached even with the tab
       backgrounded.
     • Floating red "Stop ringing" banner inside the delivery UI.

   Browsers block audio playback until a user gesture, so `armAudioOnFirstGesture`
   must be called after login — it attaches a one-shot pointer/key listener
   that resumes the AudioContext.
   =========================================================================== */

// Pleasant two-note chime — A5 → E5, a musical minor third. Sine wave so it
// reads as "ring-ring" rather than the earlier ambulance-siren feel. Pattern
// per cycle: note A (short) → gap → note B (short) → long gap → repeat.
const TONE_A_HZ = 880;    // A5
const TONE_B_HZ = 659.25; // E5
const NOTE_MS = 220;      // how long each note sounds
const INTER_NOTE_GAP_MS = 120;
const INTER_CYCLE_GAP_MS = 700;
const CYCLE_MS = (NOTE_MS + INTER_NOTE_GAP_MS) * 2 + INTER_CYCLE_GAP_MS;
const VIBRATE_PATTERN = [250, 150, 250, 800];            // matches the chime cadence
const VIBRATE_LOOP_MS = VIBRATE_PATTERN.reduce((a, b) => a + b, 0);

let _ctx = null;
let _osc = null;
let _gain = null;
let _toggleTimer = null;
let _vibrateTimer = null;
let _activeNotification = null;
let _ringing = false;
let _alertCount = 0;                                     // for multi-assignment display
let _bannerEl = null;
let _bannerLabelEl = null;
let _stopBtnEl = null;
let _armed = false;

function _ensureBannerRefs() {
  if (_bannerEl) return;
  _bannerEl = document.getElementById('ringBanner');
  if (!_bannerEl) return;
  _bannerLabelEl = _bannerEl.querySelector('[data-ring-label]');
  _stopBtnEl = document.getElementById('ringStopBtn');
  if (_stopBtnEl) _stopBtnEl.addEventListener('click', stopRinging);
  // Tapping the banner itself (not just the button) also stops — easier on
  // mobile where thumbs land anywhere on the strip.
  _bannerEl.addEventListener('click', e => {
    if (e.target === _stopBtnEl) return;                 // button handles its own
    stopRinging();
  });
}

function _getCtx() {
  if (_ctx) return _ctx;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  _ctx = new Ctor();
  return _ctx;
}

/**
 * Synchronously create + resume the AudioContext. Must be called from inside
 * a user-gesture event handler (e.g. form submit, button click) or browsers
 * will keep it suspended. Safe to call multiple times.
 */
export function primeAudioNow() {
  const ctx = _getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

/** Unlock AudioContext on the first user gesture so the first ring is audible. */
export function armAudioOnFirstGesture() {
  if (_armed) return;
  _armed = true;
  const unlock = () => {
    const ctx = _getCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
}

/** Request OS notification permission (safe to call repeatedly). */
export async function requestAlertPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try { return await Notification.requestPermission(); }
  catch { return 'default'; }
}

/**
 * Schedule one chime cycle (two notes with envelope + gaps) starting at `at`.
 * Uses Web Audio's sample-accurate scheduler so there are no audible clicks
 * and the pattern stays in rhythm even if the main thread is busy.
 */
function _scheduleCycle(ctx, at) {
  const schedule = (freq, start) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';                                   // smooth, pleasant
    osc.frequency.setValueAtTime(freq, start);
    // Attack (fade in 20ms) → hold → release (fade out 60ms) — avoids clicks.
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(1.0, start + 0.02);
    g.gain.setValueAtTime(1.0, start + (NOTE_MS / 1000) - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, start + (NOTE_MS / 1000));
    osc.connect(g).connect(_gain);
    osc.start(start);
    osc.stop(start + (NOTE_MS / 1000) + 0.02);
  };
  schedule(TONE_A_HZ, at);
  schedule(TONE_B_HZ, at + (NOTE_MS + INTER_NOTE_GAP_MS) / 1000);
}

function _startAudioLoop() {
  const ctx = _getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (_gain) return;                                     // already playing
  _gain = ctx.createGain();
  _gain.gain.setValueAtTime(1.0, ctx.currentTime);       // max within browser cap
  _gain.connect(ctx.destination);
  // Kick off the first cycle immediately, then schedule the next one on an
  // interval that matches the full cycle length.
  _scheduleCycle(ctx, ctx.currentTime + 0.02);
  _toggleTimer = setInterval(() => {
    if (!_ctx || !_gain) return;
    _scheduleCycle(_ctx, _ctx.currentTime + 0.02);
  }, CYCLE_MS);
}

function _stopAudioLoop() {
  if (_toggleTimer) { clearInterval(_toggleTimer); _toggleTimer = null; }
  if (_gain) {
    try { _gain.gain.cancelScheduledValues(_ctx.currentTime); } catch {}
    try { _gain.disconnect(); } catch {}
    _gain = null;
  }
  _osc = null;
}

function _startVibrateLoop() {
  if (!('vibrate' in navigator)) return;
  try { navigator.vibrate(VIBRATE_PATTERN); } catch {}
  _vibrateTimer = setInterval(() => {
    try { navigator.vibrate(VIBRATE_PATTERN); } catch {}
  }, VIBRATE_LOOP_MS);
}

function _stopVibrateLoop() {
  if (_vibrateTimer) { clearInterval(_vibrateTimer); _vibrateTimer = null; }
  if ('vibrate' in navigator) {
    try { navigator.vibrate(0); } catch {}
  }
}

function _fireNotification(order, count) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    if (_activeNotification) { try { _activeNotification.close(); } catch {} }
    const title = count > 1 ? `${count} new deliveries` : 'New delivery assigned';
    const body = order?.customer_name
      ? `${order.customer_name} — ${order.restaurant_name || 'Order'} #${String(order.id || '').slice(0, 6)}`
      : 'Open BankiBites Delivery to view the order.';
    _activeNotification = new Notification(title, {
      body,
      tag: 'bb-new-delivery',                            // coalesce multiple notifications
      renotify: true,
      requireInteraction: true,
      vibrate: VIBRATE_PATTERN,
      icon: '/banki-bites/banki-bites-logo.png',
      badge: '/banki-bites/banki-bites-logo.png',
    });
    _activeNotification.onclick = () => {
      try { window.focus(); } catch {}
      stopRinging();
    };
  } catch {}
}

function _showBanner(count) {
  _ensureBannerRefs();
  if (!_bannerEl) return;
  _bannerEl.hidden = false;
  if (_bannerLabelEl) {
    _bannerLabelEl.textContent = count > 1
      ? `🔔 ${count} new deliveries assigned — tap to stop ringing`
      : '🔔 New delivery assigned — tap to stop ringing';
  }
}

function _hideBanner() {
  if (_bannerEl) _bannerEl.hidden = true;
}

/** Begin ringing (idempotent). Call once per new assignment detected. */
export function startRinging(order) {
  _alertCount += 1;
  _showBanner(_alertCount);
  _fireNotification(order, _alertCount);
  if (_ringing) return;                                  // audio/vibrate already looping
  _ringing = true;
  _startAudioLoop();
  _startVibrateLoop();
}

/** Stop everything — audio, vibration, notification, banner. */
export function stopRinging() {
  if (!_ringing && _alertCount === 0) {
    _hideBanner();
    return;
  }
  _ringing = false;
  _alertCount = 0;
  _stopAudioLoop();
  _stopVibrateLoop();
  if (_activeNotification) {
    try { _activeNotification.close(); } catch {}
    _activeNotification = null;
  }
  _hideBanner();
}

export function isRinging() { return _ringing; }
