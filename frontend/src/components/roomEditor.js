import { BACKEND_API_URL } from "../views/map.js";
import { refreshCurrentMapData } from "@app/goToCampus";
import {
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
  getAdminMapToolSection,
} from "./adminMapToolsPanel.js";

const VERTEX_CLASS = "room-editor-vertex-marker";
const ROOM_LAYER_CLASS = "room-editor-room-layer";
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const addDrawVertexMarker = (latlng) => {
  if (!currentEditorState || !popupMap) return;
  const marker = L.circleMarker(latlng, {
    radius: 5,
    color: "#f59e0b",
    fillColor: "#f59e0b",
    fillOpacity: 0.8,
    weight: 2,
    interactive: false,
    className: VERTEX_CLASS,
  }).addTo(popupMap);
  currentEditorState.drawVertexMarkers.push(marker);
};

const ICONS = {
  select: "&#9757;",
  square: "&#9633;",
  rect: "&#9645;",
  circle: "&#9675;",
  free: "&#10070;",
  delete: "&#10005;",
  undo: "&#8630;",
  suggest: "&#10024;",
  save: "&#10003;",
  copy: "&#10697;",
  paste: "&#9654;",
};

let currentEditorState = null;
let undoStack = [];
let redoStack = [];
let popupContainer = null;
let popupMap = null;
let topBarEl = null;
let bottomBarEl = null;
let sidePanelEl = null;
let mapContainerEl = null;
let keydownHandler = null;
let copiedRoomData = null;

const getApiUrl = () => {
  return BACKEND_API_URL || "http://localhost:5002";
};

export const initRoomEditor = () => {
  window.selectRoomEditorFloor = selectRoomEditorFloor;
  window.selectRoomMode = selectRoomMode;
  window.deleteSelectedRoom = deleteSelectedRoom;
  window.undoRoomEditor = undoRoomEditor;
  window.redoRoomEditor = redoRoomEditor;
  window.updateRoomProperty = updateRoomProperty;
  window.runQuickSuggestion = runQuickSuggestion;
  window.approveAllSuggestions = approveAllSuggestions;
  window.saveQuickSuggestions = saveQuickSuggestions;
  window.updateRoomTransform = updateRoomTransform;
  window.copySelectedRoom = copySelectedRoom;
  window.pasteRoom = pasteRoom;

  createToggleButton();
  listenForBuildingClick();
};

const createToggleButton = () => {
  const sectionBody = getAdminMapToolSection("rooms");
  if (!sectionBody) return;

  const wrapper = document.createElement("div");
  wrapper.className = "admin-map-tools-group";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "room-editor-toggle";
  button.className = "dashboard-link manual-building-editor-button building-tool-button";
  button.innerHTML = '<span class="map-tool-button-icon" aria-hidden="true">&#9635;</span><span>Editar forma</span>';
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleRoomEditor();
  });

  wrapper.appendChild(button);
  sectionBody.appendChild(wrapper);
};

const toggleRoomEditor = () => {
  if (currentEditorState) {
    cancelRoomEditor();
    return;
  }
  clearRoomEditorState();
  setAdminMapToolsStatus("Haz click sobre el edificio que quieres editar.");
  requestAdminMapToolMode("room-edit");
};

const listenForBuildingClick = () => {
  window.addEventListener("syntro-building-layer-click", (event) => {
    const mode = window.syntroAdminMapToolMode;
    if (mode === "room-edit" && !currentEditorState) {
      event.preventDefault();
      event.stopPropagation();
      const featureId = event.detail?.featureId;
      const feature = event.detail?.feature;
      if (featureId) {
        openRoomEditor(featureId, feature);
      }
    }
  });
};

const openRoomEditor = async (buildingExternalId, feature) => {
  if (!buildingExternalId) return;

  setAdminMapToolsStatus("Abriendo editor de salas...");

  try {
    const buildingData = await fetchBuildingGeometry(buildingExternalId);
    const floorsData = await fetchBuildingFloors(buildingExternalId);

    const floors = floorsData.length > 0 ? floorsData : [{ floor: 0, totalCount: 0 }];
    const selectedFloor = floors[0].floor;

    const buildingName =
      feature?.properties?.mapLabel ||
      feature?.properties?.title ||
      feature?.properties?.name ||
      feature?.properties?.displayName ||
      feature?.properties?.sourceId ||
      buildingExternalId;

    currentEditorState = {
      buildingExternalId,
      buildingName,
      buildingGeometry: buildingData,
      floors,
      selectedFloor,
      rooms: [],
      selectedRoom: null,
      mode: "select",
      isDirty: false,
      buildingPolygonLayer: null,
      roomLayers: [],
      previewLayer: null,
      drawPoints: [],
      drawVertexMarkers: [],
      suggestions: [],
      suggestionPreviewLayers: [],
      dragging: null,
      rotating: null,
    };

    undoStack = [];
    redoStack = [];

    createPopup();
    initPopupMap(buildingData);
    await loadRoomsForFloor(buildingExternalId, selectedFloor);
    renderBuildingBoundary(buildingData);
    renderRooms();
    updatePopupContent();
    installKeyboardShortcuts();

    setAdminMapToolsStatus("Editor de salas abierto. Ctrl+click para mover, Shift+click para rotar, Ctrl+Z para deshacer.");
    requestAdminMapToolMode("room-edit");
  } catch (error) {
    console.error("Error opening room editor:", error);
    setAdminMapToolsStatus("Error al abrir editor de salas.");
  }
};

