import { BACKEND_API_URL, map } from "../views/map.js";
import { identifiers } from "../utils/identifiers.js";
import { getActiveCampus } from "@app/goToCampus";
import {
  isPointOverBuilding,
  renderMapMarkerLayer,
  buildStaticMarkerIcon,
  staticMarkerSizeForZoom,
  setCampusMarkersManagedByEditor,
  CAMPUS_MARKER_BUILDING_ID,
} from "@app/addData";
import { STATIC_ICON_KEYS, staticIconUrl, staticIconLabel } from "../config/staticIconCatalog.js";
import {
  getAdminMapToolSection,
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
} from "@app/adminMapToolsPanel";

const controlsId = "campus-marker-editor-controls";
const buttonId = "campus-marker-editor-toggle";
const editBarId = "campus-marker-edit-bar";
const generalFloor = -1;

let paletteOpen = false;
let paletteEl = null;
let paletteDragging = false;
let pendingIconKey = null;
let placementActive = false;
let mapClickHandler = null;
let mapDragCleanup = null;
let dropClickOutsideHandler = null;
let suppressClickUntil = 0;

let editorActive = false;
let editorMarkerGroup = null;
let editBarEl = null;
let selectedExternalId = null;
let editorMarkers = new Map();
let editorUndoStack = [];
let editorRedoStack = [];
let editorKeyboardHandler = null;
let editorZoomHandler = null;
let editorDeselectHandler = null;
let lastFetchedCampusMarkers = [];

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
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes("text/plain")) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (e) => {
    const draggedKey = e.dataTransfer?.getData("text/plain");
    if (!STATIC_ICON_KEYS.includes(draggedKey)) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickUntil = Date.now() + 300;
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

// ─── Backend helpers ────────────────────────────────────────────────────────

const postMarkerBackend = async (marker) => {
  try {
    const resp = await fetch(`${BACKEND_API_URL}/api/map-markers`, {
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
    if (!resp.ok) {
      let msg = "No se pudo guardar el marcador.";
      try {
        const body = await resp.json();
        if (body?.message) msg += " " + body.message;
      } catch {}
      setAdminMapToolsStatus(msg);
      return false;
    }
    return true;
  } catch {
    setAdminMapToolsStatus("No se pudo contactar el backend para guardar el marcador.");
    return false;
  }
};

const putMarkerBackend = async (externalId, changes) => {
  try {
    const resp = await fetch(`${BACKEND_API_URL}/api/map-markers/${externalId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(changes),
    });
    if (!resp.ok) {
      setAdminMapToolsStatus("No se pudo actualizar el marcador.");
      return false;
    }
    return true;
  } catch {
    setAdminMapToolsStatus("No se pudo contactar el backend.");
    return false;
  }
};

const deleteMarkerBackend = async (externalId) => {
  try {
    const resp = await fetch(`${BACKEND_API_URL}/api/map-markers/${externalId}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!resp.ok) {
      setAdminMapToolsStatus("No se pudo eliminar el marcador.");
      return false;
    }
    return true;
  } catch {
    setAdminMapToolsStatus("No se pudo contactar el backend.");
    return false;
  }
};

// ─── Editor marker layer (interactive) ──────────────────────────────────────

const attachEditorMarkerDrag = (layer, markerData) => {
  layer.on("dragstart", () => {
    layer._editorDragBefore = layer.getLatLng();
  });
  layer.on("dragend", async () => {
    const before = layer._editorDragBefore;
    const after = layer.getLatLng();
    if (!before || (before.lat === after.lat && before.lng === after.lng)) return;
    const overBuilding = await isPointOverBuilding(after);
    if (overBuilding) {
      layer.setLatLng(before);
      setAdminMapToolsStatus("No se puede mover sobre un edificio.");
      return;
    }
    const ok = await putMarkerBackend(markerData.externalId, { latitude: after.lat, longitude: after.lng });
    if (!ok) {
      layer.setLatLng(before);
      return;
    }
    markerData.latitude = after.lat;
    markerData.longitude = after.lng;
    editorUndoStack.push({
      type: "move",
      externalId: markerData.externalId,
      before: { latitude: before.lat, longitude: before.lng },
      after: { latitude: after.lat, longitude: after.lng },
    });
    editorRedoStack = [];
    updateEditBar();
    setAdminMapToolsStatus("Marcador movido.");
  });
};

const editorIconClass = "map-static-marker-icon campus-editor-marker-icon";

const buildEditorLayer = (marker) => {
  const size = staticMarkerSizeForZoom(map.getZoom());
  const layer = L.marker([marker.latitude, marker.longitude], {
    icon: buildStaticMarkerIcon(marker.iconKey, size, editorIconClass),
    draggable: true,
    keyboard: false,
    title: staticIconLabel(marker.iconKey),
    zIndexOffset: 500,
  });
  layer.markerData = marker;
  if (marker.label && String(marker.label).trim()) {
    layer.bindTooltip(String(marker.label).trim(), { direction: "top", offset: [0, -16] });
  }
  layer.on("click", (e) => {
    L.DomEvent.stop(e);
    selectEditorMarker(marker.externalId);
  });
  attachEditorMarkerDrag(layer, marker);
  layer.addTo(editorMarkerGroup);
  editorMarkers.set(marker.externalId, { layer, marker });
  const el = layer.getElement();
  if (el) {
    el.querySelectorAll("img").forEach((img) => { img.draggable = false; });
  }
};

const addEditorInteractiveMarker = (marker) => {
  if (!editorMarkerGroup) return;
  lastFetchedCampusMarkers.push(marker);
  buildEditorLayer(marker);
  selectEditorMarker(marker.externalId);
  updateEditBar();
};

// ─── Editor activation / deactivation ───────────────────────────────────────

const fetchAndRenderEditorMarkers = async () => {
  lastFetchedCampusMarkers = [];
  let allGlobal = [];
  try {
    const resp = await fetch(`${BACKEND_API_URL}/api/map-markers?floor=-1`, { cache: "no-store" });
    allGlobal = resp.ok ? await resp.json() : [];
  } catch {
    return;
  }
  lastFetchedCampusMarkers = allGlobal.filter(
    (m) => String(m.buildingExternalId) === CAMPUS_MARKER_BUILDING_ID
  );
  renderAllEditorMarkers();
};

const renderAllEditorMarkers = () => {
  if (!editorMarkerGroup) return;
  editorMarkerGroup.clearLayers();
  editorMarkers.clear();
  selectedExternalId = null;
  for (const marker of lastFetchedCampusMarkers) {
    buildEditorLayer(marker);
  }
  updateEditBar();
};

const activateEditor = async () => {
  if (editorActive) return;
  editorActive = true;
  editorMarkerGroup = L.layerGroup().addTo(map);
  setCampusMarkersManagedByEditor(true);
  await fetchAndRenderEditorMarkers();
  installEditBar();
  installEditorKeyboard();

  editorDeselectHandler = () => {
    if (!editorActive || placementActive) return;
    deselectAllEditorMarkers();
  };
  map.on("click", editorDeselectHandler);

  editorZoomHandler = onEditorZoom;
  map.on("zoomend", editorZoomHandler);
};

const deactivateEditor = () => {
  if (!editorActive) return;
  editorActive = false;
  if (editorZoomHandler) {
    map.off("zoomend", editorZoomHandler);
    editorZoomHandler = null;
  }
  if (editorDeselectHandler) {
    map.off("click", editorDeselectHandler);
    editorDeselectHandler = null;
  }
  removeEditorKeyboard();
  deselectAllEditorMarkers();
  editorMarkerGroup?.remove();
  editorMarkerGroup = null;
  editorMarkers.clear();
  selectedExternalId = null;
  editorUndoStack = [];
  editorRedoStack = [];
  editBarEl?.remove();
  editBarEl = null;
  setCampusMarkersManagedByEditor(false);
  reRenderBaseCampusMarkers();
};

const reRenderBaseCampusMarkers = () => {
  for (const marker of lastFetchedCampusMarkers) {
    renderMapMarkerLayer(marker);
  }
};

// ─── Editor interaction ─────────────────────────────────────────────────────

const selectEditorMarker = (externalId) => {
  deselectAllEditorMarkers();
  selectedExternalId = externalId;
  const info = editorMarkers.get(externalId);
  if (info) {
    info.layer.getElement()?.classList.add("is-selected");
  }
  updateEditBar();
  const label = info?.marker ? staticIconLabel(info.marker.iconKey) : "";
  setAdminMapToolsStatus(`Marcador seleccionado (${label}). Supr para borrar, arrastralo para mover.`);
};

const deselectAllEditorMarkers = () => {
  selectedExternalId = null;
  editorMarkers.forEach(({ layer }) => {
    layer.getElement()?.classList.remove("is-selected");
  });
  updateEditBar();
};

const deleteSelectedEditorMarker = async () => {
  if (!selectedExternalId) return;
  const info = editorMarkers.get(selectedExternalId);
  if (!info) return;
  const markerSnapshot = { ...info.marker };
  deselectAllEditorMarkers();
  const ok = await deleteMarkerBackend(markerSnapshot.externalId);
  if (!ok) return;
  info.layer.remove();
  editorMarkers.delete(markerSnapshot.externalId);
  lastFetchedCampusMarkers = lastFetchedCampusMarkers.filter((m) => m.externalId !== markerSnapshot.externalId);
  editorUndoStack.push({ type: "delete", marker: markerSnapshot });
  editorRedoStack = [];
  updateEditBar();
  setAdminMapToolsStatus(`Marcador '${staticIconLabel(markerSnapshot.iconKey)}' eliminado.`);
};

// ─── Undo / Redo ────────────────────────────────────────────────────────────

const editorUndo = async () => {
  if (editorUndoStack.length === 0) return;
  const action = editorUndoStack.pop();
  editorRedoStack.push(action);

  switch (action.type) {
    case "create": {
      const ok = await deleteMarkerBackend(action.marker.externalId);
      if (!ok) { editorRedoStack.pop(); editorUndoStack.push(action); updateEditBar(); return; }
      const info = editorMarkers.get(action.marker.externalId);
      info?.layer.remove();
      editorMarkers.delete(action.marker.externalId);
      lastFetchedCampusMarkers = lastFetchedCampusMarkers.filter((m) => m.externalId !== action.marker.externalId);
      deselectAllEditorMarkers();
      setAdminMapToolsStatus("Deshacer: marcador eliminado.");
      break;
    }
    case "move": {
      const info = editorMarkers.get(action.externalId);
      if (info) {
        info.layer.setLatLng([action.before.latitude, action.before.longitude]);
        info.marker.latitude = action.before.latitude;
        info.marker.longitude = action.before.longitude;
      }
      await putMarkerBackend(action.externalId, { latitude: action.before.latitude, longitude: action.before.longitude });
      setAdminMapToolsStatus("Deshacer: movimiento revertido.");
      break;
    }
    case "delete": {
      const ok = await postMarkerBackend(action.marker);
      if (!ok) { editorRedoStack.pop(); editorUndoStack.push(action); updateEditBar(); return; }
      addEditorInteractiveMarker(action.marker);
      setAdminMapToolsStatus(`Deshacer: marcador '${staticIconLabel(action.marker.iconKey)}' restaurado.`);
      break;
    }
  }
  updateEditBar();
};

const editorRedo = async () => {
  if (editorRedoStack.length === 0) return;
  const action = editorRedoStack.pop();
  editorUndoStack.push(action);

  switch (action.type) {
    case "create": {
      const ok = await postMarkerBackend(action.marker);
      if (!ok) { editorUndoStack.pop(); editorRedoStack.push(action); updateEditBar(); return; }
      addEditorInteractiveMarker(action.marker);
      setAdminMapToolsStatus(`Rehacer: marcador '${staticIconLabel(action.marker.iconKey)}' restaurado.`);
      break;
    }
    case "move": {
      const info = editorMarkers.get(action.externalId);
      if (info) {
        info.layer.setLatLng([action.after.latitude, action.after.longitude]);
        info.marker.latitude = action.after.latitude;
        info.marker.longitude = action.after.longitude;
      }
      await putMarkerBackend(action.externalId, { latitude: action.after.latitude, longitude: action.after.longitude });
      setAdminMapToolsStatus("Rehacer: movimiento aplicado.");
      break;
    }
    case "delete": {
      const ok = await deleteMarkerBackend(action.marker.externalId);
      if (!ok) { editorUndoStack.pop(); editorRedoStack.push(action); updateEditBar(); return; }
      const info = editorMarkers.get(action.marker.externalId);
      info?.layer.remove();
      editorMarkers.delete(action.marker.externalId);
      lastFetchedCampusMarkers = lastFetchedCampusMarkers.filter((m) => m.externalId !== action.marker.externalId);
      deselectAllEditorMarkers();
      setAdminMapToolsStatus("Rehacer: marcador eliminado.");
      break;
    }
  }
  updateEditBar();
};

// ─── Edit bar (undo / redo / delete buttons) ────────────────────────────────

const installEditBar = () => {
  if (editBarEl) return;
  const bar = document.createElement("div");
  bar.id = editBarId;
  bar.className = "campus-marker-edit-bar is-hidden";
  bar.innerHTML = `
    <span class="campus-marker-edit-bar-label"></span>
    <button class="campus-marker-edit-undo" type="button" title="Deshacer (Ctrl+Z)">Deshacer</button>
    <button class="campus-marker-edit-redo" type="button" title="Rehacer (Ctrl+Shift+Z)">Rehacer</button>
    <button class="campus-marker-edit-delete is-danger" type="button" title="Eliminar (Supr)">Eliminar</button>
  `;
  bar.querySelector(".campus-marker-edit-undo").addEventListener("click", (e) => { e.stopPropagation(); void editorUndo(); });
  bar.querySelector(".campus-marker-edit-redo").addEventListener("click", (e) => { e.stopPropagation(); void editorRedo(); });
  bar.querySelector(".campus-marker-edit-delete").addEventListener("click", (e) => { e.stopPropagation(); void deleteSelectedEditorMarker(); });
  editBarEl = bar;
  document.body.appendChild(bar);
  updateEditBar();
};

const updateEditBar = () => {
  if (!editBarEl) return;
  const hasSelected = !!selectedExternalId;
  const info = hasSelected ? editorMarkers.get(selectedExternalId) : null;
  const label = info ? staticIconLabel(info.marker?.iconKey || "") : "";
  editBarEl.querySelector(".campus-marker-edit-bar-label").textContent =
    label || (editorActive ? "Selecciona un icono" : "");
  editBarEl.querySelector(".campus-marker-edit-undo").disabled = editorUndoStack.length === 0;
  editBarEl.querySelector(".campus-marker-edit-redo").disabled = editorRedoStack.length === 0;
  editBarEl.querySelector(".campus-marker-edit-delete").disabled = !hasSelected;
  editBarEl.classList.toggle("is-hidden", !editorActive);
};

// ─── Keyboard shortcuts ─────────────────────────────────────────────────────

const installEditorKeyboard = () => {
  removeEditorKeyboard();
  editorKeyboardHandler = (e) => {
    if (!editorActive) return;
    if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.tagName === "SELECT") return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      void deleteSelectedEditorMarker();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      void editorUndo();
    } else if ((e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === "y" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      void editorRedo();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (placementActive) {
        cleanupPlacement();
        setAdminMapToolsStatus("Colocacion cancelada.");
      } else {
        deselectAllEditorMarkers();
        setAdminMapToolsStatus("");
      }
    }
  };
  document.addEventListener("keydown", editorKeyboardHandler);
};

const removeEditorKeyboard = () => {
  if (editorKeyboardHandler) {
    document.removeEventListener("keydown", editorKeyboardHandler);
    editorKeyboardHandler = null;
  }
};

// ─── Zoom rescale ───────────────────────────────────────────────────────────

const onEditorZoom = () => {
  if (!editorActive || !editorMarkerGroup) return;
  const size = staticMarkerSizeForZoom(map.getZoom());
  editorMarkers.forEach(({ layer, marker }) => {
    layer.setIcon(buildStaticMarkerIcon(marker.iconKey, size, editorIconClass));
  });
};

// ─── Placement (click / drag to map) ────────────────────────────────────────

const placeCampusMarker = async (latlng, iconKey) => {
  if (!iconKey) return;

  if (!getActiveCampus()) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
    deactivateEditor();
    closePalette();
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

  const ok = await postMarkerBackend(marker);
  if (!ok) return;

  if (editorActive) {
    addEditorInteractiveMarker(marker);
    editorUndoStack.push({ type: "create", marker: { ...marker } });
    editorRedoStack = [];
    updateEditBar();
    setAdminMapToolsStatus(
      `Marcador '${staticIconLabel(iconKey)}' guardado. Seleccionado para mover o editar.`
    );
  } else {
    renderMapMarkerLayer(marker);
    setAdminMapToolsStatus(
      `Marcador '${staticIconLabel(iconKey)}' guardado en el campus (visible en todos los pisos).`
    );
  }
};

const startCampusMarkerMode = (iconKey) => {
  if (!iconKey) return;

  if (!getActiveCampus()) {
    setAdminMapToolsStatus("Selecciona un campus antes de colocar iconos.");
    return;
  }

  if (placementActive && pendingIconKey === iconKey) {
    return;
  }

  cleanupPlacement();
  placementActive = true;
  pendingIconKey = iconKey;
  requestAdminMapToolMode("campus-marker");

  mapClickHandler = (e) => {
    if (!placementActive) return;
    if (paletteDragging) return;
    if (Date.now() < suppressClickUntil) return;
    if (e.originalEvent?.shiftKey || e.originalEvent?.ctrlKey || e.originalEvent?.metaKey || e.originalEvent?.altKey) return;
    L.DomEvent.stop(e);
    void placeCampusMarker(e.latlng, pendingIconKey);
  };
  map.on("click", mapClickHandler);
  attachDragHandlers();

  setAdminMapToolsStatus(
    `Coloca '${staticIconLabel(iconKey)}': click sobre el mapa general o arrastra el icono. Click en el boton para salir.`
  );
};

// ─── Palette ────────────────────────────────────────────────────────────────

const closePalette = () => {
  if (dropClickOutsideHandler) {
    document.removeEventListener("click", dropClickOutsideHandler);
    dropClickOutsideHandler = null;
  }
  removeDragHandlers();
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
  attachDragHandlers();

  dropClickOutsideHandler = (e) => {
    if (!paletteEl) return;
    if (placementActive) return;
    if (paletteEl.contains(e.target)) return;
    const button = document.getElementById(buttonId);
    if (button && button.contains(e.target)) return;
    closePalette();
  };
  document.addEventListener("click", dropClickOutsideHandler);
};

// ─── Toggle ─────────────────────────────────────────────────────────────────

const toggleCampusMarkerMode = () => {
  if (placementActive) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
    deactivateEditor();
    closePalette();
    setAdminMapToolsStatus("Colocacion de iconos detenida.");
    return;
  }
  if (paletteOpen) {
    requestAdminMapToolMode(null);
    deactivateEditor();
    closePalette();
    setAdminMapToolsStatus("");
    return;
  }
  if (editorActive) {
    requestAdminMapToolMode(null);
    deactivateEditor();
    setAdminMapToolsStatus("");
    return;
  }
  requestAdminMapToolMode("campus-marker");
  openPalette();
  activateEditor();
};

// ─── Admin controls ─────────────────────────────────────────────────────────

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
  if (editorActive) {
    deactivateEditor();
  }
  if (placementActive || paletteOpen) {
    requestAdminMapToolMode(null);
    cleanupPlacement();
    closePalette();
  }
  getEditorControls()?.remove();
};

// ─── Export / init ──────────────────────────────────────────────────────────

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

// ─── Event listeners ────────────────────────────────────────────────────────

window.addEventListener(identifiers.events.sessionChanged, (event) => {
  syncCampusMarkerEditorForSession(event.detail || {});
});

window.addEventListener(identifiers.events.mapDataRefreshed, () => {
  if (editorActive) {
    void fetchAndRenderEditorMarkers();
  }
  window.setTimeout(() => {
    if (document.getElementById(controlsId)) return;
    void initCampusMarkerEditor();
  }, 80);
});

window.addEventListener(identifiers.events.adminMapToolMode, (event) => {
  if (event.detail?.mode === "campus-marker") return;
  if (placementActive || paletteOpen) {
    cleanupPlacement();
    closePalette();
  }
  if (editorActive) {
    deactivateEditor();
  }
});
