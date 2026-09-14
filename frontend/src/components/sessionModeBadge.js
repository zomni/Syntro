import { BACKEND_API_URL, map, osmLayer, satelliteLayer } from "../views/map.js";
import { identifiers } from "../utils/identifiers.js";
import { goTo } from "@app/goToCampus";
import { getPrimaryCampusKey } from "../utils/campusConfig.js";

const rootId = "session-mode-badge";
const inventoryLinkId = "session-inventory-link";
const sessionPollMs = 10000;
let lastSessionKey = "";
let pollHandle = null;
let minimalMapMode = false;
let satelliteActive = false;

const updateMinimalMapMode = () => {
  document.body.classList.toggle("map-ui-minimal", minimalMapMode);
  const button = document.querySelector(".session-mode-visibility");
  if (!button) return;
  button.setAttribute("aria-pressed", String(minimalMapMode));
  button.title = minimalMapMode ? "Mostrar controles del mapa" : "Ocultar controles del mapa";
  button.setAttribute("aria-label", button.title);
  button.classList.toggle("is-active", minimalMapMode);
};

const loadSession = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });

    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const logout = async () => {
  try {
    await fetch(`${BACKEND_API_URL}/api/auth/logout`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } finally {
    goTo(getPrimaryCampusKey());
    window.dispatchEvent(new CustomEvent(identifiers.events.sessionChanged, { detail: { isAuthenticated: false } }));
    window.location.reload();
  }
};

const loginModalId = "session-login-modal";

const openLoginModal = () => {
  if (document.getElementById(loginModalId)) return;

  const backdrop = document.createElement("div");
  backdrop.id = loginModalId;
  backdrop.className = "manual-building-modal-backdrop";

  backdrop.innerHTML = `
    <div class="manual-building-modal" role="dialog" aria-modal="true" aria-label="Iniciar sesion">
      <div class="manual-building-modal-header">
        <div>
          <div class="manual-building-modal-title">Iniciar sesion</div>
          <div class="manual-building-modal-subtitle">Accede al modo administrador desde el mapa.</div>
        </div>
        <button type="button" class="manual-building-icon-button" data-login-modal-close aria-label="Cerrar">&times;</button>
      </div>
      <form class="manual-building-form" data-login-modal-form>
        <label>
          <span>Usuario</span>
          <input name="username" type="text" autocomplete="username" required />
        </label>
        <label>
          <span>Contraseña</span>
          <input name="password" type="password" autocomplete="current-password" required />
        </label>
        <div class="session-login-error" data-login-error hidden></div>
        <div class="manual-building-modal-actions">
          <button type="submit" class="dashboard-link manual-building-editor-button building-tool-button">Iniciar sesion</button>
          <button type="button" class="dashboard-link action-cancel-button" data-login-modal-close>Cancelar</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();

  backdrop.querySelectorAll("[data-login-modal-close]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });
  });

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });

  const errorEl = backdrop.querySelector("[data-login-error]");
  const form = backdrop.querySelector("[data-login-modal-form]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "");

    if (!username || !password) return;

    errorEl.hidden = true;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `<span class="session-login-spinner" aria-hidden="true"></span> Iniciando...`;
    }
    form.querySelectorAll("input").forEach((i) => (i.disabled = true));

    const startTime = Date.now();
    const ensureSpinnerVisible = async () => {
      const remaining = Math.max(0, 500 - (Date.now() - startTime));
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    };

    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        await ensureSpinnerVisible();
        errorEl.textContent = data?.message || "No se pudo iniciar sesión.";
        errorEl.hidden = false;
        return;
      }

      await ensureSpinnerVisible();
      close();
      window.showWelcomeLoading?.();
      await refreshSessionBadge();
    } catch {
      await ensureSpinnerVisible();
      errorEl.textContent = "No se pudo contactar el backend.";
      errorEl.hidden = false;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "Iniciar sesión";
      }
      form.querySelectorAll("input").forEach((i) => (i.disabled = false));
    }
  });

  const usernameInput = form.querySelector('input[name="username"]');
  usernameInput?.focus();
};

const buildLabel = (session) => {
  if (!session?.isAuthenticated) {
    return "Modo vista";
  }

  return session.isAdmin ? "Modo Administrador" : "Modo vista";
};

const getSiteFingerprint = (session) => {
  if (!Array.isArray(session?.sites) || session.sites.length === 0) {
    return "";
  }

  return session.sites
    .map(
      (site) =>
        `${site.campusKey}:${site.minZoom}:${site.maxZoom}:${site.zoom}:` +
        `${Array.isArray(site.center) ? site.center.join(",") : ""}:` +
        `${Array.isArray(site.bounds) ? site.bounds.length : 0}`
    )
    .sort()
    .join("|");
};

const getSessionKey = (session) =>
  [
    session?.isAuthenticated ? "1" : "0",
    session?.isAdmin ? "admin" : "viewer",
    session?.username || "",
    getSiteFingerprint(session),
  ].join("|");

const renderBadge = (badge, session) => {
  const statusPanel = document.getElementById("map-status-panel");
  badge.className = `session-mode-badge ${session?.isAdmin ? "is-admin" : "is-viewer"}`;
  badge.dataset.authenticated = session?.isAuthenticated ? "true" : "false";

  const userLabel = session?.isAuthenticated && session.username
    ? `<span class="session-mode-user">${session.username}</span>`
    : `<span class="session-mode-user">Sin sesion</span>`;

  badge.innerHTML = `
    <div class="session-mode-info">
      <div class="session-mode-heading">
        <span class="session-mode-label">${buildLabel(session)}</span>
        <div class="session-mode-heading-buttons">
          <button type="button" class="session-mode-globe" aria-pressed="false" title="Vista satelital" aria-label="Vista satelital">
            <span class="session-mode-globe-icon" aria-hidden="true"></span>
          </button>
          <button type="button" class="session-mode-visibility" aria-pressed="false" title="Ocultar controles del mapa" aria-label="Ocultar controles del mapa">
            <span class="session-mode-eye-icon" aria-hidden="true"></span>
          </button>
        </div>
      </div>
      ${userLabel}
    </div>
    ${
      session?.isAuthenticated
        ? `<button type="button" class="session-mode-logout" title="Cerrar sesion">Cerrar sesion</button>`
        : `<button type="button" class="session-mode-login" title="Iniciar sesion">Iniciar sesion</button>`
    }
  `;

  if (statusPanel) {
    statusPanel.classList.add("embedded-backend-status");
    badge.prepend(statusPanel);
  }

  badge.querySelector(".session-mode-logout")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    logout();
  });

  badge.querySelector(".session-mode-login")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openLoginModal();
  });

  badge.querySelector(".session-mode-visibility")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    minimalMapMode = !minimalMapMode;
    updateMinimalMapMode();
  });

  badge.querySelector(".session-mode-globe")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    satelliteActive = !satelliteActive;
    if (satelliteActive) {
      osmLayer.remove();
      satelliteLayer.addTo(map);
    } else {
      satelliteLayer.remove();
      osmLayer.addTo(map);
    }
    const btn = badge.querySelector(".session-mode-globe");
    if (btn) {
      btn.classList.toggle("is-active", satelliteActive);
      btn.setAttribute("aria-pressed", String(satelliteActive));
    }
  });

  updateMinimalMapMode();
};

const ensureBadge = () => {
  const statusPanel = document.getElementById("map-status-panel");
  if (!statusPanel) return null;

  let badge = document.getElementById(rootId);
  if (badge) return badge;

  badge = document.createElement("div");
  badge.id = rootId;
  badge.addEventListener("click", (event) => event.stopPropagation());
  badge.addEventListener("mousedown", (event) => event.stopPropagation());
  badge.addEventListener("dblclick", (event) => event.stopPropagation());

  statusPanel.classList.add("embedded-backend-status");
  badge.appendChild(statusPanel);
  document.body.appendChild(badge);
  return badge;
};

const ensureInventoryLink = (session) => {
  const badge = document.getElementById(rootId);

  const removeInventoryLink = () => {
    const existing = document.getElementById(inventoryLinkId);
    if (existing) {
      existing.remove();
      window.dispatchEvent(new CustomEvent("syntro-inventory-link-removed"));
    }
  };

  if (!badge || !session?.isAuthenticated) {
    removeInventoryLink();
    return null;
  }

  let link = document.getElementById(inventoryLinkId);
  if (link) return link;

  link = document.createElement("a");
  link.id = inventoryLinkId;
  link.className = "dashboard-link session-inventory-link";
  link.href = `${BACKEND_API_URL}/dashboard/inventory`;
  link.target = identifiers.windowName;
  link.rel = "noreferrer";
  link.textContent = "Inventario";
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await fetch(`${BACKEND_API_URL}/api/auth/mark-inventory-entry`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      // Si el backend no responde, se abre igual intentando el dashboard.
    }
    const dashboardWindow = window.open(link.href, identifiers.windowName);
    dashboardWindow?.focus?.();
  });

  badge.insertAdjacentElement("afterend", link);
  positionInventoryLink();
  return link;
};

const positionInventoryLink = () => {
  const badge = document.getElementById(rootId);
  const link = document.getElementById(inventoryLinkId);
  if (!badge || !link) return;

  const badgeRect = badge.getBoundingClientRect();
  link.style.top = `${Math.round(badgeRect.bottom + 6)}px`;
};

const refreshSessionBadge = async () => {
  const badge = ensureBadge();
  if (!badge) return;

  const session = await loadSession();
  const sessionKey = getSessionKey(session);
  if (sessionKey === lastSessionKey) return;

  lastSessionKey = sessionKey;
  renderBadge(badge, session);
  ensureInventoryLink(session);
  requestAnimationFrame(positionInventoryLink);
  window.dispatchEvent(new CustomEvent(identifiers.events.sessionChanged, { detail: session || {} }));
};

export const initSessionModeBadge = async () => {
  await refreshSessionBadge();

  window.addEventListener("focus", refreshSessionBadge);
  window.addEventListener("resize", positionInventoryLink);

  if (!pollHandle) {
    pollHandle = window.setInterval(refreshSessionBadge, sessionPollMs);
  }
};
