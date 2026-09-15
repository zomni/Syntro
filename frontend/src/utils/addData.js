/////////////////////////////////////////////////////////////////////////////////
///////////////////////////// Add layers to the map /////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

import "../views/draw.js";

import { map, BACKEND_API_URL } from "../views/map.js";

import {
  filter,
  style,
  onEachFeature,
  currentOpenFeatureId,
  openBuildingPopupLayer,
  clearMapEquipmentState,
} from "@app/featureDisplay"; // GeoJSON options + popup state

import { createMarkers } from "../components/markers.js"; // Create markers for the map

import { latlngBuildings, campusBuildings } from "../views/buildingsInfo.js"; // Buildings info

import { createSvgElement } from "../utils/tools.js"; // Create SVG empty element
import { getCatalogFileName, getCurrentCampusKey } from "./campusConfig.js";
import { computeAllowedBuildingIdsForFloor } from "./buildingCatalog.js";
import {
  loadManualBuildings,
  mergeCatalogWithSearch,
  mergeGeoJsonWithSearch,
} from "@app/searchMetadata";
import { staticIconUrl, STATIC_MARKER_ICON_SIZE } from "../config/staticIconCatalog.js";
import { pointInRing } from "../utils/geometry.js";
import { getActiveCampus } from "./goToCampus.js";
import { getSite } from "../config/siteConfig.js";

// Create a layer group
var layerGroup = L.layerGroup().addTo(map);
var roomLayerGroup = L.layerGroup().addTo(map);
var roomsPane =
  typeof map.createPane === "function" && !map.getPane("roomsPane")
    ? map.createPane("roomsPane")
    : map.getPane("roomsPane");
if (roomsPane) {
  roomsPane.style.zIndex = 450;
}

let buildingsCatalogCache = new Map();
let renderSequence = 0;

