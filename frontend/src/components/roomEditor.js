import { BACKEND_API_URL } from "../views/map.js";
import { refreshCurrentMapData } from "@app/goToCampus";
import {
  requestAdminMapToolMode,
  setAdminMapToolsStatus,
  getAdminMapToolSection,
  removeAdminMapToolSection,
} from "./adminMapToolsPanel.js";
import {
  pointInRing,
  snapToReferences,
  buildSnapRefs,
  simplifyRing,
  distanceMeters,
  generateContourRooms,
} from "../utils/roomEditorGeometry.js";
import { STATIC_ICON_KEYS, staticIconUrl, staticIconLabel, STATIC_MARKER_ICON_SIZE } from "../config/staticIconCatalog.js";
import { appConfirm } from "../utils/appDialog.js";

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
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>',
  square: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="1"/></svg>',
  circle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>',
  free: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12,2 22,8.5 19,20 5,20 2,8.5"/></svg>',
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 0 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  suggest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74L12 2z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  paste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
  snap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v8"/><path d="M8 6l4-4 4 4"/><circle cx="12" cy="16" r="4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M12 20v2"/></svg>',
  marker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  copyLayout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="14" height="14" rx="2"/><path d="M4 8H2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/></svg>',
  pasteLayout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/></svg>',
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
let copiedFloorLayout = null;
let copiedFloorNumber = null;
let dropdownClickOutsideHandler = null;
let isPaletteDragging = false;

const getApiUrl = () => {
  return BACKEND_API_URL || "http://localhost:5001";
};

