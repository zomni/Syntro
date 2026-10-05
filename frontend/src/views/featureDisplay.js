/////////////////////////////////////////////////////////////////////////////////
///////////////////////// Add interactions with the map /////////////////////////
/////////////////////////////////////////////////////////////////////////////////

import { map, HOST_URL, BACKEND_API_URL } from "../views/map.js";
import { getCatalogFileName, getPrimaryCampusKey } from "../utils/campusConfig.js";
import { mergeCatalogWithSearch, resetSearchMetadataCaches } from "@app/searchMetadata";
import { refreshCurrentMapData, goTo } from "@app/goToCampus";
import { resetBuildingsCatalogCache } from "@app/addData";
import { bindWalkingRouteToggleButton } from "@app/walkingRouteLayer";
import { appConfig } from "../config/appConfig.js";
import { isWayfindingMode } from "../utils/wayfinding.js";
import { canAccessLiveTelemetry } from "../utils/networkTelemetryStorage.js";
import { buildingMatchColor, buildingMatchPercentLabel } from "../utils/buildingMatchGradient.js";
import { pointInRing } from "../utils/roomEditorGeometry.js";

const DISPLAY_LOCALE = appConfig.display.locale;
const DISPLAY_TIME_ZONE = appConfig.display.timeZone;

export let currentOpenFeatureId = null;
let currentOpenLayer = null;
let currentHoveredLayer = null;
let currentSelectedLayer = null;
let popupReturnView = null;
let popupBoundsState = null;
let routeOriginFeatureId = null;
let routeDestinationFeatureId = null;

window.openSyntroDashboard = (event, url) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!url) return false;

  const openWindow = () => {
    const dashboardWindow = window.open("", "syntro-dashboard");
    if (dashboardWindow) {
      dashboardWindow.location.href = url;
      dashboardWindow.focus?.();
    } else {
      window.location.href = url;
    }
  };

  if (url.includes("/dashboard/inventory")) {
    fetch(`${BACKEND_API_URL}/api/auth/mark-inventory-entry`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    })
      .catch(() => {})
      .finally(openWindow);
  } else {
    openWindow();
  }

  return false;
};

export const setPopupViewForFeature = (featureId, viewKey) => {
  if (!featureId || !viewKey) return;
  popupViewState[featureId] = viewKey;
};

export const setPopupRoomForFeature = (featureId, roomId) => {
  if (!featureId) return;
  popupRoomState[featureId] = roomId || null;
};

export const setPopupDeviceForFeature = (featureId, deviceKey) => {
  if (!featureId) return;
  popupDeviceState[featureId] = deviceKey || null;
};



export const setCurrentOpenFeatureId = (featureId) => {
  currentOpenFeatureId = featureId || null;
};

export const clearCurrentOpenFeatureId = () => {
  currentOpenFeatureId = null;
  currentOpenLayer = null;
};

export const closeCurrentPopup = () => {
  if (currentOpenLayer?.closePopup) {
    currentOpenLayer.closePopup();
  } else if (map?.closePopup) {
    map.closePopup();
  }

  clearCurrentOpenFeatureId();
};

if (!window.closeBuildingPanel) {
  window.closeBuildingPanel = () => {
    closeCurrentPopup();
    return false;
  };
}

const isBuildingPanelOpen = () => {
  if (!currentOpenLayer) return false;
  if (typeof currentOpenLayer.isPopupOpen === "function" && currentOpenLayer.isPopupOpen()) return true;
  return document.body.classList.contains("map-building-panel");
};

// Escape debe cerrar el panel de edificio igual que el boton X. Se registra una
// sola vez a nivel de modulo y se condiciona a que el panel siga abierto, para no
// secuestrar la tecla en el resto de modales, inputs o del editor de interiores.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  if (!isBuildingPanelOpen()) return;
  closeCurrentPopup();
});

map.on("click", (event) => {
  if (buildingPanelMapFrozen) return;

  const originalTarget = event?.originalEvent?.target;
  const clickedInsideFeature =
    originalTarget?.closest?.(".leaflet-interactive") ||
    originalTarget?.closest?.(".leaflet-popup");

  if (!clickedInsideFeature) {
    closeCurrentPopup();
  }
});

const applyHighlightedStyle = (layer) => {
  if (!layer?.feature) return;

  const baseStyle = style(layer.feature) || {};
  const baseWeight = Number(baseStyle.weight);
  const baseFillOpacity = Number(baseStyle.fillOpacity);

  layer.setStyle({
    ...baseStyle,
    weight: Number.isFinite(baseWeight) ? Math.max(baseWeight, 5) : 5,
    color: "#666",
    dashArray: "",
    fillOpacity: Number.isFinite(baseFillOpacity) ? Math.max(baseFillOpacity, 0.7) : 0.7,
  });
};

const applyDefaultStyle = (layer) => {
  if (!layer?.feature) return;

  if (currentSelectedLayer === layer) {
    applyHighlightedStyle(layer);
    return;
  }

  if (applyRouteHighlightedStyle(layer)) {
    return;
  }

  layer.setStyle(style(layer.feature));
};

const setSelectedLayer = (layer) => {
  if (currentSelectedLayer && currentSelectedLayer !== layer) {
    applyDefaultStyle(currentSelectedLayer);
  }

  currentSelectedLayer = layer || null;

  if (!currentSelectedLayer) {
    return;
  }

  applyHighlightedStyle(currentSelectedLayer);

  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    currentSelectedLayer.bringToFront();
  }
};

const clearSelectedLayer = (layer = currentSelectedLayer) => {
  if (!layer) return;

  if (currentSelectedLayer === layer) {
    currentSelectedLayer = null;
  }

  applyDefaultStyle(layer);
};

const clearHoveredLayer = () => {
  if (!currentHoveredLayer) return;
  applyDefaultStyle(currentHoveredLayer);
  currentHoveredLayer = null;
};

const getFeatureIdFromLayer = (layer) => layer?.feature?.properties?.id || null;

const getRouteHighlightRole = (featureId) => {
  if (!featureId) return null;
  if (routeOriginFeatureId === featureId) return "origin";
  if (routeDestinationFeatureId === featureId) return "destination";
  return null;
};

const applyRouteHighlightedStyle = (layer, role = getRouteHighlightRole(getFeatureIdFromLayer(layer))) => {
  if (!layer?.feature || typeof layer?.setStyle !== "function" || !role) return false;

  const baseStyle = style(layer.feature) || {};
  const baseWeight = Number(baseStyle.weight);
  const baseFillOpacity = Number(baseStyle.fillOpacity);
  const borderColor = role === "origin" ? "#f97316" : "#2563eb";
  const fillColor = role === "origin" ? "#fed7aa" : "#bfdbfe";

  layer.setStyle({
    ...baseStyle,
    weight: Number.isFinite(baseWeight) ? Math.max(baseWeight, 6) : 6,
    color: borderColor,
    fillColor,
    dashArray: "",
    fillOpacity: Number.isFinite(baseFillOpacity) ? Math.max(baseFillOpacity, 0.8) : 0.8,
  });

  return true;
};

const forEachVisibleFeatureLayer = (callback) => {
  map.eachLayer((mapLayer) => {
    if (mapLayer?.feature?.properties?.id) {
      callback(mapLayer);
    }

    if (typeof mapLayer?.eachLayer === "function") {
      mapLayer.eachLayer((childLayer) => {
        if (childLayer?.feature?.properties?.id) {
          callback(childLayer);
        }
      });
    }
  });
};

const refreshRouteHighlightedLayers = () => {
  forEachVisibleFeatureLayer((layer) => {
    applyDefaultStyle(layer);
  });
};

export const setRouteHighlight = (originFeatureId, destinationFeatureId) => {
  routeOriginFeatureId = originFeatureId || null;
  routeDestinationFeatureId = destinationFeatureId || null;
  refreshRouteHighlightedLayers();
};

export const clearRouteHighlight = () => {
  routeOriginFeatureId = null;
  routeDestinationFeatureId = null;
  refreshRouteHighlightedLayers();
};

const suspendMapBoundsForPopup = () => {
  if (popupBoundsState) return;

  popupBoundsState = {
    maxBounds: map.options.maxBounds || null,
    maxBoundsViscosity: map.options.maxBoundsViscosity,
  };

  map.setMaxBounds(null);
  map.options.maxBoundsViscosity = 0;
};

const restoreMapBoundsAfterPopup = () => {
  if (!popupBoundsState) return;
  if (window.__syntroBoundaryEditing) {
    popupBoundsState = null;
    return;
  }

  const { maxBounds, maxBoundsViscosity } = popupBoundsState;
  popupBoundsState = null;

  if (maxBounds) {
    map.setMaxBounds(maxBounds);
  }

  map.options.maxBoundsViscosity = maxBoundsViscosity ?? 1.0;
};

const popupViewState = {};
const popupFloorState = {};
const popupRoomState = {};
const popupDeviceState = {};
const popupDeviceQueryState = {};
const popupDevicePageSizeState = {};
const popupDeviceSearchOpenState = {};
const popupDeviceTypeFilterState = {};
const popupDeviceScopeState = {};
const popupSectorFilterState = {};
const popupSectorFilterOpenState = {};
let loadedEquipmentRevision = null;
let pendingEquipmentRevision = null;
let latestEquipmentSyncState = null;
let equipmentSyncPollHandle = null;
let equipmentSyncRetryHandle = null;
let backendStatusPanel = null;
let backendSessionCache = null;
let backendSessionCacheAt = 0;
let backendSessionPendingPromise = null;
let buildingEquipmentSummaryCache = null;
let buildingEquipmentSummaryPromise = null;
let globalEquipmentTypeFilter = "";
let lastKnownSessionIsAuthenticated = false;
const buildingEquipmentBubbleEntries = new Map();
const buildingMatchBubbleEntries = new Map();
let buildingMatchModeActive = false;
let buildingMatchData = null;
let buildingMatchDataPromise = null;
let warnedMissingMatchRate = false;

const registerMatchBubble = (featureId, marker) => {
  if (!featureId || !marker) return;
  const markers = buildingMatchBubbleEntries.get(featureId);
  if (markers) {
    markers.add(marker);
    return;
  }
  buildingMatchBubbleEntries.set(featureId, new Set([marker]));
};

const discardMatchBubble = (featureId, marker) => {
  const markers = buildingMatchBubbleEntries.get(featureId);
  if (!markers) return;

  markers.delete(marker);
  if (markers.size === 0) {
    buildingMatchBubbleEntries.delete(featureId);
  }
};

const removeMatchBubbleMarker = (featureId, marker) => {
  if (!marker) return;
  if (map.hasLayer(marker)) {
    map.removeLayer(marker);
  }
  discardMatchBubble(featureId, marker);
};

const removeAllMatchBubbles = () => {
  buildingMatchBubbleEntries.forEach((markers, featureId) => {
    Array.from(markers).forEach((marker) => removeMatchBubbleMarker(featureId, marker));
  });
  buildingMatchBubbleEntries.clear();
};
const EQUIPMENT_SYNC_POLL_MS = 30000;
const EQUIPMENT_SYNC_RETRY_MS = 5000;
const BACKEND_SESSION_CACHE_MS = 15000;
const BUILDING_LABELS_STORAGE_KEY = "syntro_building_labels_visible";
let buildingLabelsVisible = window.sessionStorage?.getItem(BUILDING_LABELS_STORAGE_KEY) === "true";

const setBuildingLabelsVisible = (isVisible) => {
  buildingLabelsVisible = Boolean(isVisible);
  document.documentElement.classList.toggle("building-labels-hidden", !isVisible);

  const button = document.getElementById("building-label-toggle");
  if (button) {
    button.textContent = isVisible ? "Ocultar nombres" : "Mostrar nombres";
    button.setAttribute("aria-pressed", String(isVisible));
    button.classList.toggle("is-muted", !isVisible);
  }
};

const bindBuildingLabelToggleButton = (button) => {
  if (!button || button.dataset.bound === "true") return;

  button.dataset.bound = "true";
  L.DomEvent.disableClickPropagation(button);

  button.addEventListener("mousedown", (event) => event.stopPropagation());
  button.addEventListener("dblclick", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setBuildingLabelsVisible(!buildingLabelsVisible);
    window.sessionStorage?.setItem(BUILDING_LABELS_STORAGE_KEY, String(buildingLabelsVisible));
  });
};

const initBuildingLabelToggle = () => {
  setBuildingLabelsVisible(buildingLabelsVisible);
  bindBuildingLabelToggleButton(document.getElementById("building-label-toggle"));
};

const updateBackendSessionCache = (session) => {
  backendSessionCache = session || { isAuthenticated: false, isAdmin: false };
  backendSessionCacheAt = Date.now();
  window.syntroBackendSession = backendSessionCache;
};

const canManageEquipmentAssignments = (session) => {
  const role = String(session?.role || "").toLowerCase();
  return role === "admin" || role === "editor";
};

const loadBackendSession = async () => {
  const now = Date.now();
  if (backendSessionCache && now - backendSessionCacheAt < BACKEND_SESSION_CACHE_MS) {
    return backendSessionCache;
  }

  if (backendSessionPendingPromise) {
    return backendSessionPendingPromise;
  }

  backendSessionPendingPromise = (async () => {
    try {
      const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) {
        backendSessionCache = { isAuthenticated: false, isAdmin: false };
      } else {
        backendSessionCache = await response.json();
      }
    } catch {
      backendSessionCache = { isAuthenticated: false, isAdmin: false };
    }

    backendSessionCacheAt = Date.now();
    window.syntroBackendSession = backendSessionCache;
    return backendSessionCache;
  })();

  try {
    return await backendSessionPendingPromise;
  } finally {
    backendSessionPendingPromise = null;
  }
};

const resetBuildingEquipmentSummaryCache = () => {
  buildingEquipmentSummaryCache = null;
  buildingEquipmentSummaryPromise = null;
  buildingEquipmentBubbleEntries.forEach((entry) => {
    if (entry.marker && map.hasLayer(entry.marker)) {
      map.removeLayer(entry.marker);
    }
  });
  buildingEquipmentBubbleEntries.clear();
};

export const clearMapEquipmentState = () => {
  resetBuildingEquipmentSummaryCache();
  closeCurrentPopup();
  clearSelectedLayer();
};

const loadBuildingEquipmentSummary = async () => {
  const session = await loadBackendSession();
  if (!session?.isAuthenticated) {
    return new Map();
  }

  if (buildingEquipmentSummaryCache) {
    return buildingEquipmentSummaryCache;
  }

  if (buildingEquipmentSummaryPromise) {
    return buildingEquipmentSummaryPromise;
  }

  buildingEquipmentSummaryPromise = fetch(`${BACKEND_API_URL}/api/inventory-import/building-summary`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((response) => (response.ok ? response.json() : []))
    .then((items) => {
      const map = new Map();
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item?.buildingExternalId) {
            map.set(item.buildingExternalId, {
              total: Number(item.total) || 0,
              byType: item.byType || {},
              byFloor: item.byFloor || {},
            });
          }
        }
      }

      buildingEquipmentSummaryCache = map;
      return map;
    })
    .catch((error) => {
      console.error("Error cargando resumen de equipos por edificio:", error);
      buildingEquipmentSummaryCache = new Map();
      return buildingEquipmentSummaryCache;
    })
    .finally(() => {
      buildingEquipmentSummaryPromise = null;
    });

  return buildingEquipmentSummaryPromise;
};

