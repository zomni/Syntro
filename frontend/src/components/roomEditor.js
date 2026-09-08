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

let currentEditorState = null;
let undoStack = [];
let redoStack = [];
let popupContainer = null;
let popupMap = null;
let topBarEl = null;
let bottomBarEl = null;
let sidePanelEl = null;
let mapContainerEl = null;

const getApiUrl = () => {
  return BACKEND_API_URL || "http://localhost:5002";
};

export const initRoomEditor = () => {
  window.selectRoomEditorFloor = selectRoomEditorFloor;
  window.startRoomDrawRect = startRoomDrawRect;
  window.startRoomDrawPolygon = startRoomDrawPolygon;
  window.selectRoomMode = selectRoomMode;
  window.deleteSelectedRoom = deleteSelectedRoom;
  window.undoRoomEditor = undoRoomEditor;
  window.redoRoomEditor = redoRoomEditor;
  window.updateRoomProperty = updateRoomProperty;
  window.runSuggestion = runSuggestion;
  window.approveSuggestion = approveSuggestion;
  window.rejectSuggestion = rejectSuggestion;
  window.approveAllSuggestions = approveAllSuggestions;

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
      if (featureId) {
        openRoomEditor(featureId);
      }
    }
  });
};

const openRoomEditor = async (buildingExternalId) => {
  if (!buildingExternalId) return;

  setAdminMapToolsStatus("Abriendo editor de salas...");

  try {
    const buildingData = await fetchBuildingGeometry(buildingExternalId);
    const floorsData = await fetchBuildingFloors(buildingExternalId);

    const floors = floorsData.length > 0 ? floorsData : [{ floor: 0, totalCount: 0 }];
    const selectedFloor = floors[0].floor;

    currentEditorState = {
      buildingExternalId,
      buildingGeometry: buildingData,
      floors,
      selectedFloor,
      rooms: [],
      selectedRoom: null,
      mode: "select",
      isDirty: false,
      buildingPolygonLayer: null,
      roomLayers: [],
      vertexMarkers: [],
      previewLayer: null,
      drawPoints: [],
      drawPreviewLine: null,
      suggestions: [],
      suggestionPreviewLayers: [],
    };

    undoStack = [];
    redoStack = [];

    createPopup();
    initPopupMap(buildingData);
    await loadRoomsForFloor(buildingExternalId, selectedFloor);
    renderBuildingBoundary(buildingData);
    renderRooms();
    updatePopupContent();

    setAdminMapToolsStatus("Editor de salas abierto.");
    requestAdminMapToolMode("room-edit");
  } catch (error) {
    console.error("Error opening room editor:", error);
    setAdminMapToolsStatus("Error al abrir editor de salas.");
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
  });

  L.tileLayer(TILE_URL, {
    maxZoom: 19,
    keepBuffer: 8,
    updateWhenIdle: false,
    updateWhenZooming: true,
  }).addTo(popupMap);

  if (geometry && geometry.coordinates) {
    const coords = geometry.coordinates[0];
    if (coords && coords.length > 0) {
      const latLngs = coords.map((c) => [c[1], c[0]]);
      const bounds = L.latLngBounds(latLngs);
      popupMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 18 });
    }
  }

  popupMap.whenReady(() => {
    popupMap.invalidateSize();
  });
};

const updatePopupContent = () => {
  updateTopBar();
  updateBottomBar();
  updateSidePanel();
};

const updateTopBar = () => {
  if (!topBarEl || !currentEditorState) return;

  const { buildingExternalId, floors, selectedFloor, rooms } = currentEditorState;
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

  const name = document.createElement("span");
  name.className = "room-editor-building-name";
  name.textContent = buildingExternalId;
  topBarEl.appendChild(name);

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
  count.style.cssText = "font-size:12px;color:#6b7280;";
  count.textContent = `${roomCount} sala(s)`;
  topBarEl.appendChild(count);
};