const loadSession = async () => {
  try {
    const response = await fetch(`${getApiUrl()}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const readSelectedMapFloor = () => {
  const button = document.querySelector(
    "#floorButtons-container .selectedFloorButton, #map-floor-filter-buttons .selectedFloorButton"
  );
  if (!button) return null;
  const parsed = parseInt(button.textContent.trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const initRoomEditor = async () => {
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
  window.copyFloorLayout = copyFloorLayout;
  window.pasteFloorLayout = pasteFloorLayout;

  listenForBuildingClick();
  syncRoomEditorForSession(await loadSession());
};

export const syncRoomEditorForSession = (session) => {
  if (session?.isAdmin) {
    createToggleButton();
  }
};

window.addEventListener("syntro-session-changed", (event) => {
  const session = event.detail || {};
  if (session?.isAdmin) {
    createToggleButton();
    return;
  }
  cancelRoomEditor();
  removeAdminMapToolSection("rooms");
});

const createToggleButton = () => {
  const sectionBody = getAdminMapToolSection("rooms");
  if (!sectionBody || document.getElementById("room-editor-toggle")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "admin-map-tools-group";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "room-editor-toggle";
  button.className = "dashboard-link manual-building-editor-button building-tool-button is-icon-only";
  button.title = "Editar forma";
  button.setAttribute("aria-label", "Editar forma");
  button.innerHTML = '<span class="map-tool-button-icon" aria-hidden="true">&#9635;</span>';
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

    const floors = floorsData.length > 0 ? floorsData : [{ floor: 1, totalCount: 0 }];
    const mapFloor = readSelectedMapFloor();
    const selectedFloor = floors.find((f) => Number(f.floor) === mapFloor)?.floor ?? floors[0].floor;

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
      markers: [],
      selectedRoom: null,
      selectedMarker: null,
      selectedRoomIds: [],
      mode: "select",
      isDirty: false,
      buildingPolygonLayer: null,
      roomLayers: [],
      markerLayers: [],
      previewLayer: null,
      drawPoints: [],
      drawVertexMarkers: [],
      suggestions: [],
      suggestionPreviewLayers: [],
      removedExternalIds: [],
      removedManualRoomExternalIds: [],
      removedSyncedRoomExternalIds: [],
      removedMarkerExternalIds: [],
      roomSignatures: {},
      pendingMarkerIcon: null,
      paletteOpen: false,
      dragging: null,
      rotating: null,
      snapEnabled: true,
      snapPreviewMarker: null,
      snapRefs: null,
      dropdownOpen: false,
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
        currentEditorState.selectedRoomIds = [];
        if (popupMap) {
          popupMap.dragging.enable();
          popupMap.keyboard.enable();
        }
        updatePopupContent();
        updateSidePanel();
        updateBottomBar();
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
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      if (currentEditorState.selectedMarker && getSelectedRoomIds().length === 0) {
        deleteSelectedMarker();
        updateSidePanel();
      } else {
        deleteSelectedRoom();
      }
    } else if (e.key === "g" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      saveRoomEditor();
    } else if (e.key === "h" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      selectRoomMode("draw-hand");
    } else if (e.key === "b" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      selectRoomMode("draw-square");
    } else if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      selectRoomMode("draw-rect");
    } else if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      selectRoomMode("draw-circle");
    } else if (e.key === "l" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      selectRoomMode("draw-free");
    } else if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "SELECT") return;
      e.preventDefault();
      toggleSnap();
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

const fetchMarkersForFloor = async (buildingExternalId, floor) => {
  const response = await fetch(
    `${getApiUrl()}/api/map-markers?buildingExternalId=${encodeURIComponent(buildingExternalId)}&floor=${floor}`,
    { credentials: "include", cache: "no-store" }
  );
  if (!response.ok) return [];
  return response.json();
};

const loadRoomsForFloor = async (buildingExternalId, floor) => {
  currentEditorState.rooms = await fetchRoomsForFloor(buildingExternalId, floor);
  currentEditorState.roomSignatures = {};
  for (const room of currentEditorState.rooms) {
    if (room.isManual === true) {
      currentEditorState.roomSignatures[room.externalId] = buildRoomSaveSignature(room);
    }
  }
  currentEditorState.markers = await fetchMarkersForFloor(buildingExternalId, floor);
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

  dropdownClickOutsideHandler = (e) => {
    if (currentEditorState?.paletteOpen && !e.target.closest(".room-editor-icon-wrapper")) {
      closeIconPalette();
      updateBottomBar();
    }
    if (!currentEditorState?.dropdownOpen) return;
    if (!e.target.closest(".room-editor-suggest-wrapper")) {
      closeDropdown();
      updateBottomBar();
    }
  };
  document.addEventListener("click", dropdownClickOutsideHandler);
};

const destroyPopup = () => {
  removeKeyboardShortcuts();
  if (dropdownClickOutsideHandler) {
    document.removeEventListener("click", dropdownClickOutsideHandler);
    dropdownClickOutsideHandler = null;
  }
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
    scrollWheelZoom: false,
    doubleClickZoom: false,
    touchZoom: false,
    minZoom: 12,
    maxZoom: 22,
  });

  L.tileLayer(TILE_URL, {
    maxNativeZoom: 19,
    maxZoom: 22,
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
      popupMap.fitBounds(bounds, { padding: [20, 20], maxZoom: 22 });
    }
  }

  popupMap.whenReady(() => {
    popupMap.invalidateSize();
    popupMap.setMinZoom(Math.min(popupMap.getZoom(), 22));
  });

  popupMap.on("click", handleMapDeselectClick);

  const container = popupMap.getContainer();
  container.addEventListener("mousedown", handleBoxSelectStart);
  container.addEventListener("dragover", (e) => {
    if (!currentEditorState) return;
    const types = e.dataTransfer?.types;
    if (types && Array.from(types).includes("text/plain")) {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    }
  });
  container.addEventListener("drop", (e) => {
    const draggedKey = e.dataTransfer?.getData("text/plain");
    if (!currentEditorState || !popupMap || !STATIC_ICON_KEYS.includes(draggedKey)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = container.getBoundingClientRect();
    const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
    const latlng = popupMap.containerPointToLatLng(point);
    stopMarkerPlacement();
    placeMarkerAt(latlng, draggedKey);
  });
};

const handleBoxSelectStart = (e) => {
  if (!currentEditorState || !popupMap || currentEditorState.mode !== "select") return;
  if (e.button !== 0) return;
  if (e.target?.closest?.(".room-editor-marker-icon")) return;

  e.preventDefault();
  const container = popupMap.getContainer();
  const rect = container.getBoundingClientRect();
  const startPoint = L.point(e.clientX - rect.left, e.clientY - rect.top);
  const startLatLng = popupMap.containerPointToLatLng(startPoint);

  const box = L.rectangle(L.latLngBounds(startLatLng, startLatLng), {
    color: "#7c3aed",
    weight: 1.5,
    dashArray: "6 6",
    fillColor: "#7c3aed",
    fillOpacity: 0.1,
    interactive: false,
  }).addTo(popupMap);

  popupMap.dragging.disable();
  container.style.cursor = "crosshair";
  let active = true;

  const onMove = (ev) => {
    if (!active) return;
    box.setBounds(L.latLngBounds(startLatLng, ev.latlng));
  };

  const onUp = (ev) => {
    if (!active) return;
    active = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    const endPoint = popupMap.latLngToContainerPoint(ev.latlng);
    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    const bounds = box.getBounds();
    popupMap.removeLayer(box);
    popupMap.dragging.enable();
    container.style.cursor = "";
    if (dx < 5 && dy < 5) return;
    applyBoxSelection(bounds, !!(ev.originalEvent?.ctrlKey || ev.originalEvent?.metaKey));
  };

  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const applyBoxSelection = (bounds, ctrlAdd) => {
  const rooms = currentEditorState.rooms || [];
  const hitRooms = rooms.filter((room) => {
    const layer = currentEditorState.roomLayers.find((l) => l.roomData === room);
    return layer && layer.getBounds().intersects(bounds);
  });
  const hitIds = hitRooms.map((r) => r.externalId);
  currentEditorState.selectedRoomIds = ctrlAdd
    ? Array.from(new Set([...getSelectedRoomIds(), ...hitIds]))
    : hitIds;
  syncSelectedRoomFromIds();
  currentEditorState.isDirty = true;

  currentEditorState._suppressDeselectClick = true;
  renderRooms();
  updatePopupContent();
  setAdminMapToolsStatus(`${hitIds.length} sala(s) seleccionadas. Ctrl+drag agrega al marco, G para guardar.`);
};

const handleMapDeselectClick = (e) => {
  if (!currentEditorState || !popupMap || currentEditorState.mode !== "select") return;
  if (currentEditorState._suppressDeselectClick) {
    currentEditorState._suppressDeselectClick = false;
    return;
  }
  const clickedOnRoom = currentEditorState.roomLayers?.some((layer) =>
    layer.getBounds?.().contains(e.latlng)
  );
  if (!clickedOnRoom && (currentEditorState.selectedRoom || currentEditorState.selectedMarker || getSelectedRoomIds().length > 0)) {
    currentEditorState.selectedRoomIds = [];
    currentEditorState.selectedRoom = null;
    currentEditorState.selectedMarker = null;
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
    renderRooms();
    updateSidePanel();
    updateBottomBar();
  }
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

  const layoutActions = document.createElement("div");
  layoutActions.className = "room-editor-layout-actions";

  const copyLayoutBtn = document.createElement("button");
  copyLayoutBtn.type = "button";
  copyLayoutBtn.className = "room-editor-tool-btn is-icon-only";
  copyLayoutBtn.innerHTML = `<span>${ICONS.copyLayout}</span>`;
  copyLayoutBtn.title = `Copiar layout de piso ${selectedFloor}`;
  copyLayoutBtn.disabled = rooms.length === 0;
  copyLayoutBtn.addEventListener("click", () => copyFloorLayout());
  layoutActions.appendChild(copyLayoutBtn);

  const canPaste = copiedFloorLayout && copiedFloorLayout.length > 0 && copiedFloorNumber !== selectedFloor;
  const pasteLayoutBtn = document.createElement("button");
  pasteLayoutBtn.type = "button";
  pasteLayoutBtn.className = "room-editor-tool-btn is-icon-only";
  pasteLayoutBtn.innerHTML = `<span>${ICONS.pasteLayout}</span>`;
  pasteLayoutBtn.title = canPaste ? `Pegar layout de piso ${copiedFloorNumber}` : "Primero copia un layout de otro piso";
  pasteLayoutBtn.disabled = !canPaste;
  pasteLayoutBtn.addEventListener("click", () => pasteFloorLayout());
  layoutActions.appendChild(pasteLayoutBtn);

  topBarEl.appendChild(layoutActions);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "room-editor-close-btn";
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "Cerrar editor";
  closeBtn.addEventListener("click", () => cancelRoomEditor());
  topBarEl.appendChild(closeBtn);
};

const updateBottomBar = () => {
  if (!bottomBarEl || !currentEditorState) return;
  if (isPaletteDragging) return;

  const { mode, selectedRoom, suggestions, snapEnabled } = currentEditorState;
  const hasSuggestions = suggestions && suggestions.length > 0;

  bottomBarEl.innerHTML = "";

  const tools = document.createElement("div");
  tools.className = "room-editor-tools";

  const toolDefs = [
    { id: "select", icon: ICONS.select, title: "Seleccionar (V)" },
    { id: "draw-square", icon: ICONS.square, title: "Cuadrado (B)" },
    { id: "draw-rect", icon: ICONS.rect, title: "Rectangulo (R)" },
    { id: "draw-circle", icon: ICONS.circle, title: "Circulo (C)" },
    { id: "draw-free", icon: ICONS.free, title: "Libre - vertices (L)" },
    { id: "draw-hand", icon: ICONS.hand, title: "Mano alzada (H)" },
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

  const snapBtn = document.createElement("button");
  snapBtn.type = "button";
  snapBtn.className = `room-editor-tool-btn is-icon-only${snapEnabled ? " is-snap-on" : ""}`;
  snapBtn.innerHTML = `<span>${ICONS.snap}</span>`;
  snapBtn.title = `Snap a contorno y muros (S) - ${snapEnabled ? "ON" : "OFF"}`;
  snapBtn.addEventListener("click", () => toggleSnap());
  tools.appendChild(snapBtn);

  const iconWrapper = document.createElement("div");
  iconWrapper.className = "room-editor-icon-wrapper";
  const iconBtn = document.createElement("button");
  iconBtn.type = "button";
  iconBtn.className = `room-editor-tool-btn is-icon-only${mode === "marker-place" ? " is-active" : ""}`;
  iconBtn.innerHTML = `<span>${ICONS.marker}</span>`;
  iconBtn.title = "Iconos: arrastra o haz click en un icono para colocarlo en el mapa";
  iconBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (mode === "marker-place") {
      stopMarkerPlacement();
    } else {
      toggleIconPalette();
    }
  });
  iconWrapper.appendChild(iconBtn);

  const palette = document.createElement("div");
  palette.className = `room-editor-icon-dropdown${currentEditorState.paletteOpen ? " is-open" : ""}`;

  const paletteHint = document.createElement("div");
  paletteHint.className = "room-editor-icon-dropdown-hint";
  paletteHint.textContent = "Elige un icono: click para colocarlo o arrastralo al mapa.";
  palette.appendChild(paletteHint);

  const paletteGrid = document.createElement("div");
  paletteGrid.className = "room-editor-icon-grid";
  for (const key of STATIC_ICON_KEYS) {
    const item = document.createElement("div");
    item.className = `room-editor-icon-item${currentEditorState.pendingMarkerIcon === key ? " is-active" : ""}`;
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
      isPaletteDragging = true;
      e.dataTransfer?.setData("text/plain", key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "copy";
    });
    item.addEventListener("dragend", () => {
      isPaletteDragging = false;
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
      toggleMarkerPlacement(key);
    });
    paletteGrid.appendChild(item);
  }
  palette.appendChild(paletteGrid);
  iconWrapper.appendChild(palette);
  tools.appendChild(iconWrapper);

  const divider1 = document.createElement("div");
  divider1.className = "room-editor-divider";
  tools.appendChild(divider1);

  const selectedCount = selectedRoom ? Math.max(getSelectedRoomIds().length, 1) : getSelectedRoomIds().length;
  const canOperate = selectedCount > 0;

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "room-editor-tool-btn is-icon-only";
  deleteBtn.innerHTML = `<span>${ICONS.delete}</span>`;
  deleteBtn.title = selectedCount > 1 ? `Eliminar ${selectedCount} elementos (Supr)` : "Eliminar elemento seleccionado (Supr)";
  deleteBtn.disabled = !canOperate;
  deleteBtn.addEventListener("click", () => deleteSelectedRoom());
  tools.appendChild(deleteBtn);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "room-editor-tool-btn is-icon-only";
  copyBtn.innerHTML = `<span>${ICONS.copy}</span>`;
  copyBtn.title = selectedCount > 1 ? `Copiar ${selectedCount} elementos (Ctrl+C)` : "Copiar elemento (Ctrl+C)";
  copyBtn.disabled = !canOperate;
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
  undoBtn.title = "Deshacer (Ctrl+Z)";
  undoBtn.disabled = undoStack.length === 0;
  undoBtn.addEventListener("click", () => undoRoomEditor());
  tools.appendChild(undoBtn);

  const divider2 = document.createElement("div");
  divider2.className = "room-editor-divider";
  tools.appendChild(divider2);

  const suggestWrapper = document.createElement("div");
  suggestWrapper.className = "room-editor-suggest-wrapper";
  const suggestBtn = document.createElement("button");
  suggestBtn.type = "button";
  suggestBtn.className = `room-editor-tool-btn is-icon-only is-suggest${hasSuggestions ? " is-active" : ""}`;
  suggestBtn.innerHTML = `<span>${ICONS.suggest}</span>`;
  suggestBtn.title = "Sugerencias";
  suggestBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown();
  });
  suggestWrapper.appendChild(suggestBtn);

  const dropdown = document.createElement("div");
  dropdown.className = `room-editor-dropdown${currentEditorState.dropdownOpen ? " is-open" : ""}`;

  const sugItem = document.createElement("div");
  sugItem.className = "room-editor-dropdown-item";
  sugItem.innerHTML = `${ICONS.suggest} Sugerir salas automaticamente`;
  sugItem.addEventListener("click", () => { runQuickSuggestion(); });
  dropdown.appendChild(sugItem);

  if (hasSuggestions) {
    const divider = document.createElement("div");
    divider.className = "room-editor-dropdown-divider";
    dropdown.appendChild(divider);

    const saveItem = document.createElement("div");
    saveItem.className = "room-editor-dropdown-item";
    saveItem.innerHTML = `${ICONS.save} Guardar sugerencias (${suggestions.filter((s) => s.approved).length})`;
    saveItem.addEventListener("click", () => { closeDropdown(); saveQuickSuggestions(); });
    dropdown.appendChild(saveItem);

    const cancelItem = document.createElement("div");
    cancelItem.className = "room-editor-dropdown-item";
    cancelItem.innerHTML = `${ICONS.delete} Descartar sugerencias`;
    cancelItem.addEventListener("click", () => {
      closeDropdown();
      clearSuggestionPreviewLayers();
      currentEditorState.suggestions = [];
      updateBottomBar();
      setAdminMapToolsStatus("Sugerencias descartadas.");
    });
    dropdown.appendChild(cancelItem);
  }

  suggestWrapper.appendChild(dropdown);
  tools.appendChild(suggestWrapper);

  bottomBarEl.appendChild(tools);

  const hint = document.createElement("span");
  hint.className = "room-editor-hint";
  hint.textContent = getHintForMode(mode, snapEnabled);
  bottomBarEl.appendChild(hint);

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "room-editor-save-btn";
  saveBtn.innerHTML = `<span>${ICONS.save}</span><span> Guardar (G)</span>`;
  saveBtn.title = "Guardar cambios";
  saveBtn.addEventListener("click", () => saveRoomEditor());
  bottomBarEl.appendChild(saveBtn);

  if (currentEditorState.dropdownOpen) {
    const dd = bottomBarEl.querySelector(".room-editor-dropdown");
    const btn = bottomBarEl.querySelector(".room-editor-suggest-wrapper .room-editor-tool-btn");
    if (dd && btn) {
      const rect = btn.getBoundingClientRect();
      dd.style.left = rect.left + "px";
      dd.style.top = (rect.top - 4) + "px";
      dd.style.transform = "translateY(-100%)";
    }
  }

  if (currentEditorState.paletteOpen) {
    const p = bottomBarEl.querySelector(".room-editor-icon-dropdown");
    const btn = bottomBarEl.querySelector(".room-editor-icon-wrapper .room-editor-tool-btn");
    if (p && btn) {
      const rect = btn.getBoundingClientRect();
      p.style.left = rect.left + "px";
      p.style.top = (rect.top - 4) + "px";
      p.style.transform = "translateY(-100%)";
    }
  }
};

const getHintForMode = (mode, snapEnabled) => {
  const snapText = snapEnabled ? "S=snap OFF" : "S=snap ON";
  switch (mode) {
    case "select": return `Seleccion: click=sumar/quitar | Ctrl+arrastrar=mover | Shift+arrastrar=rotar | ${snapText}`;
    case "draw-square": return "Cuadrado: click 1ra esquina, click 2da esquina. Esc cancelar.";
    case "draw-rect": return "Rectangulo: click 1ra esquina, click 2da esquina. Esc cancelar.";
    case "draw-circle": return "Circulo: click centro, click radio. Esc cancelar.";
    case "draw-free": return "Libre: click para vertices, Enter/dblclick cerrar. Shift=ortogonal. Esc cancelar.";
    case "draw-hand": return "Mano alzada: click+arrastra para dibujar. Shift=rectos. Esc cancelar.";
    case "marker-place": return "Icono: click en el mapa para colocarlo (o arrastra el icono). Click en el boton del icono para salir.";
    default: return "";
  }
};

const updateSidePanel = () => {
  if (!sidePanelEl || !currentEditorState) return;

  const { selectedRoom, selectedMarker } = currentEditorState;
  const selectedCount = getSelectedRoomIds().length;

  if (selectedMarker && !selectedRoom) {
    sidePanelEl.className = "room-editor-side-panel is-visible";
    sidePanelEl.innerHTML = "";
    sidePanelEl.appendChild(buildMarkerPanel(selectedMarker));
  } else if (selectedCount > 1) {
    sidePanelEl.className = "room-editor-side-panel is-visible";
    sidePanelEl.innerHTML = "";
    const container = document.createElement("div");
    const header = document.createElement("div");
    header.className = "room-editor-side-panel-header";
    header.innerHTML = `<span class="room-editor-side-panel-title">Grupo (${selectedCount})</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "room-editor-side-panel-close";
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", () => {
      currentEditorState.selectedRoomIds = [];
      syncSelectedRoomFromIds();
      renderRooms();
      updateSidePanel();
      updateBottomBar();
    });
    header.appendChild(closeBtn);
    container.appendChild(header);
    const hint = document.createElement("div");
    hint.className = "room-editor-group-hint";
    hint.textContent = "Comandos: Ctrl+arrastrar = mover grupo | Shift+arrastrar = rotar grupo | Ctrl+C / Ctrl+V = copiar/pegar | Supr = eliminar | Ctrl+Z / Ctrl+Y = deshacer/rehacer | G = guardar";
    container.appendChild(hint);
    sidePanelEl.appendChild(container);
  } else if (selectedRoom) {
    sidePanelEl.className = "room-editor-side-panel is-visible";
    sidePanelEl.innerHTML = "";
    sidePanelEl.appendChild(buildPropertiesPanel(selectedRoom));
  } else {
    sidePanelEl.className = "room-editor-side-panel";
    sidePanelEl.innerHTML = "";
  }
};