const installKeyboardShortcuts = () => {
  removeKeyboardShortcuts();
  keydownHandler = (e) => {
    if (!currentEditorState || !popupContainer) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (currentEditorState.mode !== "select") {
        clearDrawState();
        currentEditorState.mode = "select";
        currentEditorState.selectedRoom = null;
        if (popupMap) {
          popupMap.dragging.enable();
          popupMap.keyboard.enable();
        }
        updatePopupContent();
        updateSidePanel();
        setAdminMapToolsStatus("Dibujo cancelado.");
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      const mode = currentEditorState.mode;
      if (mode === "draw-free") {
        finishCurrentPolygonDraw();
      }
    } else if (e.key === "c" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      copySelectedRoom();
    } else if (e.key === "v" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      pasteRoom();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      e.preventDefault();
      undoRoomEditor();
    } else if ((e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) || (e.key === "y" && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      redoRoomEditor();
    }
  };
  document.addEventListener("keydown", keydownHandler);
};

const removeKeyboardShortcuts = () => {
  if (keydownHandler) {
    document.removeEventListener("keydown", keydownHandler);
    keydownHandler = null;
  }
};

const finishCurrentPolygonDraw = () => {
  if (!currentEditorState) return;
  const pts = currentEditorState.drawPoints;
  if (pts.length >= 3) {
    const closedRing = [...pts, pts[0]];
    const geoJsonCoords = closedRing.map((ll) => [ll[1], ll[0]]);
    clearDrawState();
    createNewRoom(geoJsonCoords);
  } else if (pts.length > 0) {
    clearDrawState();
    currentEditorState.mode = "select";
    updatePopupContent();
    setAdminMapToolsStatus("Se necesitan al menos 3 puntos.");
  }
};

const fetchBuildingGeometry = async (buildingExternalId) => {
  const response = await fetch(
    `${getApiUrl()}/api/synced-buildings/${encodeURIComponent(buildingExternalId)}/geometry`,
    { credentials: "include", cache: "no-store" }
  );
  if (!response.ok) throw new Error("No se pudo cargar la geometria del edificio");
  return response.json();
};

const fetchBuildingFloors = async (buildingExternalId) => {
  const response = await fetch(
    `${getApiUrl()}/api/room-layouts/${encodeURIComponent(buildingExternalId)}/floors`,
    { credentials: "include", cache: "no-store" }
  );
  if (!response.ok) return [];
  return response.json();
};

const fetchRoomsForFloor = async (buildingExternalId, floor) => {
  const response = await fetch(
    `${getApiUrl()}/api/room-layouts?buildingExternalId=${encodeURIComponent(buildingExternalId)}&floor=${floor}`,
    { credentials: "include", cache: "no-store" }
  );
  if (!response.ok) return [];
  return response.json();
};

const loadRoomsForFloor = async (buildingExternalId, floor) => {
  currentEditorState.rooms = await fetchRoomsForFloor(buildingExternalId, floor);
};

const createPopup = () => {
  destroyPopup();

  popupContainer = document.createElement("div");
  popupContainer.id = "room-editor-popup";
  popupContainer.className = "room-editor-popup";

  topBarEl = document.createElement("div");
  topBarEl.className = "room-editor-top-bar";
  popupContainer.appendChild(topBarEl);

  mapContainerEl = document.createElement("div");
  mapContainerEl.className = "room-editor-popup-map";
  popupContainer.appendChild(mapContainerEl);

  sidePanelEl = document.createElement("div");
  sidePanelEl.className = "room-editor-side-panel";
  mapContainerEl.appendChild(sidePanelEl);

  bottomBarEl = document.createElement("div");
  bottomBarEl.className = "room-editor-bottom-bar";
  popupContainer.appendChild(bottomBarEl);

  document.body.appendChild(popupContainer);
};

const destroyPopup = () => {
  removeKeyboardShortcuts();
  if (popupMap) {
    popupMap.remove();
    popupMap = null;
  }
  if (popupContainer) {
    popupContainer.remove();
    popupContainer = null;
    topBarEl = null;
    bottomBarEl = null;
    sidePanelEl = null;
    mapContainerEl = null;
  }
};

const initPopupMap = (geometry) => {
  if (!mapContainerEl) return;

  popupMap = L.map(mapContainerEl, {
    zoomControl: false,
    attributionControl: false,
    boxZoom: false,
    keyboard: false,
  });

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    minZoom: 12,
    keepBuffer: 8,
    updateWhenIdle: false,
    updateWhenZooming: true,
  }).addTo(popupMap);

  if (geometry && geometry.coordinates) {
    const coords = geometry.coordinates[0];
    if (coords && coords.length > 0) {
      const latLngs = coords.map((c) => [c[1], c[0]]);
      const bounds = L.latLngBounds(latLngs);
      popupMap.fitBounds(bounds, { padding: [40, 40] });
    }
  }

  popupMap.whenReady(() => {
    popupMap.invalidateSize();
  });

  popupMap.on("click", (e) => {
    if (!currentEditorState || currentEditorState.mode !== "select") return;
    const clickedOnRoom = currentEditorState.roomLayers?.some((layer) =>
      layer.getBounds?.().contains(e.latlng)
    );
    if (!clickedOnRoom && currentEditorState.selectedRoom) {
      currentEditorState.selectedRoom = null;
      popupMap.dragging.enable();
      popupMap.keyboard.enable();
      renderRooms();
      updateSidePanel();
    }
  });
};

const updatePopupContent = () => {
  updateTopBar();
  updateBottomBar();
  updateSidePanel();
};

const updateTopBar = () => {
  if (!topBarEl || !currentEditorState) return;

  const { buildingName, buildingExternalId, floors, selectedFloor, rooms } = currentEditorState;
  const floorSummary = floors.find((f) => f.floor === selectedFloor);
  const roomCount = floorSummary?.totalCount || rooms.length;

  topBarEl.innerHTML = "";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "room-editor-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Cerrar editor";
  closeBtn.addEventListener("click", () => cancelRoomEditor());
  topBarEl.appendChild(closeBtn);

  const nameContainer = document.createElement("div");
  nameContainer.className = "room-editor-building-name-wrap";

  const name = document.createElement("span");
  name.className = "room-editor-building-name";
  name.textContent = buildingName;
  name.title = buildingExternalId;
  nameContainer.appendChild(name);

  if (buildingName !== buildingExternalId) {
    const idSmall = document.createElement("span");
    idSmall.className = "room-editor-building-id";
    idSmall.textContent = buildingExternalId;
    nameContainer.appendChild(idSmall);
  }
  topBarEl.appendChild(nameContainer);

  const floorSelector = document.createElement("div");
  floorSelector.className = "room-editor-floor-selector";
  for (const f of floors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `room-editor-floor-btn${f.floor === selectedFloor ? " is-active" : ""}`;
    btn.textContent = `${f.floor >= 0 ? f.floor : "S" + Math.abs(f.floor)} (${f.totalCount})`;
    btn.addEventListener("click", () => selectRoomEditorFloor(f.floor));
    floorSelector.appendChild(btn);
  }
  topBarEl.appendChild(floorSelector);

  const count = document.createElement("span");
  count.className = "room-editor-room-count";
  count.textContent = `${roomCount} sala(s)`;
  topBarEl.appendChild(count);

  const hint = document.createElement("span");
  hint.className = "room-editor-shortcut-hint";
  hint.textContent = "Ctrl+mover | Shift+rotar";
  topBarEl.appendChild(hint);
};