const formatSyncTimestamp = (value) => {
  if (!value) return "Sin registros";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Sin registros";
  }

  return date.toLocaleString(DISPLAY_LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
};

const getFrontendCacheVersion = () => {
  const candidates = [
    document.querySelector('script[type="importmap"]')?.textContent || "",
    ...Array.from(document.querySelectorAll("link[rel='stylesheet']")).map((link) => link.href || ""),
  ];

  for (const value of candidates) {
    const match = String(value).match(/[?&]v=([a-zA-Z0-9._-]+)/);
    if (match?.[1]) {
      return `Mapa ${match[1]}`;
    }
  }

  return "Mapa actual";
};

const getBackendStatusPanelMarkup = () => `
  <span id="backend-status-indicator" class="backend-status-indicator" aria-label="Estado de la API"></span>
  <span id="backend-status-text" hidden></span>
  <span id="backend-version" hidden></span>
  <span id="backend-last-change" hidden></span>
<span id="backend-sync-message" hidden></span>
  <button id="backend-refresh-button" type="button" hidden></button>
`;

const ensureBackendStatusPanel = () => {
  if (
    backendStatusPanel &&
    backendStatusPanel.root?.isConnected &&
    backendStatusPanel.statusText?.isConnected &&
    backendStatusPanel.version?.isConnected &&
    backendStatusPanel.lastChange?.isConnected &&
    backendStatusPanel.message?.isConnected
  ) {
    return backendStatusPanel;
  }

  const root = document.getElementById("map-status-panel");
  if (!root) return null;

  const hasCompleteMarkup =
    root.querySelector(".backend-status-indicator[data-backend-minimal]") &&
    root.querySelector("#backend-status-text") &&
    root.querySelector("#backend-version") &&
    root.querySelector("#backend-last-change") &&
    root.querySelector("#backend-sync-message");

  if (!hasCompleteMarkup) {
    root.innerHTML = getBackendStatusPanelMarkup();
    root.querySelector(".backend-status-indicator")?.setAttribute("data-backend-minimal", "true");
  }

  const panel = {
    root,
    statusText: root.querySelector("#backend-status-text"),
    version: root.querySelector("#backend-version"),
    lastChange: root.querySelector("#backend-last-change"),
    message: root.querySelector("#backend-sync-message"),
    refreshButton: root.querySelector("#backend-refresh-button"),
    dashboardLink: document.getElementById("dashboard-link"),
  };

  if (panel.dashboardLink) {
    panel.dashboardLink.href = `${BACKEND_API_URL}/dashboard`;
  }

panel.refreshButton?.addEventListener("click", async () => {
    loadedEquipmentRevision = pendingEquipmentRevision || loadedEquipmentRevision;
    pendingEquipmentRevision = null;
    resetBuildingEquipmentSummaryCache();
    resetSearchMetadataCaches();
    resetBuildingsCatalogCache();
    refreshCurrentMapData();
    if (typeof window.refreshRoutePlannerBuildings === "function") {
      await window.refreshRoutePlannerBuildings();
    }
    if (typeof window.refreshVisibleWalkingRoutes === "function") {
      await window.refreshVisibleWalkingRoutes();
    }
    updateBackendStatusPanel(latestEquipmentSyncState);
    await refreshCurrentPopup();
  });

  backendStatusPanel = panel;
  return panel;
};

const updateBackendStatusPanel = (syncState) => {
  const panel = ensureBackendStatusPanel();
  if (!panel) return;

  const isOnline = !!syncState;
  const hasPendingChanges = !!pendingEquipmentRevision;

  panel.root.dataset.backendState = isOnline ? "online" : "offline";
  panel.root.dataset.pendingChanges = hasPendingChanges ? "true" : "false";

if (!isOnline) {
    panel.statusText.textContent = "Sin conexion con la API";
    panel.version.textContent = "Mapa actual";
    panel.lastChange.textContent = "Sin registros";
    panel.message.textContent = "No hay actualizaciones pendientes.";
    panel.refreshButton.hidden = true;
    return;
  }

  panel.statusText.textContent = hasPendingChanges ? "API activa con cambios pendientes" : "API activa";
  panel.version.textContent = getFrontendCacheVersion();
  panel.lastChange.textContent = formatSyncTimestamp(syncState?.latestChangeUtc);
  panel.message.textContent = hasPendingChanges
    ? "Hay cambios pendientes en el mapa o inventario. Usa Actualizar mapa."
    : "No hay actualizaciones pendientes.";
panel.refreshButton.hidden = !hasPendingChanges;
};

const loadEquipmentSyncState = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/inventory-import/sync-state`, {
      cache: "no-store",
    });

    if (!response.ok) {
      latestEquipmentSyncState = null;
      updateBackendStatusPanel(null);
      return null;
    }

    const syncState = await response.json();
    latestEquipmentSyncState = syncState;
    return syncState;
  } catch (error) {
    console.error("Error consultando sync-state de equipos:", error);
    latestEquipmentSyncState = null;
    updateBackendStatusPanel(null);
    return null;
  }
};

const scheduleEquipmentSyncRetry = () => {
  window.clearTimeout(equipmentSyncRetryHandle);
  equipmentSyncRetryHandle = window.setTimeout(() => {
    backendStatusPanel = null;
    checkEquipmentSyncState();
  }, EQUIPMENT_SYNC_RETRY_MS);
};

const checkEquipmentSyncState = async () => {
  const syncState = await loadEquipmentSyncState();
  const revision = syncState?.revision;

  if (!syncState || !revision) {
    updateBackendStatusPanel(syncState);
    scheduleEquipmentSyncRetry();
    return;
  }

  if (!loadedEquipmentRevision) {
    loadedEquipmentRevision = revision;
    pendingEquipmentRevision = null;
    updateBackendStatusPanel(syncState);
    return;
  }

  pendingEquipmentRevision = revision !== loadedEquipmentRevision ? revision : null;
  updateBackendStatusPanel(syncState);
};

const acknowledgeCurrentMapSyncState = async () => {
  const syncState = await loadEquipmentSyncState();
  const revision = syncState?.revision;

  if (syncState && revision) {
    loadedEquipmentRevision = revision;
    pendingEquipmentRevision = null;
  }

  updateBackendStatusPanel(syncState);
};

window.acknowledgeCurrentMapSyncState = acknowledgeCurrentMapSyncState;

const startEquipmentSyncMonitor = () => {
  ensureBackendStatusPanel();
  void checkEquipmentSyncState();

  window.addEventListener("focus", checkEquipmentSyncState);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkEquipmentSyncState();
    }
  });

  window.clearInterval(equipmentSyncPollHandle);
  equipmentSyncPollHandle = window.setInterval(() => {
    backendStatusPanel = null;
    checkEquipmentSyncState();
  }, EQUIPMENT_SYNC_POLL_MS);
};

const loadBuildingsCatalog = async () => {
  try {
    const response = await fetch(`${getCatalogFileName()}?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudo cargar catalogo de edificios");
    }

    const catalog = await response.json();
    return await mergeCatalogWithSearch(catalog);
  } catch (error) {
    console.error("Error cargando catálogo de edificios:", error);
    return { buildings: [] };
  }
};

const findBuildingInCatalog = async (feature) => {
  const id = feature?.properties?.id;
  if (!id) return null;

  const catalog = await loadBuildingsCatalog();
  const buildings = catalog?.buildings || [];

  return buildings.find((building) => building.id === id) || null;
};

const loadBuildingDetail = async (building) => {
  if (!building) return null;

  try {
    const response = await fetch(
      `data/interiors/${building.id}/building_detail.json?v=${Date.now()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`Error cargando building_detail de ${building.id}:`, error);
    return null;
  }
};

const loadBackendRoomsForBuilding = async (building) => {
  if (!building?.id) {
    return [];
  }

  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/synced-rooms?buildingExternalId=${encodeURIComponent(building.id)}`,
      { cache: "no-store" }
    );

    const items = response.ok ? await response.json() : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error(`Error cargando override de salas del backend de ${building.id}:`, error);
    return [];
  }
};

const mergeRoomsWithBackendOverrides = (localRooms, backendRooms) => {
  const backendRoomsById = new Map(backendRooms.map((room) => [room.externalId, room]));

  return localRooms.map((room) => {
    const backendRoom = backendRoomsById.get(room.roomId);
    if (!backendRoom) {
      return room;
    }

    return {
      ...room,
      name: backendRoom.name || room.name,
      floor: backendRoom.floor ?? room.floor,
      type: backendRoom.type || room.type,
      unit: backendRoom.unit || room.unit,
      service: backendRoom.service || room.service,
      status: backendRoom.status || room.status,
      responsibleArea: backendRoom.responsibleArea || room.responsibleArea,
      responsiblePerson: backendRoom.responsiblePerson || room.responsiblePerson,
    };
  });
};

const loadRoomsForBuilding = async (building) => {
  if (!building || !Array.isArray(building.floors) || building.floors.length === 0) {
    return [];
  }

  const roomFilePromises = building.floors.map(async (floor) => {
    try {
      const response = await fetch(
        `data/interiors/${building.id}/floor_${floor}_rooms.json?v=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return Array.isArray(data.rooms) ? data.rooms : [];
    } catch (error) {
      console.error(`Error cargando salas de ${building.id} piso ${floor}:`, error);
      return [];
    }
  });

  const [roomsByFloor, backendRooms, manualRooms] = await Promise.all([
    Promise.all(roomFilePromises),
    loadBackendRoomsForBuilding(building),
    loadManualRoomsForBuilding(building),
  ]);

  const mergedRooms = mergeRoomsWithBackendOverrides(roomsByFloor.flat(), backendRooms);
  const knownRoomIds = new Set(mergedRooms.map((room) => room.roomId));

  return [...mergedRooms, ...manualRooms.filter((room) => !knownRoomIds.has(room.roomId))];
};

const loadManualRoomsForBuilding = async (building) => {
  if (!building?.id) {
    return [];
  }

  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/manual-rooms?buildingExternalId=${encodeURIComponent(building.id)}`,
      { cache: "no-store" }
    );

    const rooms = response.ok ? await response.json() : [];
    return (Array.isArray(rooms) ? rooms : []).map((room) => ({
      roomId: room.externalId,
      name: room.displayName || room.shortName || room.externalId,
      shortName: room.shortName || "",
      floor: room.floor ?? 0,
      type: room.type || "",
      unit: room.unit || "",
      service: room.service || "",
      status: room.status || "",
      responsibleArea: "",
      responsiblePerson: "",
      notes: room.notes || "",
      source: "manual",
      geometryJson: room.geometryJson || "",
    }));
  } catch (error) {
    console.error(`Error cargando salas manuales del backend de ${building.id}:`, error);
    return [];
  }
};

const loadBackendInventoryForBuilding = async (building) => {
  if (!building?.id) {
    return [];
  }

  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/inventory-import/items?assignedBuildingExternalId=${encodeURIComponent(
        building.id
      )}`,
      { cache: "no-store", credentials: "include" }
    );

    const items = response.ok ? await response.json() : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error(`Error cargando inventory del backend de ${building.id}:`, error);
    return [];
  }
};

const loadBuildingActivity = async (building) => {
  if (!building?.id) {
    return [];
  }

  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/activity-log/building?buildingExternalId=${encodeURIComponent(building.id)}&take=6`,
      { cache: "no-store", credentials: "include" }
    );

    const items = response.ok ? await response.json() : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error(`Error cargando actividad del edificio ${building.id}:`, error);
    return [];
  }
};

const normalizeImportedInventoryItems = (items) => {
  return items.map((item) => ({
    deviceId: item?.id ? `inventory-${item.id}` : `inventory-row-${item?.rowNumber || "na"}`,
    name: item?.serialNumber || item?.description || item?.itemNumber || "Equipo",
    type: item?.inferredCategory || "other",
    status: item?.inferredStatus || "active",
    ip: item?.ipAddress || "",
    roomId: item?.assignedRoomExternalId || "",
    assignedFloor:
      item?.assignedFloor === null || item?.assignedFloor === undefined || item?.assignedFloor === ""
        ? null
        : Number(item.assignedFloor),
    assignedTo: item?.responsibleUser || "",
    inventoryCode: item?.itemNumber || "",
    serialNumber: item?.serialNumber || "",
    description: item?.description || "",
    organizationalUnit: item?.organizationalUnit || "",
    unitOrDepartment: item?.unitOrDepartment || "",
    notes: item?.assignmentNotes || item?.observation || "",
    history: [],
  }));
};

const getFeatureDisplayName = (feature, building) => {
  if (building) {
    return (
      building.searchTitle ||
      building.realName ||
      building.displayName ||
      feature?.properties?.name ||
      feature?.properties?.sourceId ||
      "Edificio sin nombre"
    );
  }

  return (
    feature?.properties?.name ||
    feature?.properties?.sourceId ||
    "Edificio sin nombre"
  );
};

const getFeatureMapLabel = (feature) => {
  const properties = feature?.properties || {};
  return (
    properties.mapLabel ||
    properties.title ||
    properties.name ||
    properties.realName ||
    properties.displayName ||
    properties.sourceId ||
    properties.id ||
    "Edificio"
  );
};

const compactMapLabel = (value) => {
  const label = String(value || "Edificio").replace(/\s+/g, " ").trim();
  const maxLength = 34;

  if (label.length <= maxLength) {
    return label;
  }

  const words = label.split(" ");
  let compact = "";

  for (const word of words) {
    const next = compact ? `${compact} ${word}` : word;
    if (next.length > maxLength - 3) {
      break;
    }
    compact = next;
  }

  return `${compact || label.slice(0, maxLength - 3)}...`;
};

const bindBuildingNameLabel = (feature, layer) => {
  const fullLabel = getFeatureMapLabel(feature);
  const compactLabel = compactMapLabel(fullLabel);

  layer.bindTooltip(
    `<span title="${escapeHtml(fullLabel)}">${escapeHtml(compactLabel)}</span>`,
    {
      permanent: true,
      direction: "center",
      className: "building-name-label",
      opacity: 1,
      interactive: false,
    }
  );

  if (buildingLabelsVisible) {
    layer.openTooltip?.();
  }

  setBuildingLabelsVisible(buildingLabelsVisible);
};

const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const normalizeDeviceKey = (value) => String(value ?? "").trim().toLowerCase();

const matchesDeviceKey = (device, targetKey) => {
  const target = normalizeDeviceKey(targetKey);
  if (!target) return false;

  const candidates = [
    device?.serialNumber,
    device?.deviceId,
    device?.name,
    device?.inventoryCode,
  ];

  return candidates.some((value) => {
    const normalized = normalizeDeviceKey(value);
    if (!normalized) return false;
    return normalized === target || normalized.includes(target) || target.includes(normalized);
  });
};

const stripDiacritics = (value) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normalizeSearchText = (value) => stripDiacritics(value).toLowerCase().trim();

const deviceMatchesQuery = (device, query, roomsMap) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const room = roomsMap.get(device?.roomId);
  const haystack = normalizeSearchText([
    device?.serialNumber,
    device?.description,
    device?.name,
    device?.deviceId,
    device?.inventoryCode,
    device?.ip,
    device?.roomId,
    room?.name,
    room?.shortName,
    room?.unit,
    room?.service,
  ]
    .filter(Boolean)
    .join(" "));

  if (!haystack) return false;
  return tokens.every((token) => haystack.includes(token));
};

