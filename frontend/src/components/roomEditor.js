import { map, BACKEND_API_URL } from "../views/map.js";
import {
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
  getAdminMapToolSection,
} from "./adminMapToolsPanel.js";

const VERTEX_CLASS = "room-editor-vertex-marker";
const ROOM_LAYER_CLASS = "room-editor-room-layer";

let currentEditorState = null;
let undoStack = [];
let redoStack = [];
let controlsWrapper = null;

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

    zoomToBuilding(buildingData);
    await loadRoomsForFloor(buildingExternalId, selectedFloor);
    renderBuildingBoundary(buildingData);
    renderRooms();
    createEditorControls();
    updateControlsContent();

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

const zoomToBuilding = (geometry) => {
  if (!geometry || !geometry.coordinates) return;
  const coords = geometry.coordinates[0];
  if (!coords || coords.length === 0) return;

  const latLngs = coords.map((c) => [c[1], c[0]]);
  const bounds = L.latLngBounds(latLngs);
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
};

const createEditorControls = () => {
  removeEditorControls();

  const sectionBody = getAdminMapToolSection("rooms");
  if (!sectionBody) return;

  controlsWrapper = document.createElement("div");
  controlsWrapper.className = "room-editor-controls";
  sectionBody.appendChild(controlsWrapper);
};

const removeEditorControls = () => {
  if (controlsWrapper) {
    controlsWrapper.remove();
    controlsWrapper = null;
  }
};

const updateControlsContent = () => {
  if (!controlsWrapper || !currentEditorState) return;

  const { buildingExternalId, floors, selectedFloor, rooms, selectedRoom, mode } = currentEditorState;
  const floorSummary = floors.find((f) => f.floor === selectedFloor);
  const roomCount = floorSummary?.totalCount || rooms.length;

  controlsWrapper.innerHTML = "";

  const header = document.createElement("div");
  header.className = "room-editor-header";
  header.innerHTML = `
    <span style="font-size: 13px; font-weight: 600;">Editor: ${escapeHtml(buildingExternalId)}</span>
    <span style="font-size: 12px; color: #6b7280;">${roomCount} sala(s) piso ${selectedFloor >= 0 ? selectedFloor : "S" + Math.abs(selectedFloor)}</span>
  `;
  controlsWrapper.appendChild(header);

  const floorRow = document.createElement("div");
  floorRow.className = "room-editor-floor-row";
  for (const f of floors) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dashboard-link room-editor-floor-btn${f.floor === selectedFloor ? " is-active" : ""}`;
    btn.textContent = `${f.floor >= 0 ? f.floor : "S" + Math.abs(f.floor)} (${f.totalCount})`;
    btn.addEventListener("click", () => selectRoomEditorFloor(f.floor));
    floorRow.appendChild(btn);
  }
  controlsWrapper.appendChild(floorRow);

  const toolsRow = document.createElement("div");
  toolsRow.className = "room-editor-tools-row";

  const toolDefs = [
    { id: "select", label: "Seleccionar", icon: "&#128070;" },
    { id: "draw-rect", label: "Rectangulo", icon: "&#9645;" },
    { id: "draw-polygon", label: "Poligono", icon: "&#9651;" },
  ];

  for (const t of toolDefs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dashboard-link building-tool-button room-editor-tool-btn${mode === t.id ? " is-active" : ""}`;
    btn.innerHTML = `<span class="map-tool-button-icon" aria-hidden="true">${t.icon}</span><span>${t.label}</span>`;
    btn.addEventListener("click", () => selectRoomMode(t.id));
    toolsRow.appendChild(btn);
  }

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "dashboard-link building-tool-button room-editor-tool-btn";
  deleteBtn.innerHTML = '<span class="map-tool-button-icon" aria-hidden="true">&#128465;</span><span>Eliminar</span>';
  deleteBtn.disabled = !selectedRoom;
  deleteBtn.style.opacity = selectedRoom ? "1" : "0.5";
  deleteBtn.addEventListener("click", () => deleteSelectedRoom());
  toolsRow.appendChild(deleteBtn);

  const undoBtn = document.createElement("button");
  undoBtn.type = "button";
  undoBtn.className = "dashboard-link building-tool-button room-editor-tool-btn";
  undoBtn.innerHTML = '<span class="map-tool-button-icon" aria-hidden="true">&#8617;</span><span>Deshacer</span>';
  undoBtn.disabled = undoStack.length === 0;
  undoBtn.style.opacity = undoStack.length > 0 ? "1" : "0.5";
  undoBtn.addEventListener("click", () => undoRoomEditor());
  toolsRow.appendChild(undoBtn);

  const suggestBtn = document.createElement("button");
  suggestBtn.type = "button";
  suggestBtn.className = `dashboard-link building-tool-button room-editor-tool-btn${mode === "suggest" ? " is-active" : ""}`;
  suggestBtn.innerHTML = '<span class="map-tool-button-icon" aria-hidden="true">&#10024;</span><span>Sugerir</span>';
  suggestBtn.addEventListener("click", () => showSuggestionPanel());
  toolsRow.appendChild(suggestBtn);

  controlsWrapper.appendChild(toolsRow);

  if (mode === "suggest") {
    controlsWrapper.appendChild(buildSuggestionPanel());
  } else if (selectedRoom) {
    controlsWrapper.appendChild(buildPropertiesPanel(selectedRoom));
  } else {
    const hint = document.createElement("div");
    hint.className = "room-editor-hint";
    hint.textContent = "Selecciona una sala para ver sus propiedades";
    controlsWrapper.appendChild(hint);
  }

  const actions = document.createElement("div");
  actions.className = "room-editor-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "dashboard-link action-cancel-button";
  cancelBtn.textContent = "Cancelar";
  cancelBtn.addEventListener("click", () => cancelRoomEditor());

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "dashboard-link action-save-button";
  saveBtn.textContent = "Guardar";
  saveBtn.addEventListener("click", () => saveRoomEditor());

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  controlsWrapper.appendChild(actions);
};