const updateBottomBar = () => {
  if (!bottomBarEl || !currentEditorState) return;

  const { mode, selectedRoom, suggestions } = currentEditorState;
  const hasSuggestions = suggestions && suggestions.length > 0;

  bottomBarEl.innerHTML = "";

  const tools = document.createElement("div");
  tools.className = "room-editor-tools";

  const toolDefs = [
    { id: "select", icon: ICONS.select, title: "Seleccionar" },
    { id: "draw-square", icon: ICONS.square, title: "Cuadrado" },
    { id: "draw-rect", icon: ICONS.rect, title: "Rectangulo" },
    { id: "draw-circle", icon: ICONS.circle, title: "Circulo" },
    { id: "draw-free", icon: ICONS.free, title: "Libre (vertices)" },
  ];

  for (const t of toolDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `room-editor-tool-btn is-icon-only${mode === t.id ? " is-active" : ""}`;
    btn.innerHTML = `<span>${t.icon}</span>`;
    btn.title = t.title;
    btn.addEventListener("click", () => selectRoomMode(t.id));
    tools.appendChild(btn);
  }

  const divider1 = document.createElement("div");
  divider1.className = "room-editor-divider";
  tools.appendChild(divider1);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "room-editor-tool-btn is-icon-only";
  deleteBtn.innerHTML = `<span>${ICONS.delete}</span>`;
  deleteBtn.title = "Eliminar sala seleccionada";
  deleteBtn.disabled = !selectedRoom;
  deleteBtn.addEventListener("click", () => deleteSelectedRoom());
  tools.appendChild(deleteBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "room-editor-tool-btn is-icon-only";
  copyBtn.innerHTML = `<span>${ICONS.copy}</span>`;
  copyBtn.title = "Copiar sala (Ctrl+C)";
  copyBtn.disabled = !selectedRoom;
  copyBtn.addEventListener("click", () => copySelectedRoom());
  tools.appendChild(copyBtn);

  const pasteBtn = document.createElement("button");
  pasteBtn.type = "button";
  pasteBtn.className = "room-editor-tool-btn is-icon-only";
  pasteBtn.innerHTML = `<span>${ICONS.paste}</span>`;
  pasteBtn.title = "Pegar sala (Ctrl+V)";
  pasteBtn.disabled = !copiedRoomData;
  pasteBtn.addEventListener("click", () => pasteRoom());
  tools.appendChild(pasteBtn);

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "room-editor-tool-btn is-icon-only";
  undoBtn.innerHTML = `<span>${ICONS.undo}</span>`;
  undoBtn.title = "Deshacer";
  undoBtn.disabled = undoStack.length === 0;
  undoBtn.addEventListener("click", () => undoRoomEditor());
  tools.appendChild(undoBtn);

  const divider2 = document.createElement("div");
  divider2.className = "room-editor-divider";
  tools.appendChild(divider2);

  const suggestBtn = document.createElement("button");
  suggestBtn.type = "button";
  suggestBtn.className = `room-editor-tool-btn is-icon-only is-suggest${hasSuggestions ? " is-active" : ""}`;
  suggestBtn.innerHTML = `<span>${ICONS.suggest}</span>`;
  suggestBtn.title = "Sugerir salas automaticamente";
  suggestBtn.addEventListener("click", () => runQuickSuggestion());
  tools.appendChild(suggestBtn);

  if (hasSuggestions) {
    const approveBtn = document.createElement("button");
    approveBtn.type = "button";
    approveBtn.className = "room-editor-tool-btn is-icon-only is-suggest";
    approveBtn.innerHTML = `<span>${ICONS.save}</span>`;
    approveBtn.title = "Guardar salas sugeridas";
    approveBtn.addEventListener("click", () => saveQuickSuggestions());
    tools.appendChild(approveBtn);

    const cancelSugBtn = document.createElement("button");
    cancelSugBtn.type = "button";
    cancelSugBtn.className = "room-editor-tool-btn is-icon-only";
    cancelSugBtn.innerHTML = `<span>${ICONS.delete}</span>`;
    cancelSugBtn.title = "Descartar sugerencias";
    cancelSugBtn.addEventListener("click", () => {
      clearSuggestionPreviewLayers();
      currentEditorState.suggestions = [];
      updateBottomBar();
      setAdminMapToolsStatus("Sugerencias descartadas.");
    });
    tools.appendChild(cancelSugBtn);
  }

  bottomBarEl.appendChild(tools);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "room-editor-save-btn";
  saveBtn.innerHTML = `<span>${ICONS.save}</span><span> Guardar</span>`;
  saveBtn.title = "Guardar cambios";
  saveBtn.addEventListener("click", () => saveRoomEditor());
  bottomBarEl.appendChild(saveBtn);
};

const updateSidePanel = () => {
  if (!sidePanelEl || !currentEditorState) return;

  const { selectedRoom } = currentEditorState;

  if (selectedRoom) {
    sidePanelEl.className = "room-editor-side-panel is-visible";
    sidePanelEl.innerHTML = "";
    sidePanelEl.appendChild(buildPropertiesPanel(selectedRoom));
  } else {
    sidePanelEl.className = "room-editor-side-panel";
    sidePanelEl.innerHTML = "";
  }
};

const buildPropertiesPanel = (room) => {
  const container = document.createElement("div");

  const header = document.createElement("div");
  header.className = "room-editor-side-panel-header";
  header.innerHTML = '<span class="room-editor-side-panel-title">Propiedades</span>';
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "room-editor-side-panel-close";
  closeBtn.innerHTML = "&times;";
  closeBtn.addEventListener("click", () => {
    currentEditorState.selectedRoom = null;
    renderRooms();
    updateSidePanel();
  });
  header.appendChild(closeBtn);
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "room-editor-side-panel-body";

  const rotation = room.rotation || 0;
  const scaleX = room.scaleX || 1;
  const scaleY = room.scaleY || 1;

  body.innerHTML = `
    <div class="room-editor-form-grid">
      <label>Nombre *
        <input value="${escapeHtml(room.displayName || "")}" data-prop="displayName" />
      </label>
      <label>Tipo
        <select data-prop="type">
          <option value="sala" ${room.type === "sala" ? "selected" : ""}>Sala</option>
          <option value="oficina" ${room.type === "oficina" ? "selected" : ""}>Oficina</option>
          <option value="box" ${room.type === "box" ? "selected" : ""}>Box</option>
          <option value="bodega" ${room.type === "bodega" ? "selected" : ""}>Bodega</option>
          <option value="estacion_enfermeria" ${room.type === "estacion_enfermeria" ? "selected" : ""}>Est. Enfermeria</option>
          <option value="pasillo" ${room.type === "pasillo" ? "selected" : ""}>Pasillo</option>
          <option value="otro" ${room.type === "otro" ? "selected" : ""}>Otro</option>
        </select>
      </label>
      <label>Unidad
        <input value="${escapeHtml(room.unit || "")}" data-prop="unit" />
      </label>
      <label>Servicio
        <input value="${escapeHtml(room.service || "")}" data-prop="service" />
      </label>
      <label>Estado
        <select data-prop="status">
          <option value="active" ${room.status === "active" ? "selected" : ""}>Activa</option>
          <option value="closed" ${room.status === "closed" ? "selected" : ""}>Cerrada</option>
          <option value="review" ${room.status === "review" ? "selected" : ""}>En revision</option>
          <option value="temporary" ${room.status === "temporary" ? "selected" : ""}>Temporal</option>
        </select>
      </label>
      <label>Capacidad
        <input type="number" value="${room.capacity || ""}" data-prop="capacity" />
      </label>
    </div>
    <div class="room-editor-transform-section">
      <div class="room-editor-section-title">Transformar</div>
      <div class="room-editor-form-grid">
        <label>Rotacion (grados)
          <input type="number" value="${rotation}" min="0" max="270" step="90" data-transform="rotation" />
        </label>
        <label>Escala X
          <input type="number" value="${scaleX}" min="0.1" max="10" step="0.1" data-transform="scaleX" />
        </label>
        <label>Escala Y
          <input type="number" value="${scaleY}" min="0.1" max="10" step="0.1" data-transform="scaleY" />
        </label>
      </div>
    </div>
    <label class="room-editor-full-label">Notas
      <textarea data-prop="notes">${escapeHtml(room.notes || "")}</textarea>
    </label>
    <div class="room-editor-meta">Fuente: ${room.source || "synced"} | ID: ${room.externalId}</div>
  `;

  body.querySelectorAll("[data-prop]").forEach((el) => {
    const prop = el.dataset.prop;
    const handler = () => {
      let val = el.value;
      if (prop === "capacity") val = parseInt(val) || null;
      updateRoomProperty(prop, val);
    };
    el.addEventListener("change", handler);
    if (el.tagName === "INPUT" && el.type !== "number") {
      el.addEventListener("input", handler);
    }
  });

  body.querySelectorAll("[data-transform]").forEach((el) => {
    el.addEventListener("change", () => {
      const prop = el.dataset.transform;
      const val = parseFloat(el.value);
      if (isNaN(val)) return;
      updateRoomTransform(prop, val);
    });
  });

  container.appendChild(body);
  return container;
};

const updateRoomTransform = (property, value) => {
  if (!currentEditorState?.selectedRoom) return;
  const room = currentEditorState.selectedRoom;
  room[property] = value;
  currentEditorState.isDirty = true;
  renderRooms();
};

const renderBuildingBoundary = (geometry) => {
  clearBuildingBoundary();

  if (!geometry || !geometry.coordinates || !popupMap) return;

  const coords = geometry.coordinates[0];
  const latLngs = coords.map((c) => [c[1], c[0]]);

  currentEditorState.buildingPolygonLayer = L.polygon(latLngs, {
    color: "#1e40af",
    weight: 3,
    fillColor: "#1e40af",
    fillOpacity: 0.08,
    dashArray: "8 4",
    interactive: false,
  }).addTo(popupMap);
};

const clearBuildingBoundary = () => {
  if (currentEditorState?.buildingPolygonLayer && popupMap) {
    popupMap.removeLayer(currentEditorState.buildingPolygonLayer);
    currentEditorState.buildingPolygonLayer = null;
  }
};

const renderRooms = () => {
  clearRoomLayers();

  if (!currentEditorState || !popupMap) return;

  for (const room of currentEditorState.rooms) {
    if (!room.geometryJson) continue;

    try {
      const geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
      if (!geom.coordinates) continue;

      const coords = geom.coordinates[0];
      let latLngs = coords.map((c) => [c[1], c[0]]);

      const rotation = room.rotation || 0;
      const scaleX = room.scaleX || 1;
      const scaleY = room.scaleY || 1;

      if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
        latLngs = transformLatLngs(latLngs, rotation, scaleX, scaleY);
      }

      const isSelected = currentEditorState.selectedRoom?.externalId === room.externalId;

      const layer = L.polygon(latLngs, {
        color: isSelected ? "#f59e0b" : "#059669",
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? "#f59e0b" : "#059669",
        fillOpacity: isSelected ? 0.3 : 0.2,
        className: ROOM_LAYER_CLASS,
      }).addTo(popupMap);

      layer.on("mousedown", (e) => {
        const oe = e.originalEvent;

        if (oe.ctrlKey) {
          L.DomEvent.stop(e);
          enableDragLayer(layer, room, e);
        } else if (oe.shiftKey) {
          L.DomEvent.stop(e);
          enableRotateLayer(layer, room, e);
        } else if (currentEditorState.mode === "select") {
          L.DomEvent.stop(e);
          selectRoom(room);
        }
      });

      layer.roomData = room;
      currentEditorState.roomLayers.push(layer);
    } catch (e) {
      console.warn("Error rendering room:", room.externalId, e);
    }
  }
};

