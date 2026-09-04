import { identifiers } from "../utils/identifiers.js";

const panelId = "admin-map-tools-panel";
const buttonsId = "admin-map-tools-buttons";
const statusId = "admin-map-tools-status";
const toggleId = "admin-map-tools-toggle";
const footerId = "admin-map-tools-footer";
const sectionDefinitions = {
  dimensions: ["Dimensiones", "&#9638;"],
  buildings: ["Edificios", "&#9634;"],
  routes: ["Rutas", "&#8734;"],
};
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
    if (expanded) {
      requestAdminMapToolMode(null);
      setAdminMapToolsStatus("");
      window.dispatchEvent(new CustomEvent("adminMapToolsHidden"));
    }
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
  if (!buttons) return;

  buttons.querySelectorAll(".admin-map-tool-section").forEach((section) => {
    const body = section.querySelector(".admin-map-tool-section-body");
    if (!body || body.children.length === 0) {
      section.remove();
    }
  });

  if (buttons.children.length === 0) {
    document.getElementById(panelId)?.remove();
  }
};

export const removeAdminMapToolSection = (key) => {
  const buttons = document.getElementById(buttonsId);
  if (!buttons) return;
  const section = buttons.querySelector(`[data-admin-tool-section="${key}"]`);
  if (section) section.remove();
  removeAdminMapToolsPanelIfEmpty();
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

export const getAdminMapToolSection = (key) => {
  const buttons = getAdminMapToolsButtons();
  const definition = sectionDefinitions[key];
  if (!buttons || !definition) return null;

  let section = buttons.querySelector(`[data-admin-tool-section="${key}"]`);
  if (!section) {
    section = document.createElement("section");
    section.className = "admin-map-tool-section";
    section.dataset.adminToolSection = key;
    section.innerHTML = `
      <button type="button" class="admin-map-tool-section-toggle" aria-expanded="false">
        <span class="admin-map-tool-section-icon" aria-hidden="true">${definition[1]}</span>
        <span>${definition[0]}</span>
      </button>
      <div class="admin-map-tool-section-body" hidden></div>
    `;
    section.querySelector(".admin-map-tool-section-toggle")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const toggle = event.currentTarget;
      const willOpen = toggle.getAttribute("aria-expanded") !== "true";
      requestAdminMapToolMode(null);
      setAdminMapToolsStatus("");
      buttons.querySelectorAll(".admin-map-tool-section").forEach((item) => {
        const itemToggle = item.querySelector(".admin-map-tool-section-toggle");
        const itemBody = item.querySelector(".admin-map-tool-section-body");
        const isCurrent = item === section;
        itemToggle?.setAttribute("aria-expanded", isCurrent && willOpen ? "true" : "false");
        if (itemBody) itemBody.hidden = !(isCurrent && willOpen);
        item.classList.toggle("is-expanded", isCurrent && willOpen);
      });
      window.dispatchEvent(new CustomEvent("adminMapToolSectionChanged", { detail: { key, open: willOpen } }));
    });
    buttons.appendChild(section);
  }

  const footer = buttons.querySelector(`#${footerId}`);
  if (footer) buttons.appendChild(footer);

  return section.querySelector(".admin-map-tool-section-body");
};

export const getAdminMapToolsFooter = () => {
  const buttons = getAdminMapToolsButtons();
  if (!buttons) return null;

  let footer = document.getElementById(footerId);
  if (!footer) {
    footer = document.createElement("div");
    footer.id = footerId;
    footer.className = "admin-map-tools-footer";
    buttons.appendChild(footer);
  }
  buttons.appendChild(footer);
  return footer;
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
