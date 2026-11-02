import "../lib/leaflet/leaflet.js";
import { appConfig } from "../config/appConfig.js";
import { getSite, getPrimaryCampusKey, getSitesSource } from "../config/siteConfig.js";

const resolveFirstCampus = () => {
  if (getSitesSource() !== "remote") {
    return { campusKey: "", center: [0, 0], zoom: 2, bounds: null };
  }

  const campusKey = getPrimaryCampusKey();
  const config = getSite(campusKey);
  if (!config) {
    return { campusKey: "", center: [0, 0], zoom: 2, bounds: null };
  }

  return {
    campusKey,
    center: config.center,
    zoom: config.zoom,
    bounds: Array.isArray(config.bounds) && config.bounds.length >= 2 ? L.latLngBounds(config.bounds) : null,
  };
};

const firstCampus = resolveFirstCampus();

export const map = L.map("map", {
  zoomControl: false,
  attributionControl: true,
  maxBounds: firstCampus.bounds ? firstCampus.bounds.pad(0.02) : undefined,
  maxBoundsViscosity: 1.0,
}).setView(firstCampus.center, firstCampus.zoom);

export const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  keepBuffer: 8,
  updateWhenIdle: false,
  updateWhenZooming: true,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

export const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 23,
  keepBuffer: 8,
  updateWhenIdle: false,
  updateWhenZooming: true,
  attribution: 'Tiles &copy; Esri and contributors; fallback &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

let tileWarning;
let satelliteWarning = false;
let osmWarning = false;
const updateTileWarning = () => {
  if (!tileWarning && (satelliteWarning || osmWarning)) {
    tileWarning = document.createElement("div");
    tileWarning.className = "map-tile-warning";
    tileWarning.setAttribute("role", "status");
    tileWarning.textContent = "No se pudieron cargar algunos mosaicos.";
    map.getContainer().appendChild(tileWarning);
  }
  if (tileWarning) tileWarning.hidden = !satelliteWarning && !osmWarning;
};

const installTileFallback = (layer, fallbackTemplate) => {
  layer.on("tileerror", (event) => {
    const tile = event?.tile;
    if (!tile) return;
    if (tile.dataset.syntroFallbackAttempted === "true") {
      if (map.hasLayer(layer)) {
        osmWarning = true;
        updateTileWarning();
      }
      return;
    }
    tile.dataset.syntroFallbackAttempted = "true";
    const coords = event.coords;
    if (!coords) return;
    tile.addEventListener("error", () => {
      if (!map.hasLayer(layer)) return;
      osmWarning = true;
      updateTileWarning();
    }, { once: true });
    tile.src = L.Util.template(fallbackTemplate, {
      s: "a",
      x: coords.x,
      y: coords.y,
      z: coords.z,
    });
  });
};

installTileFallback(osmLayer, "https://tile.openstreetmap.de/{z}/{x}/{y}.png");

let satelliteFailures = 0;
let satelliteFallback = false;
let probeTimer;
let probeImage;
let probeTimeout;
let lastFailedCoords;
const satelliteTileTimers = new Map();
const timedOutTiles = new WeakSet();

const clearSatelliteTileTimer = (tile) => {
  clearTimeout(satelliteTileTimers.get(tile));
  satelliteTileTimers.delete(tile);
};

const clearSatelliteTileTimers = () => {
  satelliteTileTimers.forEach((timer) => clearTimeout(timer));
  satelliteTileTimers.clear();
};

const cancelSatelliteProbe = () => {
  clearTimeout(probeTimer);
  clearTimeout(probeTimeout);
  if (probeImage) {
    probeImage.onload = null;
    probeImage.onerror = null;
    probeImage.src = "";
    probeImage = null;
  }
};

const scheduleSatelliteProbe = () => {
  probeTimer = setTimeout(() => {
    if (!satelliteFallback || !map.hasLayer(osmLayer)) return;
    const image = new Image();
    probeImage = image;
    const finish = (success) => {
      if (probeImage !== image) return;
      cancelSatelliteProbe();
      if (!satelliteFallback || !map.hasLayer(osmLayer)) return;
      if (success) {
        satelliteFallback = false;
        satelliteFailures = 0;
        satelliteWarning = false;
        updateTileWarning();
        osmLayer.remove();
        satelliteLayer.addTo(map);
      } else {
        scheduleSatelliteProbe();
      }
    };
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    probeTimeout = setTimeout(() => finish(false), 10000);
    image.src = satelliteLayer.getTileUrl(lastFailedCoords);
  }, 30000);
};

const recordSatelliteFailure = (coords) => {
  if (satelliteFallback || !map.hasLayer(satelliteLayer)) return;
  if (!coords) return;
  lastFailedCoords = coords;
  satelliteFailures += 1;
  if (satelliteFailures < 3) return;
  satelliteFallback = true;
  satelliteLayer.remove();
  osmLayer.addTo(map);
  satelliteWarning = true;
  updateTileWarning();
  scheduleSatelliteProbe();
};