const transformLatLngs = (latLngs, rotationDeg, scaleX, scaleY) => {
  if (latLngs.length < 3) return latLngs;

  const centerLat = latLngs.reduce((s, ll) => s + ll[0], 0) / latLngs.length;
  const centerLng = latLngs.reduce((s, ll) => s + ll[1], 0) / latLngs.length;
  const rad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  return latLngs.map((ll) => {
    const dx = (ll[1] - centerLng) * scaleX;
    const dy = (ll[0] - centerLat) * scaleY;
    const newLng = centerLng + dx * cosR - dy * sinR;
    const newLat = centerLat + dx * sinR + dy * cosR;
    return [newLat, newLng];
  });
};

const enableDragLayer = (layer, room, e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);

  const startLatLng = e.latlng;
  const geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
  if (!geom?.coordinates?.[0]) return;

  const origCoords = geom.coordinates[0].map((c) => [...c]);
  let dragging = true;

  const onMove = (ev) => {
    if (!dragging) return;
    const dLat = ev.latlng.lat - startLatLng.lat;
    const dLng = ev.latlng.lng - startLatLng.lng;
    const newCoords = origCoords.map((c) => [c[0] + dLng, c[1] + dLat]);
    const newGeo = { type: "Polygon", coordinates: [newCoords] };
    room.geometryJson = JSON.stringify(newGeo);
    currentEditorState.isDirty = true;

    let newLatLngs = newCoords.map((c) => [c[1], c[0]]);
    const rotation = room.rotation || 0;
    const scaleX = room.scaleX || 1;
    const scaleY = room.scaleY || 1;
    if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
      newLatLngs = transformLatLngs(newLatLngs, rotation, scaleX, scaleY);
    }
    layer.setLatLngs(newLatLngs);
  };

  const onUp = () => {
    dragging = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    popupMap.getContainer().style.cursor = "";
  };

  popupMap.getContainer().style.cursor = "grabbing";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const enableRotateLayer = (layer, room, e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);

  const geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
  if (!geom?.coordinates?.[0]) return;

  const coords = geom.coordinates[0];
  const centerLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  const centerLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const center = L.latLng(centerLat, centerLng);

  const startAngle = Math.atan2(e.latlng.lat - center.lat, e.latlng.lng - center.lng);
  const baseRotation = room.rotation || 0;
  let rotating = true;

  const onMove = (ev) => {
    if (!rotating) return;
    const currentAngle = Math.atan2(ev.latlng.lat - center.lat, ev.latlng.lng - center.lng);
    const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
    room.rotation = ((baseRotation + deltaDeg) % 360 + 360) % 360;
    currentEditorState.isDirty = true;

    updateTransformInputs();
    const newLatLngs = transformLatLngs(
      coords.map((c) => [c[1], c[0]]),
      room.rotation,
      room.scaleX || 1,
      room.scaleY || 1
    );
    layer.setLatLngs(newLatLngs);
  };

  const onUp = () => {
    rotating = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    popupMap.getContainer().style.cursor = "";
  };

  popupMap.getContainer().style.cursor = "crosshair";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const updateTransformInputs = () => {
  if (!sidePanelEl || !currentEditorState?.selectedRoom) return;
  const room = currentEditorState.selectedRoom;
  const rotInput = sidePanelEl.querySelector("[data-transform='rotation']");
  const sxInput = sidePanelEl.querySelector("[data-transform='scaleX']");
  const syInput = sidePanelEl.querySelector("[data-transform='scaleY']");
  if (rotInput) rotInput.value = Math.round(room.rotation || 0);
  if (sxInput) sxInput.value = (room.scaleX || 1).toFixed(1);
  if (syInput) syInput.value = (room.scaleY || 1).toFixed(1);
};