const buildDeviceControlsHtml = (
  featureId,
  query,
  isOpen,
  pageSize,
  extraActions = "",
  sectorOptions = [],
  sectorFilter = "",
  filtersOpen = false
) => {
  const sizeOptions = [5, 10, 20, 50];
  const resolvedSize = Math.max(5, Number(pageSize) || 5);
  const buttonLabel = isOpen ? "Cerrar" : "Buscar";
  const inputHtml = isOpen
    ? `<input type="text" value="${escapeHtml(query || "")}" placeholder="Buscar equipo..."`
        + ` oninput="window.setDeviceSearch && window.setDeviceSearch('${escapeHtml(featureId)}', this.value)"`
        + ` style="flex:1; min-width:160px; padding:8px 10px; border:1px solid #cbd5f5; border-radius:10px; font-size:12px;" />`
    : "";

  let sizeButtons = "";
  for (const size of sizeOptions) {
    const isActive = resolvedSize === size;
    sizeButtons += `
      <button
        class="floorButton equipment-panel-chip-button${isActive ? " is-active" : ""}"
        style="${getChipButtonStyle(isActive, true)}"
        onclick="window.setDevicePageSize && window.setDevicePageSize('${escapeHtml(featureId)}', ${size})"
      >
        ${size}
      </button>`;
  }

  const hasSectorFilters = sectorOptions.length > 0;
  const activeSector = hasSectorFilters ? sectorOptions.find((s) => s.roomId === sectorFilter) : null;

  let filtersButtonHtml = "";
  let activeFilterBannerHtml = "";
  let filtersPanelHtml = "";

  if (hasSectorFilters) {
    filtersButtonHtml = `
      <button
        class="floorButton equipment-panel-chip-button${Boolean(activeSector) || filtersOpen ? " is-active" : ""}"
        style="${getChipButtonStyle(Boolean(activeSector) || filtersOpen, false)}"
        onclick="window.toggleSectorFilters && window.toggleSectorFilters('${escapeHtml(featureId)}')"
      >
        ${resizeIcon(PACKAGE_ICON_SVG)} Filtros
      </button>`;

    if (activeSector) {
      activeFilterBannerHtml = `
        <div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <span style="${CHIP_BASE_STYLE}; background:#0ea5e91f; color:#0284c7;">
            ${resizeIcon(ROOM_ICON_SVG)}
            ${escapeHtml(activeSector.name)} · ${activeSector.count} equipo(s)
          </span>
          <button
            class="floorButton equipment-panel-action-button"
            style="${getActionButtonStyle()}"
            onclick="window.clearSectorFilter && window.clearSectorFilter('${escapeHtml(featureId)}')"
          >
            Quitar filtro
          </button>
        </div>`;
    }

    if (filtersOpen) {
      const allChips = `
        <button
          class="floorButton equipment-panel-chip-button${activeSector ? "" : " is-active"}"
          style="${getChipButtonStyle(!activeSector, true)}"
          onclick="window.clearSectorFilter && window.clearSectorFilter('${escapeHtml(featureId)}')"
        >
          Todos los sectores
        </button>`;
      const sectorChips = sectorOptions
        .map(
          (s) => `
            <button
              class="floorButton equipment-panel-chip-button${activeSector?.roomId === s.roomId ? " is-active" : ""}"
              style="${getChipButtonStyle(activeSector?.roomId === s.roomId, true)}"
              onclick="window.setSectorFilter && window.setSectorFilter('${escapeHtml(featureId)}', '${escapeHtml(s.roomId)}')"
            >
              ${escapeHtml(s.name)} · ${s.count}
            </button>`
        )
        .join("");
      filtersPanelHtml = `
        <div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <div style="font-size:12px; color:#475569;">Filtrar por sector</div>
          ${allChips}
          ${sectorChips}
        </div>`;
    }
  }

  return `
    <div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
      <button
        class="floorButton equipment-panel-action-button"
        style="${getActionButtonStyle()}"
        onclick="window.toggleDeviceSearch && window.toggleDeviceSearch('${escapeHtml(featureId)}')"
      >
        ${buttonLabel}
      </button>
      ${inputHtml}
      ${filtersButtonHtml}
      ${extraActions}
    </div>
    ${activeFilterBannerHtml}
    ${filtersPanelHtml}
    <div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
      <div style="font-size:12px; color:#475569;">Mostrar</div>
      ${sizeButtons}
    </div>
  `;
};


const INVENTORY_CATEGORY_ORDER = appConfig.inventoryCategories.order;
const INVENTORY_CATEGORY_LABELS = appConfig.inventoryCategories.labels;

const countDevicesByType = (devices) => {
  const counts = { other: 0 };

  for (const device of devices) {
    const type = normalizeDeviceType(device?.type);
    counts[type] = (counts[type] || 0) + 1;
  }

  return counts;
};

const normalizeDeviceType = (value) => {
  const type = String(value || "other").trim().toLowerCase();
  return type || "other";
};

const getDeviceTypeLabel = (type) => {
  if (type === "all") return "TODOS";
  const label = INVENTORY_CATEGORY_LABELS[type];
  return label || type;
};

const getDeviceTypeCount = (byType, type) => Number(byType?.[type]) || 0;

const getSummaryCountForType = (summary, type = globalEquipmentTypeFilter, floor = null) => {
  if (!summary) return 0;
  const floorSummary = floor === null ? summary : summary.byFloor?.[String(floor)];
  // Keep counts visible for responses from an older API without byFloor data.
  if (floor !== null && !floorSummary && !summary.byFloor) return getSummaryCountForType(summary, type, null);
  if (floor !== null && !floorSummary) return 0;
  const scopedSummary = floorSummary || summary;
  const normalizedType = normalizeDeviceType(type || "all");
  if (!normalizedType || normalizedType === "all") {
    return Number(scopedSummary.total) || 0;
  }

  return getDeviceTypeCount(scopedSummary.byType, normalizedType);
};

const getSelectedMapFloor = () => {
  const selected = document.querySelector(
    "#floorButtons-container .selectedFloorButton, #map-floor-filter-buttons .selectedFloorButton"
  );
  const floor = Number(selected?.textContent);
  return Number.isFinite(floor) ? floor : 0;
};

const getAvailableDeviceTypes = (devices) => {
  const types = Array.from(new Set(devices.map((device) => normalizeDeviceType(device?.type))));
  const preferredOrder = INVENTORY_CATEGORY_ORDER;
  return types.sort((a, b) => {
    const indexA = preferredOrder.includes(a) ? preferredOrder.indexOf(a) : preferredOrder.length;
    const indexB = preferredOrder.includes(b) ? preferredOrder.indexOf(b) : preferredOrder.length;
    if (indexA !== indexB) return indexA - indexB;
    return a.localeCompare(b);
  });
};

const getAvailableSummaryTypes = (summaryMap) => {
  const types = new Set();
  summaryMap.forEach((summary) => {
    Object.keys(summary?.byType || {}).forEach((type) => {
      const normalized = normalizeDeviceType(type);
      if (normalized) {
        types.add(normalized);
      }
    });
  });

  return getAvailableDeviceTypes(Array.from(types).map((type) => ({ type })));
};

