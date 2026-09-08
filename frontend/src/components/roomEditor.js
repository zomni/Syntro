import { map, BACKEND_API_URL } from "../views/map.js";
import {
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
} from "./adminMapToolsPanel.js";

const EDITOR_OVERLAY_CLASS = "room-editor-overlay";
const VERTEX_CLASS = "room-editor-vertex-marker";
const PREVIEW_CLASS = "room-editor-preview-polygon";
const SELECTED_CLASS = "room-editor-selected";
const ROOM_LAYER_CLASS = "room-editor-room-layer";

let currentEditorState = null;
let undoStack = [];
let redoStack = [];

const getApiUrl = () => {
  return BACKEND_API_URL || "http://localhost:5002";
};

export const initRoomEditor = () => {
  window.openRoomEditor = openRoomEditor;
  window.selectRoomEditorFloor = selectRoomEditorFloor;
  window.startRoomDrawRect = startRoomDrawRect;
  window.startRoomDrawPolygon = startRoomDrawPolygon;
  window.selectRoomMode = selectRoomMode;
  window.deleteSelectedRoom = deleteSelectedRoom;
  window.saveRoomEditor = saveRoomEditor;
  window.cancelRoomEditor = cancelRoomEditor;
  window.undoRoomEditor = undoRoomEditor;
  window.redoRoomEditor = redoRoomEditor;
  window.updateRoomProperty = updateRoomProperty;
  window.showSuggestionPanel = showSuggestionPanel;
  window.runSuggestion = runSuggestion;
  window.approveSuggestion = approveSuggestion;
  window.rejectSuggestion = rejectSuggestion;
  window.approveAllSuggestions = approveAllSuggestions;
  window.saveSuggestions = saveSuggestions;
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
    };

    undoStack = [];
    redoStack = [];

    zoomToBuilding(buildingData);
    showEditorModal();
    await loadRoomsForFloor(buildingExternalId, selectedFloor);
    renderBuildingBoundary(buildingData);
    renderRooms();
    renderEditorContent();

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

const showEditorModal = () => {
  removeEditorModal();

  const backdrop = document.createElement("div");
  backdrop.id = "room-editor-backdrop";
  backdrop.className = "room-editor-backdrop";
  backdrop.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.5); z-index: 1500;
    display: flex; align-items: flex-start; justify-content: center;
    padding-top: 60px;
  `;

  const modal = document.createElement("div");
  modal.id = "room-editor-modal";
  modal.className = "room-editor-modal";
  modal.style.cssText = `
    background: white; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    width: min(480px, calc(100vw - 24px)); max-height: calc(100vh - 120px);
    overflow-y: auto; font-family: inherit;
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cancelRoomEditor();
  });
};

const removeEditorModal = () => {
  document.getElementById("room-editor-backdrop")?.remove();
};