const clearRoomLayers = () => {
  if (!currentEditorState || !popupMap) return;
  for (const layer of currentEditorState.roomLayers) {
    popupMap.removeLayer(layer);
  }
  currentEditorState.roomLayers = [];
};

const selectRoom = (room) => {
  if (!currentEditorState) return;
  currentEditorState.selectedRoom = room;
  if (popupMap) {
    if (room) {
      popupMap.dragging.disable();
      popupMap.keyboard.disable();
    } else {
      popupMap.dragging.enable();
      popupMap.keyboard.enable();
    }
  }
  renderRooms();
  updateSidePanel();
};

const selectRoomEditorFloor = async (floor) => {
  if (!currentEditorState) return;
  currentEditorState.selectedFloor = floor;
  currentEditorState.selectedRoom = null;
  clearDrawState();
  await loadRoomsForFloor(currentEditorState.buildingExternalId, floor);
  renderRooms();
  updatePopupContent();
};

const selectRoomMode = (mode) => {
  if (!currentEditorState) return;
  clearDrawState();
  currentEditorState.mode = mode;
  currentEditorState.selectedRoom = null;
  if (popupMap) {
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
  }
  updateBottomBar();
  updateSidePanel();

  switch (mode) {
    case "draw-square":
      setAdminMapToolsStatus("Click para colocar la primera esquina. Luego click para la segunda esquina.");
      startDrawSquare();
      break;
    case "draw-rect":
      setAdminMapToolsStatus("Click para colocar la primera esquina. Luego click para la segunda esquina.");
      startDrawRect();
      break;
    case "draw-circle":
      setAdminMapToolsStatus("Click para colocar el centro. Luego click para definir el radio.");
      startDrawCircle();
      break;
    case "draw-free":
      setAdminMapToolsStatus("Click para agregar vertices. Enter o doble clic para cerrar.");
      startDrawFree();
      break;
    default:
      setAdminMapToolsStatus("Modo seleccion. Ctrl+click para mover, Shift+click para rotar.");
  }
};