const loadBuildingsCatalog = async (campus = getCurrentCampusKey()) => {
  if (buildingsCatalogCache.has(campus)) {
    return buildingsCatalogCache.get(campus);
  }

  try {
    const response = await fetch(`${getCatalogFileName(campus)}?v=${Date.now()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudo cargar el catálogo de edificios");
    }

    const data = await response.json();
    const mergedData = await mergeCatalogWithSearch(data, campus);
    buildingsCatalogCache.set(campus, mergedData);
    return mergedData;
  } catch (error) {
    console.error("Error cargando catálogo de edificios:", error);
    return { buildings: [] };
  }
};

const getAllowedBuildingIdsForFloor = async (floorNumber) => {
  const campus = getCurrentCampusKey();
  const catalog = await loadBuildingsCatalog(campus);
  const buildings = Array.isArray(catalog.buildings) ? catalog.buildings : [];
  return computeAllowedBuildingIdsForFloor(buildings, floorNumber);
};

const SVGLayerGroup = (svg, floorNumber, building, location, expectedRenderSequence) => {
  if (expectedRenderSequence !== renderSequence) {
    return null;
  }

  var floor = "floor" + floorNumber.toString();
  var svgElement = createSvgElement();
  svgElement.innerHTML = svg;
  var svgOverlay = L.svgOverlay(
    svgElement,
    latlngBuildings[location][building][floor],
    {
      opacity: 0.7,
      interactive: false,
    }
  );
  var toAdd = L.layerGroup([svgOverlay]);
  layerGroup.addLayer(toAdd);
  return toAdd;
};

const reopenPopupIfNeeded = (geoJsonLayers) => {
  if (!currentOpenFeatureId || !Array.isArray(geoJsonLayers)) {
    return;
  }

  geoJsonLayers.forEach((geoJsonLayer) => {
    if (!geoJsonLayer || !geoJsonLayer.eachLayer) return;

    geoJsonLayer.eachLayer((layer) => {
      const featureId = layer?.feature?.properties?.id;
      if (featureId === currentOpenFeatureId) {
        openBuildingPopupLayer(layer, {
          zoom: true,
          rememberView: false,
          maxZoom: 20,
          padding: [40, 40],
        });
      }
    });
  });
};

const featuresLayerGroup = (json, expectedRenderSequence) => {
  if (expectedRenderSequence !== renderSequence) {
    return;
  }

  var markers;
  var geoJsonLayers = [];

  json.features.map((feature) => {
    if (feature.geometry.type === "Polygon") {
      const geoJson = L.geoJSON(feature, {
        filter: filter,
        style: style,
        onEachFeature: onEachFeature,
      });

      geoJsonLayers.push(geoJson);
      layerGroup.addLayer(geoJson);
    }
  });

  markers = createMarkers(json);
  var toAdd = L.layerGroup(markers);
  layerGroup.addLayer(toAdd);

  reopenPopupIfNeeded(geoJsonLayers);
};

const addSVG = (floorNumber, building, location, expectedRenderSequence) => {
  $.ajax({
    url: "assets/svg/" + building + floorNumber.toString() + ".svg",
    type: "GET",
    data: {},
    dataType: "text",
    success: function (svg) {
      SVGLayerGroup(svg, floorNumber, building, location, expectedRenderSequence);
    },
    error: function () {
      console.log("ERROR Failed to load SVG");
    },
  });
};

const buildFloorGeoJsonUrl = (school, location, floorNumber) => {
  return `data/${school}_${location}_${floorNumber.toString()}.json?v=${Date.now()}`;
};

const loadFloorGeoJson = async (school, location, floorNumber) => {
  const response = await fetch(buildFloorGeoJsonUrl(school, location, floorNumber), {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`No se pudo cargar el piso ${floorNumber}`);
  }

  return response.json();
};

const cloneFeatureForFloor = (feature, floorNumber) => {
  return {
    ...feature,
    properties: {
      ...(feature?.properties || {}),
      floor: Number(floorNumber),
      footprintFloor: feature?.properties?.floor ?? 0,
    },
  };
};

const addBaseFootprintsForMissingBuildings = async (
  school,
  location,
  floorNumber,
  filteredJson,
  allowedBuildingIds
) => {
  if (Number(floorNumber) === 0 || !allowedBuildingIds) {
    return filteredJson;
  }

  const currentFeatures = Array.isArray(filteredJson.features) ? filteredJson.features : [];
  const currentIds = new Set(currentFeatures.map((feature) => feature?.properties?.id).filter(Boolean));
  const missingIds = new Set([...allowedBuildingIds].filter((id) => !currentIds.has(id)));

  if (missingIds.size === 0) {
    return filteredJson;
  }

  try {
    const baseJson = await loadFloorGeoJson(school, location, 0);
    const enrichedBaseJson = await mergeGeoJsonWithSearch(baseJson, location);
    const fallbackFeatures = (enrichedBaseJson.features || [])
      .filter((feature) => missingIds.has(feature?.properties?.id))
      .map((feature) => cloneFeatureForFloor(feature, floorNumber));

    return {
      ...filteredJson,
      features: [...currentFeatures, ...fallbackFeatures],
    };
  } catch (error) {
    console.error("Error cargando huellas base de edificios:", error);
    return filteredJson;
  }
};

const parseManualFloors = (floorsJson) => {
  try {
    const floors = JSON.parse(floorsJson || "[]");
    return Array.isArray(floors) ? floors.map(Number).filter((floor) => Number.isFinite(floor)) : [];
  } catch {
    return [];
  }
};

const manualBuildingToFeature = (building, floorNumber) => {
  let geometry = null;
  try {
    geometry = JSON.parse(building.geometryJson || "{}");
  } catch {
    geometry = null;
  }

  if (!geometry?.type || !geometry?.coordinates) {
    return null;
  }

  return {
    type: "Feature",
    properties: {
      id: building.externalId,
      name: building.displayName || building.externalId,
      kind: "building",
      buildingType: building.type || "manual",
      sourceId: "manual",
      floor: Number(floorNumber),
      isClickable: true,
      showLabel: false,
      slug: String(building.externalId || "").toLowerCase().replaceAll("_", "-"),
      centroid:
        building.centroidLongitude && building.centroidLatitude
          ? [building.centroidLongitude, building.centroidLatitude]
          : null,
      isVisible: true,
      isPublished: true,
      style: {
        color: "#3388ff",
        weight: 2,
        opacity: 1,
        fillColor: "#3388ff",
        fillOpacity: 0.2,
      },
    },
    geometry,
  };
};

const loadManualFeaturesForFloor = async (floorNumber) => {
  const manualBuildings = await loadManualBuildings();
  return manualBuildings
    .filter((building) => {
      const floors = parseManualFloors(building.floorsJson);
      return floors.length ? floors.includes(Number(floorNumber)) : Number(floorNumber) === 0;
    })
    .map((building) => manualBuildingToFeature(building, floorNumber))
    .filter(Boolean);
};

const hasSvgForFloor = (location, floorNumber) => {
  const buildings = campusBuildings[location] || {};
  return Object.keys(buildings).some((key) => {
    const floors = Array.isArray(buildings[key]) ? buildings[key] : [];
    return floors.includes(Number(floorNumber));
  });
};

const updateEmptyCampusNotice = (isEmpty) => {
  const notice = document.getElementById("empty-campus-notice");
  if (notice) {
    notice.classList.toggle("is-visible", isEmpty);
  }
};

const showMapLoading = () => {
  const overlay = document.getElementById("map-loading-overlay");
  if (overlay) {
    overlay.hidden = false;
  }
};

const hideMapLoading = () => {
  const overlay = document.getElementById("map-loading-overlay");
  if (overlay) {
    overlay.hidden = true;
  }
};

const addManualRoomPolygonsForFloor = async (floorNumber, expectedRenderSequence) => {
  if (!BACKEND_API_URL || expectedRenderSequence !== renderSequence) {
    return;
  }

  let rooms = [];
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/manual-rooms`, {
      cache: "no-store",
    });
    rooms = response.ok ? await response.json() : [];
  } catch (error) {
    console.error("Error cargando salas manuales para el mapa:", error);
    return;
  }

  if (expectedRenderSequence !== renderSequence || !Array.isArray(rooms)) {
    return;
  }

  const allowedBuildingIds = await getAllowedBuildingIdsForFloor(floorNumber);
  if (!allowedBuildingIds || expectedRenderSequence !== renderSequence) {
    return;
  }

  roomLayerGroup.clearLayers();

  let paintedCount = 0;

  for (const room of rooms) {
    if (!allowedBuildingIds.has(room.buildingExternalId)) continue;

    let geometry;
    try {
      geometry =
        typeof room.geometryJson === "string"
          ? JSON.parse(room.geometryJson)
          : room.geometryJson;
    } catch (error) {
      console.warn("Sala manual sin geometría válida:", room.externalId);
      continue;
    }

    const ring = geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;

    const latLngs = ring
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [point[1], point[0]]);

    if (latLngs.length < 3) continue;

    L.polygon(latLngs, {
      pane: "roomsPane",
      color: "#0d9488",
      weight: 1.5,
      fillColor: "#0d9488",
      fillOpacity: 0.18,
      interactive: false,
      className: "manual-room-polygon",
    }).addTo(roomLayerGroup);

    paintedCount += 1;
  }

  console.info(`[rooms] ${paintedCount} sala(s) en piso ${floorNumber}`);
};

