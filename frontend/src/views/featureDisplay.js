/////////////////////////////////////////////////////////////////////////////////
///////////////////////// Add interactions with the map /////////////////////////
/////////////////////////////////////////////////////////////////////////////////

import { map, HOST_URL, BACKEND_API_URL } from "../views/map.js";
import { getCurrentCampusKey, getCatalogFileName, getPrimaryCampusKey } from "../utils/campusConfig.js";
import { mergeCatalogWithSearch, resetSearchMetadataCaches } from "@app/searchMetadata";
import { refreshCurrentMapData, goTo } from "@app/goToCampus";
import { resetBuildingsCatalogCache } from "@app/addData";
import { bindWalkingRouteToggleButton } from "@app/walkingRouteLayer";
import { appConfig } from "../config/appConfig.js";

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
let backendSessionIsAdmin = false;

window.openSyntroDashboard = (event, url) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();

  if (!url) return false;

  const dashboardWindow = window.open("", "syntro-dashboard");
  if (dashboardWindow) {
    dashboardWindow.location.href = url;
    dashboardWindow.focus?.();
  } else {
    window.location.href = url;
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

map.on("click", (event) => {
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

  const { maxBounds, maxBoundsViscosity } = popupBoundsState;
  popupBoundsState = null;

  if (maxBounds) {
    map.setMaxBounds(maxBounds);
  }

  map.options.maxBoundsViscosity = maxBoundsViscosity ?? 1.0;
};

const popupViewState = {};
const popupRoomState = {};
const popupDeviceState = {};
const popupDeviceQueryState = {};
const popupDevicePageSizeState = {};
const popupDeviceSearchOpenState = {};
const popupDeviceTypeFilterState = {};
const popupDeviceScopeState = {};
let loadedEquipmentRevision = null;
let pendingEquipmentRevision = null;
let latestEquipmentSyncState = null;
let equipmentSyncPollHandle = null;
let equipmentSyncRetryHandle = null;
let backendStatusPanel = null;
let backendSessionCache = null;
let backendSessionCacheAt = 0;
let buildingEquipmentSummaryCache = null;
let buildingEquipmentSummaryPromise = null;
let globalEquipmentTypeFilter = "";
const buildingEquipmentBubbleEntries = new Map();
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
  backendSessionIsAdmin = !!backendSessionCache.isAdmin;
  window.syntroBackendSession = backendSessionCache;
  updateExportBackupButtonVisibility();
};

const loadBackendSession = async () => {
  const now = Date.now();
  if (backendSessionCache && now - backendSessionCacheAt < BACKEND_SESSION_CACHE_MS) {
    return backendSessionCache;
  }

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

  backendSessionCacheAt = now;
  return backendSessionCache;
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
  <button id="backend-export-backup-button" type="button" hidden></button>
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
    exportBackupButton: root.querySelector("#backend-export-backup-button"),
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

  panel.exportBackupButton?.addEventListener("click", () => {
    void handleExportStaticBackup();
  });

  backendStatusPanel = panel;
  return panel;
};

const handleExportStaticBackup = async () => {
  const panel = ensureBackendStatusPanel();
  if (!panel?.exportBackupButton) return;

  const originalText = panel.exportBackupButton.textContent;
  panel.exportBackupButton.disabled = true;
  panel.exportBackupButton.textContent = "Guardando...";
  panel.message.textContent = "Guardando respaldo estatico en src/data...";

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/frontend-static-backup/save?campus=${getCurrentCampusKey()}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.message || `API respondio ${response.status}`);
    }

    resetSearchMetadataCaches();
    resetBuildingsCatalogCache();
    if (typeof window.refreshVisibleWalkingRoutes === "function") {
      await window.refreshVisibleWalkingRoutes();
    }

    panel.message.textContent =
      `Respaldo guardado: ${result?.routes?.nodes ?? 0} nodos, ${result?.routes?.edges ?? 0} tramos, ${result?.buildings?.synced ?? 0} edificios.`;
  } catch (error) {
    console.error("Error guardando respaldo estatico del mapa:", error);
    panel.message.textContent = error?.message || "No se pudo guardar el respaldo. Revisa la consola.";
  } finally {
    panel.exportBackupButton.disabled = false;
    panel.exportBackupButton.textContent = originalText || "Guardar respaldo";
  }
};