const startDrawSquare = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-square";

  let p1 = null;

  const onClick = (e) => {
    L.DomEvent.stop(e);
    if (!p1) {
      p1 = e.latlng;
      setAdminMapToolsStatus("Click para colocar la esquina opuesta del cuadrado.");
      currentEditorState.previewLayer = L.polygon(
        [[p1.lat, p1.lng], [p1.lat, p1.lng], [p1.lat, p1.lng], [p1.lat, p1.lng]],
        { color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false }
      ).addTo(popupMap);
      popupMap.on("mousemove", onMove);
    } else {
      popupMap.off("click", onClick);
      popupMap.off("mousemove", onMove);
      if (currentEditorState.previewLayer) {
        const latLngs = currentEditorState.previewLayer.getLatLngs()[0];
        popupMap.removeLayer(currentEditorState.previewLayer);
        currentEditorState.previewLayer = null;
        if (latLngs && latLngs.length >= 4) {
          const ring = latLngs.map((ll) => [ll.lng, ll.lat]);
          ring.push(ring[0]);
          createNewRoom(ring);
        }
      }
    }
  };

  const onMove = (e) => {
    if (!p1 || !currentEditorState.previewLayer) return;
    const dLat = Math.abs(e.latlng.lat - p1.lat);
    const dLng = Math.abs(e.latlng.lng - p1.lng);
    const d = Math.max(dLat, dLng);
    const sLat = e.latlng.lat >= p1.lat ? 1 : -1;
    const sLng = e.latlng.lng >= p1.lng ? 1 : -1;
    currentEditorState.previewLayer.setLatLngs([
      [p1.lat + d * sLat, p1.lng - d * sLng],
      [p1.lat + d * sLat, p1.lng + d * sLng],
      [p1.lat - d * sLat, p1.lng + d * sLng],
      [p1.lat - d * sLat, p1.lng - d * sLng],
    ]);
  };

  popupMap.on("click", onClick);
};

const startDrawRect = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-rect";

  let p1 = null;

  const onClick = (e) => {
    L.DomEvent.stop(e);
    if (!p1) {
      p1 = e.latlng;
      setAdminMapToolsStatus("Click para colocar la esquina opuesta del rectangulo.");
      currentEditorState.previewLayer = L.polygon(
        [[p1.lat, p1.lng], [p1.lat, p1.lng], [p1.lat, p1.lng], [p1.lat, p1.lng]],
        { color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false }
      ).addTo(popupMap);
      popupMap.on("mousemove", onMove);
    } else {
      popupMap.off("click", onClick);
      popupMap.off("mousemove", onMove);
      if (currentEditorState.previewLayer) {
        const latLngs = currentEditorState.previewLayer.getLatLngs()[0];
        popupMap.removeLayer(currentEditorState.previewLayer);
        currentEditorState.previewLayer = null;
        if (latLngs && latLngs.length >= 4) {
          const ring = latLngs.map((ll) => [ll.lng, ll.lat]);
          ring.push(ring[0]);
          createNewRoom(ring);
        }
      }
    }
  };

  const onMove = (e) => {
    if (!p1 || !currentEditorState.previewLayer) return;
    currentEditorState.previewLayer.setLatLngs([
      [p1.lat, p1.lng],
      [p1.lat, e.latlng.lng],
      [e.latlng.lat, e.latlng.lng],
      [e.latlng.lat, p1.lng],
    ]);
  };

  popupMap.on("click", onClick);
};

const startDrawCircle = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-circle";

  let center = null;

  const onClick = (e) => {
    L.DomEvent.stop(e);
    if (!center) {
      center = e.latlng;
      setAdminMapToolsStatus("Click para definir el radio del circulo.");
      currentEditorState.previewLayer = L.circle(center, {
        radius: 1, color: "#f59e0b", weight: 2, fillColor: "#f59e0b",
        fillOpacity: 0.25, dashArray: "6 6", interactive: false,
      }).addTo(popupMap);
      popupMap.on("mousemove", onMove);
    } else {
      popupMap.off("click", onClick);
      popupMap.off("mousemove", onMove);
      if (currentEditorState.previewLayer) {
        const radius = currentEditorState.previewLayer.getRadius();
        popupMap.removeLayer(currentEditorState.previewLayer);
        currentEditorState.previewLayer = null;
        if (radius > 1) {
          const numPoints = 36;
          const ring = [];
          for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const lat = center.lat + (radius / 111320) * Math.cos(angle);
            const lng = center.lng + (radius / (111320 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
            ring.push([lng, lat]);
          }
          ring.push(ring[0]);
          createNewRoom(ring);
        }
      }
    }
  };

  const onMove = (e) => {
    if (!center || !currentEditorState.previewLayer) return;
    currentEditorState.previewLayer.setRadius(center.distanceTo(e.latlng));
  };

  popupMap.on("click", onClick);
};

const startDrawFree = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-free";
  currentEditorState.drawPoints = [];

  const onClick = (e) => {
    currentEditorState.drawPoints.push(e.latlng);
    addDrawVertexMarker(e.latlng);
    const pts = currentEditorState.drawPoints;

    if (currentEditorState.previewLayer) {
      const ring = pts.length >= 3 ? [...pts, pts[0]] : pts;
      currentEditorState.previewLayer.setLatLngs(ring);
    } else if (pts.length >= 3) {
      currentEditorState.previewLayer = L.polygon([...pts, pts[0]], {
        color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false,
      }).addTo(popupMap);
    }
  };

  const onDblClick = (e) => {
    L.DomEvent.stop(e);
    finishCurrentPolygonDraw();
  };

  popupMap.on("click", onClick);
  popupMap.on("dblclick", onDblClick);
};