const buildMarkerPanel = (marker) => {
  const container = document.createElement("div");

  const header = document.createElement("div");
  header.className = "room-editor-side-panel-header";
  const label = staticIconLabel(marker.iconKey);
  header.innerHTML = `<span class="room-editor-side-panel-title">Marcador</span>`;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "room-editor-side-panel-close";
  closeBtn.innerHTML = "&times;";
  closeBtn.addEventListener("click", () => {
    currentEditorState.selectedMarker = null;
    renderMarkers();
    updateSidePanel();
    updateBottomBar();
  });
  header.appendChild(closeBtn);
  container.appendChild(header);

  const body = document.createElement("div");
  body.className = "room-editor-side-panel-body";

  const iconUrl = staticIconUrl(marker.iconKey);

  body.innerHTML = `
    <div class="room-editor-marker-preview">
      <img src="${iconUrl}" alt="${escapeHtml(label)}" />
      <span>${escapeHtml(label)}</span>
    </div>
    <div class="room-editor-form-grid">
      <label>Etiqueta
        <input value="${escapeHtml(marker.label || "")}" data-prop="label" />
      </label>
    </div>
    <label class="room-editor-full-label">Notas
      <textarea data-prop="notes">${escapeHtml(marker.notes || "")}</textarea>
    </label>
    <div class="room-editor-meta">Piso ${marker.floor} | ID: ${marker.externalId}</div>
    <button
      type="button"
      class="room-editor-tool-btn room-editor-delete-room-btn"
      data-action="delete-marker"
      title="Eliminar este marcador"
    >
      <span>${ICONS.delete}</span> Eliminar marcador
    </button>
  `;

  body.querySelectorAll("[data-prop]").forEach((el) => {
    const prop = el.dataset.prop;
    const handler = () => updateMarkerProperty(prop, el.value);
    el.addEventListener("change", handler);
    if (el.tagName === "INPUT") {
      el.addEventListener("input", handler);
    }
  });

  const deleteMarkerBtn = body.querySelector("[data-action='delete-marker']");
  if (deleteMarkerBtn) {
    deleteMarkerBtn.addEventListener("click", async () => {
      if (!currentEditorState?.selectedMarker) return;
      if (!(await appConfirm("¿Eliminar este marcador?"))) return;
      deleteSelectedMarker();
      updateSidePanel();
    });
  }

  container.appendChild(body);
  return container;
};

const updateMarkerProperty = (property, value) => {
  if (!currentEditorState?.selectedMarker) return;
  const marker = currentEditorState.selectedMarker;
  marker[property] = value;
  currentEditorState.isDirty = true;
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
    currentEditorState.selectedRoomIds = [];
    renderRooms();
    updateSidePanel();
    updateBottomBar();
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
    <button
      type="button"
      class="room-editor-tool-btn room-editor-delete-room-btn"
      data-action="delete-room"
      title="Eliminar esta sala"
    >
      <span>${ICONS.delete}</span> Eliminar sala
    </button>
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

  const deleteRoomBtn = body.querySelector("[data-action='delete-room']");
  if (deleteRoomBtn) {
    deleteRoomBtn.addEventListener("click", async () => {
      if (!currentEditorState?.selectedRoom) return;
      if (!(await appConfirm("¿Eliminar esta sala?"))) return;
      deleteSelectedRoom();
      updateSidePanel();
    });
  }

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
  if (currentEditorState) currentEditorState.snapRefs = null;

  if (!currentEditorState || !popupMap) return;

  const renderShape = (shape) => {
    if (!shape.geometryJson) return;

    try {
      const geom = typeof shape.geometryJson === "string" ? JSON.parse(shape.geometryJson) : shape.geometryJson;
      if (!geom.coordinates) return;

      const coords = geom.coordinates[0];
      if (!Array.isArray(coords) || coords.length < 3) return;

      let latLngs = coords.map((c) => [c[1], c[0]]);

      const rotation = shape.rotation || 0;
      const scaleX = shape.scaleX || 1;
      const scaleY = shape.scaleY || 1;

      if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
        latLngs = transformLatLngs(latLngs, rotation, scaleX, scaleY);
      }

      const selectedIds = getSelectedRoomIds();
      const isSelected = selectedIds.length > 0
        ? selectedIds.includes(shape.externalId)
        : currentEditorState.selectedRoom?.externalId === shape.externalId;

      const style = { color: isSelected ? "#f59e0b" : "#059669", weight: isSelected ? 3 : 2, fillColor: isSelected ? "#f59e0b" : "#059669", fillOpacity: isSelected ? 0.3 : 0.2 };

      const layer = L.polygon(latLngs, {
        ...style,
        className: ROOM_LAYER_CLASS,
      }).addTo(popupMap);

      layer.roomData = shape;
      currentEditorState.roomLayers.push(layer);

      layer.on("mousedown", (e) => {
        L.DomEvent.stop(e);
        if (e.originalEvent?.button !== 0) return;
        const ids = getSelectedRoomIds();
        const isSelectedShape = ids.includes(shape.externalId);
        if (isSelectedShape && e.originalEvent.shiftKey) {
          ids.length > 1 ? enableMultiRotateLayer(e) : enableRotateLayer(layer, shape, e);
        } else {
          beginMultiSelectInteraction(layer, shape, e);
        }
      });
    } catch (e) {
      console.warn("Error rendering shape:", shape.externalId, e);
    }
  };

  for (const room of currentEditorState.rooms) renderShape(room);

  renderMarkers();
};

const transformLatLngs = (latLngs, rotationDeg, scaleX, scaleY) => {
  if (latLngs.length < 3) return latLngs.map((ll) => [...ll]);
  if (!popupMap) return latLngs;

  const pts = latLngs.map((ll) => popupMap.latLngToContainerPoint(L.latLng(ll[0], ll[1])));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const rad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);

  return pts.map((p) => {
    const dx = (p.x - cx) * scaleX;
    const dy = (p.y - cy) * scaleY;
    const nx = cx + dx * cosR - dy * sinR;
    const ny = cy + dx * sinR + dy * cosR;
    const ll = popupMap.containerPointToLatLng(L.point(nx, ny));
    return [ll.lat, ll.lng];
  });
};

