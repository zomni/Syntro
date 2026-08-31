import {
  loadNetworkTelemetryStatus,
  resetNetworkTelemetryCache,
} from "../utils/networkTelemetryStorage.js";
import { getPrimaryCampusKey } from "../utils/campusConfig.js";
import { identifiers } from "../utils/identifiers.js";
import { appConfig } from "../config/appConfig.js";

const DEFAULT_CAMPUS = getPrimaryCampusKey();
const PANEL_ID = "network-telemetry-panel";
const TOGGLE_ID = "network-telemetry-toggle";

const DISPLAY_LOCALE = appConfig.display.locale;
const DISPLAY_TIME_ZONE = appConfig.display.timeZone;

let telemetryPanelElements = null;
let telemetryState = null;
let telemetryFetchInFlight = false;

const registerControlSurface = (element) => {
  if (!element || element.dataset.mapControlBound === "true") {
    return;
  }

  element.dataset.mapControlBound = "true";

  if (window.L?.DomEvent) {
    window.L.DomEvent.disableClickPropagation(element);
    window.L.DomEvent.disableScrollPropagation(element);
  }

  ["pointerdown", "mousedown", "touchstart", "dblclick", "click", "wheel"].forEach((eventName) => {
    element.addEventListener(eventName, (event) => event.stopPropagation(), { passive: false });
  });
};

const getRiskLabel = (score, level) => `${String(level || "low").toUpperCase()} (${Number(score) || 0})`;

const getRankIcon = (index) => {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return `#${index + 1}`;
};

const renderSummary = (panel, telemetry) => {
  if (!panel) return;

  const sourceLabel =
    telemetry?.source === "api" ? "API" :
    telemetry?.source === "backup" ? "Respaldo local" :
    telemetry?.source === "static-backup" ? "Respaldo estatico" :
    telemetry?.source === "empty" ? "Sin datos" :
    "Desconocido";

  const observedAt = telemetry?.latestObservedAtUtc
    ? new Date(telemetry.latestObservedAtUtc).toLocaleString(DISPLAY_LOCALE, { dateStyle: "short", timeStyle: "short", timeZone: DISPLAY_TIME_ZONE })
    : "Sin datos";

  panel.summary.innerHTML = `
    <div class="network-telemetry-summary-grid">
      <div><span>Fuente</span><strong>${sourceLabel}</strong></div>
      <div><span>Estado</span><strong>${telemetry?.healthLabel || "Sin datos"}</strong></div>
      <div><span>Captura</span><strong>${observedAt}</strong></div>
      <div><span>Riesgo</span><strong>${getRiskLabel(telemetry?.latestRiskScore, telemetry?.latestRiskLevel)}</strong></div>
      <div><span>Equipos</span><strong>${Number(telemetry?.latestDeviceCount) || 0}</strong></div>
      <div><span>Usuarios</span><strong>${Number(telemetry?.latestConnectedUserCount) || 0}</strong></div>
      ${telemetry?.mlScoredDeviceCount ? `<div><span>ML</span><strong>${telemetry.mlScoredDeviceCount} equipos</strong></div>` : ""}
    </div>
    ${telemetry?.notes ? `<div class="network-telemetry-summary-notes">${telemetry.notes}</div>` : ""}
  `;

  const topObservations = Array.isArray(telemetry?.topRiskObservations) ? telemetry.topRiskObservations : [];
  if (topObservations.length === 0) {
    panel.list.innerHTML = `<div class="network-telemetry-empty">No hay observaciones destacadas para mostrar.</div>`;
    return;
  }

  panel.list.innerHTML = `
    <div class="network-telemetry-top-header">Top Riesgos</div>
    ${topObservations
      .slice(0, 10)
      .map((observation, index) => {
        const reasons = Array.isArray(observation?.riskReasons) ? observation.riskReasons.join(", ") : "";
        const riskClass = String(observation?.riskLevel || "low").toLowerCase();
        return `
          <div class="network-telemetry-item">
            <div class="network-telemetry-item-rank ${riskClass}">${getRankIcon(index)}</div>
            <div class="network-telemetry-item-content">
              <div class="network-telemetry-item-header">
                <strong>${observation?.deviceName || observation?.externalKey || "Elemento"}</strong>
                <span class="network-telemetry-risk ${riskClass}">${getRiskLabel(observation?.riskScore, observation?.riskLevel)}</span>
              </div>
              <div class="network-telemetry-item-meta">${observation?.observationType || "device"} · ${observation?.username || "sin usuario"} · ${observation?.ipAddress || "sin IP"}${observation?.scoringSource === "ml-hybrid" ? ` · <span style="color:#16a34a;font-weight:600">ML ${((observation?.mlProbability || 0) * 100).toFixed(0)}%</span>` : ""}</div>
              ${reasons ? `<div class="network-telemetry-item-reasons">${reasons}</div>` : ""}
            </div>
          </div>
        `;
      })
      .join("")}
  `;
};