const createEquipmentBubbleIcon = (count, { emptyWhenZero = false } = {}) => {
  const normalizedCount = Number(count) || 0;
  const label = normalizedCount > 0
    ? `${normalizedCount} equipo(s) asignados`
    : "Sin equipos asignados";
  const visibleCount = emptyWhenZero && normalizedCount === 0 ? "" : normalizedCount;

  return L.divIcon({
    className: "building-equipment-bubble",
    html: `<button type="button" aria-label="${label}">${visibleCount}</button>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
};

const updateBuildingEquipmentBubbles = () => {
  if (buildingMatchModeActive) return;

  if (!window.syntroBackendSession?.isAuthenticated) {
    buildingEquipmentBubbleEntries.forEach((entry) => {
      if (entry.marker && map.hasLayer(entry.marker)) {
        map.removeLayer(entry.marker);
      }
    });
    buildingEquipmentBubbleEntries.clear();
    return;
  }

  const selectedFloor = getSelectedMapFloor();
  buildingEquipmentBubbleEntries.forEach((entry) => {
    const count = getSummaryCountForType(entry.summary, globalEquipmentTypeFilter, selectedFloor);

    if (count <= 0) {
      if (entry.marker && map.hasLayer(entry.marker)) {
        map.removeLayer(entry.marker);
      }
      return;
    }

    entry.marker.setIcon(createEquipmentBubbleIcon(count));
    entry.marker.options.title = `${count} equipo(s) asignados`;

    if (!map.hasLayer(entry.marker) && entry.layer?._map) {
      entry.marker.addTo(map);
    }
  });
};

const syncFloorButtonsToFilter = () => {
  if (isWayfindingMode()) {
    const host = document.getElementById("floorButtons-container");
    if (!host) return;
    document.querySelectorAll("#map-floor-filter-buttons [id^='b']").forEach((button) => {
      if (button.id !== "bLoc") host.appendChild(button);
    });
    return;
  }

  const floorHost = document.getElementById("map-floor-filter-buttons");
  if (!floorHost) return;

  document.querySelectorAll("#floorButtons-container [id^='b']").forEach((button) => {
    if (button.id !== "bLoc") floorHost.appendChild(button);
  });
};

const ensureWayfindingControls = () => {
  if (!isWayfindingMode()) return;
  const topActions = document.getElementById("top-actions");
  if (!topActions) return;

  let wrapper = document.getElementById("map-wayfinding-controls");
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.id = "map-wayfinding-controls";
    wrapper.className = "map-equipment-type-filter";
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);

    const labelToggle = document.createElement("button");
    labelToggle.id = "building-label-toggle";
    labelToggle.className = "dashboard-link building-label-toggle is-muted";
    labelToggle.type = "button";
    labelToggle.setAttribute("aria-pressed", "false");
    labelToggle.textContent = "Mostrar nombres";
    wrapper.appendChild(labelToggle);
    bindBuildingLabelToggleButton(labelToggle);
    setBuildingLabelsVisible(buildingLabelsVisible);

    const routeVisibilityToggle = document.createElement("button");
    routeVisibilityToggle.id = "walking-route-toggle";
    routeVisibilityToggle.className = "dashboard-link building-label-toggle is-muted";
    routeVisibilityToggle.type = "button";
    routeVisibilityToggle.setAttribute("aria-pressed", "false");
    routeVisibilityToggle.textContent = "Mostrar rutas";
    wrapper.appendChild(routeVisibilityToggle);
    bindWalkingRouteToggleButton(routeVisibilityToggle);

    const routePlannerToggle = document.getElementById("route-planner-toggle");
    const navigationGroup = document.getElementById("navigation-panel-group");
    if (navigationGroup) {
      topActions.insertBefore(wrapper, navigationGroup);
    } else if (routePlannerToggle) {
      topActions.insertBefore(wrapper, routePlannerToggle);
    } else {
      topActions.appendChild(wrapper);
    }
  }

  syncFloorButtonsToFilter();
  syncEquipmentTypeFilterVisibility();
};

let previousWayfindingState = false;

export const initWayfindingControls = () => {
  const active = isWayfindingMode();
  const entering = active && !previousWayfindingState;
  const leaving = !active && previousWayfindingState;

  if (entering) {
    clearMapEquipmentState();
  }

  ensureWayfindingControls();

  if (leaving) {
    refreshCurrentMapData();
  }

  previousWayfindingState = active;
};

const ensureMapEquipmentTypeFilter = (summaryMap) => {
  const topActions = document.getElementById("top-actions");
  if (!topActions) return;
  if (document.getElementById("map-equipment-filters")) {
    syncFloorButtonsToFilter();
    return;
  }

  const types = ["all", ...getAvailableSummaryTypes(summaryMap)];

  const wrapper = document.createElement("div");
  wrapper.id = "map-equipment-filters";
  wrapper.className = "map-equipment-type-filter";
  L.DomEvent.disableClickPropagation(wrapper);
  L.DomEvent.disableScrollPropagation(wrapper);

  const label = document.createElement("span");
  label.textContent = "Filtros";

  const typeLabel = document.createElement("label");
  typeLabel.className = "map-equipment-type-filter-field";
  typeLabel.htmlFor = "map-equipment-type-filter";

  const typeText = document.createElement("small");
  typeText.textContent = "Tipo de equipo";

  const select = document.createElement("select");
  select.id = "map-equipment-type-filter";
  select.className = "map-equipment-type-filter-select";
  select.disabled = types.length <= 1;

  for (const type of types) {
    const option = document.createElement("option");
    option.value = type === "all" ? "" : type;
    option.textContent = getDeviceTypeLabel(type);
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    globalEquipmentTypeFilter = select.value || "";
    updateBuildingEquipmentBubbles();
  });

  wrapper.appendChild(label);
  typeLabel.appendChild(typeText);
  typeLabel.appendChild(select);
  wrapper.appendChild(typeLabel);

  const floorFilter = document.createElement("div");
  floorFilter.className = "map-floor-filter";
  floorFilter.innerHTML = '<small>Piso</small><div id="map-floor-filter-buttons" class="map-floor-filter-buttons"></div>';
  wrapper.appendChild(floorFilter);
  syncFloorButtonsToFilter();

  const labelToggle = document.createElement("button");
  labelToggle.id = "building-label-toggle";
  labelToggle.className = "dashboard-link building-label-toggle is-muted";
  labelToggle.type = "button";
  labelToggle.setAttribute("aria-pressed", "false");
  labelToggle.textContent = "Mostrar nombres";
  wrapper.appendChild(labelToggle);
  bindBuildingLabelToggleButton(labelToggle);
  setBuildingLabelsVisible(buildingLabelsVisible);

  const routeVisibilityToggle = document.createElement("button");
  routeVisibilityToggle.id = "walking-route-toggle";
  routeVisibilityToggle.className = "dashboard-link building-label-toggle is-muted";
  routeVisibilityToggle.type = "button";
  routeVisibilityToggle.setAttribute("aria-pressed", "false");
  routeVisibilityToggle.textContent = "Mostrar rutas";
  wrapper.appendChild(routeVisibilityToggle);
  bindWalkingRouteToggleButton(routeVisibilityToggle);

  const routeToggle = document.getElementById("route-planner-toggle");
  const navigationGroup = document.getElementById("navigation-panel-group");
  if (navigationGroup) {
    topActions.insertBefore(wrapper, navigationGroup);
  } else if (routeToggle) {
    topActions.insertBefore(wrapper, routeToggle);
  } else {
    topActions.appendChild(wrapper);
  }
  syncEquipmentTypeFilterVisibility();
};

const syncEquipmentTypeFilterVisibility = () => {
  const field = document.querySelector(".map-equipment-type-filter-field");
  if (!field) return;
  field.style.display = !isWayfindingMode() && lastKnownSessionIsAuthenticated ? "" : "none";
};

const buildRoomsMap = (rooms) => {
  const roomMap = new Map();
  for (const room of rooms) {
    roomMap.set(room.roomId, room);
  }
  return roomMap;
};

const filterRoomsByFloor = (rooms, floor) => {
  return rooms.filter((room) => Number(room.floor) === Number(floor));
};

const getDeviceFloor = (device, roomsMap) => {
  const assignedFloor = Number(device?.assignedFloor);
  if (Number.isFinite(assignedFloor)) {
    return assignedFloor;
  }

  if (device?.roomId && roomsMap.has(device.roomId)) {
    return Number(roomsMap.get(device.roomId)?.floor);
  }

  return null;
};

const filterDevicesByFloor = (devices, roomsInFloor, allRooms, floor) => {
  const roomIds = new Set(roomsInFloor.map((room) => room.roomId));
  const roomsMap = buildRoomsMap(allRooms);

  return devices.filter((device) => {
    if (device?.roomId && roomIds.has(device.roomId)) {
      return true;
    }

    const deviceFloor = getDeviceFloor(device, roomsMap);
    if (deviceFloor === null) {
      return true;
    }

    const normalizedDeviceFloor = Number(deviceFloor);
    return normalizedDeviceFloor === Number(floor) ||
      (Number(floor) === 1 && normalizedDeviceFloor === 0);
  });
};

const getRecentEvents = (devices) => {
  const events = [];

  for (const device of devices) {
    const history = Array.isArray(device.history) ? device.history : [];

    for (const event of history) {
      events.push({
        deviceName: device.name || device.deviceId || "Equipo",
        date: event.date || "",
        type: event.type || "",
        description: event.description || "",
      });
    }
  }

  events.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return events;
};

const popupShellStyle = `
  min-width: 320px;
  max-width: 400px;
  max-height: 68vh;
  overflow-y: auto;
  line-height: 1.35;
  font-size: 13px;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding-right: 2px;
`;

const buildBuildingPanelHeaderHtml = (featureName, selectedRoomName = "") => `
  <div class="building-panel-heading">
    <div class="building-panel-heading-copy">
      <b class="building-panel-title">
        ${escapeHtml(featureName)}
      </b>
      ${selectedRoomName ? `<span class="building-panel-subtitle">${escapeHtml(selectedRoomName)}</span>` : ""}
    </div>
    <button
      type="button"
      class="building-panel-close"
      onclick="window.closeBuildingPanel && window.closeBuildingPanel()"
      aria-label="Cerrar edificio"
    >×</button>
  </div>
`;

const sectionBoxStyle = `
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #ddd;
`;

const chipRowStyle = `
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
`;

const getChipButtonStyle = (isActive = false, compact = false) => `
  margin: 0;
  padding: ${compact ? "6px 12px" : "8px 14px"};
  width: auto;
  min-width: 0;
  height: auto;
  min-height: ${compact ? "34px" : "38px"};
  border-radius: 999px;
  font-weight: ${isActive ? "700" : "600"};
  font-size: ${compact ? "12px" : "13px"};
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  box-sizing: border-box;
`;

const getActionButtonStyle = () => `
  margin: 0;
  padding: 8px 14px;
  width: auto;
  min-width: 0;
  height: auto;
  min-height: 36px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 13px;
  line-height: 1.15;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  white-space: nowrap;
  box-sizing: border-box;
`;

const DASHBOARD_INVENTORY_URL = `${BACKEND_API_URL}/dashboard/inventory`;
const DASHBOARD_BUILDING_EDIT_URL = `${BACKEND_API_URL}/admin/editsyncedbuilding`;

const buildDashboardEquipmentLink = (identifier) => {
  const value = String(identifier || "").trim();
  if (!value) {
    return "";
  }

  const url = `${DASHBOARD_INVENTORY_URL}?search=${encodeURIComponent(value)}`;
  return `
    <a
      href="${url}"
      target="syntro-dashboard"
      rel="noreferrer"
      class="floorButton equipment-panel-action-button"
      style="${getActionButtonStyle()}"
      title="Ver en dashboard"
      aria-label="Ver en dashboard"
      onclick="return window.openSyntroDashboard(event, this.href)"
    >
      &#9776;
    </a>
  `;
};

const buildDashboardBuildingEditLink = (buildingId) => {
  const value = String(buildingId || "").trim();
  if (!value) {
    return "";
  }

  const url = `${DASHBOARD_BUILDING_EDIT_URL}/${encodeURIComponent(value)}`;
  return `
    <a
      href="${url}"
      target="syntro-dashboard"
      rel="noreferrer"
      class="floorButton equipment-panel-action-button dashboard-link building-tool-button is-icon-only popup-dashboard-edit-link"
      title="Editar edificio en dashboard"
      aria-label="Editar edificio en dashboard"
      onclick="return window.openSyntroDashboard(event, this.href)"
    >
      <span class="map-tool-button-icon" aria-hidden="true">&#9881;</span>
    </a>
  `;
};



const buildKeyValueRow = (label, value) => {
  return `<div style="margin-bottom:3px;"><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</div>`;
};

const buildBuildingDetailHtml = (buildingDetail) => {
  if (!buildingDetail) return "Sin información adicional.";

  let html = "";

  if (buildingDetail.mappingStatus) {
    html += buildKeyValueRow("Estado de mapeo", buildingDetail.mappingStatus);
  }

  if (buildingDetail.inventoryStatus) {
    html += buildKeyValueRow("Estado de inventario", buildingDetail.inventoryStatus);
  }

  if (buildingDetail.lastUpdate) {
    html += buildKeyValueRow("Última actualización", buildingDetail.lastUpdate);
  }

  if (buildingDetail.operationalNotes) {
    html += buildKeyValueRow("Nota operativa", buildingDetail.operationalNotes);
  }

  if (buildingDetail.technicalNotes) {
    html += buildKeyValueRow("Nota técnica", buildingDetail.technicalNotes);
  }

  if (Array.isArray(buildingDetail.tags) && buildingDetail.tags.length > 0) {
    html += buildKeyValueRow("Etiquetas", buildingDetail.tags.join(", "));
  }

  return html || "Sin datos adicionales.";
};

const PC_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;

const PRINTER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;

const SCANNER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="12" y1="7" x2="12" y2="17"/></svg>`;

const OTHER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`;

const FLOOR_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`;

const ROOM_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;

const NETWORK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`;

const PACKAGE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

const PLUS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const DEVICE_TYPE_ICONS = {
  pc: PC_ICON_SVG,
  printer: PRINTER_ICON_SVG,
  scanner: SCANNER_ICON_SVG,
  other: OTHER_ICON_SVG,
};

const DEVICE_TYPE_COLORS = {
  pc: "#2563eb",
  printer: "#7c3aed",
  scanner: "#0e7490",
  other: "#64748b",
};

const DEVICE_TYPE_SINGULAR = {
  pc: "PC",
  printer: "Impresora",
  scanner: "Escáner",
  other: "Otro",
};

const CHIP_BASE_STYLE = `
  display:inline-flex; align-items:center; gap:4px;
  padding:2px 8px; border-radius:999px;
  font-size:11px; font-weight:600; line-height:1.5;
  white-space:nowrap;
`;

const resizeIcon = (iconSvg, size = 13) =>
  iconSvg.replace(/width="18"/, `width="${size}"`).replace(/height="18"/, `height="${size}"`);

const getDeviceTypeIconHtml = (type, size = 13) => {
  const key = normalizeDeviceType(type);
  return resizeIcon(DEVICE_TYPE_ICONS[key] || DEVICE_TYPE_ICONS.other, size);
};

const getDeviceTypeColor = (type) =>
  DEVICE_TYPE_COLORS[normalizeDeviceType(type)] || DEVICE_TYPE_COLORS.other;

const buildDeviceTypeChipHtml = (type) => {
  const key = normalizeDeviceType(type);
  const color = getDeviceTypeColor(key);
  const storedLabel = INVENTORY_CATEGORY_LABELS[key] || key;
  const label = DEVICE_TYPE_SINGULAR[key] || storedLabel || type || "Otro";
  return `
    <span style="${CHIP_BASE_STYLE}; background:${color}1f; color:${color};">
      ${getDeviceTypeIconHtml(key)}
      ${escapeHtml(label)}
    </span>
  `;
};

const getStatusMeta = (status) => {
  const raw = String(status || "").trim().toLowerCase();
  if (!raw || /^(sin|unknown|desconocido|null|undefined)/.test(raw)) {
    return { color: "#94a3b8", label: status || "Sin estado" };
  }
  if (/online|activo|alive|operativo|en.linea|up|ok|funcionando|conectado/.test(raw)) {
    return { color: "#16a34a", label: "Online" };
  }
  if (/offline|inactivo|desconectado|falla|error|caido|caído|down|unavailable|sin servi/.test(raw)) {
    return { color: "#dc2626", label: "Offline" };
  }
  if (/warning|warn|pendiente|parcial|mantenimiento|revisar/.test(raw)) {
    return { color: "#d97706", label: "Pendiente" };
  }
  return { color: "#94a3b8", label: status || "Sin estado" };
};

const buildStatusBadgeHtml = (status) => {
  const meta = getStatusMeta(status);
  return `
    <span style="${CHIP_BASE_STYLE}; background:${meta.color}1f; color:${meta.color};">
      <span style="width:8px; height:8px; border-radius:50%; background:${meta.color}; display:inline-block;"></span>
      ${escapeHtml(meta.label)}
    </span>
  `;
};

const buildFloorBadgeHtml = (floor) => {
  const value = Number(floor);
  if (!Number.isFinite(value)) return "";
  return `
    <span style="${CHIP_BASE_STYLE}; background:#0f766e1f; color:#0f766e;">
      ${resizeIcon(FLOOR_ICON_SVG)}
      ${escapeHtml(String(value))}
    </span>
  `;
};

const buildRoomChipHtml = (roomName) => {
  const label = String(roomName || "").trim() || "Sin sector";
  return `
    <span style="${CHIP_BASE_STYLE}; background:#0284c71f; color:#0284c7;">
      ${resizeIcon(ROOM_ICON_SVG)}
      ${escapeHtml(label)}
    </span>
  `;
};

const buildRoomTypeChipHtml = (type) => {
  const label = String(type || "").trim() || "Sin tipo";
  return `
    <span style="${CHIP_BASE_STYLE}; background:#0284c71f; color:#0284c7;">
      ${resizeIcon(ROOM_ICON_SVG)}
      ${escapeHtml(label)}
    </span>
  `;
};

const buildIpLabelHtml = (ip) => {
  const value = String(ip || "").trim();
  if (!value || /^sin/i.test(value)) return "";
  return `
    <span style="${CHIP_BASE_STYLE}; background:#47556914; color:#475569; font-family:Consolas, Menlo, monospace;">
      ${resizeIcon(NETWORK_ICON_SVG)}
      ${escapeHtml(value)}
    </span>
  `;
};

const buildDeviceCountChipHtml = (count) => `
  <span style="${CHIP_BASE_STYLE}; background:#64748b1f; color:#64748b;">
    ${resizeIcon(PACKAGE_ICON_SVG)}
    ${escapeHtml(String(count))} equipo(s)
  </span>
`;

const buildChipsRowHtml = (...chips) => `
  <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:5px; align-items:center;">
    ${chips.filter(Boolean).join("")}
  </div>
`;

const buildDevicesSummaryHtml = (devices) => {
  const counts = countDevicesByType(devices);
  const presentTypes = INVENTORY_CATEGORY_ORDER.filter((type) => counts[type]);
  const extraTypes = Object.keys(counts).filter(
    (type) => !INVENTORY_CATEGORY_ORDER.includes(type) && counts[type]
  );
  const allTypes = presentTypes.concat(extraTypes);

  if (!allTypes.length) {
    return buildChipsRowHtml(`
      <span style="${CHIP_BASE_STYLE}; background:#64748b1f; color:#64748b;">
        ${getDeviceTypeIconHtml("other")}
        <span style="font-weight:700;">0</span>
      </span>
    `);
  }

  return buildChipsRowHtml(
    ...allTypes.map(
      (type) => `
        <span style="${CHIP_BASE_STYLE}; background:${getDeviceTypeColor(type)}1f; color:${getDeviceTypeColor(type)};">
          ${getDeviceTypeIconHtml(type)}
          <span style="font-weight:700;">${counts[type]}</span>
        </span>
      `
    )
  );
};

const UNASSIGNED_SECTOR_KEY = "__unassigned__";

const buildDevicesListHtml = (devicesInFloor, roomsInFloor, allDevices, allRooms, floorLabel, highlightKey, query, pageSize, typeFilter, sectorFilter = "", canManageEquipment = false) => {
  const roomsMap = buildRoomsMap(allRooms);
  const activeQuery = String(query || "").trim();
  const activeType = String(typeFilter || "all").trim().toLowerCase();
  const activeSectorFilter = String(sectorFilter || "").trim();
  const sourceDevices = activeQuery ? allDevices : devicesInFloor;
  const sectorScopedDevices = activeSectorFilter === UNASSIGNED_SECTOR_KEY
    ? sourceDevices.filter((device) => !device.roomId)
    : activeSectorFilter
      ? sourceDevices.filter((device) => device.roomId === activeSectorFilter)
      : sourceDevices;

  if (!sectorScopedDevices.length) {
    return `No hay equipos en el sector seleccionado para ${escapeHtml(floorLabel)}.`;
  }

  const queryFilteredDevices = activeQuery
    ? sectorScopedDevices.filter((device) => deviceMatchesQuery(device, activeQuery, roomsMap))
    : sectorScopedDevices;

  const filteredDevices = activeType && activeType !== "all"
    ? queryFilteredDevices.filter((device) => normalizeDeviceType(device?.type) === activeType)
    : queryFilteredDevices;

  if (activeQuery && queryFilteredDevices.length === 0) {
    return `No hay resultados para "${escapeHtml(activeQuery)}".`;
  }

  if (filteredDevices.length === 0) {
    return `No hay equipos del tipo ${escapeHtml(getDeviceTypeLabel(activeType))}.`;
  }

  const resolvedPageSize = Math.max(5, Number(pageSize) || 5);
  let displayDevices = filteredDevices.slice(0, resolvedPageSize);
  const highlightDevice = highlightKey
    ? filteredDevices.find((device) => matchesDeviceKey(device, highlightKey))
    : null;

  if (highlightDevice && !displayDevices.includes(highlightDevice)) {
    displayDevices = [highlightDevice, ...displayDevices.slice(0, Math.max(0, resolvedPageSize - 1))];
  }

  let html = `
    <div style="margin-bottom:6px; font-size:12px; color:#475569;">
      Mostrando ${Math.min(displayDevices.length, filteredDevices.length)} de ${filteredDevices.length}
    </div>
  `;

  for (const device of displayDevices) {
    const room = roomsMap.get(device.roomId);
    const roomName = room?.name || room?.shortName || "Sin sector";
    const title = device.serialNumber || device.name || device.deviceId || "Sin S/N";
    const description = device.description || device.name || "Sin descripcion";
    const isHighlighted = highlightDevice === device;
    const deviceFloor = getDeviceFloor(device, roomsMap);
    const itemId = canManageEquipment ? deviceItemIdOf(device) : "";
    const draggableAttrs = itemId
      ? ` draggable="true" ondragstart="window.startEquipmentDrag && window.startEquipmentDrag(event, '${escapeHtml(itemId)}', '${escapeHtml(normalizeDeviceType(device.type))}')"`
      : "";
    const clearSectorHtml = canManageEquipment && device.roomId && itemId
      ? `<button
           class="floorButton equipment-panel-action-button"
           style="${getActionButtonStyle()}"
           onclick="window.clearEquipmentSector && window.clearEquipmentSector('${escapeHtml(itemId)}')"
         >
           Quitar sector
         </button>`
      : "";
    const cardStyle = isHighlighted
      ? "margin-bottom:8px; padding:8px 10px; border:2px solid #2f7ea8; border-radius:8px; background:#f0f7fb;"
      : "margin-bottom:8px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;";

    html += `
      <div style="${cardStyle}"${draggableAttrs}>
        ${
          isHighlighted
            ? `<div style="font-size:11px; font-weight:700; color:#1f2937; margin-bottom:4px;">Equipo buscado</div>`
            : ""
        }
        <div style="font-weight:600;">${escapeHtml(title)}</div>
        <div style="margin-top:2px; font-size:12px;">
          ${escapeHtml(description)}
        </div>
        ${buildChipsRowHtml(
          buildDeviceTypeChipHtml(device.type),
          buildFloorBadgeHtml(deviceFloor),
          buildRoomChipHtml(roomName),
          buildIpLabelHtml(device.ip),
          buildStatusBadgeHtml(device.status)
        )}
        <div style="margin-top:6px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          ${buildDashboardEquipmentLink(device.serialNumber || device.deviceId || device.name)}
          ${clearSectorHtml}
        </div>
      </div>
    `;
  }

  if (filteredDevices.length > resolvedPageSize) {
    html += `... y ${filteredDevices.length - resolvedPageSize} equipo(s) mas<br/>`;
  }

  return html;
};

const buildHistorySummaryHtml = (activityItems) => {
  if (!activityItems.length) {
    return `No hay actualizaciones pendientes ni cambios recientes para este edificio.`;
  }

  let html = `<b>Últimos cambios del edificio</b><br/>`;

  for (const entry of activityItems.slice(0, 6)) {
    const when = formatSyncTimestamp(entry?.createdAtUtc);
    const actor = entry?.changedByUsername || "sistema";
    const summary = entry?.summary || "Cambio registrado";
    const details = entry?.details || "Sin detalle adicional";

    html += `
      <div style="margin-top:8px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
        <div style="font-weight:600;">${escapeHtml(summary)}</div>
        <div style="margin-top:2px; font-size:12px; color:#475569;">${escapeHtml(actor)} · ${escapeHtml(when)}</div>
        <div style="margin-top:4px; font-size:12px; color:#334155;">${escapeHtml(details)}</div>
      </div>
    `;
  }

  return html;
};

const buildFloorSelectorHtml = (building, currentFloor) => {
  const floors = Array.isArray(building?.floors)
    ? building.floors.filter((floor) => Number(floor) !== 0)
    : [];
  if (!floors.length) return "";

  let html = `
    <div style="margin-top:10px;">
      <div style="font-weight:600; margin-bottom:4px;">Pisos del edificio</div>
      <div style="${chipRowStyle}">
  `;

  for (const floor of floors) {
    const isCurrent = Number(floor) === Number(currentFloor);

    html += `
      <button
        class="floorButton equipment-panel-chip-button${isCurrent ? " is-active" : ""}"
        style="${getChipButtonStyle(isCurrent, false)}"
        onclick="window.selectBuildingFloor && window.selectBuildingFloor('${escapeHtml(String(floor))}')"
      >
        ${resizeIcon(FLOOR_ICON_SVG, 12)}
        ${escapeHtml(String(floor))}
      </button>
    `;
  }

  html += `</div></div>`;
  return html;
};

const POPUP_SKELETON_DELAY_MS = 120;

let popupRenderToken = 0;

const renderPopupWithPartialLoading = async (layer) => {
  const feature = layer?.feature;
  if (!feature) return;

  const token = ++popupRenderToken;
  let shellTimer = null;
  let settled = false;

  const isCurrent = () => token === popupRenderToken && currentOpenLayer === layer;

  const popupHtml = await getFeaturePopupHtml(feature, {
    onShellReady: (shellHtml) => {
      shellTimer = window.setTimeout(() => {
        if (settled || !isCurrent()) return;
        layer.setPopupContent(shellHtml);
      }, POPUP_SKELETON_DELAY_MS);
    },
  });

  settled = true;
  if (shellTimer) window.clearTimeout(shellTimer);
  if (!isCurrent()) return;

  layer.setPopupContent(popupHtml);
};

const refreshCurrentPopup = async () => {
  if (!currentOpenLayer || !currentOpenLayer.feature) return;

  await renderPopupWithPartialLoading(currentOpenLayer);
};

window.preparePopupNavigation = (featureId, viewKey, roomId = "", deviceKey = "") => {
  if (!featureId) return;

  popupViewState[featureId] = viewKey || "summary";
  popupRoomState[featureId] = roomId || null;
  popupDeviceState[featureId] = deviceKey || null;

  if (deviceKey) {
    popupDeviceSearchOpenState[featureId] = true;
    popupDeviceQueryState[featureId] = deviceKey;
  }
};

window.setPopupView = (featureId, viewKey) => {
  if (!featureId || !viewKey) return;

  popupViewState[featureId] = popupViewState[featureId] === viewKey ? null : viewKey;
  popupRoomState[featureId] = null;
  if (viewKey === "devices" && popupDeviceScopeState[featureId] !== "building") {
    popupDeviceScopeState[featureId] = "";
  }
  refreshCurrentPopup();
};

window.toggleDeviceSearch = (featureId) => {
  if (!featureId) return;
  popupDeviceSearchOpenState[featureId] = !popupDeviceSearchOpenState[featureId];
  if (!popupDeviceSearchOpenState[featureId]) {
    popupDeviceQueryState[featureId] = "";
  }
  refreshCurrentPopup();
};

window.setDeviceSearch = (featureId, value) => {
  if (!featureId) return;
  popupDeviceQueryState[featureId] = value || "";
  refreshCurrentPopup();
};

window.setDevicePageSize = (featureId, size) => {
  if (!featureId) return;
  const resolved = Math.max(5, Number(size) || 5);
  popupDevicePageSizeState[featureId] = resolved;
  refreshCurrentPopup();
};

window.setDeviceTypeFilter = (featureId, type) => {
  if (!featureId) return;
  popupDeviceTypeFilterState[featureId] = type && type !== "all" ? type : "";
  popupViewState[featureId] = "devices";
  refreshCurrentPopup();
};

window.toggleSectorFilters = (featureId) => {
  if (!featureId) return;
  popupSectorFilterOpenState[featureId] = !popupSectorFilterOpenState[featureId];
  popupViewState[featureId] = "devices";
  refreshCurrentPopup();
};

window.setSectorFilter = (featureId, roomId) => {
  if (!featureId) return;
  const active = popupSectorFilterState[featureId];
  if (roomId && roomId === active) {
    popupSectorFilterState[featureId] = "";
  } else {
    popupSectorFilterState[featureId] = roomId || "";
  }
  popupSectorFilterOpenState[featureId] = false;
  popupRoomState[featureId] = null;
  popupDeviceScopeState[featureId] = "";
  popupViewState[featureId] = "devices";
  refreshCurrentPopup();
  if (currentOpenLayer) {
    renderFloorSectors(currentOpenLayer.feature).catch((error) =>
      console.error("[mapa] error renderizando sectores al filtrar:", error)
    );
  }
};

window.clearSectorFilter = (featureId) => {
  if (!featureId) return;
  popupSectorFilterState[featureId] = "";
  popupSectorFilterOpenState[featureId] = false;
  popupViewState[featureId] = "devices";
  refreshCurrentPopup();
  if (currentOpenLayer) {
    renderFloorSectors(currentOpenLayer.feature).catch((error) =>
      console.error("[mapa] error renderizando sectores al limpiar filtro:", error)
    );
  }
};

window.selectBuildingFloor = (targetFloor) => {
  const featureId = currentOpenFeatureId;
  if (!featureId) return;

  popupFloorState[featureId] = Number(targetFloor);
  popupRoomState[featureId] = null;
  popupDeviceState[featureId] = null;
  popupDeviceScopeState[featureId] = "";
  popupSectorFilterState[featureId] = "";
  popupSectorFilterOpenState[featureId] = false;
  refreshCurrentPopup();

  if (currentOpenLayer) {
    renderFloorSectors(currentOpenLayer.feature).catch((error) =>
      console.error("[mapa] error renderizando sectores al cambiar piso:", error)
    );
  }
};

window.selectRoomDetail = (featureId, roomId) => {
  if (!featureId || !roomId) return;

  popupViewState[featureId] = "rooms";
  popupRoomState[featureId] = roomId;
  refreshCurrentPopup();
};

window.backToRoomsList = (featureId) => {
  popupRoomState[featureId] = null;
  refreshCurrentPopup();
};

const buildRoomsListWithButtonsHtml = (featureId, rooms, devices, floorLabel) => {
  if (!rooms.length) {
    return `No hay sectores cargados para el piso ${escapeHtml(floorLabel)}.`;
  }

  let html = "";

  for (const room of rooms.slice(0, 10)) {
    const roomDevicesCount = devices.filter((device) => device.roomId === room.roomId).length;

    html += `
      <div style="margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
        <div style="font-weight:600; margin-bottom:3px;">${escapeHtml(room.name || room.shortName || room.roomId)}</div>
        ${buildChipsRowHtml(
          buildRoomTypeChipHtml(room.type),
          buildStatusBadgeHtml(room.status),
          buildDeviceCountChipHtml(roomDevicesCount)
        )}
        <div style="margin-top:8px;">
          <button
            class="floorButton equipment-panel-action-button"
            style="${getActionButtonStyle()}"
            onclick="window.selectRoomDetail && window.selectRoomDetail('${escapeHtml(featureId)}','${escapeHtml(room.roomId)}')"
          >
            Ver
          </button>
        </div>
      </div>
    `;
  }

  if (rooms.length > 10) {
    html += `... y ${rooms.length - 10} sector(es) más<br/>`;
  }

  return html;
};

const buildRoomDetailHtml = (featureId, room, roomDevices) => {
  const recentEvents = getRecentEvents(roomDevices).slice(0, 5);

  let html = `
    <div style="margin-bottom:10px;">
      <button
        class="floorButton equipment-panel-action-button"
        style="${getActionButtonStyle()}"
        onclick="window.backToRoomsList && window.backToRoomsList('${escapeHtml(featureId)}')"
      >
        ← Volver
      </button>
    </div>
  `;

  html += buildKeyValueRow("Nombre", room.name || "");
  html += buildKeyValueRow("Código", room.shortName || "");
  html += buildKeyValueRow("Tipo", room.type || "");
  html += buildKeyValueRow("Estado", room.status || "");
  html += buildKeyValueRow("Unidad", room.unit || "");
  html += buildKeyValueRow("Área responsable", room.responsibleArea || "");
  html += buildKeyValueRow("Equipos", roomDevices.length);

  if (room.notes) {
    html += buildKeyValueRow("Notas", room.notes);
  }

  html += `<div style="margin-top:10px; font-weight:600;">Equipos del sector</div>`;

  if (!roomDevices.length) {
    html += `No hay equipos asociados.<br/>`;
  } else {
    for (const device of roomDevices) {
      html += `
        <div style="margin-top:6px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
          <div style="font-weight:600;">${escapeHtml(device.name || device.deviceId)}</div>
          ${buildChipsRowHtml(
            buildDeviceTypeChipHtml(device.type),
            buildIpLabelHtml(device.ip),
            buildStatusBadgeHtml(device.status)
          )}
        <div style="margin-top:6px;">
          ${buildDashboardEquipmentLink(device.serialNumber || device.deviceId || device.name)}
        </div>
        </div>
      `;
    }
  }

  html += `<div style="margin-top:12px; font-weight:600;">Historial reciente</div>`;

  if (!recentEvents.length) {
    html += `No hay historial reciente.`;
  } else {
    for (const event of recentEvents) {
      html += `• ${escapeHtml(event.date)} — ${escapeHtml(event.type)} — ${escapeHtml(event.description || "Sin descripción")}<br/>`;
    }
  }

  return html;
};

const buildBuildingPanelPopupHtml = ({ featureName, selectedRoomName = "", building, currentFloor, hasView, contentHtml }) => `
  <div style="${popupShellStyle}">
    ${buildBuildingPanelHeaderHtml(featureName, selectedRoomName)}
    ${buildFloorSelectorHtml(building, currentFloor)}
    <div style="margin-top:8px;">
      <div style="${hasView ? "margin-top:8px;" : "display:none; margin-top:8px;"}">
        ${contentHtml}
      </div>
    </div>
  </div>
`;

const buildPopupDataSkeletonHtml = () => `
  <div style="${sectionBoxStyle}">
    <div class="popup-data-skeleton" role="status" aria-live="polite">
      <span class="popup-data-skeleton-spinner" aria-hidden="true"></span>
      <span class="popup-data-skeleton-text">Cargando información...</span>
      <span class="popup-data-skeleton-line" aria-hidden="true"></span>
      <span class="popup-data-skeleton-line" aria-hidden="true"></span>
      <span class="popup-data-skeleton-line is-short" aria-hidden="true"></span>
    </div>
  </div>
`;

const buildPopupLoadingShellHtml = (feature) => `
  <div style="${popupShellStyle}">
    ${feature?.properties?.name ? `<b>${escapeHtml(feature.properties.name)}</b>` : ""}
    <div class="popup-data-skeleton" role="status" aria-live="polite">
      <span class="popup-data-skeleton-spinner" aria-hidden="true"></span>
      <span class="popup-data-skeleton-text">Cargando información...</span>
      <span class="popup-data-skeleton-line" aria-hidden="true"></span>
      <span class="popup-data-skeleton-line is-short" aria-hidden="true"></span>
    </div>
  </div>
`;

const getFeaturePopupHtml = async (feature, { onShellReady } = {}) => {
  const building = await findBuildingInCatalog(feature);
  const featureId = feature?.properties?.id || "Sin ID";
  const currentFloor = popupFloorState[featureId] ?? (feature?.properties?.floor ?? 0);
  const floorLabel = currentFloor;
  let currentView = popupViewState[featureId] || null;
  const deviceQuery = popupDeviceQueryState[featureId] || "";
  const devicePageSize = popupDevicePageSizeState[featureId] || 5;
  const deviceSearchOpen = popupDeviceSearchOpenState[featureId] || false;
  const deviceTypeFilter = popupDeviceTypeFilterState[featureId] || "";
  const deviceScope = popupDeviceScopeState[featureId] || "";
  const selectedRoomId = popupRoomState[featureId] || null;

  if (!building) {
    return `
      <div style="${popupShellStyle}">
        <b>${escapeHtml(feature?.properties?.name || "Edificio sin nombre")}</b><br/>
        ${buildFloorSelectorHtml(null, currentFloor)}
      </div>
    `;
  }

  const backendSession = await loadBackendSession();
  const featureName = getFeatureDisplayName(feature, building);
  const canViewEquipment = Boolean(backendSession?.isAuthenticated) && !isWayfindingMode();

  if (!canViewEquipment) {
    currentView = "summary";
    popupViewState[featureId] = "summary";
    return `
      <div style="${popupShellStyle}">
        ${buildBuildingPanelHeaderHtml(featureName)}
        ${buildFloorSelectorHtml(building, currentFloor)}
      </div>
    `;
  }

  currentView = "devices";

  if (typeof onShellReady === "function") {
    onShellReady(
      buildBuildingPanelPopupHtml({
        featureName,
        building,
        currentFloor,
        hasView: true,
        contentHtml: buildPopupDataSkeletonHtml(),
      })
    );
  }

  const [buildingDetail, allRooms, backendInventoryItems, buildingActivityItems] = await Promise.all([
    loadBuildingDetail(building),
    loadRoomsForBuilding(building),
    loadBackendInventoryForBuilding(building),
    loadBuildingActivity(building),
  ]);

  loadedEquipmentRevision = pendingEquipmentRevision || loadedEquipmentRevision;
  pendingEquipmentRevision = null;
  updateBackendStatusPanel(latestEquipmentSyncState);

  const allDevices = normalizeImportedInventoryItems(backendInventoryItems);
  const roomsInFloor = filterRoomsByFloor(allRooms, currentFloor);
  const devicesInFloor = filterDevicesByFloor(allDevices, roomsInFloor, allRooms, currentFloor);
  const selectedRoomHeaderId = popupSectorFilterState[featureId] || selectedRoomId;
  const selectedRoomHeader = selectedRoomHeaderId
    ? roomsInFloor.find((room) => room.roomId === selectedRoomHeaderId && room.type === "sector")
    : null;
  const selectedRoomName = selectedRoomHeader?.name || "";

  const searchPopupContent = building?.searchPopupContent || "";
  const canManageEquipment = canManageEquipmentAssignments(backendSession);
  const isBackendAdmin = Boolean(backendSession?.isAdmin);
  const adminActionsHtml = isBackendAdmin
    ? buildDashboardBuildingEditLink(featureId)
    : "";

  let contentHtml = "";
  if (currentView === "summary") {
    contentHtml = `
      <div style="${sectionBoxStyle}">
        <div style="font-weight:600; margin-bottom:6px;">Resumen</div>
        ${searchPopupContent ? `<div>${searchPopupContent}</div>` : ""}
        ${buildBuildingDetailHtml(buildingDetail)}
      </div>
    `;
  } else if (currentView === "rooms") {
    contentHtml = `<div style="${sectionBoxStyle}">`;

    if (selectedRoomId) {
      const selectedRoom = roomsInFloor.find((room) => room.roomId === selectedRoomId);
      const roomDevices = devicesInFloor.filter((device) => device.roomId === selectedRoomId);

      if (selectedRoom) {
        contentHtml += `<div style="font-weight:600; margin-bottom:6px;">Detalle de sector</div>`;
        contentHtml += buildRoomDetailHtml(featureId, selectedRoom, roomDevices);
      } else {
        contentHtml += `Sector no encontrado en este piso.`;
      }
    } else {
      contentHtml += `<div style="font-weight:600; margin-bottom:6px;">Sectores del piso ${escapeHtml(floorLabel)}</div>`;
      contentHtml += buildRoomsListWithButtonsHtml(featureId, roomsInFloor, devicesInFloor, floorLabel);
    }

    contentHtml += `</div>`;
  } else if (currentView === "devices") {
    const sectorCounts = new Map();
    for (const room of roomsInFloor) {
      if (room.type === "sector") sectorCounts.set(room.roomId, 0);
    }
    for (const device of devicesInFloor) {
      if (device.roomId && sectorCounts.has(device.roomId)) {
        sectorCounts.set(device.roomId, sectorCounts.get(device.roomId) + 1);
      }
    }
    const sectorOptions = roomsInFloor
      .filter((room) => room.type === "sector")
      .map((room) => ({
        roomId: room.roomId,
        name: room.name || "Sector",
        count: sectorCounts.get(room.roomId) || 0,
      }));
    const activeSectorFilter = popupSectorFilterState[featureId] || "";
    const sectorFiltersOpen = Boolean(popupSectorFilterOpenState[featureId]);
    const scopeDevices = deviceScope === "building" ? allDevices : devicesInFloor;
    const devicesForView = activeSectorFilter === UNASSIGNED_SECTOR_KEY
      ? scopeDevices.filter((device) => !device.roomId)
      : activeSectorFilter
        ? scopeDevices.filter((device) => device.roomId === activeSectorFilter)
        : scopeDevices;
    const unassignedCount = scopeDevices.filter((device) => !device.roomId).length;
    const sectorOptionsForFilter = canManageEquipment
      ? [...sectorOptions, { roomId: UNASSIGNED_SECTOR_KEY, name: "Sin sector", count: unassignedCount }]
      : sectorOptions;
    const activeSectorOption = activeSectorFilter
      ? sectorOptionsForFilter.find((s) => s.roomId === activeSectorFilter)
      : null;
    const devicesScopeLabel = activeSectorOption
      ? `sector ${activeSectorOption.name}`
      : deviceScope === "building"
        ? "edificio completo"
        : `piso ${floorLabel}`;

    contentHtml = `
      <div style="${sectionBoxStyle}">
        ${buildDevicesSummaryHtml(devicesForView)}
        ${
          canManageEquipment
            ? `<div style="margin-top:6px; font-size:11px; color:#475569;">
                 Arrastra un equipo hasta un sector del mapa para asignarlo, o usa "Quitar sector" para dejarlos sin sector.
               </div>`
            : ""
        }
        <div style="margin-top:8px;">
          ${buildDeviceControlsHtml(featureId, deviceQuery, deviceSearchOpen, devicePageSize, adminActionsHtml, sectorOptionsForFilter, activeSectorFilter, sectorFiltersOpen)}
        </div>
        <div style="margin-top:4px;">
          ${buildDevicesListHtml(devicesForView, roomsInFloor, allDevices, allRooms, devicesScopeLabel, popupDeviceState[featureId], deviceQuery, devicePageSize, deviceTypeFilter, activeSectorFilter, canManageEquipment)}
        </div>
      </div>
    `;
  } else if (currentView === "history") {
    contentHtml = `
      <div style="${sectionBoxStyle}">
        <div style="font-weight:600; margin-bottom:6px;">Historial del edificio</div>
        ${buildHistorySummaryHtml(buildingActivityItems)}
      </div>
    `;
  }

  return buildBuildingPanelPopupHtml({
    featureName,
    selectedRoomName,
    building,
    currentFloor,
    hasView: Boolean(currentView),
    contentHtml,
  });
};

export const filter = (feature) => {
  return feature.properties.isVisible && feature.properties.isPublished;
};

export const style = (feature) => {
  return feature.properties.style;
};

let buildingPanelMapFrozen = false;
let buildingViewMap = null;
let buildingViewContainer = null;
let buildingViewOverlay = null;
let buildingViewAnimateNext = false;
let buildingViewFlyToken = 0;
const MAX_BUILDING_VIEW_ZOOM = 22;
const BUILDING_VIEW_OSM_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const freezeMapForBuildingPanel = () => {
  if (buildingPanelMapFrozen) return;
  buildingPanelMapFrozen = true;

  ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "boxZoom", "keyboard"].forEach(
    (handler) => {
      if (map[handler]?.disable) {
        map[handler].disable();
      }
    }
  );
};

const unfreezeMapForBuildingPanel = () => {
  if (!buildingPanelMapFrozen) return;
  buildingPanelMapFrozen = false;

  ["dragging", "touchZoom", "doubleClickZoom", "scrollWheelZoom", "boxZoom", "keyboard"].forEach(
    (handler) => {
      if (map[handler]?.enable) {
        map[handler].enable();
      }
    }
  );
};

const destroyBuildingViewMap = () => {
  // Invalida cualquier render de sectores que siga en vuelo: si no, volvería a
  // pintar sobre un mapa ya destruido.
  floorSectorsRenderToken += 1;
  hoveredSectorRoomId = "";
  hoveredSectorPolygon = null;
  if (buildingViewOverlay) {
    buildingViewOverlay.clearLayers();
    buildingViewOverlay = null;
  }
  teardownEquipmentDropTargets();
  if (buildingViewMap) {
    buildingViewMap.remove();
    buildingViewMap = null;
  }
  if (buildingViewContainer) {
    buildingViewContainer.remove();
    buildingViewContainer = null;
  }
};

const parseRoomGeometryCoords = (geometryJson) => {
  if (!geometryJson) return [];
  try {
    const geom = typeof geometryJson === "string" ? JSON.parse(geometryJson) : geometryJson;
    if (geom?.type !== "Polygon" || !geom.coordinates?.[0]) return [];
    return geom.coordinates[0].map((c) => [Number(c[0]), Number(c[1])]);
  } catch (error) {
    console.error("Error parseando geometria de sala:", error);
    return [];
  }
};

const ringCentroidLatLng = (latLngs) => {
  const n = latLngs.length;
  if (n < 3) return null;
  const centerLat = latLngs.reduce((sum, p) => sum + p[0], 0) / n;
  const lngScale = Math.cos((centerLat * Math.PI) / 180);
  const pts = latLngs.map((p) => [p[1] * lngScale, p[0]]);
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1];
    twiceArea += cross;
    cx += (pts[i][0] + pts[j][0]) * cross;
    cy += (pts[i][1] + pts[j][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const lngs = latLngs.map((p) => p[1]);
    const lats = latLngs.map((p) => p[0]);
    return [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2];
  }
  return [cy / (3 * twiceArea), cx / (3 * twiceArea * lngScale)];
};

const createFloorTotalBubbleIcon = (count) =>
  L.divIcon({
    className: "building-floor-total-bubble",
    html: `<button type="button" aria-label="${count} equipo(s) en el piso">${count}</button>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });

const SECTOR_BUBBLE_RADIUS_PX = 17;
const FLOOR_BUBBLE_RADIUS_PX = 22;
const BUBBLE_MIN_DISTANCE_PX = SECTOR_BUBBLE_RADIUS_PX + FLOOR_BUBBLE_RADIUS_PX + 4;

const bubbleProbeOffsets = (radiusPx) => {
  const offsets = [[0, 0]];
  for (let i = 0; i < 8; i += 1) {
    const angle = (Math.PI * 2 * i) / 8;
    offsets.push([Math.round(Math.cos(angle) * radiusPx), Math.round(Math.sin(angle) * radiusPx)]);
  }
  return offsets;
};

const bubbleCandidateOffsets = () => {
  const offsets = [[0, 0]];
  [12, 24, 36, 48, 64].forEach((radius) => {
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8;
      offsets.push([Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
    }
  });
  return offsets;
};

const isLatLngInsideRing = (latlng, ring) => pointInRing([latlng.lat, latlng.lng], ring);

let sectorDropTargets = {};
let equipmentDragItemId = "";
let equipmentDropTargetRoomId = "";
let equipmentDropHandlersBound = false;
let hoveredSectorRoomId = "";
let hoveredSectorPolygon = null;

// RenderFloorSectors se dispara desde varios sitios a la vez (cambio de piso,
// refresco tras asignar un equipo, whenReady del mapa) y es async: sin este token
// la invocación lenta sigue pintando su piso sobre el overlay que creó la más
// reciente y los sectores de pisos distintos quedan superpuestos.
let floorSectorsRenderToken = 0;

const baseSectorStyle = {
  color: "#a78bfa",
  weight: 1.8,
  fillColor: "#a78bfa",
  fillOpacity: 0.16,
  opacity: 0.95,
};
const activeSectorStyle = {
  color: "#6d28d9",
  weight: 3.5,
  fillColor: "#6d28d9",
  fillOpacity: 0.24,
  opacity: 1,
};
const hoverSectorStyle = {
  color: "#38bdf8",
  weight: 4,
  fillColor: "#38bdf8",
  fillOpacity: 0.32,
  opacity: 1,
};

const deviceItemIdOf = (device) => {
  const deviceId = String(device?.deviceId || "");
  const prefix = "inventory-";
  if (!deviceId.startsWith(prefix)) return "";
  const candidate = deviceId.slice(prefix.length).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : "";
};

const setEquipmentDropHighlight = (roomId) => {
  if (equipmentDropTargetRoomId === roomId) return;

  const targets = sectorDropTargets[currentOpenFeatureId] || [];
  const previous = targets.find((target) => target.roomId === equipmentDropTargetRoomId);
  previous?.polygon.getElement()?.classList?.remove("is-drop-target");

  equipmentDropTargetRoomId = roomId;

  if (!roomId) return;

  const next = targets.find((target) => target.roomId === roomId);
  next?.polygon.getElement()?.classList?.add("is-drop-target");
  next?.polygon.bringToFront();
};

const findSectorTargetAtClientPoint = (clientX, clientY) => {
  const targets = sectorDropTargets[currentOpenFeatureId] || [];
  const container = buildingViewMap?.getContainer?.();
  if (!targets.length || !buildingViewMap || !container) return null;

  const rect = container.getBoundingClientRect();
  const latLng = buildingViewMap.containerPointToLatLng(
    L.point(clientX - rect.left, clientY - rect.top)
  );

  return targets.find((target) => pointInRing([latLng.lat, latLng.lng], target.ring)) || null;
};

const teardownEquipmentDropTargets = () => {
  if (equipmentDropHandlersBound) {
    const container = buildingViewMap?.getContainer?.();
    container?.removeEventListener("dragover", onEquipmentDragOver);
    container?.removeEventListener("dragleave", onEquipmentDragLeave);
    container?.removeEventListener("drop", onEquipmentDrop);
    equipmentDropHandlersBound = false;
  }
  equipmentDragItemId = "";
  equipmentDropTargetRoomId = "";
  sectorDropTargets = {};
};

const bindEquipmentDropTargets = () => {
  const container = buildingViewMap?.getContainer?.();
  if (!container || equipmentDropHandlersBound) return;

  container.addEventListener("dragover", onEquipmentDragOver);
  container.addEventListener("dragleave", onEquipmentDragLeave);
  container.addEventListener("drop", onEquipmentDrop);
  equipmentDropHandlersBound = true;
};

function onEquipmentDragOver(event) {
  if (!equipmentDragItemId) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  setEquipmentDropHighlight(findSectorTargetAtClientPoint(event.clientX, event.clientY)?.roomId || "");
}

function onEquipmentDragLeave() {
  setEquipmentDropHighlight("");
}

async function onEquipmentDrop(event) {
  if (!equipmentDragItemId) return;
  event.preventDefault();

  const itemId = event.dataTransfer?.getData("text/plain") || equipmentDragItemId;
  const target = findSectorTargetAtClientPoint(event.clientX, event.clientY);
  setEquipmentDropHighlight("");

  if (!target || !itemId) return;

  equipmentDragItemId = "";
  await assignEquipmentToSector(itemId, target.roomId);
}

let assignmentFeedbackTimer = null;

const showAssignmentFeedback = (message, isError = false) => {
  let container = document.getElementById("building-assignment-feedback");
  if (!container) {
    container = document.createElement("div");
    container.id = "building-assignment-feedback";
    container.className = "building-assignment-feedback";
    document.body.appendChild(container);
  }

  container.textContent = message;
  container.classList.toggle("is-error", Boolean(isError));
  container.classList.add("is-visible");

  window.clearTimeout(assignmentFeedbackTimer);
  assignmentFeedbackTimer = window.setTimeout(() => {
    container?.classList.remove("is-visible");
  }, 4000);
};

const assignEquipmentToSector = async (itemId, roomExternalId) => {
  if (!itemId) return false;

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/inventory-assignments/items/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedRoomExternalId: roomExternalId || "" }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message || "No se pudo actualizar el equipo.");
    }

    showAssignmentFeedback(roomExternalId ? "Equipo movido al sector." : "Sector quitado al equipo.");
    await refreshBuildingPanelAfterAssignment();
    return true;
  } catch (error) {
    console.error("[mapa] error asignando equipo a sector:", error);
    showAssignmentFeedback(error.message || "No se pudo actualizar el equipo.", true);
    return false;
  }
};