const renderEditorContent = () => {
  const modal = document.getElementById("room-editor-modal");
  if (!modal || !currentEditorState) return;

  const { buildingExternalId, floors, selectedFloor, rooms, selectedRoom, mode } = currentEditorState;
  const floorSummary = floors.find((f) => f.floor === selectedFloor);
  const roomCount = floorSummary?.totalCount || rooms.length;

  modal.innerHTML = `
    <div style="padding: 16px; border-bottom: 1px solid #e5e7eb;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 600;">Editor de Salas</h3>
        <button onclick="cancelRoomEditor()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #6b7280;">&times;</button>
      </div>
      <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">
        Edificio: ${buildingExternalId}
      </div>
    </div>

    <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="font-size: 13px; font-weight: 500;">Piso:</span>
        ${floors
          .map(
            (f) => `
          <button onclick="selectRoomEditorFloor(${f.floor})"
            style="padding: 4px 12px; border-radius: 16px; border: 1px solid ${f.floor === selectedFloor ? "#2563eb" : "#d1d5db"};
            background: ${f.floor === selectedFloor ? "#2563eb" : "white"}; color: ${f.floor === selectedFloor ? "white" : "#374151"};
            font-size: 12px; cursor: pointer;">
          ${f.floor >= 0 ? f.floor : "S" + Math.abs(f.floor)} (${f.totalCount})
        </button>`
          )
          .join("")}
      </div>
      <div style="font-size: 12px; color: #6b7280; margin-top: 6px;">
        ${roomCount} sala(s) en este piso
      </div>
    </div>

    <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
      <div style="display: flex; gap: 6px; flex-wrap: wrap;">
        <button onclick="selectRoomMode('select')" class="room-tool-btn ${mode === "select" ? "active" : ""}"
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid ${mode === "select" ? "#2563eb" : "#d1d5db"};
          background: ${mode === "select" ? "#eff6ff" : "white"}; font-size: 12px; cursor: pointer;">
          &#128070; Seleccionar
        </button>
        <button onclick="startRoomDrawRect()" class="room-tool-btn ${mode === "draw-rect" ? "active" : ""}"
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid ${mode === "draw-rect" ? "#2563eb" : "#d1d5db"};
          background: ${mode === "draw-rect" ? "#eff6ff" : "white"}; font-size: 12px; cursor: pointer;">
          &#9645; Rectangulo
        </button>
        <button onclick="startRoomDrawPolygon()" class="room-tool-btn ${mode === "draw-polygon" ? "active" : ""}"
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid ${mode === "draw-polygon" ? "#2563eb" : "#d1d5db"};
          background: ${mode === "draw-polygon" ? "#eff6ff" : "white"}; font-size: 12px; cursor: pointer;">
          &#9651; Poligono
        </button>
        <button onclick="deleteSelectedRoom()" ${!selectedRoom ? "disabled" : ""}
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid #d1d5db;
          background: white; font-size: 12px; cursor: ${selectedRoom ? "pointer" : "not-allowed"}; opacity: ${selectedRoom ? 1 : 0.5};">
          &#128465; Eliminar
        </button>
        <button onclick="undoRoomEditor()" ${undoStack.length === 0 ? "disabled" : ""}
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid #d1d5db;
          background: white; font-size: 12px; cursor: ${undoStack.length > 0 ? "pointer" : "not-allowed"}; opacity: ${undoStack.length > 0 ? 1 : 0.5};">
          &#8617; Deshacer
        </button>
        <button onclick="showSuggestionPanel()" class="room-tool-btn ${mode === "suggest" ? "active" : ""}"
          style="padding: 6px 10px; border-radius: 6px; border: 1px solid ${mode === "suggest" ? "#7c3aed" : "#d1d5db"};
          background: ${mode === "suggest" ? "#f5f3ff" : "white"}; font-size: 12px; cursor: pointer;">
          &#10024; Sugerir
        </button>
      </div>
    </div>

    ${mode === "suggest" ? renderSuggestionPanel() : ""}

    ${mode !== "suggest" ? (selectedRoom ? renderPropertiesPanel(selectedRoom) : '<div style="padding: 16px; color: #9ca3af; font-size: 13px; text-align: center;">Selecciona una sala para ver sus propiedades</div>') : ""}

    <div style="padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; justify-content: flex-end;">
      <button onclick="cancelRoomEditor()"
        style="padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; background: white; font-size: 13px; cursor: pointer;">
        Cancelar
      </button>
      <button onclick="saveRoomEditor()"
        style="padding: 8px 16px; border-radius: 6px; border: none; background: #15803d; color: white; font-size: 13px; cursor: pointer;">
        Guardar
      </button>
    </div>
  `;
};