const buildPropertiesPanel = (room) => {
  const container = document.createElement("div");
  container.className = "room-editor-properties";

  container.innerHTML = `
    <div class="room-editor-section-title">Propiedades</div>
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

  container.querySelectorAll("[data-prop]").forEach((el) => {
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

  return container;
};

const buildSuggestionPanel = () => {
  const suggestions = currentEditorState?.suggestions || [];
  const approvedCount = suggestions.filter((s) => s.approved).length;

  const container = document.createElement("div");
  container.className = "room-editor-suggestion-panel";

  container.innerHTML = `
    <div class="room-editor-section-title" style="color:#7c3aed;">&#10024; Sugerencia de distribucion</div>
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

  const genBtn = document.createElement("button");
  genBtn.type = "button";
  genBtn.className = "dashboard-link action-save-button";
  genBtn.style.cssText = "width:100%;margin-bottom:8px;";
  genBtn.textContent = "Generar sugerencia";
  genBtn.addEventListener("click", () => runSuggestion());
  container.appendChild(genBtn);

  if (suggestions.length > 0) {
    const info = document.createElement("div");
    info.className = "room-editor-hint";
    info.textContent = `${approvedCount} de ${suggestions.length} sala(s) aprobada(s)`;
    container.appendChild(info);

    const btnRow = document.createElement("div");
    btnRow.className = "room-editor-actions";

    const approveAllBtn = document.createElement("button");
    approveAllBtn.type = "button";
    approveAllBtn.className = "dashboard-link action-cancel-button";
    approveAllBtn.textContent = "Aprobar todas";
    approveAllBtn.addEventListener("click", () => approveAllSuggestions());

    const saveSugBtn = document.createElement("button");
    saveSugBtn.type = "button";
    saveSugBtn.className = "dashboard-link action-save-button";
    saveSugBtn.textContent = "Guardar aprobadas";
    saveSugBtn.addEventListener("click", () => saveSuggestions());

    btnRow.appendChild(approveAllBtn);
    btnRow.appendChild(saveSugBtn);
    container.appendChild(btnRow);

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
    container.appendChild(list);
  } else {
    const hint = document.createElement("div");
    hint.className = "room-editor-hint";
    hint.textContent = 'Configura los parametros y haz clic en "Generar sugerencia"';
    container.appendChild(hint);
  }

  return container;
};

