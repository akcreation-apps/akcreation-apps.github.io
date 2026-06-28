// Small shared utilities for Anvisha admin: date helpers, formatting,
// grouping, Chart.js theming. Independent of any collection-specific logic.

export function toDateSafe(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  if (typeof v.toDate === 'function') {           // Firestore Timestamp
    try { return v.toDate(); } catch (_) { return null; }
  }
  if (typeof v.seconds === 'number') {            // raw Firestore-like object
    return new Date(v.seconds * 1000);
  }
  return null;
}

export function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
export function endOfDay(d)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }
export function startOfMonth(d = new Date()) { const x = startOfDay(d); x.setDate(1); return x; }
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function daysBetween(a, b) {
  return Math.floor((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000);
}

export function fmtINR(n) {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Math.round(Number(n)).toLocaleString('en-IN');
}
export function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Number(n).toLocaleString('en-IN');
}
export function fmtDate(d) {
  const x = toDateSafe(d);
  if (!x) return '—';
  return x.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateTime(d) {
  const x = toDateSafe(d);
  if (!x) return '—';
  return x.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtTimeLabel(timeHHmm) {
  if (!timeHHmm || typeof timeHHmm !== 'string') return '';
  const p = timeHHmm.split(':');
  const h = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (isNaN(h)) return timeHHmm;
  const h12 = (h % 12) || 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${h12}:${m < 10 ? '0' + m : m} ${ampm}`;
}

export function groupBy(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (k == null) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}
export function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
export function bucketByDay(list, dateFn, days) {
  const today = startOfDay(new Date());
  const labels = [];
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const k = d.toISOString().slice(0, 10);
    labels.push(k);
    buckets.set(k, 0);
  }
  for (const x of list) {
    const d = toDateSafe(dateFn(x));
    if (!d) continue;
    const k = startOfDay(d).toISOString().slice(0, 10);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + 1);
  }
  return {
    labels: labels.map(k => {
      const d = new Date(k);
      return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }),
    data: labels.map(k => buckets.get(k)),
  };
}

export function chartPalette() {
  return [
    '#f5a623', '#22c55e', '#3b82f6', '#a855f7', '#ef4444',
    '#eab308', '#06b6d4', '#ec4899', '#10b981', '#f97316',
  ];
}
export function applyChartGlobalDefaults() {
  if (!window.Chart) return;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const text = dark ? '#c4bbaf' : '#4a4540';
  const grid = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  Chart.defaults.color = text;
  Chart.defaults.borderColor = grid;
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  Chart.defaults.font.size = 11;
  Chart.defaults.plugins.legend.labels.color = text;
  Chart.defaults.scale.ticks = Chart.defaults.scale.ticks || {};
  Chart.defaults.scale.ticks.color = text;
}

export function wireStatsBlockResize(canvases) {
  // Chart.js sometimes loses sizing when its container becomes visible after
  // a tab switch. Force a resize on next tick to pick up the real height.
  requestAnimationFrame(() => {
    canvases.forEach(c => { try { c.resize && c.resize(); } catch (_) {} });
  });
}

// Phone number normaliser — strips spaces, +91, leading 0; returns digits only.
export function normalisePhone(raw) {
  if (!raw) return '';
  let s = String(raw).trim().replace(/[^\d+]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}

// Customer lifecycle bucket from days since last trip.
export function lifecycleBucket(daysSince) {
  if (daysSince == null) return 'never';
  if (daysSince <= 30) return 'active';
  if (daysSince <= 60) return 'cooling';
  if (daysSince <= 120) return 'lapsed';
  return 'lost';
}

// Build a wa.me URL — never api.whatsapp.com.
export function buildWaUrl(phoneE164DigitsOnly, text) {
  return `https://wa.me/${phoneE164DigitsOnly}?text=${encodeURIComponent(text)}`;
}