const refreshBuildingPanelAfterAssignment = async () => {
  const featureId = currentOpenFeatureId;
  const layer = currentOpenLayer;

  if (featureId) {
    const feature = layer?.feature;
    if (feature) {
      await renderFloorSectors(feature).catch((error) =>
        console.error("[mapa] error refrescando sectores:", error)
      );
    }
  }

  await renderPopupWithPartialLoading(layer).catch((error) =>
    console.error("[mapa] error refrescando panel:", error)
  );
};

const createEquipmentDragGhost = (deviceType) => {
  const typeKey = normalizeDeviceType(deviceType);
  const typeIcon = DEVICE_TYPE_ICONS[typeKey] || DEVICE_TYPE_ICONS.other;
  const ghost = document.createElement("div");
  ghost.className = "equipment-drag-ghost";
  ghost.setAttribute("aria-hidden", "true");
  ghost.innerHTML = `
    <span class="equipment-drag-ghost-plus">${resizeIcon(PLUS_ICON_SVG, 22)}</span>
    <span class="equipment-drag-ghost-type" style="color:${getDeviceTypeColor(typeKey)};">${resizeIcon(typeIcon, 18)}</span>
  `;
  document.body.appendChild(ghost);
  return ghost;
};

window.startEquipmentDrag = (event, itemId, deviceType) => {
  if (!itemId || !event?.dataTransfer) return;
  equipmentDragItemId = itemId;
  let ghost = null;
  try {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);

    ghost = createEquipmentDragGhost(deviceType);
    event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    const source = event.currentTarget;
    source?.addEventListener?.(
      "dragend",
      () => ghost?.remove(),
      { once: true }
    );
  } catch (error) {
    ghost?.remove();
    console.error("[mapa] error iniciando arrastre de equipo:", error);
  }
};