const addAnnotationsForFloor = async (floorNumber, expectedRenderSequence) => {
  if (!BACKEND_API_URL || expectedRenderSequence !== renderSequence) {
    return;
  }

  let annotations = [];
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/annotations`, {
      cache: "no-store",
    });
    annotations = response.ok ? await response.json() : [];
  } catch (error) {
    console.error("Error cargando marcas para el mapa:", error);
    return;
  }

  if (expectedRenderSequence !== renderSequence || !Array.isArray(annotations)) {
    return;
  }

  const allowedBuildingIds = await getAllowedBuildingIdsForFloor(floorNumber);
  if (!allowedBuildingIds || expectedRenderSequence !== renderSequence) {
    return;
  }

  let paintedCount = 0;

  for (const annotation of annotations) {
    if (!allowedBuildingIds.has(annotation.buildingExternalId)) continue;

    let geometry;
    try {
      geometry =
        typeof annotation.geometryJson === "string"
          ? JSON.parse(annotation.geometryJson)
          : annotation.geometryJson;
    } catch (error) {
      console.warn("Marca sin geometría válida:", annotation.externalId);
      continue;
    }

    const ring = geometry?.coordinates?.[0];
    if (!Array.isArray(ring) || ring.length < 3) continue;

    const latLngs = ring
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [point[1], point[0]]);

    if (latLngs.length < 3) continue;

    const isStair = annotation.annotationType === "stair";
    L.polygon(latLngs, {
      pane: "roomsPane",
      color: isStair ? "#7c3aed" : "#0ea5e9",
      weight: 1.5,
      fillColor: isStair ? "#7c3aed" : "#0ea5e9",
      fillOpacity: 0.25,
      interactive: false,
      className: "annotation-polygon",
    }).addTo(roomLayerGroup);

    paintedCount += 1;
  }

  console.info(`[annotations] ${paintedCount} marca(s) en piso ${floorNumber}`);
};

export const CAMPUS_MARKER_BUILDING_ID = "map-general";

// Los iconos estaticos mantienen un tamano fijo relativo al mapa: se reescalan
// con el zoom (zoom de referencia = 18 => 28px) acotado a un rango legible.
const STATIC_MARKER_ZOOM_REF = 18;
const STATIC_MARKER_MIN_SIZE = 14;
const STATIC_MARKER_MAX_SIZE = 56;

let staticMarkerLayers = new Map();
let campusMarkersManagedByEditor = false;

export const setCampusMarkersManagedByEditor = (value) => {
  campusMarkersManagedByEditor = Boolean(value);
};

export const buildStaticMarkerIcon = (iconKey, size = STATIC_MARKER_ICON_SIZE, className = "map-static-marker-icon") =>
  L.icon({
    iconUrl: staticIconUrl(iconKey),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -10],
    className,
  });

export const staticMarkerSizeForZoom = (zoom, baseSize = STATIC_MARKER_ICON_SIZE) => {
  const scale = map.getZoomScale(zoom, STATIC_MARKER_ZOOM_REF);
  return Math.round(Math.min(STATIC_MARKER_MAX_SIZE, Math.max(STATIC_MARKER_MIN_SIZE, baseSize * scale)));
};

export const rescaleStaticMarkers = () => {
  const size = staticMarkerSizeForZoom(map.getZoom());
  staticMarkerLayers.forEach(({ layer, iconKey }) => {
    layer.setIcon(buildStaticMarkerIcon(iconKey, size));
  });
};

map.on("zoomend", rescaleStaticMarkers);
rescaleStaticMarkers();

export const renderMapMarkerLayer = (marker) => {
  if (!Array.isArray(marker.latitude) && typeof marker.latitude !== "number") return null;
  if (!Array.isArray(marker.longitude) && typeof marker.longitude !== "number") return null;

  const layer = L.marker([marker.latitude, marker.longitude], {
    icon: buildStaticMarkerIcon(marker.iconKey),
    pane: "roomsPane",
    interactive: false,
    keyboard: false,
    zIndexOffset: 400,
  });

  const keyed = String(marker.externalId || "");
  if (keyed) {
    staticMarkerLayers.set(keyed, { layer, iconKey: marker.iconKey });
    layer.on("remove", () => {
      staticMarkerLayers.delete(keyed);
    });
  }

  layer.addTo(roomLayerGroup);
  return layer;
};

const extractPolygonRings = (features) => {
  const rings = [];
  const pushRings = (coords) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    const outer = coords[0];
    if (!Array.isArray(outer) || outer.length < 3) return;
    rings.push(outer.map(([lng, lat]) => [lat, lng]));
  };

  for (const feature of features || []) {
    const geometry = feature?.geometry;
    if (!geometry?.coordinates) continue;
    if (geometry.type === "Polygon") {
      pushRings(geometry.coordinates);
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        pushRings(polygon);
      }
    }
  }
  return rings;
};

let buildingRingsCache = null;
let buildingRingsCampus = "";

const buildBuildingRingsForCampus = async () => {
  const { getActiveCampus } = await import("./goToCampus.js");
  const campus = getActiveCampus();
  if (!campus) return [];

  if (buildingRingsCampus === campus && Array.isArray(buildingRingsCache)) {
    return buildingRingsCache;
  }

  const rings = [];
  const site = getSite(campus);
  const floors = Array.isArray(site?.floors) ? site.floors.map(Number) : [];
  const school = site?.school;

  if (school) {
    for (const floorNumber of floors) {
      if (!Number.isFinite(floorNumber)) continue;
      try {
        const json = await loadFloorGeoJson(school, campus, floorNumber);
        const enriched = await mergeGeoJsonWithSearch(json, campus);
        rings.push(...extractPolygonRings(Array.isArray(enriched?.features) ? enriched.features : []));
      } catch (error) {
        // Piso sin plano: se ignora para la validacion.
      }
    }
  }

  try {
    const manualBuildings = await loadManualBuildings();
    for (const building of manualBuildings || []) {
      let floorsParsed = [];
      try {
        floorsParsed = JSON.parse(building.floorsJson || "[]");
      } catch {
        floorsParsed = [];
      }
      const buildingFloors =
        Array.isArray(floorsParsed) && floorsParsed.length > 0 ? floorsParsed.map(Number) : [0];
      if (!buildingFloors.some((floorNumber) => floors.includes(floorNumber))) continue;

      let geometry = null;
      try {
        geometry = JSON.parse(building.geometryJson || "{}");
      } catch {
        geometry = null;
      }
      if (geometry?.coordinates) {
        rings.push(...extractPolygonRings([{ geometry }]));
      }
    }
  } catch (error) {
    // Edificios manuales sin backend disponible.
  }

  buildingRingsCache = rings;
  buildingRingsCampus = campus;
  return rings;
};

export const isPointOverBuilding = async (latlng) => {
  const rings = await buildBuildingRingsForCampus();
  for (const ring of rings) {
    if (pointInRing(latlng, ring)) return true;
  }
  return false;
};

const addMapMarkersForFloor = async (floorNumber, expectedRenderSequence) => {
  if (!BACKEND_API_URL || expectedRenderSequence !== renderSequence) {
    return;
  }

  let markers = [];
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/map-markers?floor=${floorNumber}`, {
      cache: "no-store",
    });
    markers = response.ok ? await response.json() : [];
  } catch (error) {
    console.error("Error cargando marcadores para el mapa:", error);
    return;
  }

  if (expectedRenderSequence !== renderSequence || !Array.isArray(markers)) {
    return;
  }

  let globalMarkers = [];
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/map-markers?floor=-1`, {
      cache: "no-store",
    });
    globalMarkers = response.ok ? await response.json() : [];
  } catch (error) {
    console.error("Error cargando marcadores de campus:", error);
  }

  if (expectedRenderSequence !== renderSequence || !Array.isArray(globalMarkers)) {
    return;
  }

  let paintedCount = 0;

  for (const marker of globalMarkers) {
    if (String(marker.buildingExternalId) !== CAMPUS_MARKER_BUILDING_ID) continue;
    if (campusMarkersManagedByEditor) continue;
    if (renderMapMarkerLayer(marker)) paintedCount += 1;
  }

  const allowedBuildingIds = await getAllowedBuildingIdsForFloor(floorNumber);
  if (!allowedBuildingIds || expectedRenderSequence !== renderSequence) {
    return;
  }

  for (const marker of markers) {
    if (!allowedBuildingIds.has(marker.buildingExternalId)) continue;
    if (renderMapMarkerLayer(marker)) paintedCount += 1;
  }

  console.info(`[map-markers] ${paintedCount} marcador(es) en piso ${floorNumber}`);
};

const addFeatures = async (school, floorNumber, location, expectedRenderSequence) => {
  try {
    if (expectedRenderSequence !== renderSequence) {
      return;
    }

    const [allowedBuildingIds, floorJson] = await Promise.all([
      getAllowedBuildingIdsForFloor(floorNumber),
      loadFloorGeoJson(school, location, floorNumber),
    ]).catch((error) => {
      console.log("ERROR Failed to load floor data:", error);
      return [null, null];
    });

    if (expectedRenderSequence !== renderSequence) {
      return;
    }

    const enrichedJson = floorJson ? await mergeGeoJsonWithSearch(floorJson, location) : { features: [] };
    const baseFeatures = Array.isArray(enrichedJson.features) ? enrichedJson.features : [];

    if (expectedRenderSequence !== renderSequence) {
      return;
    }

    const filteredFeatures = allowedBuildingIds
      ? baseFeatures.filter((feature) => {
          const featureId = feature?.properties?.id;
          if (!featureId) return false;
          return allowedBuildingIds.has(featureId);
        })
      : baseFeatures;

    const filteredJson = {
      ...enrichedJson,
      features: filteredFeatures,
    };

    const renderJson = await addBaseFootprintsForMissingBuildings(
      school,
      location,
      floorNumber,
      filteredJson,
      allowedBuildingIds
    );
    const manualFeatures = await loadManualFeaturesForFloor(floorNumber);

    if (expectedRenderSequence !== renderSequence) {
      return;
    }

    const featuresToRender = [...(renderJson.features || []), ...manualFeatures];

    featuresLayerGroup(
      {
        ...renderJson,
        features: featuresToRender,
      },
      expectedRenderSequence
    );

    await addManualRoomPolygonsForFloor(floorNumber, expectedRenderSequence);

    await addAnnotationsForFloor(floorNumber, expectedRenderSequence);

    await addMapMarkersForFloor(floorNumber, expectedRenderSequence);

    updateEmptyCampusNotice(!hasSvgForFloor(location, floorNumber) && featuresToRender.length === 0);
  } finally {
    if (expectedRenderSequence === renderSequence) {
      hideMapLoading();
    }
  }
};

export const addDataToMap = (school, floorNumber, location) => {
  renderSequence += 1;
  const expectedRenderSequence = renderSequence;
  layerGroup.clearLayers();
  roomLayerGroup.clearLayers();
  updateEmptyCampusNotice(false);
  showMapLoading();
  addFeatures(school, floorNumber, location, expectedRenderSequence);

  Object.keys(campusBuildings[location] || {}).map((key) => {
    if (campusBuildings[location][key].includes(floorNumber)) {
      addSVG(floorNumber, key, location, expectedRenderSequence);
    }
  });
};

export const clearAllMapData = () => {
  layerGroup.clearLayers();
  roomLayerGroup.clearLayers();
  clearMapEquipmentState();
  updateEmptyCampusNotice(false);
  hideMapLoading();
};

export const resetBuildingsCatalogCache = () => {
  buildingsCatalogCache = new Map();
};