const clearDrawState = () => {
  if (!currentEditorState || !popupMap) return;
  if (currentEditorState.previewLayer) {
    popupMap.removeLayer(currentEditorState.previewLayer);
    currentEditorState.previewLayer = null;
  }
  for (const marker of (currentEditorState.drawVertexMarkers || [])) {
    popupMap.removeLayer(marker);
  }
  currentEditorState.drawVertexMarkers = [];
  currentEditorState.drawPoints = [];
  popupMap.off("click");
  popupMap.off("dblclick");
  popupMap.off("mousemove");
  popupMap.off("mousedown");
  popupMap.off("mouseup");
};

const createNewRoom = (geoJsonCoords) => {
  if (!currentEditorState) return;

  const newRoom = {
    externalId: `MAN-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}`,
    buildingExternalId: currentEditorState.buildingExternalId,
    floor: currentEditorState.selectedFloor,
    displayName: `Sala ${currentEditorState.rooms.length + 1}`,
    shortName: "",
    type: "sala",
    unit: "",
    service: "",
    status: "active",
    capacity: null,
    geometryJson: JSON.stringify({ type: "Polygon", coordinates: [geoJsonCoords] }),
    source: "manual",
    notes: "",
    isNew: true,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };

  pushUndo({ type: "create-room", room: newRoom });

  currentEditorState.rooms.push(newRoom);
  currentEditorState.selectedRoom = newRoom;
  currentEditorState.isDirty = true;
  clearDrawState();
  currentEditorState.mode = "select";
  renderRooms();
  updatePopupContent();
  setAdminMapToolsStatus("Sala creada. Ctrl+click para mover, Shift+click para rotar, Ctrl+Z para deshacer.");
};

const deleteSelectedRoom = () => {
  if (!currentEditorState?.selectedRoom) return;

  const room = currentEditorState.selectedRoom;
  pushUndo({ type: "delete-room", room });

  currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== room.externalId);
  currentEditorState.selectedRoom = null;
  currentEditorState.isDirty = true;
  if (popupMap) {
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
  }
  renderRooms();
  updatePopupContent();
  updateSidePanel();
  setAdminMapToolsStatus("Sala eliminada.");
};

const copySelectedRoom = () => {
  if (!currentEditorState?.selectedRoom) return;
  const room = currentEditorState.selectedRoom;
  copiedRoomData = {
    geometryJson: room.geometryJson,
    type: room.type,
  };
  setAdminMapToolsStatus("Sala copiada. Ctrl+V para pegar.");
};

const pasteRoom = () => {
  if (!currentEditorState || !copiedRoomData) {
    setAdminMapToolsStatus("No hay sala copiada.");
    return;
  }

  const geom = typeof copiedRoomData.geometryJson === "string"
    ? JSON.parse(copiedRoomData.geometryJson)
    : copiedRoomData.geometryJson;

  if (!geom?.coordinates?.[0]) return;

  const OFFSET = 0.0001;
  const newCoords = geom.coordinates[0].map((c) => [c[0] + OFFSET, c[1] + OFFSET]);
  newCoords.push(newCoords[0]);

  createNewRoom(newCoords);
  if (currentEditorState?.selectedRoom) {
    currentEditorState.selectedRoom.type = copiedRoomData.type;
  }
  setAdminMapToolsStatus("Sala pegada. Ctrl+drag para mover.");
};

const updateRoomProperty = (property, value) => {
  if (!currentEditorState?.selectedRoom) return;

  const room = currentEditorState.selectedRoom;
  const prevValue = room[property];
  room[property] = value;
  currentEditorState.isDirty = true;

  pushUndo({ type: "update-property", roomExternalId: room.externalId, property, prevValue, newValue: value });

  if (property === "displayName" || property === "type") {
    renderRooms();
  }
};

const pushUndo = (action) => {
  undoStack.push(action);
  redoStack = [];
};

const undoRoomEditor = () => {
  if (undoStack.length === 0 || !currentEditorState) return;
  const action = undoStack.pop();
  redoStack.push(action);

  switch (action.type) {
    case "create-room":
      currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== action.room.externalId);
      if (currentEditorState.selectedRoom?.externalId === action.room.externalId) {
        currentEditorState.selectedRoom = null;
      }
      break;
    case "delete-room":
      currentEditorState.rooms.push(action.room);
      break;
    case "update-property": {
      const room = currentEditorState.rooms.find((r) => r.externalId === action.roomExternalId);
      if (room) room[action.property] = action.prevValue;
      break;
    }
  }

  renderRooms();
  updatePopupContent();
};

const redoRoomEditor = () => {
  if (redoStack.length === 0 || !currentEditorState) return;
  const action = redoStack.pop();
  undoStack.push(action);

  switch (action.type) {
    case "create-room":
      currentEditorState.rooms.push(action.room);
      break;
    case "delete-room":
      currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== action.room.externalId);
      break;
    case "update-property": {
      const room = currentEditorState.rooms.find((r) => r.externalId === action.roomExternalId);
      if (room) room[action.property] = action.newValue;
      break;
    }
  }

  renderRooms();
  updatePopupContent();
};