const updateExportBackupButtonVisibility = () => {
  const panel = ensureBackendStatusPanel();
  if (!panel?.exportBackupButton) return;

  panel.exportBackupButton.hidden = !(backendSessionIsAdmin && panel.root.dataset.backendState === "online");
};

const refreshBackendSessionForExport = async () => {
  const session = await loadBackendSession();
  backendSessionIsAdmin = !!session?.isAdmin;
  updateExportBackupButtonVisibility();
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
    updateExportBackupButtonVisibility();
    return;
  }

  panel.statusText.textContent = hasPendingChanges ? "API activa con cambios pendientes" : "API activa";
  panel.version.textContent = getFrontendCacheVersion();
  panel.lastChange.textContent = formatSyncTimestamp(syncState?.latestChangeUtc);
  panel.message.textContent = hasPendingChanges
    ? "Hay cambios pendientes en el mapa o inventario. Usa Actualizar mapa."
    : "No hay actualizaciones pendientes.";
  panel.refreshButton.hidden = !hasPendingChanges;
  updateExportBackupButtonVisibility();
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
  void refreshBackendSessionForExport();
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

  const [roomsByFloor, backendRooms] = await Promise.all([
    Promise.all(roomFilePromises),
    loadBackendRoomsForBuilding(building),
  ]);

  return mergeRoomsWithBackendOverrides(roomsByFloor.flat(), backendRooms);
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
      { cache: "no-store" }
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
      { cache: "no-store" }
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

