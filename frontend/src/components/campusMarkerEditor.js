import { BACKEND_API_URL, map } from "../views/map.js";
import { identifiers } from "../utils/identifiers.js";
import { getActiveCampus } from "@app/goToCampus";
import { isPointOverBuilding, renderMapMarkerLayer, CAMPUS_MARKER_BUILDING_ID } from "@app/addData";
import { STATIC_ICON_KEYS, staticIconUrl, staticIconLabel } from "../config/staticIconCatalog.js";
import {
  getAdminMapToolSection,
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
} from "@app/adminMapToolsPanel";

const controlsId = "campus-marker-editor-controls";
const buttonId = "campus-marker-editor-toggle";
const generalFloor = -1;

let paletteOpen = false;
let paletteEl = null;
let paletteDragging = false;
let pendingIconKey = null;
let placementActive = false;
let mapClickHandler = null;
let mapDragCleanup = null;
let dropClickOutsideHandler = null;

const getEditorControls = () => document.getElementById(controlsId);

const setToolButtonContent = (button, icon, label = "") => {
  const labelMarkup = label ? `<span class="map-tool-button-label">${label}</span>` : "";
  button.innerHTML = `<span class="map-tool-button-icon" aria-hidden="true">${icon}</span>${labelMarkup}`;
  button.classList.toggle("is-icon-only", !label);
};

const cleanupPlacement = () => {
  if (mapClickHandler) {
    map.off("click", mapClickHandler);
    mapClickHandler = null;
  }
  removeDragHandlers();
  closePalette();
  placementActive = false;
  pendingIconKey = null;
};

const removeDragHandlers = () => {
  if (mapDragCleanup) {
    mapDragCleanup();
    mapDragCleanup = null;
  }
};