const enableDragLayer = (layer, room, e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);
  popupMap.dragging.disable();

  const startLatLng = e.latlng;
  let geom;
  try {
    geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
  } catch { return; }
  if (!geom?.coordinates?.[0]) return;

  const origCoords = geom.coordinates[0].map((c) => [...c]);
  let dragging = true;

  const onMove = (ev) => {
    if (!dragging) return;
    let newLat = ev.latlng.lat;
    let newLng = ev.latlng.lng;
    if (currentEditorState?.snapEnabled) {
      const snapResult = applySnap(ev.latlng);
      if (snapResult && snapResult !== ev.latlng) {
        const origCenterLat = origCoords.reduce((s, c) => s + c[1], 0) / origCoords.length;
        const origCenterLng = origCoords.reduce((s, c) => s + c[0], 0) / origCoords.length;
        const dLatNew = snapResult.lat - origCenterLat;
        const dLngNew = snapResult.lng - origCenterLng;
        newLat = startLatLng.lat + dLatNew;
        newLng = startLatLng.lng + dLngNew;
      }
    }
    const dLat = newLat - startLatLng.lat;
    const dLng = newLng - startLatLng.lng;
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
    popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";
    currentEditorState._suppressDeselectClick = true;
  };

  popupMap.getContainer().style.cursor = "grabbing";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const enableRotateLayer = (layer, room, e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);
  popupMap.dragging.disable();

  let geom;
  try {
    geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
  } catch { return; }
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
    popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";
    currentEditorState._suppressDeselectClick = true;
  };

  popupMap.getContainer().style.cursor = "crosshair";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const getMultiSelectItems = () => {
  if (!currentEditorState) return [];
  const ids = getSelectedRoomIds();
  return currentEditorState.roomLayers
    .filter((l) => ids.includes(l.roomData.externalId))
    .map((l) => {
      const room = l.roomData;
      if (!room.geometryJson) return null;
      let geom;
      try {
        geom = typeof room.geometryJson === "string" ? JSON.parse(room.geometryJson) : room.geometryJson;
      } catch { return null; }
      const coords = geom?.coordinates?.[0];
      if (!Array.isArray(coords) || coords.length < 3) return null;
      return { layer: l, room, coords: coords.map((c) => [...c]) };
    })
    .filter(Boolean);
};

const beginMultiSelectInteraction = (layer, room, e) => {
  if (!popupMap) return;
  if (e.originalEvent?.button !== 0) return;
  L.DomEvent.stop(e);
  popupMap.dragging.disable();
  const startClientX = e.originalEvent.clientX;
  const startClientY = e.originalEvent.clientY;
  let moved = false;

  const onMapMove = (ev) => {
    if (moved) return;
    const dx = ev.originalEvent.clientX - startClientX;
    const dy = ev.originalEvent.clientY - startClientY;
    if (Math.abs(dx) + Math.abs(dy) < 5) return;
    moved = true;
    popupMap.off("mousemove", onMapMove);
    popupMap.off("mouseup", onMapUp);

    if (!getSelectedRoomIds().includes(room.externalId)) {
      // drag started on an unselected room: do not move/rotate any group
      popupMap.dragging.enable();
      return;
    }
    if (ev.originalEvent.shiftKey) {
      enableMultiRotateLayer(ev);
    } else if (ev.originalEvent.ctrlKey) {
      enableMultiDragLayer(ev);
    } else {
      // plain drag without Ctrl/Shift: no group action, map drag is blocked
      popupMap.once("mouseup", () => popupMap.dragging.enable());
    }
  };

  const onMapUp = (ev) => {
    popupMap.off("mousemove", onMapMove);
    popupMap.off("mouseup", onMapUp);
    if (moved) return;
    popupMap.dragging.enable();
    currentEditorState._suppressDeselectClick = true;
    if (ev.originalEvent?.ctrlKey || ev.originalEvent?.metaKey) {
      toggleRoomSelection(room);
    } else {
      selectOnlyRoom(room);
    }
  };

  popupMap.on("mousemove", onMapMove);
  popupMap.on("mouseup", onMapUp);
};