window.assignEquipmentToSector = (itemId, roomExternalId) => {
  if (!itemId) return false;
  return assignEquipmentToSector(itemId, roomExternalId);
};

window.clearEquipmentSector = async (itemId) => {
  if (!itemId) return false;
  return assignEquipmentToSector(itemId, "");
};

/**
 * Devuelve un LatLng cuyo icono completo (centro + sondas) queda dentro del
 * anillo del edificio, sin chocar con las burbujas ya colocadas.
 */
const resolveBubbleLatLng = ({ preferred, ring, avoidPoints = [], radiusPx, minDistancePx }) => {
  if (!buildingViewMap || !Array.isArray(ring) || ring.length < 3) return null;

  const baseLatLng = preferred || L.latLng(ring[0][0], ring[0][1]);
  const basePoint = buildingViewMap.latLngToContainerPoint(baseLatLng);
  if (!Number.isFinite(basePoint?.x) || !Number.isFinite(basePoint?.y)) return null;

  const probes = bubbleProbeOffsets(radiusPx);
  let fallback = null;
  let nonCollidingFallback = null;
  let insideFallback = null;

  for (const [dx, dy] of bubbleCandidateOffsets()) {
    const candidate = buildingViewMap.containerPointToLatLng(
      L.point(basePoint.x + dx, basePoint.y + dy)
    );
    if (!isLatLngInsideRing(candidate, ring)) continue;
    if (!insideFallback) insideFallback = candidate;

    const fitsCompletely = probes.every(([px, py]) => {
      const probe = buildingViewMap.containerPointToLatLng(L.point(basePoint.x + dx + px, basePoint.y + dy + py));
      return isLatLngInsideRing(probe, ring);
    });

    const collides = avoidPoints.some((other) => {
      const otherPoint = buildingViewMap.latLngToContainerPoint(other);
      return Math.hypot(basePoint.x + dx - otherPoint.x, basePoint.y + dy - otherPoint.y) < minDistancePx;
    });

    if (fitsCompletely && !collides) return candidate;
    if (!collides && !nonCollidingFallback) nonCollidingFallback = candidate;
    if (!fallback && fitsCompletely) fallback = candidate;
  }

  // Sectores pequenos no siempre admiten el diametro completo de la burbuja.
  // En vez de omitirla, usamos primero un punto sin colision y luego cualquier
  // punto interior: la burbuja debe identificar tambien sectores vacios.
  return fallback || nonCollidingFallback || insideFallback || baseLatLng;
};

