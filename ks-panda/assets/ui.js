// KS Panda UI helpers — shared across every admin/manager page.
// Vanilla ES module, no dependencies. Bootstrap JS is not required.

const NAV_ITEMS = {
  admin: [
    { href: "dashboard.html", label: "Dashboard", icon: "fa-gauge-high" },
    { href: "sites.html",     label: "Sites",     icon: "fa-location-dot" },
    { href: "users.html",     label: "Users",     icon: "fa-users" },
    { href: "reports.html",   label: "Reports",   icon: "fa-file-arrow-down" },
    { href: "audit.html",     label: "Audit Log", icon: "fa-clipboard-list" },
  ],
  manager: [
    { href: "dashboard.html", label: "Today",   icon: "fa-clock" },
    { href: "history.html",   label: "History", icon: "fa-calendar-days" },
  ],
};

const COLLAPSE_KEY = "ks_sidebar_collapsed";

export function mountTopbar({ role, onSignOut, logoSrc = "../logo.png" } = {}) {
  const items = NAV_ITEMS[role] || [];
  const currentFile = (location.pathname.split("/").pop() || "dashboard.html");
  const roleLabel = role === "admin" ? "Admin" : "Manager";

  // Grab existing body children so we can move them into the shell content area.
  const existingMain = document.querySelector("body > main");
  const existingFooter = document.querySelector("body > footer, body > .ks-footer");

  const shell = document.createElement("div");
  shell.id = "appShell";

  // --- Sidebar (desktop) -------------------------------------------------
  const sidebar = document.createElement("aside");
  sidebar.className = "ks-sidebar";
  sidebar.setAttribute("aria-label", "Primary navigation");
  sidebar.innerHTML = `
    <a class="ks-sidebar-brand" href="dashboard.html" aria-label="KS Panda ${roleLabel} home">
      <img src="${logoSrc}" alt="">
      <span class="ks-sidebar-brand-text">
        <span class="ks-sidebar-brand-title">KS Panda</span>
        <span class="ks-sidebar-brand-role">${roleLabel}</span>
      </span>
    </a>
    <nav class="ks-sidebar-nav">
      ${items.map(i => `
        <a href="${i.href}" class="ks-nav-item ${i.href === currentFile ? "active" : ""}" title="${i.label}">
          <i class="fa-solid ${i.icon}"></i>
          <span>${i.label}</span>
        </a>`).join("")}
    </nav>
    <div class="ks-sidebar-footer">
      <button type="button" class="ks-nav-item ks-nav-signout" data-signout title="Sign out">
        <i class="fa-solid fa-right-from-bracket"></i>
        <span>Sign out</span>
      </button>
      <button type="button" class="ks-sidebar-collapse" data-collapse aria-label="Collapse sidebar" title="Collapse sidebar">
        <i class="fa-solid fa-angles-left"></i>
        <span>Collapse</span>
      </button>
    </div>
  `;

  // --- Topbar (mobile) — brand + sign-out icon ---------------------------
  const topbar = document.createElement("header");
  topbar.className = "ks-topbar";
  topbar.innerHTML = `
    <a class="ks-topbar-brand" href="dashboard.html">
      <img src="${logoSrc}" alt="KS Panda">
      <span><span class="ks-topbar-brand-title">KS Panda</span> <span class="ks-topbar-brand-role">· ${roleLabel}</span></span>
    </a>
    <button type="button" class="ks-topbar-signout" data-signout-mobile aria-label="Sign out" title="Sign out">
      <i class="fa-solid fa-right-from-bracket"></i>
    </button>
  `;

  // --- Tab bar (mobile) — horizontal sticky scroll strip -----------------
  const tabbar = document.createElement("nav");
  tabbar.className = "ks-tabbar";
  tabbar.setAttribute("aria-label", "Primary");
  tabbar.innerHTML = items.map(i => `
    <a href="${i.href}" class="ks-tab ${i.href === currentFile ? "active" : ""}" title="${i.label}">
      <i class="fa-solid ${i.icon}"></i>
      <span>${i.label}</span>
    </a>`).join("");

  // --- Content + footer slots --------------------------------------------
  const content = document.createElement("div");
  content.className = "ks-content";
  if (existingMain) content.appendChild(existingMain);

  const footerSlot = document.createElement("div");
  footerSlot.className = "ks-shell-footer";
  if (existingFooter) footerSlot.appendChild(existingFooter);

  shell.appendChild(sidebar);
  shell.appendChild(topbar);
  shell.appendChild(tabbar);
  shell.appendChild(content);
  shell.appendChild(footerSlot);
  document.body.appendChild(shell);

  // Scroll the active tab into view on mobile so users see where they are.
  requestAnimationFrame(() => {
    const activeTab = tabbar.querySelector(".ks-tab.active");
    if (activeTab && window.matchMedia("(max-width: 899.98px)").matches) {
      activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    }
  });

  // --- Sign out (both triggers) ------------------------------------------
  const signOutHandler = () => { if (typeof onSignOut === "function") onSignOut(); };
  sidebar.querySelector("[data-signout]").addEventListener("click", signOutHandler);
  topbar.querySelector("[data-signout-mobile]").addEventListener("click", signOutHandler);

  // --- Sidebar collapse (desktop) ----------------------------------------
  if (localStorage.getItem(COLLAPSE_KEY) === "1") {
    document.body.classList.add("ks-sidebar-collapsed");
  }
  const collapseBtn = sidebar.querySelector("[data-collapse]");
  const syncCollapseBtn = () => {
    const collapsed = document.body.classList.contains("ks-sidebar-collapsed");
    collapseBtn.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
    collapseBtn.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
  };
  syncCollapseBtn();
  collapseBtn.addEventListener("click", () => {
    const collapsed = document.body.classList.toggle("ks-sidebar-collapsed");
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    syncCollapseBtn();
  });

  return shell;
}