const updateBottomBar = () => {
  if (!bottomBarEl || !currentEditorState) return;

  const { mode, selectedRoom } = currentEditorState;

  bottomBarEl.innerHTML = "";

  const tools = document.createElement("div");
  tools.className = "room-editor-tools";

  const toolDefs = [
    { id: "select", label: "Seleccionar", icon: "&#128070;" },
    { id: "draw-rect", label: "Rectangulo", icon: "&#9645;" },
    { id: "draw-polygon", label: "Poligono", icon: "&#9651;" },
  ];

  for (const t of toolDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `room-editor-tool-btn${mode === t.id ? " is-active" : ""}`;
    btn.innerHTML = `<span>${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener("click", () => selectRoomMode(t.id));
    tools.appendChild(btn);
  }

  const divider1 = document.createElement("div");
  divider1.className = "room-editor-divider";
  tools.appendChild(divider1);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "room-editor-tool-btn";
  deleteBtn.innerHTML = '<span>&#128465;</span><span>Eliminar</span>';
  deleteBtn.disabled = !selectedRoom;
  deleteBtn.addEventListener("click", () => deleteSelectedRoom());
  tools.appendChild(deleteBtn);

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "room-editor-tool-btn";
  undoBtn.innerHTML = '<span>&#8617;</span><span>Deshacer</span>';
  undoBtn.disabled = undoStack.length === 0;
  undoBtn.addEventListener("click", () => undoRoomEditor());
  tools.appendChild(undoBtn);

  const divider2 = document.createElement("div");
  divider2.className = "room-editor-divider";
  tools.appendChild(divider2);

  const suggestBtn = document.createElement("button");
  suggestBtn.type = "button";
  suggestBtn.className = `room-editor-tool-btn${mode === "suggest" ? " is-active is-suggest" : ""}`;
  suggestBtn.innerHTML = '<span>&#10024;</span><span>Sugerir</span>';
  suggestBtn.addEventListener("click", () => showSuggestionPanel());
  tools.appendChild(suggestBtn);

  bottomBarEl.appendChild(tools);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "room-editor-save-btn";
  saveBtn.textContent = "Guardar";
  saveBtn.addEventListener("click", () => saveRoomEditor());
  bottomBarEl.appendChild(saveBtn);
};

const updateSidePanel = () => {
  if (!sidePanelEl || !currentEditorState) return;

  const { mode, selectedRoom } = currentEditorState;

  if (mode === "suggest") {
    sidePanelEl.className = "room-editor-side-panel is-visible";
    sidePanelEl.innerHTML = "";
    sidePanelEl.appendChild(buildSuggestionPanel());
  } else if (selectedRoom) {
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

  container.appendChild(body);
  return container;
};

const buildSuggestionPanel = () => {
  const suggestions = currentEditorState?.suggestions || [];
  const approvedCount = suggestions.filter((s) => s.approved).length;

  const container = document.createElement("div");

  const header = document.createElement("div");
  header.className = "room-editor-side-panel-header";
  header.innerHTML = '<span class="room-editor-side-panel-title" style="color:#7c3aed;">&#10024; Sugerencia</span>';
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "room-editor-side-panel-body";

  const sugPanel = document.createElement("div");
  sugPanel.className = "room-editor-suggestion-panel";
  sugPanel.innerHTML = `
    <div class="room-editor-form-grid">
      <label>Patron
        <select data-suggest="pattern">
          <option value="grid">Cuadricula</option>
          <option value="corridor-central">Pasillo central</option>
          <option value="corridor-lateral">Pasillo lateral</option>
          <option value="perimeter">Perimetral</option>
        </select>
      </label>
      <label>Cantidad
        <input type="number" value="6" min="1" max="100" data-suggest="count" />
      </label>
      <label>Pasillo (m)
        <input type="number" value="1.5" min="0" step="0.5" data-suggest="corridor" />
      </label>
      <label>Prefijo
        <input value="Box" data-suggest="prefix" />
      </label>
      <label>Tipo
        <select data-suggest="type">
          <option value="box">Box</option>
          <option value="sala">Sala</option>
          <option value="oficina">Oficina</option>
        </select>
      </label>
      <label>Filas (0=auto)
        <input type="number" value="0" min="0" data-suggest="rows" />
      </label>
    </div>
  `;
  body.appendChild(sugPanel);

  const genBtn = document.createElement("button");
  genBtn.type = "button";
  genBtn.style.cssText = "width:100%;margin:8px 0;padding:6px;border-radius:4px;border:none;background:#7c3aed;color:white;font-size:12px;cursor:pointer;";
  genBtn.textContent = "Generar sugerencia";
  genBtn.addEventListener("click", () => runSuggestion());
  body.appendChild(genBtn);

  if (suggestions.length > 0) {
    const info = document.createElement("div");
    info.className = "room-editor-hint";
    info.textContent = `${approvedCount} de ${suggestions.length} sala(s) aprobada(s)`;
    body.appendChild(info);

    const btnRow = document.createElement("div");
    btnRow.className = "room-editor-suggestion-actions";

    const approveAllBtn = document.createElement("button");
    approveAllBtn.type = "button";
    approveAllBtn.className = "room-editor-action-cancel";
    approveAllBtn.textContent = "Aprobar todas";
    approveAllBtn.addEventListener("click", () => approveAllSuggestions());

    const saveSugBtn = document.createElement("button");
    saveSugBtn.type = "button";
    saveSugBtn.className = "room-editor-action-save";
    saveSugBtn.textContent = "Guardar aprobadas";
    saveSugBtn.addEventListener("click", () => saveSuggestions());

    btnRow.appendChild(approveAllBtn);
    btnRow.appendChild(saveSugBtn);
    body.appendChild(btnRow);

    const list = document.createElement("div");
    list.className = "room-editor-suggestion-list";
    suggestions.forEach((s, i) => {
      const row = document.createElement("label");
      row.className = "room-editor-suggestion-item";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = s.approved;
      cb.addEventListener("change", () => {
        if (s.approved) rejectSuggestion(i);
        else approveSuggestion(i);
      });
      const span = document.createElement("span");
      span.textContent = `${s.displayName} (${s.type})`;
      if (!s.approved) span.style.cssText = "text-decoration:line-through;color:#9ca3af;";
      row.appendChild(cb);
      row.appendChild(span);
      list.appendChild(row);
    });
    body.appendChild(list);
  } else {
    const hint = document.createElement("div");
    hint.className = "room-editor-hint";
    hint.textContent = 'Configura los parametros y haz clic en "Generar sugerencia"';
    body.appendChild(hint);
  }

  container.appendChild(body);
  return container;
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
      const latLngs = coords.map((c) => [c[1], c[0]]);

      const isSelected = currentEditorState.selectedRoom?.externalId === room.externalId;

      const layer = L.polygon(latLngs, {
        color: isSelected ? "#f59e0b" : "#059669",
        weight: isSelected ? 3 : 2,
        fillColor: isSelected ? "#f59e0b" : "#059669",
        fillOpacity: isSelected ? 0.3 : 0.2,
        className: ROOM_LAYER_CLASS,
      }).addTo(popupMap);

      layer.on("click", (e) => {
        L.DomEvent.stop(e);
        if (currentEditorState.mode === "select") {
          selectRoom(room);
        }
      });

      layer.roomData = room;
      currentEditorState.roomLayers.push(layer);

      if (isSelected) {
        renderVertexMarkers(latLngs, room);
      }
    } catch (e) {
      console.warn("Error rendering room:", room.externalId, e);
    }
  }
};

const clearRoomLayers = () => {
  if (!currentEditorState || !popupMap) return;
  for (const layer of currentEditorState.roomLayers) {
    popupMap.removeLayer(layer);
  }
  currentEditorState.roomLayers = [];
  clearVertexMarkers();
};

const renderVertexMarkers = (latLngs, room) => {
  clearVertexMarkers();

  if (!popupMap) return;

  for (let i = 0; i < latLngs.length - 1; i++) {
    const marker = L.marker(latLngs[i], {
      icon: L.divIcon({
        className: VERTEX_CLASS,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      draggable: true,
    }).addTo(popupMap);

    const idx = i;
    marker.on("drag", (e) => {
      latLngs[idx] = e.target.getLatLng();
      if (currentEditorState.selectedRoom?.externalId === room.externalId) {
        const roomLayer = currentEditorState.roomLayers.find((l) => l.roomData?.externalId === room.externalId);
        if (roomLayer) roomLayer.setLatLngs(latLngs);
      }
    });

    marker.on("dragend", () => {
      pushUndo({
        type: "move-vertex",
        roomExternalId: room.externalId,
        vertexIndex: idx,
        previousLatLng: latLngs[idx],
        newLatLng: marker.getLatLng(),
      });
    });

    currentEditorState.vertexMarkers.push(marker);
  }
};

const clearVertexMarkers = () => {
  if (!currentEditorState || !popupMap) return;
  for (const marker of currentEditorState.vertexMarkers) {
    popupMap.removeLayer(marker);
  }
  currentEditorState.vertexMarkers = [];
};

const selectRoom = (room) => {
  if (!currentEditorState) return;
  currentEditorState.selectedRoom = room;
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
  updateBottomBar();
  updateSidePanel();

  if (mode === "draw-rect") {
    setAdminMapToolsStatus("Haz clic para colocar la esquina superior izquierda del rectangulo.");
    startRoomDrawRect();
  } else if (mode === "draw-polygon") {
    setAdminMapToolsStatus("Haz clic para agregar puntos. Doble clic para cerrar el poligono.");
    startRoomDrawPolygon();
  } else {
    setAdminMapToolsStatus("Modo seleccion. Click en una sala para editarla.");
  }
};

const startRoomDrawRect = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-rect";
  currentEditorState.drawPoints = [];

  const onClick = (e) => {
    currentEditorState.drawPoints.push(e.latlng);
    if (currentEditorState.drawPoints.length === 1) {
      setAdminMapToolsStatus("Ahora haz clic para colocar la esquina inferior derecha.");
      currentEditorState.drawPreviewLine = L.circleMarker(e.latlng, {
        radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 1,
      }).addTo(popupMap);
    } else if (currentEditorState.drawPoints.length === 2) {
      popupMap.off("click", onClick);
      popupMap.off("mousemove", onMove);
      if (currentEditorState.drawPreviewLine) {
        popupMap.removeLayer(currentEditorState.drawPreviewLine);
        currentEditorState.drawPreviewLine = null;
      }
      finishRectDraw();
    }
  };

  const onMove = (e) => {
    if (currentEditorState.drawPoints.length === 1 && currentEditorState.previewLayer) {
      const p1 = currentEditorState.drawPoints[0];
      const p2 = e.latlng;
      const rectCoords = [
        [p1.lat, p1.lng],
        [p1.lat, p2.lng],
        [p2.lat, p2.lng],
        [p2.lat, p1.lng],
        [p1.lat, p1.lng],
      ];
      currentEditorState.previewLayer.setLatLngs(rectCoords);
    }
  };

  popupMap.on("click", onClick);
  popupMap.on("mousemove", onMove);

  const p = popupMap.getCenter();
  currentEditorState.previewLayer = L.polygon(
    [[p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng]],
    { color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false }
  ).addTo(popupMap);
};

const finishRectDraw = () => {
  if (!currentEditorState || currentEditorState.drawPoints.length < 2) return;

  const p1 = currentEditorState.drawPoints[0];
  const p2 = currentEditorState.drawPoints[1];

  const coords = [
    [p1.lng, p1.lat],
    [p2.lng, p1.lat],
    [p2.lng, p2.lat],
    [p1.lng, p2.lat],
    [p1.lng, p1.lat],
  ];

  createNewRoom(coords);
};

const startRoomDrawPolygon = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-polygon";
  currentEditorState.drawPoints = [];

  const tempLatLngs = [];

  const onClick = (e) => {
    currentEditorState.drawPoints.push(e.latlng);
    tempLatLngs.push([e.latlng.lat, e.latlng.lng]);

    if (currentEditorState.previewLayer) {
      currentEditorState.previewLayer.setLatLngs(tempLatLngs.length >= 3 ? tempLatLngs : tempLatLngs.concat([tempLatLngs[0]]));
    } else if (tempLatLngs.length >= 3) {
      currentEditorState.previewLayer = L.polygon(tempLatLngs, {
        color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false,
      }).addTo(popupMap);
    }
  };

  const onDblClick = (e) => {
    L.DomEvent.stop(e);
    popupMap.off("click", onClick);
    popupMap.off("dblclick", onDblClick);

    if (currentEditorState.previewLayer) {
      popupMap.removeLayer(currentEditorState.previewLayer);
      currentEditorState.previewLayer = null;
    }

    if (tempLatLngs.length >= 3) {
      const closedRing = [...tempLatLngs, tempLatLngs[0]];
      const geoJsonCoords = closedRing.map((ll) => [ll[1], ll[0]]);
      createNewRoom(geoJsonCoords);
    }
  };

  popupMap.on("click", onClick);
  popupMap.on("dblclick", onDblClick);
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
  };

  pushUndo({ type: "create-room", room: newRoom });

  currentEditorState.rooms.push(newRoom);
  currentEditorState.selectedRoom = newRoom;
  currentEditorState.isDirty = true;
  clearDrawState();
  currentEditorState.mode = "select";
  renderRooms();
  updatePopupContent();
  setAdminMapToolsStatus("Sala creada. Completa las propiedades y guarda.");
};

const clearDrawState = () => {
  if (!currentEditorState || !popupMap) return;
  if (currentEditorState.previewLayer) {
    popupMap.removeLayer(currentEditorState.previewLayer);
    currentEditorState.previewLayer = null;
  }
  if (currentEditorState.drawPreviewLine) {
    popupMap.removeLayer(currentEditorState.drawPreviewLine);
    currentEditorState.drawPreviewLine = null;
  }
  currentEditorState.drawPoints = [];
  popupMap.off("click");
  popupMap.off("dblclick");
  popupMap.off("mousemove");
};

const deleteSelectedRoom = () => {
  if (!currentEditorState?.selectedRoom) return;

  const room = currentEditorState.selectedRoom;
  pushUndo({ type: "delete-room", room });

  currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== room.externalId);
  currentEditorState.selectedRoom = null;
  currentEditorState.isDirty = true;
  renderRooms();
  updatePopupContent();
  setAdminMapToolsStatus("Sala eliminada.");
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

  setAdminMapToolsStatus("Guardando salas...");

  try {
    for (const room of currentEditorState.rooms) {
      const coordinates = parseGeometryToCoordinates(room.geometryJson);

      if (room.isNew) {
        await fetch(`${getApiUrl()}/api/manual-rooms`, {
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
      } else {
        await fetch(`${getApiUrl()}/api/manual-rooms/${encodeURIComponent(room.externalId)}`, {
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
      }
    }

    setAdminMapToolsStatus("Salas guardadas correctamente.");

    destroyPopup();
    clearRoomEditorState();
    requestAdminMapToolMode(null);
    setAdminMapToolsStatus("");

    refreshCurrentMapData();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState?.buildingExternalId } }));
  } catch (error) {
    console.error("Error saving rooms:", error);
    setAdminMapToolsStatus("Error al guardar salas.");
  }
};

const cancelRoomEditor = () => {
  clearDrawState();
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

const showSuggestionPanel = () => {
  if (!currentEditorState) return;
  currentEditorState.mode = "suggest";
  currentEditorState.suggestions = [];
  currentEditorState.suggestionPreviewLayers = [];
  updateBottomBar();
  updateSidePanel();
};

const runSuggestion = async () => {
  if (!currentEditorState) return;

  const pattern = sidePanelEl?.querySelector("[data-suggest='pattern']")?.value || "grid";
  const count = parseInt(sidePanelEl?.querySelector("[data-suggest='count']")?.value) || 6;
  const corridor = parseFloat(sidePanelEl?.querySelector("[data-suggest='corridor']")?.value) || 1.5;
  const prefix = sidePanelEl?.querySelector("[data-suggest='prefix']")?.value || "Box";
  const roomType = sidePanelEl?.querySelector("[data-suggest='type']")?.value || "box";
  const rows = parseInt(sidePanelEl?.querySelector("[data-suggest='rows']")?.value) || 0;

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
        roomCount: count,
        pattern,
        rows,
        columns: 0,
        corridorWidth: corridor,
        roomType,
        namePrefix: prefix,
        coordinates: buildingCoords,
      }),
    });

    if (!response.ok) throw new Error("Error al generar sugerencias");

    const suggestions = await response.json();
    currentEditorState.suggestions = suggestions.map((s, i) => ({
      ...s,
      approved: true,
      externalId: `SUG-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${i}`,
    }));

    clearSuggestionPreviewLayers();
    renderSuggestionPreviewLayers();
    updateSidePanel();
    setAdminMapToolsStatus(`${suggestions.length} sala(s) sugerida(s). Revisa y aprueba las que desees guardar.`);
  } catch (error) {
    console.error("Error running suggestion:", error);
    setAdminMapToolsStatus("Error al generar sugerencias.");
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

const approveSuggestion = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = true;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateSidePanel();
};

const rejectSuggestion = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = false;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateSidePanel();
};

const toggleSuggestionApproval = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = !currentEditorState.suggestions[index].approved;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateSidePanel();
};

const approveAllSuggestions = () => {
  if (!currentEditorState?.suggestions) return;
  for (const sug of currentEditorState.suggestions) {
    sug.approved = true;
  }
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateSidePanel();
};

const saveSuggestions = async () => {
  if (!currentEditorState?.suggestions) return;

  const approved = currentEditorState.suggestions.filter((s) => s.approved);
  if (approved.length === 0) {
    setAdminMapToolsStatus("No hay sugerencias aprobadas para guardar.");
    return;
  }

  setAdminMapToolsStatus("Guardando sugerencias aprobadas...");

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
    currentEditorState.mode = "select";

    await loadRoomsForFloor(currentEditorState.buildingExternalId, currentEditorState.selectedFloor);
    renderRooms();
    updatePopupContent();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState.buildingExternalId } }));
  } catch (error) {
    console.error("Error saving suggestions:", error);
    setAdminMapToolsStatus("Error al guardar sugerencias.");
  }
};