const renderPropertiesPanel = (room) => {
  if (!room) return "";

  return `
    <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
      <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Propiedades</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Nombre *</label>
          <input value="${escapeHtml(room.displayName || "")}" onchange="updateRoomProperty('displayName', this.value)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Tipo</label>
          <select onchange="updateRoomProperty('type', this.value)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
            <option value="sala" ${room.type === "sala" ? "selected" : ""}>Sala</option>
            <option value="oficina" ${room.type === "oficina" ? "selected" : ""}>Oficina</option>
            <option value="box" ${room.type === "box" ? "selected" : ""}>Box</option>
            <option value="bodega" ${room.type === "bodega" ? "selected" : ""}>Bodega</option>
            <option value="estacion_enfermeria" ${room.type === "estacion_enfermeria" ? "selected" : ""}>Est. Enfermeria</option>
            <option value="pasillo" ${room.type === "pasillo" ? "selected" : ""}>Pasillo</option>
            <option value="otro" ${room.type === "otro" ? "selected" : ""}>Otro</option>
          </select>
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Unidad</label>
          <input value="${escapeHtml(room.unit || "")}" onchange="updateRoomProperty('unit', this.value)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Servicio</label>
          <input value="${escapeHtml(room.service || "")}" onchange="updateRoomProperty('service', this.value)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Estado</label>
          <select onchange="updateRoomProperty('status', this.value)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
            <option value="active" ${room.status === "active" ? "selected" : ""}>Activa</option>
            <option value="closed" ${room.status === "closed" ? "selected" : ""}>Cerrada</option>
            <option value="review" ${room.status === "review" ? "selected" : ""}>En revision</option>
            <option value="temporary" ${room.status === "temporary" ? "selected" : ""}>Temporal</option>
          </select>
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Capacidad</label>
          <input type="number" value="${room.capacity || ""}" onchange="updateRoomProperty('capacity', parseInt(this.value) || null)"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
      </div>
      <div style="margin-top: 8px;">
        <label style="font-size: 11px; color: #6b7280; display: block;">Notas</label>
        <textarea onchange="updateRoomProperty('notes', this.value)"
          style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; min-height: 40px;"
        >${escapeHtml(room.notes || "")}</textarea>
      </div>
      <div style="font-size: 11px; color: #9ca3af; margin-top: 6px;">
        Fuente: ${room.source || "synced"} | ID: ${room.externalId}
      </div>
    </div>
  `;
};

const renderSuggestionPanel = () => {
  const suggestions = currentEditorState?.suggestions || [];
  const approvedCount = suggestions.filter((s) => s.approved).length;

  return `
    <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; background: #f5f3ff;">
      <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: #7c3aed;">&#10024; Sugerencia de distribucion</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Patron</label>
          <select id="suggest-pattern"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
            <option value="grid">Cuadricula</option>
            <option value="corridor-central">Pasillo central</option>
            <option value="corridor-lateral">Pasillo lateral</option>
            <option value="perimeter">Perimetral</option>
          </select>
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Cantidad</label>
          <input id="suggest-count" type="number" value="6" min="1" max="100"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Pasillo (m)</label>
          <input id="suggest-corridor" type="number" value="1.5" min="0" step="0.5"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Prefijo</label>
          <input id="suggest-prefix" value="Box"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Tipo</label>
          <select id="suggest-type"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;">
            <option value="box">Box</option>
            <option value="sala">Sala</option>
            <option value="oficina">Oficina</option>
          </select>
        </div>
        <div>
          <label style="font-size: 11px; color: #6b7280; display: block;">Filas (0=auto)</label>
          <input id="suggest-rows" type="number" value="0" min="0"
            style="width: 100%; padding: 4px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px;" />
        </div>
      </div>
      <button onclick="runSuggestion()"
        style="width: 100%; padding: 8px; border-radius: 6px; border: none; background: #7c3aed; color: white; font-size: 12px; cursor: pointer; margin-bottom: 8px;">
        Generar sugerencia
      </button>
      ${suggestions.length > 0 ? `
        <div style="font-size: 12px; color: #374151; margin-bottom: 6px;">
          ${approvedCount} de ${suggestions.length} sala(s) aprobada(s)
        </div>
        <div style="display: flex; gap: 6px; margin-bottom: 8px;">
          <button onclick="approveAllSuggestions()"
            style="flex: 1; padding: 6px; border-radius: 4px; border: 1px solid #d1d5db; background: white; font-size: 11px; cursor: pointer;">
            Aprobar todas
          </button>
          <button onclick="saveSuggestions()"
            style="flex: 1; padding: 6px; border-radius: 4px; border: none; background: #15803d; color: white; font-size: 11px; cursor: pointer;">
            Guardar aprobadas
          </button>
        </div>
        <div style="max-height: 200px; overflow-y: auto;">
          ${suggestions.map((s, i) => `
            <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; border-bottom: 1px solid #e5e7eb; font-size: 12px;">
              <input type="checkbox" ${s.approved ? "checked" : ""}
                onchange="${s.approved ? `rejectSuggestion(${i})` : `approveSuggestion(${i})`}"
                style="cursor: pointer;" />
              <span style="flex: 1; ${s.approved ? "" : "text-decoration: line-through; color: #9ca3af;"}">
                ${escapeHtml(s.displayName)} (${s.type})
              </span>
            </div>
          `).join("")}
        </div>
      ` : '<div style="font-size: 12px; color: #9ca3af; text-align: center;">Configura los parametros y haz clic en "Generar sugerencia"</div>'}
    </div>
  `;
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
  renderEditorContent();
};

