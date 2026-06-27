// Shared analytics + fee-rule helpers for BankiBites admin and delivery views.
//
// SEED: on first use, if `bankibites_meta/fee_rules` is missing, an admin
// caller is expected to seed it with:
//   { far_places: ["Bedapur","Sisua","Chakapada","Harirajpur","Gopalpur","Patapur","Ragadi","Bheda"],
//     fee_near: 30, fee_far: 40 }
// Until then, callers fall back to the same defaults locally.

import {
  doc, getDoc, setDoc,
} from 'https://www.gstatic.com/firebasejs/9.20.0/firebase-firestore.js';
import { COL } from './firebase-config.js';

const DEFAULT_RULES = {
  far_places: ['Bedapur', 'Sisua', 'Chakapada', 'Harirajpur', 'Gopalpur', 'Patapur', 'Ragadi', 'Bheda'],
  fee_near: 30,
  fee_far: 40,
};

let _rulesCache = null;
let _rulesPromise = null;

export async function loadFeeRules(db, { force = false, autoSeed = false } = {}) {
  if (!force && _rulesCache) return _rulesCache;
  if (!force && _rulesPromise) return _rulesPromise;
  _rulesPromise = (async () => {
    try {
      const ref = doc(db, COL.META, 'fee_rules');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() || {};
        _rulesCache = {
          far_places: Array.isArray(d.far_places) && d.far_places.length ? d.far_places : DEFAULT_RULES.far_places,
          fee_near:   Number.isFinite(d.fee_near) ? d.fee_near : DEFAULT_RULES.fee_near,
          fee_far:    Number.isFinite(d.fee_far)  ? d.fee_far  : DEFAULT_RULES.fee_far,
        };
      } else {
        _rulesCache = { ...DEFAULT_RULES };
        if (autoSeed) {
          try { await setDoc(ref, _rulesCache); } catch (e) { console.warn('[analytics] fee_rules seed skipped:', e.message); }
        }
      }
    } catch (e) {
      console.warn('[analytics] loadFeeRules failed, using defaults:', e.message);
      _rulesCache = { ...DEFAULT_RULES };
    }
    return _rulesCache;
  })();
  return _rulesPromise;
}