const enableMultiDragLayer = (e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);
  const items = getMultiSelectItems();
  if (!items.length) return;

  const startLatLng = e.latlng;
  const before = items.map((it) => ({ id: it.room.externalId, geometryJson: it.room.geometryJson }));
  let dragging = true;

  const onMove = (ev) => {
    if (!dragging) return;
    const dLat = ev.latlng.lat - startLatLng.lat;
    const dLng = ev.latlng.lng - startLatLng.lng;
    for (const it of items) {
      const newCoords = it.coords.map((c) => [c[0] + dLng, c[1] + dLat]);
      const newGeo = { type: "Polygon", coordinates: [newCoords] };
      it.room.geometryJson = JSON.stringify(newGeo);
      currentEditorState.isDirty = true;

      let newLatLngs = newCoords.map((c) => [c[1], c[0]]);
      const rotation = it.room.rotation || 0;
      const scaleX = it.room.scaleX || 1;
      const scaleY = it.room.scaleY || 1;
      if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
        newLatLngs = transformLatLngs(newLatLngs, rotation, scaleX, scaleY);
      }
      it.layer.setLatLngs(newLatLngs);
    }
    setAdminMapToolsStatus(`Moviendo ${items.length} elemento(s). G para guardar.`);
  };

  const onUp = () => {
    dragging = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";
    const after = items.map((it) => ({ id: it.room.externalId, geometryJson: it.room.geometryJson }));
    const changed = after.some((a, i) => a.geometryJson !== before[i].geometryJson);
    if (changed) {
      pushUndo({ type: "move-rooms", ids: before.map((b) => b.id), before: before.map((b) => b.geometryJson), after: after.map((a) => a.geometryJson) });
      setAdminMapToolsStatus("Grupo movido. G para guardar.");
    } else {
      setAdminMapToolsStatus("Los elementos no se movieron.");
    }
    currentEditorState._suppressDeselectClick = true;
  };

  popupMap.getContainer().style.cursor = "grabbing";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const enableMultiRotateLayer = (e) => {
  if (!popupMap) return;
  L.DomEvent.stop(e);
  popupMap.dragging.disable();
  const items = getMultiSelectItems();
  if (!items.length) return;

  const groupCenter = L.latLng(
    items.reduce((s, it) => s + it.coords.reduce((sa, c) => sa + c[1], 0) / it.coords.length, 0) / items.length,
    items.reduce((s, it) => s + it.coords.reduce((sa, c) => sa + c[0], 0) / it.coords.length, 0) / items.length
  );
  const groupCenterPt = popupMap.latLngToContainerPoint(groupCenter);
  const basePts = items.map((it) => ({
    layer: it.layer,
    room: it.room,
    pts: it.coords.map((c) => popupMap.latLngToContainerPoint(L.latLng(c[1], c[0]))),
  }));

  const startAngle = Math.atan2(popupMap.latLngToContainerPoint(e.latlng).y - groupCenterPt.y, popupMap.latLngToContainerPoint(e.latlng).x - groupCenterPt.x);
  const before = items.map((it) => ({ id: it.room.externalId, geometryJson: it.room.geometryJson }));
  let rotating = true;

  const onMove = (ev) => {
    if (!rotating) return;
    const evPt = popupMap.latLngToContainerPoint(ev.latlng);
    const currentAngle = Math.atan2(evPt.y - groupCenterPt.y, evPt.x - groupCenterPt.x);
    const deltaDeg = ((currentAngle - startAngle) * 180) / Math.PI;
    const rad = (deltaDeg * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    for (const base of basePts) {
      const rotatedPts = base.pts.map((p) => {
        const dx = p.x - groupCenterPt.x;
        const dy = p.y - groupCenterPt.y;
        return L.point(groupCenterPt.x + dx * cosR - dy * sinR, groupCenterPt.y + dx * sinR + dy * cosR);
      });
      const newLatLngs = rotatedPts.map((p) => {
        const ll = popupMap.containerPointToLatLng(p);
        return [ll.lat, ll.lng];
      });
      const newCoords = newLatLngs.map((ll) => [ll[1], ll[0]]);
      const newGeo = { type: "Polygon", coordinates: [newCoords] };
      base.room.geometryJson = JSON.stringify(newGeo);
      currentEditorState.isDirty = true;

      const displayed = transformLatLngs(
        newLatLngs,
        base.room.rotation || 0,
        base.room.scaleX || 1,
        base.room.scaleY || 1
      );
      base.layer.setLatLngs(displayed);
    }
    setAdminMapToolsStatus(`Rotando ${basePts.length} elemento(s) como grupo. G para guardar.`);
  };

  const onUp = () => {
    rotating = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";
    const after = items.map((it) => ({ id: it.room.externalId, geometryJson: it.room.geometryJson }));
    const changed = after.some((a, i) => a.geometryJson !== before[i].geometryJson);
    if (changed) {
      pushUndo({ type: "rotate-rooms", ids: before.map((b) => b.id), before: before.map((b) => b.geometryJson), after: after.map((a) => a.geometryJson) });
      setAdminMapToolsStatus("Grupo rotado. G para guardar.");
    } else {
      setAdminMapToolsStatus("Los elementos no se rotaron.");
    }
    currentEditorState._suppressDeselectClick = true;
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

const clearMarkerLayers = () => {
  if (!currentEditorState || !popupMap) return;
  for (const layer of currentEditorState.markerLayers) {
    popupMap.removeLayer(layer);
  }
  currentEditorState.markerLayers = [];
};

const buildMarkerLeafletIcon = (marker) =>
  L.icon({
    iconUrl: staticIconUrl(marker.iconKey),
    iconSize: [STATIC_MARKER_ICON_SIZE, STATIC_MARKER_ICON_SIZE],
    iconAnchor: [STATIC_MARKER_ICON_SIZE / 2, STATIC_MARKER_ICON_SIZE / 2],
    popupAnchor: [0, -12],
    className: "room-editor-marker-icon",
  });

const renderMarkers = () => {
  clearMarkerLayers();
  if (!currentEditorState || !popupMap) return;

  const selectedId = currentEditorState.selectedMarker?.externalId;
  currentEditorState._suppressMarkerClick = null;

  for (const marker of currentEditorState.markers) {
    const layer = L.marker([marker.latitude, marker.longitude], {
      icon: buildMarkerLeafletIcon(marker),
      title: staticIconLabel(marker.iconKey),
      interactive: true,
      keyboard: false,
      zIndexOffset: 500,
    });
    layer.markerData = marker;
    if (marker.label && String(marker.label).trim()) {
      layer.bindTooltip(String(marker.label).trim(), { direction: "top", offset: [0, -16] });
    }
    layer.on("click", (e) => {
      L.DomEvent.stop(e);
      if (currentEditorState._suppressMarkerClick === marker.externalId) {
        currentEditorState._suppressMarkerClick = null;
        return;
      }
      selectMarker(marker);
    });
    layer.on("mousedown", (e) => {
      if (!(e.originalEvent?.ctrlKey || e.originalEvent?.metaKey)) return;
      enableMarkerDragLayer(layer, marker, e);
    });
    layer.addTo(popupMap);
    currentEditorState.markerLayers.push(layer);
    const el = layer.getElement();
    if (el) {
      el.querySelectorAll("img").forEach((img) => {
        img.draggable = false;
      });
      if (marker.externalId === selectedId) {
        el.classList.add("is-selected");
      }
    }
  }
};

const enableMarkerDragLayer = (layer, marker, e) => {
  if (!popupMap || !currentEditorState) return;
  L.DomEvent.stop(e);
  popupMap.dragging.disable();

  const before = { latitude: marker.latitude, longitude: marker.longitude };
  let dragging = true;

  const onMove = (ev) => {
    if (!dragging) return;
    marker.latitude = ev.latlng.lat;
    marker.longitude = ev.latlng.lng;
    layer.setLatLng([marker.latitude, marker.longitude]);
    currentEditorState.isDirty = true;
    setAdminMapToolsStatus("Moviendo marcador. G para guardar.");
  };

  const onUp = () => {
    dragging = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";
    const after = { latitude: marker.latitude, longitude: marker.longitude };
    if (before.latitude !== after.latitude || before.longitude !== after.longitude) {
      pushUndo({ type: "move-marker", externalId: marker.externalId, before, after });
      currentEditorState._suppressMarkerClick = marker.externalId;
      setAdminMapToolsStatus("Marcador movido. G para guardar.");
    } else {
      currentEditorState._suppressDeselectClick = true;
      setAdminMapToolsStatus("El marcador no se movio.");
    }
  };

  popupMap.getContainer().style.cursor = "grabbing";
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
};

const selectMarker = (marker) => {
  if (!currentEditorState) return;
  currentEditorState.selectedMarker = marker;
  currentEditorState.selectedRoom = null;
  currentEditorState.selectedRoomIds = [];
  currentEditorState._suppressDeselectClick = true;
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  setAdminMapToolsStatus("Marcador seleccionado. Edita la etiqueta o notas en el panel, G para guardar.");
};

const placeMarkerAt = (latlng, iconKey) => {
  if (!currentEditorState || !popupMap || !iconKey) return;
  const marker = {
    externalId: `MKR-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    buildingExternalId: currentEditorState.buildingExternalId,
    floor: currentEditorState.selectedFloor,
    latitude: latlng.lat,
    longitude: latlng.lng,
    iconKey,
    label: staticIconLabel(iconKey),
    notes: "",
    campus: "default",
    source: "manual",
    isNew: true,
  };
  pushUndo({ type: "create-marker", marker });
  currentEditorState.markers.push(marker);
  currentEditorState.selectedMarker = marker;
  currentEditorState.selectedRoom = null;
  currentEditorState.selectedRoomIds = [];
  currentEditorState.isDirty = true;
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  setAdminMapToolsStatus(`Marcador '${staticIconLabel(iconKey)}' colocado. Edítalo en el panel; G para guardar.`);
};

const deleteSelectedMarker = (markerToDelete) => {
  if (!currentEditorState) return;
  const marker = markerToDelete || currentEditorState.selectedMarker;
  if (!marker) return;

  pushUndo({ type: "delete-marker", marker });
  currentEditorState.markers = currentEditorState.markers.filter((m) => m.externalId !== marker.externalId);
  if (!marker.isNew && !currentEditorState.removedMarkerExternalIds.includes(marker.externalId)) {
    currentEditorState.removedMarkerExternalIds.push(marker.externalId);
  }
  if (currentEditorState.selectedMarker?.externalId === marker.externalId) {
    currentEditorState.selectedMarker = null;
  }
  currentEditorState.isDirty = true;
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  setAdminMapToolsStatus("Marcador eliminado. G para guardar.");
};

const removeMarkerPlaceClickHandler = () => {
  if (!currentEditorState?._markerPlaceClickHandler || !popupMap) return;
  popupMap.off("click", currentEditorState._markerPlaceClickHandler);
  currentEditorState._markerPlaceClickHandler = null;
};

const startMarkerPlacement = (iconKey) => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.pendingMarkerIcon = iconKey;
  currentEditorState.mode = "marker-place";
  currentEditorState.selectedMarker = null;
  currentEditorState.selectedRoom = null;
  currentEditorState.selectedRoomIds = [];
  removeMarkerPlaceClickHandler();
  const onClick = (e) => {
    if (!currentEditorState) return;
    if (e.originalEvent?.shiftKey || e.originalEvent?.ctrlKey || e.originalEvent?.metaKey || e.originalEvent?.altKey) return;
    L.DomEvent.stop(e);
    placeMarkerAt(e.latlng, currentEditorState?.pendingMarkerIcon || iconKey);
  };
  currentEditorState._markerPlaceClickHandler = onClick;
  popupMap.on("click", onClick);
  popupMap.dragging.enable();
  popupMap.keyboard.enable();
  renderRooms();
  updateBottomBar();
  updateSidePanel();
  setAdminMapToolsStatus(`Coloca '${staticIconLabel(iconKey)}': click sobre el mapa o arrastra el icono. Click en el boton del icono para salir.`);
};

const stopMarkerPlacement = () => {
  if (!currentEditorState) return;
  removeMarkerPlaceClickHandler();
  if (currentEditorState.mode === "marker-place") {
    currentEditorState.mode = "select";
    currentEditorState.pendingMarkerIcon = null;
  }
  renderRooms();
  updateBottomBar();
  updateSidePanel();
};

const toggleMarkerPlacement = (iconKey) => {
  if (!currentEditorState) return;
  if (currentEditorState.mode === "marker-place" && currentEditorState.pendingMarkerIcon === iconKey) {
    stopMarkerPlacement();
    setAdminMapToolsStatus("Colocacion de iconos detenida.");
  } else {
    startMarkerPlacement(iconKey);
  }
};

const toggleIconPalette = () => {
  if (!currentEditorState) return;
  currentEditorState.paletteOpen = !currentEditorState.paletteOpen;
  updateBottomBar();
};

const closeIconPalette = () => {
  if (!currentEditorState?.paletteOpen) return;
  currentEditorState.paletteOpen = false;
};

const getSelectedRoomIds = () => {
  if (!currentEditorState) return [];
  const ids = currentEditorState.selectedRoomIds || [];
  const valid = new Set([
    ...currentEditorState.rooms.map((r) => r.externalId),
  ]);
  return ids.filter((id) => valid.has(id));
};

const syncSelectedRoomFromIds = () => {
  if (!currentEditorState) return;
  const ids = getSelectedRoomIds();
  if (ids.length === 0) {
    currentEditorState.selectedRoom = null;
    if (popupMap) {
      popupMap.dragging.enable();
      popupMap.keyboard.enable();
    }
    return;
  }
  const anchor = findShapeById(ids[0]);
  currentEditorState.selectedRoom = anchor;
};

const findShapeById = (id) => {
  if (!currentEditorState) return null;
  return currentEditorState.rooms.find((r) => r.externalId === id) || null;
};

const allShapes = () => [...(currentEditorState?.rooms || [])];

const toggleRoomSelection = (room) => {
  if (!currentEditorState) return;
  const ids = getSelectedRoomIds();
  if (ids.includes(room.externalId)) {
    currentEditorState.selectedRoomIds = ids.filter((id) => id !== room.externalId);
  } else {
    currentEditorState.selectedRoomIds = [...ids, room.externalId];
  }
  syncSelectedRoomFromIds();
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  if (getSelectedRoomIds().length > 0) {
    setAdminMapToolsStatus(`${getSelectedRoomIds().length} elemento(s) seleccionado(s). Ctrl+arrastrar para mover, Shift+arrastrar para rotar, G para guardar.`);
  }
};

const selectOnlyRoom = (room) => {
  if (!currentEditorState) return;
  currentEditorState.selectedRoomIds = [room.externalId];
  syncSelectedRoomFromIds();
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  setAdminMapToolsStatus(`1 sala seleccionada. Ctrl+click para agregar/quitar mas, Ctrl+arrastrar para mover, Shift+arrastrar para rotar, G para guardar.`);
};

const clearRoomSelection = () => {
  if (!currentEditorState) return;
  currentEditorState.selectedRoomIds = [];
  currentEditorState.selectedRoom = null;
};

const selectRoomEditorFloor = async (floor) => {
  if (!currentEditorState) return;
  currentEditorState.selectedFloor = floor;
  currentEditorState.selectedRoom = null;
  currentEditorState.selectedMarker = null;
  currentEditorState.selectedRoomIds = [];
  currentEditorState.removedExternalIds = [];
  currentEditorState.removedMarkerExternalIds = [];
  clearDrawState();
  await loadRoomsForFloor(currentEditorState.buildingExternalId, floor);
  renderRooms();
  updatePopupContent();
};

const selectRoomMode = (mode) => {
  if (!currentEditorState) return;
  clearDrawState();
  const wasDrawMode = currentEditorState.mode !== "select";
  currentEditorState.mode = mode;
  if (mode === "select") {
    syncSelectedRoomFromIds();
  } else if (wasDrawMode) {
    currentEditorState.selectedRoom = null;
  }
  if (popupMap) {
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
  }
  renderRooms();
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
      setAdminMapToolsStatus("Click para agregar vertices. Enter o doble clic para cerrar. Shift = ortogonal.");
      startDrawFree();
      break;
    case "draw-hand":
      setAdminMapToolsStatus("Click y arrastra para dibujar. Shift = lineas rectas.");
      startDrawHand();
      break;
    case "marker-place":
      if (currentEditorState.pendingMarkerIcon) {
        startMarkerPlacement(currentEditorState.pendingMarkerIcon);
      } else {
        setAdminMapToolsStatus("Elige un icono de la paleta para colocarlo en el mapa.");
      }
      break;
    case "draw-door":
    case "draw-stair":
      setAdminMapToolsStatus("Modo seleccion. Click para sumar/quitar, Ctrl+arrastrar para mover, Shift+arrastrar para rotar. Ctrl+Z deshacer, G guardar.");
      selectRoomMode("select");
      break;
    default:
      setAdminMapToolsStatus("Modo seleccion. Click para sumar/quitar, Ctrl+arrastrar para mover, Shift+arrastrar para rotar. Ctrl+Z deshacer, G guardar.");
  }
};

const startDrawSquare = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-square";

  let p1 = null;

  const onClick = (e) => {
    L.DomEvent.stop(e);
    const snapped = applySnap(e.latlng);
    if (!p1) {
      p1 = snapped;
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
    const snapped = applySnap(e.latlng);
    const dLat = Math.abs(snapped.lat - p1.lat);
    const dLng = Math.abs(snapped.lng - p1.lng);
    const d = Math.max(dLat, dLng);
    const sLat = snapped.lat >= p1.lat ? 1 : -1;
    const sLng = snapped.lng >= p1.lng ? 1 : -1;
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
    const snapped = applySnap(e.latlng);
    if (!p1) {
      p1 = snapped;
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
    const snapped = applySnap(e.latlng);
    currentEditorState.previewLayer.setLatLngs([
      [p1.lat, p1.lng],
      [p1.lat, snapped.lng],
      [snapped.lat, snapped.lng],
      [snapped.lat, p1.lng],
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
    const snapped = applySnap(e.latlng);
    if (!center) {
      center = snapped;
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

const startDrawFree = (mode = "draw-free") => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = mode;
  currentEditorState.drawPoints = [];
  let shiftHeld = false;

  const onClick = (e) => {
    const snapped = applySnap(e.latlng);
    let point = snapped;

    if (shiftHeld && currentEditorState.drawPoints.length >= 1) {
      const base = currentEditorState.drawPoints[currentEditorState.drawPoints.length - 1];
      const dx = snapped.lng - base.lng;
      const dy = snapped.lat - base.lat;
      if (Math.abs(dx) > Math.abs(dy)) {
        point = L.latLng(base.lat, snapped.lng);
      } else {
        point = L.latLng(snapped.lat, base.lng);
      }
    }

    currentEditorState.drawPoints.push(point);
    addDrawVertexMarker(point);
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

  const onKey = (e) => {
    shiftHeld = e.shiftKey;
  };

  document.addEventListener("keyup", onKey);
  document.addEventListener("keydown", onKey);

  const origCleanup = currentEditorState._handCleanup;
  currentEditorState._handCleanup = () => {
    document.removeEventListener("keyup", onKey);
    document.removeEventListener("keydown", onKey);
    if (origCleanup) origCleanup();
  };

  popupMap.on("click", onClick);
  popupMap.on("dblclick", onDblClick);
};

const startDrawHand = () => {
  if (!currentEditorState || !popupMap) return;
  clearDrawState();
  currentEditorState.mode = "draw-hand";
  currentEditorState.drawPoints = [];
  let drawing = false;
  let lastPoint = null;
  let previewLine = null;
  let shiftHeld = false;

  const THRESHOLD_M = 1.5;

  const onDown = (e) => {
    L.DomEvent.stop(e);
    drawing = true;
    lastPoint = e.latlng;
    currentEditorState.drawPoints.push(e.latlng);
    if (popupMap.dragging) popupMap.dragging.disable();
    popupMap.getContainer().style.cursor = "crosshair";
    previewLine = L.polyline([e.latlng], {
      color: "#f59e0b",
      weight: 2,
      dashArray: "4 4",
      interactive: false,
    }).addTo(popupMap);
  };

  const onMove = (e) => {
    if (!drawing || !previewLine) return;
    const pts = currentEditorState.drawPoints;
    const prev = pts[pts.length - 1];
    const dist = distanceMeters([prev.lat, prev.lng], [e.latlng.lat, e.latlng.lng]);
    if (dist < THRESHOLD_M) return;

    let newPoint = e.latlng;
    if (shiftHeld && pts.length >= 1) {
      const base = pts[pts.length - 1];
      const dx = e.latlng.lng - base.lng;
      const dy = e.latlng.lat - base.lat;
      if (Math.abs(dx) > Math.abs(dy)) {
        newPoint = L.latLng(base.lat, e.latlng.lng);
      } else {
        newPoint = L.latLng(e.latlng.lat, base.lng);
      }
    }

    pts.push(newPoint);
    lastPoint = newPoint;
    previewLine.addLatLng(newPoint);
  };

  const onUp = () => {
    if (!drawing) return;
    drawing = false;
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    if (previewLine && popupMap.hasLayer(previewLine)) popupMap.removeLayer(previewLine);
    if (popupMap.dragging) popupMap.dragging.enable();
    popupMap.getContainer().style.cursor = "";

    const pts = currentEditorState.drawPoints;
    if (pts.length < 3) {
      clearDrawState();
      setAdminMapToolsStatus("Trazo muy corto. Intenta de nuevo.");
      return;
    }

    const simplified = simplifyRing(
      pts.map((p) => [p.lat, p.lng]),
      2
    );
    if (simplified.length < 4) {
      clearDrawState();
      setAdminMapToolsStatus("Trazo demasiado simple. Intenta de nuevo.");
      return;
    }

    const closedRing = [...simplified, simplified[0]];
    const geoJsonCoords = closedRing.map((c) => [c[1], c[0]]);

    const buildingRing = currentEditorState.buildingGeometry?.coordinates?.[0]?.map((c) => [c[1], c[0]]);
    if (buildingRing) {
      const insideCount = closedRing.filter((p) => pointInRing(p, buildingRing)).length;
      const ratio = insideCount / closedRing.length;
      if (ratio < 0.5) {
        clearDrawState();
        setAdminMapToolsStatus("Sala fuera del contorno del edificio. Ctrl+Z para deshacer.");
        createNewRoom(geoJsonCoords);
        return;
      }
      if (ratio < 1) {
        setAdminMapToolsStatus("Parte de la sala fuera del contorno. Se guardara igual.");
      }
    }

    clearDrawState();
    createNewRoom(geoJsonCoords);
  };

  const onKey = (e) => {
    shiftHeld = e.shiftKey;
  };

  popupMap.on("mousedown", onDown);
  popupMap.on("mousemove", onMove);
  popupMap.on("mouseup", onUp);
  document.addEventListener("keyup", onKey);
  document.addEventListener("keydown", onKey);

  const origClear = clearDrawState;
  const wrappedClear = () => {
    document.removeEventListener("keyup", onKey);
    document.removeEventListener("keydown", onKey);
    popupMap.off("mousedown", onDown);
    popupMap.off("mousemove", onMove);
    popupMap.off("mouseup", onUp);
    if (previewLine && popupMap?.hasLayer(previewLine)) popupMap.removeLayer(previewLine);
  };
  currentEditorState._handCleanup = wrappedClear;
};

const clearDrawState = () => {
  if (!currentEditorState || !popupMap) return;
  removeMarkerPlaceClickHandler();
  if (currentEditorState._handCleanup) {
    currentEditorState._handCleanup();
    currentEditorState._handCleanup = null;
  }
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
  popupMap.on("click", handleMapDeselectClick);
};

const ensureSnapMarker = () => {
  if (!currentEditorState || !popupMap) return;
  if (!currentEditorState.snapPreviewMarker) {
    currentEditorState.snapPreviewMarker = L.circleMarker([0, 0], {
      radius: 6,
      color: "#059669",
      fillColor: "#059669",
      fillOpacity: 0.6,
      weight: 2,
      interactive: false,
      className: "room-editor-snap-indicator",
    });
  }
  return currentEditorState.snapPreviewMarker;
};

const applySnap = (latlng) => {
  if (!currentEditorState?.snapEnabled || !popupMap) return latlng;
  if (!currentEditorState.snapRefs) {
    const buildingCoords = currentEditorState.buildingGeometry?.coordinates?.[0];
    const roomCoords = currentEditorState.rooms.map((r) => {
      let geom = null;
      try {
        geom = typeof r.geometryJson === "string" ? JSON.parse(r.geometryJson) : r.geometryJson;
      } catch { geom = null; }
      return geom?.coordinates?.[0] || [];
    });
    currentEditorState.snapRefs = buildSnapRefs(buildingCoords, roomCoords);
  }
  const marker = ensureSnapMarker();
  const result = snapToReferences(popupMap, latlng, currentEditorState.snapRefs, 12, marker);
  return result.latlng;
};

const buildNewRoomObject = (geoJsonCoords, extra = {}) => ({
  externalId: extra.externalId || `MAN-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  buildingExternalId: currentEditorState.buildingExternalId,
  floor: currentEditorState.selectedFloor,
  displayName: extra.displayName || `Sala ${currentEditorState.rooms.length + 1}`,
  shortName: "",
  type: extra.type || "sala",
  unit: "",
  service: "",
  status: "active",
  capacity: null,
  geometryJson: JSON.stringify({ type: "Polygon", coordinates: [geoJsonCoords] }),
  source: "manual",
  isManual: true,
  notes: "",
  isNew: true,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
});

const createNewRoom = (geoJsonCoords) => {
  if (!currentEditorState) return;

  const newRoom = buildNewRoomObject(geoJsonCoords);

  pushUndo({ type: "create-room", room: newRoom });

  currentEditorState.rooms.push(newRoom);
  currentEditorState.selectedRoom = newRoom;
  currentEditorState.selectedRoomIds = [newRoom.externalId];
  currentEditorState.isDirty = true;
  clearDrawState();
  currentEditorState.mode = "select";
  renderRooms();
  updatePopupContent();
  setAdminMapToolsStatus("Sala creada. Ctrl+click para mover, Shift+click para rotar, Ctrl+Z para deshacer.");
};

const deleteSelectedRoom = () => {
  if (!currentEditorState) return;

  const ids = getSelectedRoomIds();
  let rooms = currentEditorState.rooms.filter((r) => ids.includes(r.externalId));

  if (rooms.length === 0 && currentEditorState.selectedRoom) {
    rooms = [currentEditorState.selectedRoom];
  }

  if (rooms.length === 0) {
    setAdminMapToolsStatus("No hay elementos seleccionados para eliminar.");
    return;
  }

  pushUndo({ type: rooms.length > 1 ? "delete-rooms" : "delete-room", rooms });
  currentEditorState.rooms = currentEditorState.rooms.filter((r) => !rooms.some((del) => del.externalId === r.externalId));
  for (const room of rooms) {
    if (!room.isNew && !currentEditorState.removedExternalIds.includes(room.externalId)) {
      currentEditorState.removedExternalIds.push(room.externalId);
      if (room.isManual === true) {
        currentEditorState.removedManualRoomExternalIds.push(room.externalId);
      } else {
        currentEditorState.removedSyncedRoomExternalIds.push(room.externalId);
      }
    }
  }

  currentEditorState.selectedRoomIds = [];
  syncSelectedRoomFromIds();
  currentEditorState.isDirty = true;
  if (popupMap) {
    popupMap.dragging.enable();
    popupMap.keyboard.enable();
  }
  renderRooms();
  updatePopupContent();
  const total = rooms.length;
  setAdminMapToolsStatus(total > 1 ? `${total} elementos eliminados. G para guardar.` : "Elemento eliminado. G para guardar.");
};

const copySelectedRoom = () => {
  if (!currentEditorState) return;
  const ids = getSelectedRoomIds();
  const shapes = allShapes().filter((s) => ids.includes(s.externalId));
  if (shapes.length === 0 && currentEditorState.selectedRoom) {
    shapes.push(currentEditorState.selectedRoom);
  }
  const selectedMarker = currentEditorState.selectedMarker;
  if (shapes.length === 0 && !selectedMarker) {
    setAdminMapToolsStatus("Selecciona al menos un elemento para copiar.");
    return;
  }
  copiedRoomData = {
    items: shapes.map((s) => ({
      type: s.type,
      geometryJson: s.geometryJson,
    })),
    markerItems: selectedMarker
      ? [
          {
            kind: "marker",
            iconKey: selectedMarker.iconKey,
            label: selectedMarker.label,
            notes: selectedMarker.notes,
            latitude: selectedMarker.latitude,
            longitude: selectedMarker.longitude,
          },
        ]
      : [],
  };
  const count = shapes.length + copiedRoomData.markerItems.length;
  const message =
    count > 1
      ? `${count} elementos copiados. Ctrl+V para pegar.`
      : copiedRoomData.markerItems.length > 0
        ? "Marcador copiado. Ctrl+V para pegar."
        : "Elemento copiado. Ctrl+V para pegar.";
  setAdminMapToolsStatus(message);
};

const pasteRoom = () => {
  if (!currentEditorState || !copiedRoomData) {
    setAdminMapToolsStatus("No hay elemento copiado.");
    return;
  }

  const items = Array.isArray(copiedRoomData.items) && copiedRoomData.items.length
    ? copiedRoomData.items
    : [{ kind: "room", type: copiedRoomData.type, geometryJson: copiedRoomData.geometryJson }];
  const markerItems = Array.isArray(copiedRoomData.markerItems) ? copiedRoomData.markerItems : [];

  const baseRoomsLen = currentEditorState.rooms.length;
  const OFFSET = 0.0001;
  const createdRooms = [];
  const createdMarkers = [];

  items.forEach((src, idx) => {
    if (!src?.geometryJson) return;
    const geom = typeof src.geometryJson === "string" ? JSON.parse(src.geometryJson) : src.geometryJson;
    if (!geom?.coordinates?.[0]) return;
    const newCoords = geom.coordinates[0].map((c) => [c[0] + OFFSET * (idx + 1), c[1] + OFFSET * (idx + 1)]);
    newCoords.push(newCoords[0]);
    createdRooms.push(buildNewRoomObject(newCoords, {
      displayName: `Sala ${baseRoomsLen + 1 + idx}`,
      type: src.type || "sala",
    }));
  });

  markerItems.forEach((src, idx) => {
    if (!src?.kind || src.kind !== "marker" || !src.iconKey) return;
    createdMarkers.push({
      externalId: `MKR-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      buildingExternalId: currentEditorState.buildingExternalId,
      floor: currentEditorState.selectedFloor,
      latitude: (src.latitude || 0) + OFFSET * (items.length + idx + 1),
      longitude: (src.longitude || 0) + OFFSET * (items.length + idx + 1),
      iconKey: src.iconKey,
      label: src.label || staticIconLabel(src.iconKey),
      notes: src.notes || "",
      campus: "default",
      source: "manual",
      isNew: true,
    });
  });

  if (createdRooms.length === 0 && createdMarkers.length === 0) return;

  if (createdRooms.length > 0) {
    pushUndo({ type: "create-rooms", rooms: createdRooms });
    currentEditorState.rooms.push(...createdRooms);
  }
  for (const marker of createdMarkers) {
    pushUndo({ type: "create-marker", marker });
    currentEditorState.markers.push(marker);
  }
  currentEditorState.selectedRoomIds = createdRooms.map((r) => r.externalId);
  if (createdMarkers.length > 0) {
    currentEditorState.selectedRoomIds = [];
    currentEditorState.selectedRoom = null;
    currentEditorState.selectedMarker = createdMarkers[0];
  }
  syncSelectedRoomFromIds();
  currentEditorState.isDirty = true;
  renderRooms();
  updateSidePanel();
  updateBottomBar();
  setAdminMapToolsStatus(`${createdRooms.length + createdMarkers.length} elemento(s) pegados. Ctrl+drag para mover, G para guardar.`);
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
    case "create-rooms":
      for (const room of action.rooms) {
        currentEditorState.rooms = currentEditorState.rooms.filter((r) => r.externalId !== room.externalId);
      }
      if (action.rooms.some((r) => currentEditorState.selectedRoom?.externalId === r.externalId)) {
        currentEditorState.selectedRoom = null;
      }
      break;
    case "create-marker":
      currentEditorState.markers = (currentEditorState.markers || []).filter((m) => m.externalId !== action.marker.externalId);
      if (currentEditorState.selectedMarker?.externalId === action.marker.externalId) {
        currentEditorState.selectedMarker = null;
      }
      break;
    case "delete-marker": {
      currentEditorState.markers.push(action.marker);
      if (!action.marker.isNew && currentEditorState.removedMarkerExternalIds) {
        const idx = currentEditorState.removedMarkerExternalIds.indexOf(action.marker.externalId);
        if (idx !== -1) currentEditorState.removedMarkerExternalIds.splice(idx, 1);
      }
      break;
    }
    case "delete-room": {
      const deleted = action.rooms || [action.room];
      currentEditorState.rooms.push(...deleted);
      for (const room of deleted) {
        if (!room.isNew && currentEditorState.removedExternalIds) {
          const idx = currentEditorState.removedExternalIds.indexOf(room.externalId);
          if (idx !== -1) currentEditorState.removedExternalIds.splice(idx, 1);
        }
        if (!room.isNew && currentEditorState.removedManualRoomExternalIds && room.isManual === true) {
          const idx = currentEditorState.removedManualRoomExternalIds.indexOf(room.externalId);
          if (idx !== -1) currentEditorState.removedManualRoomExternalIds.splice(idx, 1);
        }
        if (!room.isNew && currentEditorState.removedSyncedRoomExternalIds && room.isManual !== true) {
          const idx = currentEditorState.removedSyncedRoomExternalIds.indexOf(room.externalId);
          if (idx !== -1) currentEditorState.removedSyncedRoomExternalIds.splice(idx, 1);
        }
      }
      break;
    }
    case "update-property": {
      const room = currentEditorState.rooms.find((r) => r.externalId === action.roomExternalId);
      if (room) room[action.property] = action.prevValue;
      break;
    }
    case "move-rooms":
      action.ids.forEach((id, i) => {
        const shape = findShapeById(id);
        if (shape) shape.geometryJson = action.before[i];
      });
      break;
    case "rotate-rooms":
      action.ids.forEach((id, i) => {
        const shape = findShapeById(id);
        if (shape) shape.geometryJson = action.before[i];
      });
      break;
    case "move-marker": {
      const marker = (currentEditorState.markers || []).find((m) => m.externalId === action.externalId);
      if (marker) {
        marker.latitude = action.before.latitude;
        marker.longitude = action.before.longitude;
      }
      break;
    }
  }

  syncSelectedRoomFromIds();
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
    case "create-rooms":
      currentEditorState.rooms.push(...action.rooms);
      break;
    case "create-marker":
      currentEditorState.markers.push(action.marker);
      currentEditorState.selectedMarker = action.marker;
      break;
    case "delete-marker": {
      currentEditorState.markers = currentEditorState.markers.filter((m) => m.externalId !== action.marker.externalId);
      if (!action.marker.isNew && currentEditorState.removedMarkerExternalIds && !currentEditorState.removedMarkerExternalIds.includes(action.marker.externalId)) {
        currentEditorState.removedMarkerExternalIds.push(action.marker.externalId);
      }
      if (currentEditorState.selectedMarker?.externalId === action.marker.externalId) {
        currentEditorState.selectedMarker = null;
      }
      break;
    }
    case "delete-room": {
      const deleted = action.rooms || [action.room];
      currentEditorState.rooms = currentEditorState.rooms.filter((r) => !deleted.some((d) => d.externalId === r.externalId));
      for (const room of deleted) {
        if (!room.isNew && currentEditorState.removedExternalIds && !currentEditorState.removedExternalIds.includes(room.externalId)) {
          currentEditorState.removedExternalIds.push(room.externalId);
        }
        if (!room.isNew && currentEditorState.removedManualRoomExternalIds && room.isManual === true && !currentEditorState.removedManualRoomExternalIds.includes(room.externalId)) {
          currentEditorState.removedManualRoomExternalIds.push(room.externalId);
        }
        if (!room.isNew && currentEditorState.removedSyncedRoomExternalIds && room.isManual !== true && !currentEditorState.removedSyncedRoomExternalIds.includes(room.externalId)) {
          currentEditorState.removedSyncedRoomExternalIds.push(room.externalId);
        }
      }
      break;
    }
    case "update-property": {
      const room = currentEditorState.rooms.find((r) => r.externalId === action.roomExternalId);
      if (room) room[action.property] = action.newValue;
      break;
    }
    case "move-rooms":
      action.ids.forEach((id, i) => {
        const shape = findShapeById(id);
        if (shape) shape.geometryJson = action.after[i];
      });
      break;
    case "rotate-rooms":
      action.ids.forEach((id, i) => {
        const shape = findShapeById(id);
        if (shape) shape.geometryJson = action.after[i];
      });
      break;
    case "move-marker": {
      const marker = (currentEditorState.markers || []).find((m) => m.externalId === action.externalId);
      if (marker) {
        marker.latitude = action.after.latitude;
        marker.longitude = action.after.longitude;
      }
      break;
    }
  }

  syncSelectedRoomFromIds();
  renderRooms();
  updatePopupContent();
};

const saveRoomEditorMarkers = async (state, pushError) => {
  const blockErrors = [];

  for (const externalId of state.removedMarkerExternalIds || []) {
    const res = await fetch(`${getApiUrl()}/api/map-markers/${encodeURIComponent(externalId)}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      let msg = `Error al eliminar el marcador '${externalId}'.`;
      try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
      blockErrors.push(msg);
    }
  }
  if (blockErrors.length === 0) {
    state.removedMarkerExternalIds = [];
  }

  for (const marker of state.markers || []) {
    if (marker.isNew) {
      const res = await fetch(`${getApiUrl()}/api/map-markers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          externalId: marker.externalId,
          buildingExternalId: marker.buildingExternalId,
          campus: marker.campus || "default",
          floor: marker.floor,
          latitude: marker.latitude,
          longitude: marker.longitude,
          iconKey: marker.iconKey,
          label: marker.label || "",
          notes: marker.notes || "",
        }),
      });
      if (!res.ok) {
        let msg = `Error al crear el marcador '${marker.iconKey}'.`;
        try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
        blockErrors.push(msg);
      } else {
        marker.isNew = false;
      }
    } else {
      const res = await fetch(`${getApiUrl()}/api/map-markers/${encodeURIComponent(marker.externalId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          floor: marker.floor,
          latitude: marker.latitude,
          longitude: marker.longitude,
          iconKey: marker.iconKey,
          label: marker.label || "",
          notes: marker.notes || "",
        }),
      });
      if (!res.ok) {
        let msg = `Error al actualizar el marcador '${marker.iconKey}'.`;
        try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
        blockErrors.push(msg);
      }
    }
  }

  for (const msg of blockErrors) {
    pushError(msg);
  }
};

const showSaveToast = (message, isError = false) => {
  const container = popupContainer || document.body;
  const existing = container.querySelector(".room-editor-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `room-editor-toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  toast.addEventListener("click", () => toast.remove());
  container.appendChild(toast);

  window.setTimeout(() => toast.remove(), isError ? 6000 : 2500);
};

const saveRoomEditor = async () => {
  if (!currentEditorState) return;

  const savedBuildingId = currentEditorState.buildingExternalId;
  setAdminMapToolsStatus("Guardando salas y marcas...");
  showSaveToast("Guardando...");

  const errors = [];

  const pushError = (msg) => {
    errors.push(msg);
    console.error(msg);
  };

  try {
    for (const externalId of currentEditorState.removedManualRoomExternalIds || []) {
      const res = await fetch(`${getApiUrl()}/api/manual-rooms/${encodeURIComponent(externalId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        let msg = `Error al eliminar la sala '${externalId}'.`;
        try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
        pushError(msg);
      }
    }

    for (const externalId of currentEditorState.removedSyncedRoomExternalIds || []) {
      const res = await fetch(`${getApiUrl()}/api/synced-rooms/${encodeURIComponent(externalId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) {
        let msg = `Error al eliminar la sala '${externalId}'.`;
        try { const b = await res.json(); if (b.message) msg += " " + b.message; } catch {}
        pushError(msg);
      }
    }

    for (const room of currentEditorState.rooms) {
      if (room.isNew) {
        const coordinates = parseGeometryToCoordinates(room.geometryJson);
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
          pushError(msg);
        } else {
          room.isNew = false;
          if (currentEditorState.roomSignatures) {
            currentEditorState.roomSignatures[room.externalId] = buildRoomSaveSignature(room);
          }
        }
      } else if (room.isManual === true) {
        const previousSignature = (currentEditorState.roomSignatures || {})[room.externalId];
        if (previousSignature && buildRoomSaveSignature(room) === previousSignature) {
          continue;
        }
        const coordinates = parseGeometryToCoordinates(room.geometryJson);
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
          pushError(msg);
        } else if (currentEditorState.roomSignatures) {
          currentEditorState.roomSignatures[room.externalId] = buildRoomSaveSignature(room);
        }
      }
    }

    await saveRoomEditorMarkers(currentEditorState, pushError);

    if (errors.length > 0) {
      const message = `${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} mas)` : ""}`;
      setAdminMapToolsStatus(message + " ");
      showSaveToast(message, true);
      return;
    }

    currentEditorState.removedExternalIds = [];
    currentEditorState.removedManualRoomExternalIds = [];
    currentEditorState.removedSyncedRoomExternalIds = [];

    setAdminMapToolsStatus("Salas y marcadores guardados correctamente.");

    destroyPopup();
    clearRoomEditorState();
    requestAdminMapToolMode(null);
    setAdminMapToolsStatus("");

    showSaveToast("Salas, marcas y marcadores guardados correctamente.");

    refreshCurrentMapData();

    window.dispatchEvent(new CustomEvent("syntro-rooms-changed", { detail: { buildingExternalId: savedBuildingId } }));
  } catch (error) {
    console.error("Error saving rooms:", error);
    setAdminMapToolsStatus("Error al guardar: " + (error.message || "error inesperado"));
    showSaveToast("Error al guardar: " + (error.message || "error inesperado"), true);
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

const toggleSnap = () => {
  if (!currentEditorState) return;
  currentEditorState.snapEnabled = !currentEditorState.snapEnabled;
  if (!currentEditorState.snapEnabled && currentEditorState.snapPreviewMarker && popupMap) {
    popupMap.removeLayer(currentEditorState.snapPreviewMarker);
    currentEditorState.snapPreviewMarker = null;
  }
  updateBottomBar();
  setAdminMapToolsStatus(`Snap ${currentEditorState.snapEnabled ? "activado" : "desactivado"}.`);
};

const toggleDropdown = () => {
  if (!currentEditorState) return;
  currentEditorState.dropdownOpen = !currentEditorState.dropdownOpen;
  updateBottomBar();
};

const closeDropdown = () => {
  if (!currentEditorState) return;
  currentEditorState.dropdownOpen = false;
};

const copyFloorLayout = () => {
  if (!currentEditorState || currentEditorState.rooms.length === 0) return;
  copiedFloorLayout = currentEditorState.rooms.map((r) => ({
    geometryJson: r.geometryJson,
  }));
  copiedFloorNumber = currentEditorState.selectedFloor;
  updateTopBar();
  setAdminMapToolsStatus(`Layout copiado del piso ${copiedFloorNumber}. Ve a otro piso y pega.`);
};

const pasteFloorLayout = () => {
  if (!currentEditorState || !copiedFloorLayout || copiedFloorLayout.length === 0) return;
  if (copiedFloorNumber === currentEditorState.selectedFloor) {
    setAdminMapToolsStatus("No se puede pegar en el mismo piso de origen.");
    return;
  }

  const created = [];
  for (const copied of copiedFloorLayout) {
    const geom = typeof copied.geometryJson === "string" ? JSON.parse(copied.geometryJson) : copied.geometryJson;
    if (!geom?.coordinates?.[0]) continue;
    const newRoom = {
      externalId: `MAN-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${created.length}`,
      buildingExternalId: currentEditorState.buildingExternalId,
      floor: currentEditorState.selectedFloor,
      displayName: `Sala ${currentEditorState.rooms.length + created.length + 1}`,
      shortName: "",
      type: "sala",
      unit: "",
      service: "",
      status: "active",
      capacity: null,
      geometryJson: JSON.stringify(geom),
      source: "manual",
      notes: "",
      isNew: true,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    };
    created.push(newRoom);
  }

  if (created.length > 0) {
    pushUndo({ type: "create-rooms", rooms: created });
    currentEditorState.rooms.push(...created);
    currentEditorState.isDirty = true;
    renderRooms();
    updatePopupContent();
    setAdminMapToolsStatus(`${created.length} sala(s) pegada(s) en piso ${currentEditorState.selectedFloor}. Ctrl+Z para deshacer.`);
  }
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

const buildRoomSaveSignature = (room) => {
  const coords = parseGeometryToCoordinates(room.geometryJson).map((c) => [
    Number(c[0].toFixed(7)),
    Number(c[1].toFixed(7)),
  ]);
  return JSON.stringify({
    externalId: room.externalId,
    buildingExternalId: room.buildingExternalId,
    floor: room.floor,
    displayName: room.displayName,
    shortName: room.shortName,
    type: room.type,
    unit: room.unit,
    service: room.service,
    status: room.status,
    capacity: room.capacity ?? null,
    notes: room.notes || "",
    coordinates: coords,
  });
};

const METERS_PER_DEG_LAT = 111_320;

const calculateAreaMeters = (coords) => {
  if (!coords || coords.length < 3) return 0;
  const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  const degToM_lng = METERS_PER_DEG_LAT * Math.cos((centerLat * Math.PI) / 180);
  let area = 0;
  const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = coords[i][0] * degToM_lng;
    const yi = coords[i][1] * METERS_PER_DEG_LAT;
    const xj = coords[j][0] * degToM_lng;
    const yj = coords[j][1] * METERS_PER_DEG_LAT;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area) / 2;
};

const escapeHtml = (str) => {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

const runQuickSuggestion = async () => {
  if (!currentEditorState) return;

  setAdminMapToolsStatus("Generando sugerencias...");

  try {
    const buildingGeometry = currentEditorState.buildingGeometry;
    if (!buildingGeometry?.coordinates?.[0]) {
      setAdminMapToolsStatus("No se encontro la geometria del edificio.");
      return;
    }

    const buildingAreaM2 = calculateAreaMeters(buildingGeometry.coordinates[0]);
    const roomAreaM2 = 20;
    const corridorFactor = 0.3;
    const roomCount = Math.max(1, Math.floor((buildingAreaM2 * (1 - corridorFactor)) / roomAreaM2));

    const suggestions = generateContourRooms(buildingGeometry, roomCount, {
      roomDepth: 5,
      corridorWidth: 1.5,
    });

    if (!suggestions || suggestions.length === 0) {
      setAdminMapToolsStatus("El edificio es muy pequeno para generar salas con los parametros actuales.");
      return;
    }

    currentEditorState.suggestions = suggestions.map((s, i) => ({
      externalId: `SUG-${currentEditorState.buildingExternalId}-${currentEditorState.selectedFloor}-${Date.now()}-${i}`,
      displayName: s.DisplayName,
      type: s.Type,
      coordinates: s.Coordinates,
      approved: true,
    }));

    clearSuggestionPreviewLayers();
    renderSuggestionPreviewLayers();
    updateBottomBar();
    setAdminMapToolsStatus(`${suggestions.length} sala(s) sugerida(s). Haz clic en el check para guardarlas.`);
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