const saveRoomEditor = async () => {
  if (!currentEditorState) return;

  const savedBuildingId = currentEditorState.buildingExternalId;
  setAdminMapToolsStatus("Guardando salas...");

  try {
    for (const room of currentEditorState.rooms) {
      const coordinates = parseGeometryToCoordinates(room.geometryJson);

      if (room.isNew) {
        const res = await fetch(`${getApiUrl()}/api/manual-rooms`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            externalId: room.externalId,
            buildingExternalId: room.buildingExternalId,
            floor: room.floor,
            displayName: room.displayName,
            shortName: room.shortName,
            type: room.type,
            unit: room.unit,
            service: room.service,
            status: room.status,
            capacity: room.capacity,
            coordinates,
            notes: room.notes,
          }),
        });
        if (!res.ok) {
          let msg = `Error al crear sala '${room.displayName}'.`;
          try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
          throw new Error(msg);
        }
      } else {
        const res = await fetch(`${getApiUrl()}/api/manual-rooms/${encodeURIComponent(room.externalId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            displayName: room.displayName,
            shortName: room.shortName,
            floor: room.floor,
            type: room.type,
            unit: room.unit,
            service: room.service,
            status: room.status,
            capacity: room.capacity,
            coordinates,
            notes: room.notes,
          }),
        });
        if (!res.ok) {
          let msg = `Error al actualizar sala '${room.displayName}'.`;
          try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
          throw new Error(msg);
        }
      }
    }

    setAdminMapToolsStatus("Salas guardadas correctamente.");

    destroyPopup();
    clearRoomEditorState();
    requestAdminMapToolMode(null);
    setAdminMapToolsStatus("");

    refreshCurrentMapData();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: savedBuildingId } }));
  } catch (error) {
    console.error("Error saving rooms:", error);
    setAdminMapToolsStatus(error.message || "Error al guardar salas.");
  }
};

const cancelRoomEditor = () => {
  clearDrawState();
  if (popupMap) {
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
  }
  destroyPopup();
  clearRoomEditorState();
  requestAdminMapToolMode(null);
  setAdminMapToolsStatus("");
};

const clearRoomEditorState = () => {
  currentEditorState = null;
  undoStack = [];
  redoStack = [];
};

const parseGeometryToCoordinates = (geometryJson) => {
  if (!geometryJson) return [];
  try {
    const geom = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    if (!geom.coordinates || !geom.coordinates[0]) return [];
    return geom.coordinates[0].map((c) => [c[0], c[1]]);
  } catch {
    return [];
  }
};

const escapeHtml = (str) => {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

const runQuickSuggestion = async () => {
  if (!currentEditorState) return;

  setAdminMapToolsStatus("Generando sugerencias...");

  try {
    const buildingCoords = currentEditorState.buildingGeometry?.coordinates?.[0];
    if (!buildingCoords) {
      setAdminMapToolsStatus("No se encontro la geometria del edificio.");
      return;
    }

    const response = await fetch(`${getApiUrl()}/api/room-layouts/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        buildingExternalId: currentEditorState.buildingExternalId,
        floor: currentEditorState.selectedFloor,
        roomCount: 6,
        pattern: "grid",
        rows: 0,
        columns: 0,
        corridorWidth: 1.5,
        roomType: "sala",
        namePrefix: "Sala",
        coordinates: buildingCoords,
      }),
    });

    if (response.status === 401) {
      setAdminMapToolsStatus("Sesion expirada. Recarga la pagina.");
      return;
    }
    if (!response.ok) {
      let msg = "Error al generar sugerencias.";
      try { const body = await response.json(); if (body.message) msg += " " + body.message; } catch {}
      setAdminMapToolsStatus(msg);
      return;
    }

    const suggestions = await response.json();

    if (!suggestions || suggestions.length === 0) {
      setAdminMapToolsStatus("El edificio es muy pequeno para generar salas con los parametros actuales.");
      return;
    }

    currentEditorState.suggestions = suggestions.map((s, i) => ({
      ...s,
      approved: true,
      externalId: `SUG-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${i}`,
    }));

    clearSuggestionPreviewLayers();
    renderSuggestionPreviewLayers();
    updateBottomBar();
    setAdminMapToolsStatus(`${suggestions.length} sala(s) sugerida(s). Haz clic en el check para guardarlas.`);
  } catch (error) {
    console.error("Error running suggestion:", error);
    setAdminMapToolsStatus("Error al conectar con el servidor.");
  }
};

const renderSuggestionPreviewLayers = () => {
  if (!currentEditorState?.suggestions || !popupMap) return;

  for (let i = 0; i < currentEditorState.suggestions.length; i++) {
    const sug = currentEditorState.suggestions[i];
    if (!sug.approved || !sug.coordinates || sug.coordinates.length < 3) continue;

    const latLngs = sug.coordinates.map((c) => [c[1], c[0]]);
    const layer = L.polygon(latLngs, {
      color: "#7c3aed",
      weight: 2,
      fillColor: "#7c3aed",
      fillOpacity: 0.2,
      dashArray: "6 4",
      className: "room-editor-suggestion-layer",
    }).addTo(popupMap);

    layer.on("click", (e) => {
      L.DomEvent.stop(e);
      toggleSuggestionApproval(i);
    });

    currentEditorState.suggestionPreviewLayers.push(layer);
  }
};

const clearSuggestionPreviewLayers = () => {
  if (!currentEditorState || !popupMap) return;
  for (const layer of currentEditorState.suggestionPreviewLayers || []) {
    popupMap.removeLayer(layer);
  }
  currentEditorState.suggestionPreviewLayers = [];
};

const toggleSuggestionApproval = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = !currentEditorState.suggestions[index].approved;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateBottomBar();
};

const approveAllSuggestions = () => {
  if (!currentEditorState?.suggestions) return;
  for (const sug of currentEditorState.suggestions) {
    sug.approved = true;
  }
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateBottomBar();
};

const saveQuickSuggestions = async () => {
  if (!currentEditorState?.suggestions) return;

  const approved = currentEditorState.suggestions.filter((s) => s.approved);
  if (approved.length === 0) {
    setAdminMapToolsStatus("No hay sugerencias aprobadas para guardar.");
    return;
  }

  setAdminMapToolsStatus("Guardando sugerencias...");

  try {
    const response = await fetch(`${getApiUrl()}/api/room-layouts/bulk-save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        buildingExternalId: currentEditorState.buildingExternalId,
        floor: currentEditorState.selectedFloor,
        rooms: approved.map((s) => ({
          externalId: s.externalId,
          displayName: s.displayName,
          type: s.type,
          coordinates: s.coordinates,
        })),
      }),
    });

    if (!response.ok) throw new Error("Error al guardar sugerencias");

    const result = await response.json();
    setAdminMapToolsStatus(`${result.savedCount} sala(s) sugerida(s) guardada(s).`);

    clearSuggestionPreviewLayers();
    currentEditorState.suggestions = [];
    currentEditorState.suggestionPreviewLayers = [];

    await loadRoomsForFloor(currentEditorState.buildingExternalId, currentEditorState.selectedFloor);
    renderRooms();
    updatePopupContent();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState.buildingExternalId } }));
  } catch (error) {
    console.error("Error saving suggestions:", error);
    setAdminMapToolsStatus("Error al guardar sugerencias.");
  }
};