const renderBuildingBoundary = (geometry) => {
  clearBuildingBoundary();

  if (!geometry || !geometry.coordinates) return;

  const coords = geometry.coordinates[0];
  const latLngs = coords.map((c) => [c[1], c[0]]);

  currentEditorState.buildingPolygonLayer = L.polygon(latLngs, {
    color: "#1e40af",
    weight: 3,
    fillColor: "#1e40af",
    fillOpacity: 0.08,
    dashArray: "8 4",
    interactive: false,
  }).addTo(map);
};

const clearBuildingBoundary = () => {
  if (currentEditorState?.buildingPolygonLayer) {
    map.removeLayer(currentEditorState.buildingPolygonLayer);
    currentEditorState.buildingPolygonLayer = null;
  }
};

const renderRooms = () => {
  clearRoomLayers();

  if (!currentEditorState) return;

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
      }).addTo(map);

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
  if (!currentEditorState) return;
  for (const layer of currentEditorState.roomLayers) {
    map.removeLayer(layer);
  }
  currentEditorState.roomLayers = [];
  clearVertexMarkers();
};

const renderVertexMarkers = (latLngs, room) => {
  clearVertexMarkers();

  for (let i = 0; i < latLngs.length - 1; i++) {
    const marker = L.marker(latLngs[i], {
      icon: L.divIcon({
        className: VERTEX_CLASS,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      }),
      draggable: true,
    }).addTo(map);

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
  if (!currentEditorState) return;
  for (const marker of currentEditorState.vertexMarkers) {
    map.removeLayer(marker);
  }
  currentEditorState.vertexMarkers = [];
};

const selectRoom = (room) => {
  if (!currentEditorState) return;
  currentEditorState.selectedRoom = room;
  renderRooms();
  updateControlsContent();
};

const selectRoomEditorFloor = async (floor) => {
  if (!currentEditorState) return;
  currentEditorState.selectedFloor = floor;
  currentEditorState.selectedRoom = null;
  clearDrawState();
  await loadRoomsForFloor(currentEditorState.buildingExternalId, floor);
  renderRooms();
  updateControlsContent();
};

const selectRoomMode = (mode) => {
  if (!currentEditorState) return;
  clearDrawState();
  currentEditorState.mode = mode;
  updateControlsContent();

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
  if (!currentEditorState) return;
  clearDrawState();
  currentEditorState.mode = "draw-rect";
  currentEditorState.drawPoints = [];

  const onClick = (e) => {
    currentEditorState.drawPoints.push(e.latlng);
    if (currentEditorState.drawPoints.length === 1) {
      setAdminMapToolsStatus("Ahora haz clic para colocar la esquina inferior derecha.");
      currentEditorState.drawPreviewLine = L.circleMarker(e.latlng, {
        radius: 4, color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 1,
      }).addTo(map);
    } else if (currentEditorState.drawPoints.length === 2) {
      map.off("click", onClick);
      map.off("mousemove", onMove);
      if (currentEditorState.drawPreviewLine) {
        map.removeLayer(currentEditorState.drawPreviewLine);
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

  map.on("click", onClick);
  map.on("mousemove", onMove);

  const p = map.getCenter();
  currentEditorState.previewLayer = L.polygon(
    [[p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng], [p.lat, p.lng]],
    { color: "#f59e0b", weight: 2, fillColor: "#f59e0b", fillOpacity: 0.25, dashArray: "6 6", interactive: false }
  ).addTo(map);
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
  if (!currentEditorState) return;
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
      }).addTo(map);
    }
  };

  const onDblClick = (e) => {
    L.DomEvent.stop(e);
    map.off("click", onClick);
    map.off("dblclick", onDblClick);

    if (currentEditorState.previewLayer) {
      map.removeLayer(currentEditorState.previewLayer);
      currentEditorState.previewLayer = null;
    }

    if (tempLatLngs.length >= 3) {
      const closedRing = [...tempLatLngs, tempLatLngs[0]];
      const geoJsonCoords = closedRing.map((ll) => [ll[1], ll[0]]);
      createNewRoom(geoJsonCoords);
    }
  };

  map.on("click", onClick);
  map.on("dblclick", onDblClick);
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
  updateControlsContent();
  setAdminMapToolsStatus("Sala creada. Completa las propiedades y guarda.");
};