const buildDeviceControlsHtml = (featureId, query, isOpen, pageSize) => {
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
        class="floorButton"
        style="${getChipButtonStyle(isActive, true)}"
        onclick="window.setDevicePageSize && window.setDevicePageSize('${escapeHtml(featureId)}', ${size})"
      >
        ${size}
      </button>`;
  }

  return `
    <div style="margin-top:8px; display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
      <button
        class="floorButton"
        style="${getActionButtonStyle()}"
        onclick="window.toggleDeviceSearch && window.toggleDeviceSearch('${escapeHtml(featureId)}')"
      >
        ${buttonLabel}
      </button>
      ${inputHtml}
    </div>
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

const createEquipmentBubbleIcon = (count) =>
  L.divIcon({
    className: "building-equipment-bubble",
    html: `<button type="button" aria-label="${count} equipo(s) asignados">${count}</button>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });

const updateBuildingEquipmentBubbles = () => {
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
  const floorHost = document.getElementById("map-floor-filter-buttons");
  if (!floorHost) return;

  document.querySelectorAll("#floorButtons-container [id^='b']").forEach((button) => {
    if (button.id !== "bLoc") floorHost.appendChild(button);
  });
};

const ensureMapEquipmentTypeFilter = (summaryMap) => {
  const topActions = document.getElementById("top-actions");
  if (!topActions) return;
  if (document.getElementById("map-equipment-type-filter")) {
    syncFloorButtonsToFilter();
    return;
  }

  const types = ["all", ...getAvailableSummaryTypes(summaryMap)];

  const wrapper = document.createElement("div");
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
  min-width: 300px;
  max-width: 390px;
  max-height: 68vh;
  overflow-y: auto;
  line-height: 1.35;
  font-size: 13px;
  word-break: break-word;
  overflow-wrap: anywhere;
  padding-right: 2px;
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
  border: 2px solid ${isActive ? "#444" : "#2f7ea8"};
  background: ${isActive ? "#e9ecef" : "#fff"};
  color: #333;
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
  border: 2px solid #2f7ea8;
  background: #fff;
  color: #333;
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
      class="floorButton"
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
      class="floorButton"
      style="${getActionButtonStyle()}"
      title="Editar edificio en dashboard"
      aria-label="Editar edificio en dashboard"
      onclick="return window.openSyntroDashboard(event, this.href)"
    >
      Editar edificio
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

const buildDevicesSummaryHtml = (devices, floorLabel) => {
  if (!devices.length) {
    return `No hay equipos cargados para ${escapeHtml(floorLabel)}.`;
  }

  const counts = countDevicesByType(devices);

  return `
    ${buildKeyValueRow("PCs", counts.pc)}
    ${buildKeyValueRow("Impresoras", counts.printer)}
    ${buildKeyValueRow("Escáneres", counts.scanner)}
    ${buildKeyValueRow("Otros", counts.other)}
  `;
};

const buildDevicesListHtml = (devicesInFloor, roomsInFloor, allDevices, allRooms, floorLabel, highlightKey, query, pageSize, typeFilter) => {
  const roomsMap = buildRoomsMap(allRooms);
  const activeQuery = String(query || "").trim();
  const activeType = String(typeFilter || "all").trim().toLowerCase();
  const sourceDevices = activeQuery ? allDevices : devicesInFloor;

  if (!sourceDevices.length) {
    return `No hay equipos cargados para ${escapeHtml(floorLabel)}.`;
  }

  const queryFilteredDevices = activeQuery
    ? sourceDevices.filter((device) => deviceMatchesQuery(device, activeQuery, roomsMap))
    : sourceDevices;

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
    const roomName = room?.name || room?.shortName || "Sin sala";
    const title = device.serialNumber || device.name || device.deviceId || "Sin S/N";
    const description = device.description || device.name || "Sin descripcion";
    const isHighlighted = highlightDevice === device;
    const deviceFloor = getDeviceFloor(device, roomsMap);
    const floorText = Number.isFinite(deviceFloor) ? `Piso ${deviceFloor}` : "";
    const cardStyle = isHighlighted
      ? "margin-bottom:8px; padding:8px 10px; border:2px solid #2f7ea8; border-radius:8px; background:#f0f7fb;"
      : "margin-bottom:8px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;";

    html += `
      <div style="${cardStyle}">
        ${
          isHighlighted
            ? `<div style="font-size:11px; font-weight:700; color:#1f2937; margin-bottom:4px;">Equipo buscado</div>`
            : ""
        }
        <div style="font-weight:600;">${escapeHtml(title)}</div>
        <div style="margin-top:2px; font-size:12px;">
          ${escapeHtml(description)}
        </div>
        <div style="margin-top:2px; font-size:12px;">
          ${escapeHtml(device.type || "sin_tipo")} · ${escapeHtml(floorText)}${floorText ? " · " : ""}${escapeHtml(roomName)} · IP: ${escapeHtml(device.ip || "sin IP")} · ${escapeHtml(device.status || "sin estado")}
        </div>
        <div style="margin-top:6px;">
          ${buildDashboardEquipmentLink(device.serialNumber || device.deviceId || device.name)}
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
  const floors = Array.isArray(building?.floors) ? building.floors : [];
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
        class="floorButton"
        style="${getChipButtonStyle(isCurrent, false)}"
        onclick="window.selectBuildingFloor && window.selectBuildingFloor('${escapeHtml(String(floor))}')"
      >
        ${escapeHtml(String(floor))}
      </button>
    `;
  }

  html += `</div></div>`;
  return html;
};

const buildViewSelectorHtml = (featureId, currentView, canViewEquipment = true) => {
  const views = [
    { key: "summary", label: "Resumen" },
    { key: "rooms", label: "Salas" },
    { key: "history", label: "Historial" },
  ];

  if (canViewEquipment) views.splice(2, 0, { key: "devices", label: "Equipos" });

  let html = `
    <div style="margin-top:10px;">
      <div style="font-weight:600; margin-bottom:4px;">Vista</div>
      <div style="${chipRowStyle}">
  `;

  for (const view of views) {
    const isCurrent = view.key === currentView;

    html += `
      <button
        class="floorButton"
        style="${getChipButtonStyle(isCurrent, true)}"
        onclick="window.setPopupView && window.setPopupView('${escapeHtml(featureId)}','${escapeHtml(view.key)}')"
      >
        ${escapeHtml(view.label)}
      </button>
    `;
  }

  html += `</div></div>`;
  return html;
};

const refreshCurrentPopup = async () => {
  if (!currentOpenLayer || !currentOpenLayer.feature) return;

  currentOpenLayer.setPopupContent("Cargando información...");
  const popupHtml = await getFeaturePopupHtml(currentOpenLayer.feature);
  currentOpenLayer.setPopupContent(popupHtml);
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

  popupViewState[featureId] = viewKey;
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

window.selectBuildingFloor = (targetFloor) => {
  const floorText = String(targetFloor).trim();

  const candidates = Array.from(document.querySelectorAll("button, a")).filter((el) => {
    const text = (el.textContent || "").trim();
    const insidePopup = !!el.closest(".leaflet-popup-content");
    return text === floorText && !insidePopup;
  });

  if (candidates.length > 0) {
    candidates[0].click();
    return;
  }

  console.warn(`No se encontró botón global para el piso ${floorText}`);
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
    return `No hay salas cargadas para el piso ${escapeHtml(floorLabel)}.`;
  }

  let html = "";

  for (const room of rooms.slice(0, 10)) {
    const roomDevicesCount = devices.filter((device) => device.roomId === room.roomId).length;

    html += `
      <div style="margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
        <div style="font-weight:600; margin-bottom:3px;">${escapeHtml(room.name || room.shortName || room.roomId)}</div>
        <div style="font-size:12px; color:#444;">
          ${escapeHtml(room.type || "sin_tipo")} · ${escapeHtml(room.status || "sin_estado")} · ${roomDevicesCount} equipo(s)
        </div>
        <div style="margin-top:8px;">
          <button
            class="floorButton"
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
    html += `... y ${rooms.length - 10} sala(s) más<br/>`;
  }

  return html;
};

const buildRoomDetailHtml = (featureId, room, roomDevices) => {
  const recentEvents = getRecentEvents(roomDevices).slice(0, 5);

  let html = `
    <div style="margin-bottom:10px;">
      <button
        class="floorButton"
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

  html += `<div style="margin-top:10px; font-weight:600;">Equipos de la sala</div>`;

  if (!roomDevices.length) {
    html += `No hay equipos asociados.<br/>`;
  } else {
    for (const device of roomDevices) {
      html += `
        <div style="margin-top:6px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#fafafa;">
          <div style="font-weight:600;">${escapeHtml(device.name || device.deviceId)}</div>
          <div style="font-size:12px; margin-top:2px;">
            ${escapeHtml(device.type || "sin_tipo")} · IP: ${escapeHtml(device.ip || "sin IP")} · ${escapeHtml(device.status || "sin estado")}
          </div>
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

const getFeaturePopupHtml = async (feature) => {
  const building = await findBuildingInCatalog(feature);
  const featureId = feature?.properties?.id || "Sin ID";
  const currentFloor = feature?.properties?.floor ?? 0;
  const floorLabel = currentFloor;
  let currentView = popupViewState[featureId] || "summary";
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
  const canViewEquipment = Boolean(backendSession?.isAuthenticated);

  if (!canViewEquipment) {
    currentView = "summary";
    popupViewState[featureId] = "summary";
    return `
      <div style="${popupShellStyle}">
        <b style="font-size:16px;">${escapeHtml(featureName)}</b>
        ${buildFloorSelectorHtml(building, currentFloor)}
      </div>
    `;
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

  const type = building?.type || "unknown";
  const shortName = building?.shortName || "";
  const responsibleArea = building?.responsibleArea || "";
  const floors = Array.isArray(building?.floors) ? building.floors.join(", ") : "";
  const searchPopupContent = building?.searchPopupContent || "";
  const isBackendAdmin = Boolean(backendSession?.isAdmin);
  const adminActionsHtml = isBackendAdmin ? buildDashboardBuildingEditLink(featureId) : "";

  let detailsHtml = `
    <div style="${popupShellStyle}">
      <b style="font-size:16px;">${escapeHtml(featureName)}</b><br/>
      ID: ${escapeHtml(featureId)}<br/>
      Piso actual: ${escapeHtml(floorLabel)}<br/>
      Tipo: ${escapeHtml(type)}
  `;

  if (shortName) detailsHtml += `<br/>Código: ${escapeHtml(shortName)}`;
  if (responsibleArea) detailsHtml += `<br/>Área: ${escapeHtml(responsibleArea)}`;
  if (floors) detailsHtml += `<br/>Pisos: ${escapeHtml(floors)}`;

  detailsHtml += `<br/>Salas edificio: ${escapeHtml(allRooms.length)}`;
  detailsHtml += `<br/>Salas piso ${escapeHtml(floorLabel)}: ${escapeHtml(roomsInFloor.length)}`;
  if (canViewEquipment) {
    detailsHtml += `<br/>Equipos edificio: ${escapeHtml(allDevices.length)}`;
    detailsHtml += `<br/>Equipos piso ${escapeHtml(floorLabel)}: ${escapeHtml(devicesInFloor.length)}`;
  }

  detailsHtml += buildFloorSelectorHtml(building, currentFloor);
  detailsHtml += buildViewSelectorHtml(featureId, currentView, canViewEquipment);

  if (currentView === "summary") {
    detailsHtml += `
      <div style="${sectionBoxStyle}">
        <div style="font-weight:600; margin-bottom:6px;">Resumen</div>
        ${searchPopupContent ? `<div>${searchPopupContent}</div>` : ""}
        ${buildBuildingDetailHtml(buildingDetail)}
      </div>
    `;

  }

  if (currentView === "rooms") {
    detailsHtml += `<div style="${sectionBoxStyle}">`;

    if (selectedRoomId) {
      const selectedRoom = roomsInFloor.find((room) => room.roomId === selectedRoomId);
      const roomDevices = devicesInFloor.filter((device) => device.roomId === selectedRoomId);

      if (selectedRoom) {
        detailsHtml += `<div style="font-weight:600; margin-bottom:6px;">Detalle de sala</div>`;
        detailsHtml += buildRoomDetailHtml(featureId, selectedRoom, roomDevices);
      } else {
        detailsHtml += `Sala no encontrada en este piso.`;
      }
    } else {
      detailsHtml += `<div style="font-weight:600; margin-bottom:6px;">Salas del piso ${escapeHtml(floorLabel)}</div>`;
      detailsHtml += buildRoomsListWithButtonsHtml(featureId, roomsInFloor, devicesInFloor, floorLabel);
    }

    detailsHtml += `</div>`;
  }

  if (currentView === "devices" && canViewEquipment) {
    const devicesForView = deviceScope === "building" ? allDevices : devicesInFloor;
    const devicesScopeLabel = deviceScope === "building" ? "edificio completo" : `piso ${floorLabel}`;

    detailsHtml += `
        <div style="${sectionBoxStyle}">
        <div style="font-weight:600; margin-bottom:6px;">Equipos por tipo (${escapeHtml(devicesScopeLabel)})</div>
        ${buildDevicesSummaryHtml(devicesForView, devicesScopeLabel)}
        <div style="margin-top:10px; font-weight:600;">Equipos destacados</div>
        ${buildDeviceControlsHtml(featureId, deviceQuery, deviceSearchOpen, devicePageSize)}
        <div style="margin-top:4px;">
          ${buildDevicesListHtml(devicesForView, roomsInFloor, allDevices, allRooms, devicesScopeLabel, popupDeviceState[featureId], deviceQuery, devicePageSize, deviceTypeFilter)}
        </div>
      </div>
    `;
  }

  if (currentView === "history") {
    detailsHtml += `
      <div style="${sectionBoxStyle}">
        <div style="font-weight:600; margin-bottom:6px;">Historial del edificio</div>
        ${buildHistorySummaryHtml(buildingActivityItems)}
      </div>
    `;
  }

  detailsHtml += `
    <div style="margin-top:12px; display:flex; flex-wrap:wrap; gap:8px;">
      ${adminActionsHtml}
    </div>
  `;
  detailsHtml += `</div>`;

  return detailsHtml;
};

export const filter = (feature) => {
  return feature.properties.isVisible && feature.properties.isPublished;
};

export const style = (feature) => {
  return feature.properties.style;
};

export const openBuildingPopupLayer = (layer, options = {}) => {
  if (!layer) return false;

  const {
    zoom = true,
    rememberView = true,
    maxZoom = 20,
    padding = [40, 40],
  } = options;
  const minZoom = typeof map.getMinZoom === "function" ? map.getMinZoom() : null;
  const currentZoom = typeof map.getZoom === "function" ? map.getZoom() : null;
  const shouldZoom =
    !!zoom &&
    Number.isFinite(Number(minZoom)) &&
    Number.isFinite(Number(currentZoom)) &&
    Number(currentZoom) <= Number(minZoom) + 0.05;

  if (rememberView) {
    popupReturnView = {
      center: map.getCenter(),
      zoom: map.getZoom(),
    };
  }

  suspendMapBoundsForPopup();

  if (shouldZoom && typeof layer.getBounds === "function") {
    map.fitBounds(layer.getBounds(), {
      maxZoom,
      padding,
    });
  } else if (shouldZoom && typeof layer.getLatLng === "function") {
    map.setView(layer.getLatLng(), maxZoom);
  }

  if (typeof layer.openPopup === "function") {
    layer.openPopup();
  }

  return true;
};

const zoomToFeaturePoint = (e) => {
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
    maxZoom: 20,
    padding: [40, 40],
  });
};

const createEquipmentBubbleForLayer = async (feature, layer) => {
  const featureId = feature?.properties?.id;
  if (!featureId || typeof layer?.getBounds !== "function") return;

  const summaryMap = await loadBuildingEquipmentSummary();
  if (!layer?._map) return;
  ensureMapEquipmentTypeFilter(summaryMap);

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
  applyDefaultStyle(layer);

  if (currentHoveredLayer === layer) {
    currentHoveredLayer = null;
  }
};

export const onEachFeature = (feature, layer) => {
  if (feature.properties.isClickable) {
    layer.bindPopup("Cargando información...");

    if (layer.getPopup()) {
      layer.getPopup().options.autoPan = true;
      layer.getPopup().options.keepInView = true;
      layer.getPopup().options.closeOnClick = false;
    }

        layer.on("popupopen", async () => {
      suspendMapBoundsForPopup();
      setCurrentOpenFeatureId(feature?.properties?.id || null);
      currentOpenLayer = layer;
      setSelectedLayer(layer);

      if (!popupViewState[feature.properties.id]) {
        popupViewState[feature.properties.id] = "summary";
      }

      const popupHtml = await getFeaturePopupHtml(feature);
      layer.setPopupContent(popupHtml);
    });

    layer.on("popupclose", () => {
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
          duration: 0.45,
          easeLinearity: 0.25,
        });
        window.setTimeout(restoreOnce, 650);
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
  updateBackendSessionCache(event.detail || {});

  if (!event?.detail?.isAuthenticated) {
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