const selectRoomEditorFloor = async (floor) => {
  if (!currentEditorState) return;
  currentEditorState.selectedFloor = floor;
  currentEditorState.selectedRoom = null;
  clearDrawState();
  await loadRoomsForFloor(currentEditorState.buildingExternalId, floor);
  renderRooms();
  renderEditorContent();
};

const selectRoomMode = (mode) => {
  if (!currentEditorState) return;
  clearDrawState();
  currentEditorState.mode = mode;
  renderEditorContent();
};

const startRoomDrawRect = () => {
  if (!currentEditorState) return;
  clearDrawState();
  currentEditorState.mode = "draw-rect";
  currentEditorState.drawPoints = [];
  setAdminMapToolsStatus("Haz clic para colocar la esquina superior izquierda del rectangulo.");
  renderEditorContent();

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

  const p = currentEditorState.drawPoints[0] || map.getCenter();
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
  setAdminMapToolsStatus("Haz clic para agregar puntos. Doble clic para cerrar el poligono.");
  renderEditorContent();

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
  renderEditorContent();
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
  renderEditorContent();
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
  renderEditorContent();
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
  renderEditorContent();
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
  removeEditorModal();
  currentEditorState = null;
  undoStack = [];
  redoStack = [];
  requestAdminMapToolMode(null);
  setAdminMapToolsStatus("");
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
  renderEditorContent();
};

const runSuggestion = async () => {
  if (!currentEditorState) return;

  const pattern = document.getElementById("suggest-pattern")?.value || "grid";
  const count = parseInt(document.getElementById("suggest-count")?.value) || 6;
  const corridor = parseFloat(document.getElementById("suggest-corridor")?.value) || 1.5;
  const prefix = document.getElementById("suggest-prefix")?.value || "Box";
  const roomType = document.getElementById("suggest-type")?.value || "box";
  const rows = parseInt(document.getElementById("suggest-rows")?.value) || 0;
  const cols = parseInt(document.getElementById("suggest-cols")?.value) || 0;

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
        columns: cols,
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
    renderEditorContent();
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
  renderEditorContent();
};

const rejectSuggestion = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = false;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  renderEditorContent();
};

const toggleSuggestionApproval = (index) => {
  if (!currentEditorState?.suggestions?.[index]) return;
  currentEditorState.suggestions[index].approved = !currentEditorState.suggestions[index].approved;
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  renderEditorContent();
};

const approveAllSuggestions = () => {
  if (!currentEditorState?.suggestions) return;
  for (const sug of currentEditorState.suggestions) {
    sug.approved = true;
  }
  clearSuggestionPreviewLayers();
  renderSuggestionPreviewLayers();
  renderEditorContent();
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
    renderEditorContent();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: currentEditorState.buildingExternalId } }));
  } catch (error) {
    console.error("Error saving suggestions:", error);
    setAdminMapToolsStatus("Error al guardar sugerencias.");
  }
};