const clearDrawState = () => {
  if (!currentEditorState) return;
  if (currentEditorState.previewLayer) {
    map.removeLayer(currentEditorState.previewLayer);
    currentEditorState.previewLayer = null;
  }
  if (currentEditorState.drawPreviewLine) {
    map.removeLayer(currentEditorState.drawPreviewLine);
    currentEditorState.drawPreviewLine = null;
  }
  currentEditorState.drawPoints = [];
  map.off("click");
  map.off("dblclick");
  map.off("mousemove");
};

const deleteSelectedRoom = () => {
  if (!currentEditorState?.selectedRoom) return;

  const room = currentEditorState.selectedRoom;
  pushUndo({ type: "delete-room", room });

  currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== room.externalId);
  currentEditorState.selectedRoom = null;
  currentEditorState.isDirty = true;
  renderRooms();
  updateControlsContent();
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
  updateControlsContent();
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
  updateControlsContent();
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
    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState.buildingExternalId } }));

    setTimeout(() => {
      cancelRoomEditor();
    }, 1000);
  } catch (error) {
    console.error("Error saving rooms:", error);
    setAdminMapToolsStatus("Error al guardar salas.");
  }
};

const cancelRoomEditor = () => {
  clearDrawState();
  clearRoomLayers();
  clearBuildingBoundary();
  removeEditorControls();
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
  updateControlsContent();
};

const runSuggestion = async () => {
  if (!currentEditorState) return;

  const pattern = controlsWrapper?.querySelector("[data-suggest='pattern']")?.value || "grid";
  const count = parseInt(controlsWrapper?.querySelector("[data-suggest='count']")?.value) || 6;
  const corridor = parseFloat(controlsWrapper?.querySelector("[data-suggest='corridor']")?.value) || 1.5;
  const prefix = controlsWrapper?.querySelector("[data-suggest='prefix']")?.value || "Box";
  const roomType = controlsWrapper?.querySelector("[data-suggest='type']")?.value || "box";
  const rows = parseInt(controlsWrapper?.querySelector("[data-suggest='rows']")?.value) || 0;

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
    updateControlsContent();
    setAdminMapToolsStatus(`${suggestions.length} sala(s) sugerida(s). Revisa y aprueba las que desees guardar.`);
  } catch (error) {
    console.error("Error running suggestion:", error);
    setAdminMapToolsStatus("Error al generar sugerencias.");
  }
};

const renderSuggestionPreviewLayers = () => {
  if (!currentEditorState?.suggestions) return;

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
    }).addTo(map);

    layer.on("click", (e) => {
      L.DomEvent.stop(e);
      toggleSuggestionApproval(i);
    });

    currentEditorState.suggestionPreviewLayers.push(layer);
  }
};

const clearSuggestionPreviewLayers = () => {
  if (!currentEditorState) return;
  for (const layer of currentEditorState.suggestionPreviewLayers || []) {
    map.removeLayer(layer);
  }
  currentEditorState.suggestionPreviewLayers = [];
};

const approveSuggestion = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = true;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateControlsContent();
};

const rejectSuggestion = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = false;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateControlsContent();
};

const toggleSuggestionApproval = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = !currentEditorState.suggestions[index].approved;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateControlsContent();
};

const approveAllSuggestions = () => {
  if (!currentEditorState?.suggestions) return;
  for (const sug of currentEditorState.suggestions) {
    sug.approved = true;
  }
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  updateControlsContent();
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
    updateControlsContent();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState.buildingExternalId } }));
  } catch (error) {
    console.error("Error saving suggestions:", error);
    setAdminMapToolsStatus("Error al guardar sugerencias.");
  }
};
