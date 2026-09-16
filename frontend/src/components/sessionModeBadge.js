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

const goToLoginPage = () => {
  window.location.href = `${BACKEND_API_URL}/Auth/Login`;
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
    goToLoginPage();
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
  link.href = `${BACKEND_API_URL}/dashboard`;
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
