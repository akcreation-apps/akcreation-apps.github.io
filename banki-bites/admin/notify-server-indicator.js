// Top-bar indicator for the local_machine notification server's reachability.
//
// Pulls `server_url` + `notify_token` from the live notify-sync cache (which
// in turn subscribes to bankibites_meta/notification_config via onSnapshot),
// so admin edits to the server URL propagate without a page refresh.
//
// Ping frequency: every 20 s when the tab is visible. Paused when hidden.

const PING_EVERY_MS = 20_000;
const HEALTH_PATH   = '/bankibites/scanner-health';   // light-weight — no tracking file I/O
const TIMEOUT_MS    = 5_000;

// Last-known state is cached so the click popup can show details without
// re-pinging (and without blocking the admin on a 5s timeout).
let _lastState  = { state: 'unknown', title: '', detail: null, server: '', ts: 0 };

export function initNotifyServerIndicator() {
  const el = document.getElementById('notifyServerIndicator');
  if (!el) return;
  const label = document.getElementById('notifyServerLabel');

  function set(state, title, detail, server) {
    el.classList.remove('notify-server--online', 'notify-server--offline', 'notify-server--unknown');
    el.classList.add(`notify-server--${state}`);
    el.title = title;
    if (label) label.textContent = `Notification server ${state}`;
    _lastState = { state, title, detail: detail || null, server: server || '', ts: Date.now() };
  }

  function cfg() {
    // notify-sync.js caches server_url + notify_token in its module scope.
    // We re-read it on every ping so admin edits apply without refresh.
    const win = window;
    return {
      server_url:   win.__bbNotifyCfg?.server_url   || '',
      notify_token: win.__bbNotifyCfg?.notify_token || '',
    };
  }

  async function ping() {
    const { server_url, notify_token } = cfg();
    if (!server_url || !notify_token) {
      set('unknown', 'Notification server not configured', { reason: 'missing_config' }, server_url || '');
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${server_url}${HEALTH_PATH}`, {
        method: 'GET',
        mode:   'cors',
        headers: { 'X-Notify-Token': notify_token },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      if (body.success === false) throw new Error(body.message || 'server error');
      const extra = body.seconds_since_tick !== undefined && body.seconds_since_tick !== null
        ? ` · scanner ${body.seconds_since_tick}s ago`
        : '';
      set('online', `Notification server online${extra}`, body, server_url);
    } catch (err) {
      clearTimeout(timer);
      set('offline',
          `Notification server OFFLINE: ${err.message || 'unreachable'}`,
          { error: err.message || 'unreachable' },
          server_url);
    }
  }

  function _fmtAge(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    return Math.floor(s / 3600) + 'h ago';
  }

  function showStatusPopup() {
    const { state, server, detail, ts } = _lastState;
    const serverLine = server
      ? `<code style="word-break:break-all;">${server}</code>`
      : '<em>not configured</em>';

    let icon, title, html;

    if (state === 'online') {
      icon = 'success';
      title = 'Notification server ONLINE';
      const d = detail || {};
      const scannerLine = d.alive === false
        ? '<span style="color:#D7263D;">Scanner thread NOT running</span>'
        : d.stuck
          ? `<span style="color:#D7263D;">Scanner STUCK (last tick ${d.seconds_since_tick}s ago)</span>`
          : d.disabled
            ? '<span style="color:#D7263D;">Scanner disabled (DISABLE_ETA_SCANNER=1)</span>'
            : `✅ Scanner alive · last tick ${d.seconds_since_tick ?? '—'}s ago · ${d.total_ticks ?? 0} tick(s) total`;
      const errLine = d.last_tick_error
        ? `<div style="margin-top:6px;color:#D7263D;">⚠ Last tick error: <code>${d.last_tick_error}</code></div>`
        : '';
      html = `
        <div style="text-align:left;font-size:13px;">
          <div style="margin-bottom:6px;">Server: ${serverLine}</div>
          <div style="margin-bottom:6px;">Checked: ${_fmtAge(ts)}</div>
          <hr style="margin:10px 0;">
          <div>${scannerLine}</div>
          ${errLine}
          <div style="margin-top:10px;color:#6b7280;font-size:12px;">
            Notifications (email + WhatsApp) will fire normally.
          </div>
        </div>`;
    } else if (state === 'offline') {
      icon = 'error';
      title = 'Notification server OFFLINE';
      html = `
        <div style="text-align:left;font-size:13px;">
          <div style="margin-bottom:6px;">Server: ${serverLine}</div>
          <div style="margin-bottom:6px;">Checked: ${_fmtAge(ts)}</div>
          <div style="margin-bottom:6px;color:#D7263D;">Error: <code>${(detail && detail.error) || 'unreachable'}</code></div>
          <hr style="margin:10px 0;">
          <div style="color:#D7263D;font-weight:600;margin-bottom:6px;">🚨 No notifications will fire until this is fixed.</div>
          <div style="color:#6b7280;font-size:12px;">
            Likely causes:
            <ul style="margin:4px 0 0 20px;padding:0;">
              <li>Flask server not running on your laptop</li>
              <li>ngrok tunnel is down or URL changed</li>
              <li>Wrong URL / token saved in Settings</li>
              <li>Network connection to ngrok blocked</li>
            </ul>
          </div>
        </div>`;
    } else {
      icon = 'info';
      title = 'Notification server NOT CONFIGURED';
      html = `
        <div style="text-align:left;font-size:13px;">
          <div style="margin-bottom:6px;color:#6b7280;">
            Server URL and token haven't been saved yet.
          </div>
          <hr style="margin:10px 0;">
          <div style="color:#6b7280;font-size:12px;">
            Open <b>Settings → Server &amp; notifications</b> and fill in:
            <ul style="margin:4px 0 0 20px;padding:0;">
              <li>Notification server URL (your ngrok URL)</li>
              <li>X-Notify-Token (matches server <code>.env</code>)</li>
              <li>Admin email(s) + WhatsApp group link</li>
            </ul>
          </div>
        </div>`;
    }

    if (typeof Swal === 'undefined') {
      alert(`${title}\nServer: ${server || '—'}`);
      return;
    }
    Swal.fire({
      icon, title, html,
      confirmButtonText: 'Close',
      confirmButtonColor: '#FF6B35',
      width: 480,
    });
  }

  let timer = null;
  function startPinging() {
    stopPinging();
    ping();   // run once immediately
    timer = setInterval(() => { if (!document.hidden) ping(); }, PING_EVERY_MS);
  }
  function stopPinging() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPinging();
    else startPinging();
  });

  // Clicking the indicator opens a status popup with the last-known state,
  // the server URL that was pinged, and (if offline) likely root causes.
  // No redirect to Settings — admin can stay on the current tab.
  el.addEventListener('click', showStatusPopup);

  startPinging();
}