const attachDragHandlers = () => {
  removeDragHandlers();
  const container = map.getContainer();

  const handleDragOver = (e) => {
    if (!paletteDragging) return;
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes("text/plain")) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (e) => {
    if (!paletteDragging) return;
    const draggedKey = e.dataTransfer?.getData("text/plain");
    if (!STATIC_ICON_KEYS.includes(draggedKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = container.getBoundingClientRect();
    const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
    const latlng = map.containerPointToLatLng(point);
    void placeCampusMarker(latlng, draggedKey);
  };

  container.addEventListener("dragover", handleDragOver);
  container.addEventListener("drop", handleDrop);
  mapDragCleanup = () => {
    container.removeEventListener("dragover", handleDragOver);
    container.removeEventListener("drop", handleDrop);
    mapDragCleanup = null;
  };
};

const placeCampusMarker = async (latlng, iconKey) => {
  if (!iconKey) return;

  if (!getActiveCampus()) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
    setAdminMapToolsStatus("No hay campus activo para colocar iconos.");
    return;
  }

  const overBuilding = await isPointOverBuilding(latlng);
  if (overBuilding) {
    setAdminMapToolsStatus(
      `No se puede colocar '${staticIconLabel(iconKey)}' sobre un edificio: elige un espacio en blanco del mapa.`
    );
    return;
  }

  const externalId = `MKR-CAMPUS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const marker = {
    externalId,
    buildingExternalId: CAMPUS_MARKER_BUILDING_ID,
    campus: getActiveCampus() || "default",
    floor: generalFloor,
    latitude: latlng.lat,
    longitude: latlng.lng,
    iconKey,
    label: staticIconLabel(iconKey),
    notes: "",
    source: "campus",
  };

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/map-markers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        externalId: marker.externalId,
        buildingExternalId: marker.buildingExternalId,
        campus: marker.campus,
        floor: marker.floor,
        latitude: marker.latitude,
        longitude: marker.longitude,
        iconKey: marker.iconKey,
        label: marker.label,
        notes: marker.notes,
      }),
    });
    if (!response.ok) {
      let msg = "No se pudo guardar el marcador.";
      try {
        const body = await response.json();
        if (body?.message) msg += " " + body.message;
      } catch {}
      setAdminMapToolsStatus(msg);
      return;
    }
  } catch {
    setAdminMapToolsStatus("No se pudo contactar el backend para guardar el marcador.");
    return;
  }

  renderMapMarkerLayer(marker);
  setAdminMapToolsStatus(
    `Marcador '${staticIconLabel(iconKey)}' guardado en el campus (visible en todos los pisos).`
  );
};

const startCampusMarkerMode = (iconKey) => {
  if (!iconKey) return;

  if (!getActiveCampus()) {
    setAdminMapToolsStatus("Selecciona un campus antes de colocar iconos.");
    return;
  }

  cleanupPlacement();
  placementActive = true;
  pendingIconKey = iconKey;
  requestAdminMapToolMode("campus-marker");

  mapClickHandler = (e) => {
    if (!placementActive) return;
    if (e.originalEvent?.shiftKey || e.originalEvent?.ctrlKey || e.originalEvent?.metaKey || e.originalEvent?.altKey) return;
    L.DomEvent.stop(e);
    void placeCampusMarker(e.latlng, pendingIconKey);
  };
  map.on("click", mapClickHandler);
  attachDragHandlers();
  closePalette();

  setAdminMapToolsStatus(
    `Coloca '${staticIconLabel(iconKey)}': click sobre el mapa general o arrastra el icono. Click en el boton para salir.`
  );
};

const closePalette = () => {
  if (dropClickOutsideHandler) {
    document.removeEventListener("click", dropClickOutsideHandler);
    dropClickOutsideHandler = null;
  }
  paletteEl?.remove();
  paletteEl = null;
  paletteOpen = false;
};

const positionPalette = () => {
  const button = document.getElementById(buttonId);
  if (!paletteEl || !button) return;
  const rect = button.getBoundingClientRect();
  paletteEl.style.left = `${Math.max(8, rect.left)}px`;
  paletteEl.style.top = `${rect.bottom + 6}px`;
  paletteEl.style.transform = "";
};

const openPalette = () => {
  const button = document.getElementById(buttonId);
  if (!button) return;
  closePalette();

  const dropdown = document.createElement("div");
  dropdown.className = "room-editor-icon-dropdown campus-marker-icon-dropdown is-open";

  const hint = document.createElement("div");
  hint.className = "room-editor-icon-dropdown-hint";
  hint.textContent = "Elige un icono: click para colocarlo o arrastralo al mapa.";
  dropdown.appendChild(hint);

  const grid = document.createElement("div");
  grid.className = "room-editor-icon-grid";
  for (const key of STATIC_ICON_KEYS) {
    const item = document.createElement("div");
    item.className = `room-editor-icon-item${pendingIconKey === key ? " is-active" : ""}`;
    item.draggable = true;
    item.title = staticIconLabel(key);
    const img = document.createElement("img");
    img.src = staticIconUrl(key);
    img.alt = staticIconLabel(key);
    img.draggable = false;
    item.appendChild(img);
    const nameTag = document.createElement("span");
    nameTag.textContent = staticIconLabel(key);
    item.appendChild(nameTag);
    item.addEventListener("dragstart", (e) => {
      paletteDragging = true;
      e.dataTransfer?.setData("text/plain", key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    item.addEventListener("dragend", () => {
      paletteDragging = false;
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      startCampusMarkerMode(key);
    });
    grid.appendChild(item);
  }
  dropdown.appendChild(grid);

  paletteEl = dropdown;
  document.body.appendChild(paletteEl);
  positionPalette();
  paletteOpen = true;

  dropClickOutsideHandler = (e) => {
    if (!paletteEl) return;
    if (paletteEl.contains(e.target)) return;
    const button = document.getElementById(buttonId);
    if (button && button.contains(e.target)) return;
    closePalette();
  };
  document.addEventListener("click", dropClickOutsideHandler);
};

const toggleCampusMarkerMode = () => {
  if (placementActive) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
    setAdminMapToolsStatus("Colocacion de iconos detenida.");
    return;
  }
  if (paletteOpen) {
    closePalette();
    setAdminMapToolsStatus("");
    return;
  }
  openPalette();
};

const createEditorControls = () => {
  const sectionBody = getAdminMapToolSection("buildings");
  if (!sectionBody || getEditorControls()) return;

  const wrapper = document.createElement("div");
  wrapper.id = controlsId;
  wrapper.className = "admin-map-tools-group";

  const button = document.createElement("button");
  button.id = buttonId;
  button.className = "dashboard-link manual-building-editor-button building-tool-button";
  button.type = "button";
  setToolButtonContent(button, "&#9679;");
  button.title = "Colocar iconos en el mapa general";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleCampusMarkerMode();
  });

  wrapper.appendChild(button);
  sectionBody.appendChild(wrapper);
};

const removeEditorControls = () => {
  if (placementActive || paletteOpen) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
  }
  getEditorControls()?.remove();
};

export const syncCampusMarkerEditorForSession = (session) => {
  if (session?.isAdmin) {
    createEditorControls();
  } else if (getEditorControls()) {
    removeEditorControls();
  }
};

export const initCampusMarkerEditor = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    const session = response.ok ? await response.json() : {};
    syncCampusMarkerEditorForSession(session);
  } catch {
    syncCampusMarkerEditorForSession({});
  }
};

window.addEventListener(identifiers.events.sessionChanged, (event) => {
  syncCampusMarkerEditorForSession(event.detail || {});
});

window.addEventListener(identifiers.events.mapDataRefreshed, () => {
  window.setTimeout(() => {
    if (document.getElementById(controlsId)) return;
    void initCampusMarkerEditor();
  }, 80);
});

window.addEventListener(identifiers.events.adminMapToolMode, (event) => {
  if (event.detail?.mode !== "campus-marker" && (placementActive || paletteOpen)) {
    cleanupPlacement();
  }
});