import { identifiers } from "../utils/identifiers.js";

const panelId = "admin-map-tools-panel";
const buttonsId = "admin-map-tools-buttons";
const statusId = "admin-map-tools-status";
const toggleId = "admin-map-tools-toggle";
const activeModes = new Map([
  ["manual-building", "manual-building-editor-toggle"],
  ["geometry-shape", "building-shape-editor-button"],
  ["geometry-move", "building-move-editor-button"],
  ["walking-routes", "walking-route-editor-toggle"],
  ["walking-route-delete", "walking-route-delete-toggle"],
  ["walking-route-split", "walking-route-split-toggle"],
  ["walking-route-building", "walking-route-building-toggle"],
]);

export const ensureAdminMapToolsPanel = () => {
  let panel = document.getElementById(panelId);
  if (panel) {
    positionAdminMapToolsPanel();
    return panel;
  }

  panel = document.createElement("div");
  panel.id = panelId;
  panel.className = "admin-map-tools-panel";
  panel.innerHTML = `
    <button id="${toggleId}" type="button" class="admin-map-tools-title" aria-expanded="false">
      <span>Herramientas admin</span><span class="admin-map-tools-chevron" aria-hidden="true">▾</span>
    </button>
    <div id="${buttonsId}" class="admin-map-tools-buttons" hidden></div>
    <div id="${statusId}" class="admin-map-tools-status" hidden></div>
  `;

  panel.querySelector(`#${toggleId}`)?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const toggle = event.currentTarget;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    const buttons = panel.querySelector(`#${buttonsId}`);
    if (buttons) buttons.hidden = expanded;
    panel.classList.toggle("is-expanded", !expanded);
  });

  document.body.appendChild(panel);
  scheduleAdminMapToolsPanelPosition();
  window.addEventListener("resize", positionAdminMapToolsPanel);
  window.addEventListener(identifiers.events.sessionChanged, () => {
    scheduleAdminMapToolsPanelPosition();
  });
  return panel;
};

const scheduleAdminMapToolsPanelPosition = () => {
  window.requestAnimationFrame(positionAdminMapToolsPanel);
  window.setTimeout(positionAdminMapToolsPanel, 80);
  window.setTimeout(positionAdminMapToolsPanel, 250);
};

const positionAdminMapToolsPanel = () => {
  const panel = document.getElementById(panelId);
  if (!panel) return;

  const inventoryLink = document.getElementById("session-inventory-link");
  const sessionBadge = document.getElementById("session-mode-badge");
  const anchor = inventoryLink || sessionBadge || document.getElementById("map-status-panel");

  if (!anchor) return;

  const rect = anchor.getBoundingClientRect();
  const top = Math.round(rect.bottom + 6);
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `calc(100vh - ${top + 12}px)`;
};

export const removeAdminMapToolsPanelIfEmpty = () => {
  const buttons = document.getElementById(buttonsId);
  if (buttons && buttons.children.length === 0) {
    document.getElementById(panelId)?.remove();
  }
};

export const getAdminMapToolsButtons = () => {
  ensureAdminMapToolsPanel();
  return document.getElementById(buttonsId);
};

export const setAdminMapToolsStatus = (message) => {
  const status = document.getElementById(statusId);
  if (!status) return;
  status.textContent = message || "";
  status.hidden = !String(message || "").trim();
};

export const setAdminMapToolActiveMode = (mode) => {
  window[identifiers.globals.adminMapToolMode] = mode || null;
  document.documentElement.dataset.adminMapToolMode = mode || "";

  document
    .querySelectorAll(".admin-map-tools-panel .dashboard-link")
    .forEach((button) => button.classList.remove("is-active", "is-working"));

  const buttonId = activeModes.get(mode);
  if (!buttonId) return;

  const button = document.getElementById(buttonId);
  button?.classList.add("is-active", "is-working");
};

export const requestAdminMapToolMode = (mode) => {
  setAdminMapToolActiveMode(mode);
  window.dispatchEvent(new CustomEvent(identifiers.events.adminMapToolMode, { detail: { mode } }));
};