const placeFloorTotalBubble = (overlay, floorRing, floorTotal, floor, featureId) => {
  if (!overlay || floorRing.length < 3) return;

  const anchors = overlay
    .getLayers()
    .filter((l) => l.options?.icon && /building-equipment-bubble/.test(l.options.icon?.options?.className || ""));
  const avoidPoints = anchors.map((marker) => marker.getLatLng());

  const centroid = ringCentroidLatLng(floorRing);
  const target = resolveBubbleLatLng({
    preferred: centroid ? L.latLng(centroid[0], centroid[1]) : null,
    ring: floorRing,
    avoidPoints,
    radiusPx: FLOOR_BUBBLE_RADIUS_PX,
    minDistancePx: BUBBLE_MIN_DISTANCE_PX,
  });
  if (!target) return;

  const marker = L.marker(target, {
    icon: createFloorTotalBubbleIcon(floorTotal),
    zIndexOffset: 1000,
  }).addTo(overlay);
  marker.bindTooltip(`${floorTotal} equipo(s) en el piso ${floor}`, { sticky: true, direction: "top" });
  marker.on("click", () => {
    window.clearSectorFilter && window.clearSectorFilter(featureId);
  });
};

const renderFloorSectors = async (feature) => {
  if (!buildingViewMap || !feature) return;

  const featureId = feature?.properties?.id;
  if (!featureId) return;

  const building = await findBuildingInCatalog(feature);
  if (!building) return;

  const token = ++floorSectorsRenderToken;
  const isStale = () => token !== floorSectorsRenderToken;

  const floor = popupFloorState[featureId] ?? (feature?.properties?.floor ?? 0);
  const backendSession = await loadBackendSession();
  if (isStale()) return;
  const canViewEquipment = Boolean(backendSession?.isAuthenticated) && !isWayfindingMode();

  if (buildingViewOverlay) {
    buildingViewOverlay.clearLayers();
    buildingViewOverlay.remove();
    buildingViewOverlay = null;
  }
  hoveredSectorRoomId = "";
  hoveredSectorPolygon = null;
  const overlay = L.layerGroup().addTo(buildingViewMap);
  buildingViewOverlay = overlay;

  const [allRooms, backendInventoryItems] = await Promise.all([
    loadRoomsForBuilding(building),
    canViewEquipment ? loadBackendInventoryForBuilding(building) : Promise.resolve([]),
  ]);

  // Otra invocación ya tomó el control (o el mapa se cerró): este render quedó
  // obsoleto, así que se descarta su overlay en vez de mezclarlo con el vigente.
  if (isStale() || !buildingViewMap) {
    overlay.clearLayers();
    overlay.remove();
    return;
  }

  const allDevices = normalizeImportedInventoryItems(backendInventoryItems);
  const sectors = filterRoomsByFloor(allRooms, floor).filter(
    (room) => room.type === "sector" && room.geometryJson
  );
  const devicesInFloor = filterDevicesByFloor(allDevices, sectors, allRooms, floor);

  const sectorCountByRoom = new Map();
  for (const sector of sectors) {
    sectorCountByRoom.set(sector.roomId, 0);
  }
  for (const device of devicesInFloor) {
    if (device.roomId && sectorCountByRoom.has(device.roomId)) {
      sectorCountByRoom.set(device.roomId, sectorCountByRoom.get(device.roomId) + 1);
    }
  }

  const activeSectorFilter = popupSectorFilterState[featureId] || "";
  const sectorBubblePoints = [];
  const dropTargets = [];
  const canDropEquipment = canManageEquipmentAssignments(backendSession);
  const sectorEntries = [];
  hoveredSectorRoomId = "";
  hoveredSectorPolygon = null;

  const clearHoveredSector = () => {
    if (!hoveredSectorPolygon) return;
    hoveredSectorPolygon.setStyle(baseSectorStyle);
    hoveredSectorPolygon.getElement()?.classList?.remove("is-hover");
    hoveredSectorPolygon = null;
    hoveredSectorRoomId = "";
  };

  const setHoveredSector = (roomId, polygon) => {
    if (hoveredSectorRoomId === roomId && hoveredSectorPolygon === polygon) return;
    clearHoveredSector();
    hoveredSectorRoomId = roomId;
    hoveredSectorPolygon = polygon;
    polygon.setStyle(hoverSectorStyle);
    polygon.getElement()?.classList?.add("is-hover");
    polygon.bringToFront();
  };

  for (const sector of sectors) {
    const coords = parseRoomGeometryCoords(sector.geometryJson);
    if (coords.length < 3) continue;
    const latLngs = coords.map((c) => [c[1], c[0]]);
    const isActive = activeSectorFilter && activeSectorFilter === sector.roomId;

    const polygon = L.polygon(latLngs, {
      ...(isActive ? activeSectorStyle : baseSectorStyle),
      className: isActive ? "building-view-sector is-active" : "building-view-sector",
      interactive: true,
    }).addTo(overlay);

    const setHover = (hovering) => {
      if (isActive) return;
      if (hovering) {
        setHoveredSector(sector.roomId, polygon);
      } else if (hoveredSectorPolygon === polygon) {
        clearHoveredSector();
      }
    };

    polygon.on("mouseover", () => setHover(true));
    polygon.on("mouseout", () => setHover(false));
    polygon.on("click", () => {
      window.setSectorFilter && window.setSectorFilter(featureId, sector.roomId);
    });

    sectorEntries.push({ roomId: sector.roomId, polygon, setHover });

    if (canDropEquipment) {
      dropTargets.push({ roomId: sector.roomId, ring: latLngs, polygon });
    }

    if (!canViewEquipment) continue;

    const count = sectorCountByRoom.get(sector.roomId) || 0;
    const centroid = ringCentroidLatLng(latLngs);
    const bubblePoint = resolveBubbleLatLng({
      preferred: centroid ? L.latLng(centroid[0], centroid[1]) : null,
      ring: latLngs,
      avoidPoints: sectorBubblePoints,
      radiusPx: SECTOR_BUBBLE_RADIUS_PX,
      minDistancePx: SECTOR_BUBBLE_RADIUS_PX * 2 + 6,
    });
    if (!bubblePoint) continue;

    sectorBubblePoints.push(bubblePoint);

    const marker = L.marker(bubblePoint, {
      icon: createEquipmentBubbleIcon(count, { emptyWhenZero: true }),
    }).addTo(overlay);
    marker.bindTooltip(
      `${sector.name} · ${count > 0 ? `${count} equipo(s)` : "Sin equipos asignados"}`,
      { sticky: true, direction: "top" }
    );
    marker.on("click", () => {
      window.setSectorFilter && window.setSectorFilter(featureId, sector.roomId);
    });
    marker.on("mouseover", () => {
      const entry = sectorEntries.find((item) => item.roomId === sector.roomId);
      entry?.setHover(true);
    });
    marker.on("mouseout", () => {
      const entry = sectorEntries.find((item) => item.roomId === sector.roomId);
      entry?.setHover(false);
    });
  }

  // Siempre se reescribe: si el piso ya no tiene sectores hay que borrar los
  // drop targets del piso anterior o se seguirían soltando equipos en pisos
  // donde ese sector ya no existe.
  sectorDropTargets[featureId] = dropTargets;
  if (dropTargets.length) {
    bindEquipmentDropTargets();
  }

  if (!canViewEquipment) return;

  const floorRing =
    feature.geometry?.type === "Polygon" ? feature.geometry.coordinates[0].map((c) => [c[1], c[0]]) : [];
  placeFloorTotalBubble(overlay, floorRing, devicesInFloor.length, floor, featureId);
};

const createBuildingViewMap = (layer) => {
  destroyBuildingViewMap();

  const bounds = typeof layer.getBounds === "function" ? layer.getBounds() : null;
  if (!bounds) return;

  try {
    buildingViewContainer = document.createElement("div");
    buildingViewContainer.className = "building-view-map";
    document.body.appendChild(buildingViewContainer);

    buildingViewMap = L.map(buildingViewContainer, {
      zoomControl: false,
      attributionControl: false,
      boxZoom: false,
      keyboard: false,
      scrollWheelZoom: false,
      dragging: false,
      touchZoom: false,
      doubleClickZoom: false,
      minZoom: 12,
      maxZoom: MAX_BUILDING_VIEW_ZOOM,
    });

    L.tileLayer(BUILDING_VIEW_OSM_TILE_URL, {
      maxNativeZoom: 19,
      maxZoom: MAX_BUILDING_VIEW_ZOOM,
      minZoom: 12,
      keepBuffer: 8,
      updateWhenIdle: false,
      updateWhenZooming: true,
    }).addTo(buildingViewMap);

    const outerRing =
      typeof layer.getLatLngs === "function" && Array.isArray(layer.getLatLngs()[0])
        ? layer.getLatLngs()[0]
        : null;
    if (outerRing) {
      L.polygon(outerRing, {
        color: "#1e40af",
        weight: 3,
        fillColor: "#1e40af",
        fillOpacity: 0.08,
        dashArray: "8 4",
        interactive: false,
      }).addTo(buildingViewMap);
    }

    buildingViewMap.fitBounds(bounds, { padding: [20, 20], maxZoom: MAX_BUILDING_VIEW_ZOOM });
    buildingViewMap.whenReady(() => {
      buildingViewMap?.invalidateSize();
      renderFloorSectors(layer?.feature).catch((error) =>
        console.error("[mapa] error renderizando sectores de la vista edificio:", error)
      );
    });

    console.info(
      `[mapa] vista edificio creada: center=${bounds.getCenter().toString()} ancho=${Math.round(
        bounds.getNorthEast().distanceTo(bounds.getSouthEast())
      )}m zoom=${buildingViewMap.getZoom()}`
    );
  } catch (err) {
    console.error("[mapa] vista edificio ERROR:", err);
    destroyBuildingViewMap();
  }
};

export const openBuildingPopupLayer = (layer, options = {}) => {
  if (!layer) return false;
  if (buildingPanelMapFrozen) return false;

  const { zoom = true, rememberView = true, maxZoom = 20, animate = false } = options;

  if (rememberView) {
    popupReturnView = {
      center: map.getCenter(),
      zoom: map.getZoom(),
    };
  }

  buildingViewAnimateNext = Boolean(animate);

  suspendMapBoundsForPopup();

  const hasPoint = zoom && typeof layer.getLatLng === "function";

  if (typeof layer.openPopup === "function") {
    layer.openPopup();
  }

  if (hasPoint) {
    map.setView(layer.getLatLng(), maxZoom);
  }

  return true;
};

const zoomToFeaturePoint = (e) => {
  if (buildingPanelMapFrozen) return;
  map.setView([e.latlng.lat, e.latlng.lng], 19);
};