const updateToggleButton = (panel, isOpen) => {
  if (!panel?.toggle) return;
  panel.toggle.setAttribute("aria-expanded", String(isOpen));
  panel.toggle.classList.toggle("is-active", isOpen);
};

const refreshPanel = async ({ forceRefresh = false } = {}) => {
  const panel = getPanel();
  if (!panel || telemetryFetchInFlight) return;

  telemetryFetchInFlight = true;
  panel.refreshButton.disabled = true;
  panel.refreshButton.textContent = "Cargando...";
  panel.summary.innerHTML = `<div class="network-telemetry-empty">Consultando estado de la telemetria...</div>`;
  panel.list.innerHTML = "";

  try {
    const telemetry = await loadNetworkTelemetryStatus(DEFAULT_CAMPUS, { forceRefresh });
    telemetryState = telemetry;
    renderSummary(panel, telemetry);
  } catch (error) {
    console.error("[network-telemetry] error al actualizar panel:", error);
    panel.summary.innerHTML = `<div class="network-telemetry-empty">No se pudo cargar la telemetria.</div>`;
    panel.list.innerHTML = `<div class="network-telemetry-empty">Revisa la consola para mas detalle.</div>`;
  } finally {
    telemetryFetchInFlight = false;
    panel.refreshButton.disabled = false;
    panel.refreshButton.textContent = "Actualizar";
  }
};

const getPanel = () => {
  const root = document.getElementById(PANEL_ID);
  const toggle = document.getElementById(TOGGLE_ID);

  if (!root || !toggle) {
    return null;
  }

  if (
    telemetryPanelElements &&
    telemetryPanelElements.root?.isConnected &&
    telemetryPanelElements.toggle?.isConnected &&
    telemetryPanelElements.summary?.isConnected &&
    telemetryPanelElements.list?.isConnected
  ) {
    return telemetryPanelElements;
  }

  if (!root.querySelector(".network-telemetry-panel-summary")) {
    root.innerHTML = `
      <div class="network-telemetry-panel-header">
        <div>
          <div class="network-telemetry-panel-title">Red y riesgo</div>
          <div class="network-telemetry-panel-subtitle">Top de equipos con mayor riesgo</div>
        </div>
        <button type="button" class="network-telemetry-panel-refresh" data-network-telemetry-refresh>Actualizar</button>
      </div>
      <div class="network-telemetry-panel-summary"></div>
      <div class="network-telemetry-panel-list"></div>
    `;
  }

  telemetryPanelElements = {
    root,
    toggle,
    summary: root.querySelector(".network-telemetry-panel-summary"),
    list: root.querySelector(".network-telemetry-panel-list"),
    refreshButton: root.querySelector("[data-network-telemetry-refresh]"),
  };

  registerControlSurface(root);

  return telemetryPanelElements;
};

const togglePanel = async () => {
  const panel = getPanel();
  if (!panel) return;

  const isOpen = panel.root.hidden;
  panel.root.hidden = !isOpen;
  updateToggleButton(panel, isOpen);

  if (isOpen) {
    await refreshPanel();
  } else {
    resetNetworkTelemetryCache();
  }
};

const initTelemetryPanel = () => {
  const topActions = document.getElementById("top-actions");
  if (!topActions) {
    return;
  }

  let toggle = document.getElementById(TOGGLE_ID);
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.id = TOGGLE_ID;
    toggle.type = "button";
    toggle.className = "dashboard-link network-telemetry-toggle is-muted";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML = `<span class="map-tool-button-icon" aria-hidden="true">⌁</span><span>Red y riesgo</span>`;
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void togglePanel();
    });

    const routePanel = document.getElementById("route-planner-panel");
    const routeToggle = document.getElementById("route-planner-toggle");
    if (routePanel) {
      routePanel.insertAdjacentElement("afterend", toggle);
    } else if (routeToggle) {
      routeToggle.insertAdjacentElement("afterend", toggle);
    } else {
      topActions.appendChild(toggle);
    }
  }

  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.className = "network-telemetry-panel";
    panel.hidden = true;
    toggle.insertAdjacentElement("afterend", panel);
  }

  const panelElements = getPanel();
  panelElements?.refreshButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void refreshPanel({ forceRefresh: true });
  });

  window.addEventListener(identifiers.events.sessionChanged, () => {
    resetNetworkTelemetryCache();
    if (!panel.hidden) {
      void refreshPanel({ forceRefresh: true });
    }
  });

  window.refreshNetworkTelemetryPanel = () => refreshPanel({ forceRefresh: true });
  window.toggleNetworkTelemetryPanel = togglePanel;
};

export const initNetworkTelemetryPanel = () => {
  initTelemetryPanel();
};