satelliteLayer.on("tileloadstart", (event) => {
  if (!event.tile || !event.coords || !map.hasLayer(satelliteLayer)) return;
  const { tile, coords } = event;
  clearSatelliteTileTimer(tile);
  satelliteTileTimers.set(tile, setTimeout(() => {
    satelliteTileTimers.delete(tile);
    if (!map.hasLayer(satelliteLayer) || satelliteFallback) return;
    timedOutTiles.add(tile);
    recordSatelliteFailure(coords);
    if (map.hasLayer(satelliteLayer)) {
      // Replacing the source aborts the stalled request without counting its load as success.
      tile.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
    }
  }, 10000));
});
satelliteLayer.on("tileload", (event) => {
  clearSatelliteTileTimer(event.tile);
  if (!timedOutTiles.has(event.tile) && !satelliteFallback && map.hasLayer(satelliteLayer)) satelliteFailures = 0;
});
satelliteLayer.on("tileerror", (event) => {
  clearSatelliteTileTimer(event.tile);
  if (!timedOutTiles.has(event.tile)) recordSatelliteFailure(event.coords);
});
satelliteLayer.on("tileunload", (event) => clearSatelliteTileTimer(event.tile));
satelliteLayer.on("remove", () => {
  clearSatelliteTileTimers();
  if (!satelliteFallback) satelliteFailures = 0;
});
osmLayer.on("remove", () => {
  if (!satelliteFallback) return;
  satelliteFallback = false;
  satelliteFailures = 0;
  satelliteWarning = false;
  updateTileWarning();
  cancelSatelliteProbe();
});
const disposeSatelliteFallback = () => {
  satelliteFallback = false;
  clearSatelliteTileTimers();
  cancelSatelliteProbe();
};
map.on("unload", disposeSatelliteFallback);
window.addEventListener("unload", disposeSatelliteFallback);

// The toggle records user intent even when the temporary OSM layer is already active.
document.addEventListener("click", (event) => {
  if (!satelliteFallback || !event.target.closest?.(".session-mode-globe")) return;
  satelliteFallback = false;
  satelliteFailures = 0;
  satelliteWarning = false;
  updateTileWarning();
  cancelSatelliteProbe();
}, true);

export const getSatellitePreference = () => {
  try {
    return window.localStorage.getItem("syntro-map-layer") !== "streets";
  } catch {
    return true;
  }
};

(getSatellitePreference() ? satelliteLayer : osmLayer).addTo(map);

let locationTrackingActive = false;
let userLocationMarker = null;
let userAccuracyCircle = null;
let hasCenteredOnUser = false;

const userLocationIcon = L.divIcon({
  className: "user-location-marker-wrapper",
  html: '<span class="user-location-marker" aria-hidden="true"></span>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

const updateLocationButton = (state, message) => {
  const button = document.getElementById("bLoc");
  if (!button) return;

  button.classList.toggle("locationTrackingActive", state === "active");
  button.classList.toggle("locationTrackingError", state === "error");
  button.setAttribute("aria-pressed", String(state === "active"));
  button.title = message;
};

const clearLocationLayers = () => {
  if (userLocationMarker) {
    map.removeLayer(userLocationMarker);
    userLocationMarker = null;
  }

  if (userAccuracyCircle) {
    map.removeLayer(userAccuracyCircle);
    userAccuracyCircle = null;
  }
};

const handleLocationFound = (event) => {
  const position = event.latlng;
  const accuracy = Math.max(Number(event.accuracy) || 0, 1);

  if (!userLocationMarker) {
    userLocationMarker = L.marker(position, {
      icon: userLocationIcon,
      keyboard: false,
      zIndexOffset: 3000,
    })
      .bindTooltip("Tu ubicación", {
        direction: "top",
        offset: [0, -12],
      })
      .addTo(map);
  } else {
    userLocationMarker.setLatLng(position);
  }

  if (!userAccuracyCircle) {
    userAccuracyCircle = L.circle(position, {
      radius: accuracy,
      color: "#1a56a8",
      weight: 1,
      opacity: 0.65,
      fillColor: "#5eead4",
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(map);
  } else {
    userAccuracyCircle.setLatLng(position);
    userAccuracyCircle.setRadius(accuracy);
  }

  if (!hasCenteredOnUser) {
    map.setView(position, Math.max(map.getZoom(), 18), { animate: true });
    hasCenteredOnUser = true;
  } else if (!map.getBounds().pad(-0.2).contains(position)) {
    map.panTo(position, { animate: true, duration: 0.45 });
  }

  updateLocationButton(
    "active",
    `Siguiendo tu ubicación (precisión aproximada: ${Math.round(accuracy)} m)`
  );
};

const handleLocationError = (event) => {
  locationTrackingActive = false;
  hasCenteredOnUser = false;
  map.stopLocate();
  clearLocationLayers();
  updateLocationButton("error", event?.message || "No se pudo obtener tu ubicación");
  console.error("[ubicación] No se pudo iniciar el seguimiento:", event);
};

map.on("locationfound", handleLocationFound);
map.on("locationerror", handleLocationError);

export const stopLocationTracking = () => {
  locationTrackingActive = false;
  hasCenteredOnUser = false;
  map.stopLocate();
  clearLocationLayers();
  updateLocationButton("inactive", "Activar seguimiento de ubicación");
};

export const startLocationTracking = () => {
  locationTrackingActive = true;
  hasCenteredOnUser = false;
  updateLocationButton("active", "Buscando tu ubicación...");

  map.locate({
    watch: true,
    setView: false,
    enableHighAccuracy: true,
    maximumAge: 3000,
    timeout: 15000,
  });
};

export const toggleLocationTracking = () => {
  if (locationTrackingActive) {
    stopLocationTracking();
    return false;
  }

  startLocationTracking();
  return true;
};

export const HOST_URL =
  window.location.protocol +
  "//" +
  window.location.hostname +
  (window.location.port ? ":" + window.location.port : "");

export const BACKEND_API_URL = appConfig.apiBaseUrl;
