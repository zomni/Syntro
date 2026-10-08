import { BACKEND_API_URL, map, osmLayer, satelliteLayer } from "../views/map.js";
import { identifiers } from "../utils/identifiers.js";
import { goTo } from "@app/goToCampus";
import { getPrimaryCampusKey } from "../utils/campusConfig.js";
import { canAccessLiveTelemetry } from "../utils/networkTelemetryStorage.js";
import { setBuildingMatchMode, syncSessionButtonsToFilters } from "@app/featureDisplay";

const rootId = "session-mode-badge";
const inventoryLinkId = "session-inventory-link";
const sessionPollMs = 10000;
let lastSessionKey = "";
let pollHandle = null;
let minimalMapMode = false;
let satelliteActive = false;
let buildingMatchActive = false;

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
    session?.role || "",
    session?.username || "",
    getSiteFingerprint(session),
  ].join("|");

const getRoleClass = (session) => {
  if (!session?.isAuthenticated) return "";
  const role = String(session.role || "viewer").toLowerCase().replace(/[^a-z]/g, "");
  return role ? ` role-${role}` : "";
};

const renderBadge = (badge, session) => {
  // Si satelital/coincidencias estaban en el panel de filtros, vuelven al badge
  // antes del innerHTML: asi el re-render los sustituye en vez de dejar copias.
  [".session-mode-globe", ".session-mode-match"].forEach((selector) => {
    const button = document.querySelector(selector);
    if (button && !badge.contains(button)) badge.appendChild(button);
  });

  const statusPanel = document.getElementById("map-status-panel");
  badge.className = `session-mode-badge ${session?.isAdmin ? "is-admin" : "is-viewer"}`;
  badge.dataset.authenticated = session?.isAuthenticated ? "true" : "false";

  const userLabel = session?.isAuthenticated && session.username
    ? `<span class="session-mode-user${getRoleClass(session)}">${session.username}</span>`
    : `<span class="session-mode-user">Sin sesion</span>`;

  badge.innerHTML = `
    <div class="session-mode-info">
      <div class="session-mode-heading">
        <div class="session-mode-heading-buttons">
          <button type="button" class="session-mode-globe" aria-pressed="false" title="Vista satelital" aria-label="Vista satelital">
            <span class="session-mode-globe-icon" aria-hidden="true"></span>
          </button>
          <button type="button" class="session-mode-visibility" aria-pressed="false" title="Ocultar controles del mapa" aria-label="Ocultar controles del mapa">
            <span class="session-mode-eye-icon" aria-hidden="true"></span>
          </button>
          ${
            canAccessLiveTelemetry(session)
              ? `<button type="button" class="session-mode-match" aria-pressed="${buildingMatchActive}" title="${buildingMatchActive ? "Ocultar coincidencias de inventario" : "Coincidencias de inventario"}" aria-label="${buildingMatchActive ? "Ocultar coincidencias de inventario" : "Coincidencias de inventario"}">
                  <span class="session-mode-match-icon" aria-hidden="true"></span>
                </button>`
              : ""
          }
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
    // El boton puede haberse movido al panel de filtros: event.currentTarget
    // lo referencia aunque ya no viva dentro del badge.
    const btn = event.currentTarget;
    btn.classList.toggle("is-active", satelliteActive);
    btn.setAttribute("aria-pressed", String(satelliteActive));
  });

  badge.querySelector(".session-mode-match")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    // Capturado antes del await: currentTarget es null al terminar el dispatch.
    const btn = event.currentTarget;
    buildingMatchActive = !buildingMatchActive;
    await setBuildingMatchMode(buildingMatchActive);

    btn.classList.toggle("is-active", buildingMatchActive);
    btn.setAttribute("aria-pressed", String(buildingMatchActive));
    btn.title = buildingMatchActive ? "Ocultar coincidencias de inventario" : "Coincidencias de inventario";
    btn.setAttribute("aria-label", btn.title);
  });

  updateMinimalMapMode();
  syncSessionButtonsToFilters();
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

  if (!canAccessLiveTelemetry(session)) {
    buildingMatchActive = false;
    setBuildingMatchMode(false);
  }
};

export const initSessionModeBadge = async () => {
  await refreshSessionBadge();

  window.addEventListener("focus", refreshSessionBadge);
  window.addEventListener("resize", positionInventoryLink);

  if (!pollHandle) {
    pollHandle = window.setInterval(refreshSessionBadge, sessionPollMs);
  }
};