const handleFeatureClick = (e) => {
  const featureId = e?.target?.feature?.properties?.id || null;
  const event = new CustomEvent("syntro-building-layer-click", {
    cancelable: true,
    detail: {
      featureId,
      feature: e?.target?.feature || null,
      layer: e?.target || null,
      originalEvent: e,
    },
  });

  const shouldContinue = window.dispatchEvent(event);
  if (!shouldContinue) {
    e?.originalEvent?.preventDefault?.();
    e?.originalEvent?.stopPropagation?.();
    e?.target?.closePopup?.();
    map.closePopup?.();
    L.DomEvent.stop(e);
    return;
  }

  openBuildingPopupLayer(e?.target, {
    zoom: true,
    rememberView: true,
    animate: true,
    maxZoom: 20,
    padding: [40, 40],
  });
  clearHoveredLayer();
  console.info("[mapa] clic edificio → openBuildingPopupLayer (zoom:true)");
};

const normalizeMatchRate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null;
};

const loadBuildingMatchData = async () => {
  const session = await loadBackendSession();
  if (!canAccessLiveTelemetry(session)) return new Map();

  if (buildingMatchData) return buildingMatchData;
  if (buildingMatchDataPromise) return buildingMatchDataPromise;

  buildingMatchDataPromise = fetch(`${BACKEND_API_URL}/api/network-telemetry/building-match`, {
    cache: "no-store",
    credentials: "include",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API respondio ${response.status}`);
      }
      return response.json();
    })
    .then((telemetry) => {
      const result = new Map();
      let missingMatchRate = false;

      for (const summary of telemetry?.buildingRiskSummaries || []) {
        const key = String(summary?.buildingExternalId || "").trim();
        if (!key) continue;

        const matchRate = normalizeMatchRate(summary?.matchRate);
        if (matchRate === null) missingMatchRate = true;

        result.set(key, {
          deviceCount: Number(summary?.deviceCount) || 0,
          matchedCount: Number(summary?.matchedCount) || 0,
          matchRate,
        });
      }

      if (missingMatchRate && !warnedMissingMatchRate) {
        warnedMissingMatchRate = true;
        console.warn(
          "[feature-display] la API de telemetria no devolvio matchRate; los edificios afectados se muestran sin dato en vez de 0%."
        );
      }

      return result;
    })
    .catch((error) => {
      console.error("[feature-display] no se pudo cargar las coincidencias de inventario:", error);
      return new Map();
    });

  return buildingMatchDataPromise;
};

const applyBuildingMatchStyle = (layer) => {
  const featureId = layer?.feature?.properties?.id;
  if (!featureId || !buildingMatchData) return false;

  const summary = buildingMatchData.get(featureId);
  if (!summary || summary.deviceCount <= 0 || summary.matchRate === null) return false;

  const fillColor = buildingMatchColor(summary.matchRate);
  if (!fillColor) return false;

  const baseStyle = style(layer.feature) || {};
  layer.setStyle({
    ...baseStyle,
    fillColor,
    fillOpacity: 0.45,
    weight: 2,
  });
  return true;
};

const createMatchBubbleForLayer = async (feature, layer) => {
  const featureId = feature?.properties?.id;
  if (!featureId || typeof layer?.getBounds !== "function") return;
  if (isWayfindingMode()) return;

  const data = await loadBuildingMatchData();
  if (!buildingMatchModeActive) return;
  if (!layer?._map) return;

  if (layer.syntroMatchBubbles) {
    Array.from(layer.syntroMatchBubbles).forEach((previous) => removeMatchBubbleMarker(featureId, previous));
  }

  applyBuildingMatchStyle(layer);

  const summary = data.get(featureId);
  if (!summary || summary.deviceCount <= 0 || summary.matchRate === null) return;

  const label = buildingMatchPercentLabel(summary.matchRate);
  if (!label) return;

  const fillColor = buildingMatchColor(summary.matchRate) || "#666";

  const marker = L.marker(layer.getBounds().getCenter(), {
    interactive: true,
    keyboard: true,
    title: `${summary.matchedCount} de ${summary.deviceCount} dispositivos coinciden con inventario (${label})`,
    icon: L.divIcon({
      className: "building-match-bubble",
      html: `<button type="button" style="background-color:${fillColor};" aria-label="${label} de coincidencia de inventario">${label}</button>`,
      iconSize: [46, 28],
      iconAnchor: [23, 14],
    }),
  });

  marker.on("click", (event) => {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    L.DomEvent.stop(event);

    if (["geometry-shape", "geometry-move", "walking-route-building"].includes(window.syntroAdminMapToolMode)) {
      const buildingEvent = new CustomEvent("syntro-building-layer-click", {
        cancelable: true,
        detail: {
          featureId,
          feature,
          layer,
          originalEvent: event,
        },
      });
      window.dispatchEvent(buildingEvent);
      return;
    }

    popupViewState[featureId] = "devices";
    popupDeviceTypeFilterState[featureId] = globalEquipmentTypeFilter || "";
    popupDeviceScopeState[featureId] = "building";
    popupRoomState[featureId] = null;
    openBuildingPopupLayer(layer, {
      zoom: true,
      rememberView: true,
      animate: true,
      maxZoom: 20,
      padding: [40, 40],
    });
  });

  registerMatchBubble(featureId, marker);

  if (!layer.syntroMatchBubbles) {
    layer.syntroMatchBubbles = new Set();
  }
  layer.syntroMatchBubbles.add(marker);

  if (!map.hasLayer(marker) && layer?._map) {
    marker.addTo(map);
  }

  layer.on("remove", () => {
    layer.syntroMatchBubbles?.delete(marker);
    removeMatchBubbleMarker(featureId, marker);
  });
};

const hideEquipmentTypeFilterWhileMatchActive = () => {
  const filter = document.getElementById("map-equipment-filters");
  filter?.classList.toggle("building-match-active", buildingMatchModeActive);
};

export const setBuildingMatchMode = async (active) => {
  buildingMatchModeActive = Boolean(active);

  if (!buildingMatchModeActive) {
    removeAllMatchBubbles();
    forEachVisibleFeatureLayer((layer) => {
      applyDefaultStyle(layer);
    });
    hideEquipmentTypeFilterWhileMatchActive();
    updateBuildingEquipmentBubbles();
    return;
  }

  buildingMatchData = await loadBuildingMatchData();
  if (!buildingMatchModeActive) {
    removeAllMatchBubbles();
    return;
  }

  buildingEquipmentBubbleEntries.forEach((entry) => {
    if (entry.marker && map.hasLayer(entry.marker)) {
      map.removeLayer(entry.marker);
    }
  });

  removeAllMatchBubbles();
  hideEquipmentTypeFilterWhileMatchActive();
  forEachVisibleFeatureLayer((layer) => {
    applyBuildingMatchStyle(layer);
    createMatchBubbleForLayer(layer.feature, layer);
  });
};

const createEquipmentBubbleForLayer = async (feature, layer) => {
  const featureId = feature?.properties?.id;
  if (!featureId || typeof layer?.getBounds !== "function") return;
  if (isWayfindingMode()) return;

  const summaryMap = await loadBuildingEquipmentSummary();
  if (!layer?._map) return;
  ensureMapEquipmentTypeFilter(summaryMap);

  const session = await loadBackendSession();
  if (!session?.isAuthenticated) return;

  const summary = summaryMap.get(featureId);
  const selectedFloor = getSelectedMapFloor();
  const total = getSummaryCountForType(summary, globalEquipmentTypeFilter, selectedFloor);
  if (total <= 0) return;

  const center = layer.getBounds().getCenter();
  const marker = L.marker(center, {
    interactive: true,
    keyboard: true,
    title: `${total} equipo(s) asignados`,
    icon: createEquipmentBubbleIcon(total),
  });

  marker.on("click", (event) => {
    event?.originalEvent?.preventDefault?.();
    event?.originalEvent?.stopPropagation?.();
    L.DomEvent.stop(event);

    if (["geometry-shape", "geometry-move", "walking-route-building"].includes(window.syntroAdminMapToolMode)) {
      const buildingEvent = new CustomEvent("syntro-building-layer-click", {
        cancelable: true,
        detail: {
          featureId,
          feature,
          layer,
          originalEvent: event,
        },
      });
      window.dispatchEvent(buildingEvent);
      return;
    }

    popupViewState[featureId] = "devices";
    popupDeviceTypeFilterState[featureId] = globalEquipmentTypeFilter || "";
    popupDeviceScopeState[featureId] = "building";
    popupRoomState[featureId] = null;
    openBuildingPopupLayer(layer, {
      zoom: true,
      rememberView: true,
      animate: true,
      maxZoom: 20,
      padding: [40, 40],
    });
  });

  buildingEquipmentBubbleEntries.set(featureId, { layer, marker, summary });
  updateBuildingEquipmentBubbles();

  layer.on("remove", () => {
    if (map.hasLayer(marker)) {
      map.removeLayer(marker);
    }
    buildingEquipmentBubbleEntries.delete(featureId);
  });
};

const highlightFeature = (e) => {
  var layer = e.target;

  if (currentHoveredLayer && currentHoveredLayer !== layer) {
    applyDefaultStyle(currentHoveredLayer);
  }

  layer.setStyle({
    weight: 5,
    color: "#666",
    dashArray: "",
    fillOpacity: 0.7,
  });

  currentHoveredLayer = layer;

  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
};

const resetHighlight = (e) => {
  var layer = e.target;

  if (currentHoveredLayer !== layer) return;
  applyDefaultStyle(layer);
  currentHoveredLayer = null;
};

const dockBuildingPopup = (layer) => {
  const popupElement = layer?.getPopup()?.getElement();
  const mapHost = document.getElementById("map");
  if (popupElement && mapHost && popupElement.parentNode !== mapHost) {
    mapHost.appendChild(popupElement);
  }
};

export const onEachFeature = (feature, layer) => {
  if (feature.properties.isClickable) {
    layer.bindPopup(buildPopupLoadingShellHtml(feature), {
      className: "building-panel-popup",
      minWidth: 320,
      maxWidth: 480,
    });

    if (layer.getPopup()) {
      layer.getPopup().options.autoPan = false;
      layer.getPopup().options.keepInView = false;
      layer.getPopup().options.closeOnClick = false;
    }

    if (feature.geometry.type === "Polygon") {
      layer.off("click");
    }

    layer.on("popupopen", async () => {
      const animateOpen = buildingViewAnimateNext;
      buildingViewAnimateNext = false;

      suspendMapBoundsForPopup();
      setCurrentOpenFeatureId(feature?.properties?.id || null);
      currentOpenLayer = layer;
      setSelectedLayer(layer);
      dockBuildingPopup(layer);
      freezeMapForBuildingPanel();

      if (!popupViewState[feature.properties.id]) {
        popupViewState[feature.properties.id] = null;
      }

      const token = ++popupRenderToken;
      let shellTimer = null;
      let popupSettled = false;
      const isCurrentRender = () => token === popupRenderToken && currentOpenLayer === layer;

      const htmlPromise = getFeaturePopupHtml(feature, {
        onShellReady: (shellHtml) => {
          shellTimer = window.setTimeout(() => {
            if (popupSettled || !isCurrentRender()) return;
            layer.setPopupContent(shellHtml);
          }, POPUP_SKELETON_DELAY_MS);
        },
      });

      const shouldAnimate =
        animateOpen &&
        typeof layer.getBounds === "function" &&
        !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

      if (shouldAnimate) {
        const token = ++buildingViewFlyToken;
        const bounds = layer.getBounds();

        await new Promise((resolve) => {
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            map.off("moveend", finish);
            window.clearTimeout(fallbackTimer);
            resolve();
          };
          const fallbackTimer = window.setTimeout(finish, 1700);
          map.once("moveend", finish);
          map.flyToBounds(bounds, {
            padding: [60, 100],
            duration: 0.9,
            easeLinearity: 0.22,
            maxZoom: 20,
          });
        });

        if (token !== buildingViewFlyToken || currentOpenLayer !== layer || !buildingPanelMapFrozen) {
          return;
        }

        document.body.classList.add("map-building-panel");
        createBuildingViewMap(layer);
      } else {
        document.body.classList.add("map-building-panel");
        createBuildingViewMap(layer);
      }

      popupSettled = true;
      if (shellTimer) window.clearTimeout(shellTimer);

      const finalHtml = await htmlPromise;
      if (!isCurrentRender()) return;

      layer.setPopupContent(finalHtml);
    });

    layer.on("popupclose", () => {
      buildingViewFlyToken += 1;
      buildingViewAnimateNext = false;
      document.body.classList.remove("map-building-panel");
      destroyBuildingViewMap();
      unfreezeMapForBuildingPanel();
      clearHoveredLayer();

      if (currentOpenLayer === layer) {
        clearCurrentOpenFeatureId();
      }

      clearSelectedLayer(layer);

      if (popupReturnView) {
        const view = popupReturnView;
        popupReturnView = null;
        let didRestoreBounds = false;
        const restoreOnce = () => {
          if (didRestoreBounds) return;
          didRestoreBounds = true;
          restoreMapBoundsAfterPopup();
        };
        map.once("moveend", restoreOnce);
        map.flyTo(view.center, view.zoom, {
          animate: true,
          duration: 0.55,
          easeLinearity: 0.25,
        });
        window.setTimeout(restoreOnce, 750);
      } else {
        restoreMapBoundsAfterPopup();
      }
    });

    const routeRole = getRouteHighlightRole(feature?.properties?.id);
    if (routeRole) {
      applyRouteHighlightedStyle(layer, routeRole);
    }

    if (feature.geometry.type == "Polygon") {
      bindBuildingNameLabel(feature, layer);

      layer.on({
        mouseover: highlightFeature,
        mouseout: resetHighlight,
        click: handleFeatureClick,
      });

      createEquipmentBubbleForLayer(feature, layer);

      if (buildingMatchModeActive) {
        createMatchBubbleForLayer(feature, layer);
      }

      layer.on("remove", () => {
        if (currentHoveredLayer === layer) {
          currentHoveredLayer = null;
        }
      });
    } else if (feature.geometry.type == "Point") {
      layer.on({
        click: zoomToFeaturePoint,
      });
    }
  }
};

if (document.readyState === "loading") {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      initBuildingLabelToggle();
      startEquipmentSyncMonitor();
    },
    { once: true }
  );
} else {
  initBuildingLabelToggle();
  startEquipmentSyncMonitor();
}

window.addEventListener("syntro-session-changed", (event) => {
  const detail = event.detail || {};
  const hasAuthFlag = typeof detail.isAuthenticated === "boolean";

  lastKnownSessionIsAuthenticated = Boolean(detail.isAuthenticated);
  syncEquipmentTypeFilterVisibility();

  if (hasAuthFlag) {
    updateBackendSessionCache(detail);
  } else {
    backendSessionCache = null;
    backendSessionCacheAt = 0;
  }

  if (hasAuthFlag && !detail.isAuthenticated) {
    clearMapEquipmentState();
    goTo(getPrimaryCampusKey());
  } else {
    clearMapEquipmentState();
    refreshCurrentMapData();
  }

  refreshCurrentPopup();
});

window.addEventListener("syntro-campus-changed", () => {
  clearMapEquipmentState();
});

window.addEventListener("syntro-map-data-refreshed", () => {
  window.setTimeout(() => setBuildingLabelsVisible(buildingLabelsVisible), 80);
});