// ---------- Toast ----------
function ensureToastHost() {
  let host = document.getElementById("ks-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "ks-toast-host";
    host.className = "ks-toast-host";
    document.body.appendChild(host);
  }
  return host;
}

export function showToast(message, kind = "info", { duration = 3200 } = {}) {
  const host = ensureToastHost();
  const iconMap = {
    info: "fa-circle-info",
    success: "fa-circle-check",
    danger: "fa-circle-exclamation",
    warn: "fa-triangle-exclamation",
  };
  const el = document.createElement("div");
  el.className = `ks-toast ks-toast--${kind}`;
  el.innerHTML = `
    <span class="ks-toast-icon"><i class="fa-solid ${iconMap[kind] || iconMap.info}"></i></span>
    <div class="ks-toast-body"></div>
  `;
  el.querySelector(".ks-toast-body").textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .2s ease, transform .2s ease";
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    setTimeout(() => el.remove(), 220);
  }, duration);
}

// ---------- Modal ----------
export function openModal({
  title = "",
  bodyHtml = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  confirmClass = "btn btn-primary",
  onConfirm,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "ks-modal-backdrop open";
    backdrop.innerHTML = `
      <div class="ks-modal" role="dialog" aria-modal="true">
        <div class="ks-modal-header">
          <h3 class="ks-modal-title"></h3>
          <button type="button" class="ks-modal-close" aria-label="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="ks-modal-body"></div>
        <div class="ks-modal-footer">
          <button type="button" class="btn btn-outline-secondary" data-cancel></button>
          <button type="button" data-confirm></button>
        </div>
      </div>
    `;
    backdrop.querySelector(".ks-modal-title").textContent = title;
    backdrop.querySelector(".ks-modal-body").innerHTML = bodyHtml;

    const cancelBtn = backdrop.querySelector("[data-cancel]");
    cancelBtn.textContent = cancelLabel;

    const confirmBtn = backdrop.querySelector("[data-confirm]");
    confirmBtn.className = confirmClass;
    confirmBtn.textContent = confirmLabel;

    const close = (result) => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e) => { if (e.key === "Escape") close(null); };
    document.addEventListener("keydown", onKey);

    backdrop.querySelector(".ks-modal-close").onclick = () => close(null);
    cancelBtn.onclick = () => close(null);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(null); });

    confirmBtn.onclick = async () => {
      const modalEl = backdrop.querySelector(".ks-modal");
      confirmBtn.disabled = true;
      const original = confirmBtn.innerHTML;
      confirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${confirmLabel}`;
      try {
        const result = typeof onConfirm === "function" ? await onConfirm(modalEl) : true;
        if (result === false) {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = original;
          return;
        }
        close(result ?? true);
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = original;
        showToast(err?.message || "Something went wrong", "danger");
      }
    };

    document.body.appendChild(backdrop);
    setTimeout(() => {
      const focusable = backdrop.querySelector("input, textarea, select");
      if (focusable) focusable.focus();
    }, 40);
  });
}

// ---------- Small helpers ----------
export function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join("") || "?";
}

export function setYear(id = "footer-year") {
  const el = document.getElementById(id);
  if (el) el.textContent = new Date().getFullYear();
}