export function isFarPlace(o, rules) {
  const list = rules?.far_places || DEFAULT_RULES.far_places;
  const haystack = [o?.place, o?.customer?.address].filter(Boolean).join(' ').toLowerCase();
  if (!haystack) return false;
  return list.some(p => {
    const safe = String(p || '').trim().toLowerCase();
    if (!safe) return false;
    const re = new RegExp(`\\b${safe.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return re.test(haystack);
  });
}

export function feeForOrder(o, rules) {
  if (Number.isFinite(o?.payout_amount)) return o.payout_amount;
  return isFarPlace(o, rules) ? rules.fee_far : rules.fee_near;
}

export function toDateSafe(v) {
  if (!v) return null;
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// First day (00:00 local) of the *previous* calendar month.
// e.g. on 2026-05-01 (or any May date) → 2026-04-01 00:00. Used as the
// canonical "fetch window" lower bound across admin and delivery views so we
// never load orders older than ~30–60 days into memory.
export function startOfLastMonth(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 0, 0, 0, 0);
}

// First day (00:00 local) of the *current* calendar month.
export function startOfCurrentMonth(ref = new Date()) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
}

// Build N consecutive day buckets ending today. Returns { labels: ['DD MMM',...],
// keys: ['YYYY-MM-DD',...], buckets: Map<key, items[]> }.
export function bucketByDay(items, getDate, days = 14) {
  const today = startOfDay(new Date());
  const buckets = new Map();
  const keys = [];
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    const k = dayKey(d);
    keys.push(k);
    labels.push(d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
    buckets.set(k, []);
  }
  for (const it of items) {
    const d = getDate(it);
    if (!d) continue;
    const k = dayKey(startOfDay(d));
    if (buckets.has(k)) buckets.get(k).push(it);
  }
  return { labels, keys, buckets };
}

export function dayKey(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function groupBy(items, keyFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (k == null || k === '') continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(it);
  }
  return m;
}

export function topN(map, n, valueFn = arr => arr.length) {
  return [...map.entries()]
    .map(([k, v]) => [k, valueFn(v)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// Theme-aware Chart.js colour palette. Always computed fresh from the current
// OS preference so charts pick up the correct colors if the user switches
// light/dark after the page loaded. The palette object is cheap to build.
export function chartPalette() {
  const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    brand:    '#FF6B35',
    brandSoft:'rgba(255,107,53,0.35)',
    text:     dark ? '#e5e7eb' : '#1a1a2e',
    muted:    dark ? '#9aa3b2' : '#6b7280',
    grid:     dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    series: [
      '#FF6B35', '#3b82f6', '#16a34a', '#a855f7', '#f59e0b',
      '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1',
    ],
    status: {
      new:              '#f59e0b',
      assigned:         '#3b82f6',
      out_for_delivery: '#a855f7',
      delivered:        '#16a34a',
      cancelled:        '#dc3545',
      fake:             '#92400e',
    },
  };
}

export function applyChartGlobalDefaults() {
  if (!window.Chart) return;
  const p = chartPalette();
  Chart.defaults.color = p.muted;
  Chart.defaults.borderColor = p.grid;
  Chart.defaults.font.family = "Inter, 'Segoe UI', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.boxHeight = 12;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
}

// Reapply Chart.js global defaults whenever the user switches OS theme so that
// existing charts' grid-lines and tick labels update on next repaint/resize.
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyChartGlobalDefaults();
  });
}

// Wait for Chart.js global to be ready when the CDN script loads async.
// Rejects after 5 s so callers don't hang silently when the CDN fails.
export function whenChartReady() {
  if (window.Chart) { applyChartGlobalDefaults(); return Promise.resolve(window.Chart); }
  return new Promise((resolve, reject) => {
    const t = setInterval(() => {
      if (window.Chart) { clearInterval(t); applyChartGlobalDefaults(); resolve(window.Chart); }
    }, 30);
    setTimeout(() => { clearInterval(t); if (!window.Chart) reject(new Error('Chart.js failed to load within 5 s')); }, 5000);
  });
}

// Wire a one-shot resize on a collapsible stats block so Chart.js canvases that
// were rendered while collapsed (height 0) snap to the right size on first open.
// Also syncs aria-expanded on the summary element for consistent cross-browser
// screen-reader announcement of the collapsed/expanded state.
export function wireStatsBlockResize(blockEl) {
  if (!blockEl || blockEl._resizeWired) return;
  blockEl._resizeWired = true;
  const summary = blockEl.querySelector('summary');
  if (summary) summary.setAttribute('aria-expanded', blockEl.open ? 'true' : 'false');
  blockEl.addEventListener('toggle', () => {
    if (summary) summary.setAttribute('aria-expanded', blockEl.open ? 'true' : 'false');
    if (!blockEl.open) return;
    blockEl.querySelectorAll('canvas').forEach(c => {
      const ch = window.Chart?.getChart?.(c);
      if (ch) ch.resize();
    });
  });
}

export function fmtINR(n) {
  if (!Number.isFinite(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

// Net revenue for an order = cart total minus any admin-applied discount.
// Prepayments (paid_already) are assumed to have gone into the BankiBites
// account so they're already counted in `total` — do not subtract them.
export function netRevenue(o) {
  const total    = Number.isFinite(+o?.total)    ? +o.total    : 0;
  const discount = Number.isFinite(+o?.discount) ? +o.discount : 0;
  return Math.max(0, total - discount);
}

export function isDelivered(o)  { return o?.status === 'delivered'; }
export function isCancelled(o)  { return o?.status === 'cancelled'; }
export function isPayoutPaid(o) { return o?.payout_paid === true; }

// A delivered order whose courier hasn't been settled is "pending payout".
export function isPayoutPending(o) {
  return isDelivered(o) && !isPayoutPaid(o);
}
