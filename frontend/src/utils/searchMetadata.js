import { BACKEND_API_URL } from "../views/map.js";

import { getDataFileNames, getCurrentCampusKey } from "./campusConfig.js";

import { loadBuildingBackupBundle, resetBuildingBackupCache } from "./buildingBackupStorage.js?v=20260608b";

const getSearchPath = (campusKey) =>
  `${getDataFileNames(campusKey).search}?v=${Date.now()}`;

let searchMetadataCache = new Map();
let backendBuildingOverridesCache = new Map();
let manualBuildingsCache = new Map();
let buildingGeometryOverridesCache = new Map();

const isBuildingId = (id) => Boolean(String(id || "").trim());
const DEFAULT_FLOOR = 0;

const uniqueSortedFloors = (floors) =>
  [...new Set((floors || []).map((floor) => Number(floor)).filter((floor) => Number.isFinite(floor)))]
    .sort((a, b) => a - b);

const parseFloorsFromText = (text) => {
  const value = String(text || "");
  const match = value.match(/Pisos?:\s*([^<\n]+)/i) || value.match(/piso\(s\):\s*([^<\n]+)/i);

  if (!match) {
    return [];
  }

  const normalized = match[1].trim();
  if (!normalized || normalized.toUpperCase() === "N/D") {
    return [];
  }

  return uniqueSortedFloors(
    normalized
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
  );
};

const parseFloorsFromMetadata = (properties) => {
  const popupFloors = parseFloorsFromText(properties.popupContent);
  if (popupFloors.length > 0) {
    return popupFloors;
  }

  const descriptionFloors = parseFloorsFromText(properties.description);
  if (descriptionFloors.length > 0) {
    return descriptionFloors;
  }

  if (Number.isFinite(Number(properties.floor))) {
    return [Number(properties.floor)];
  }

  return [DEFAULT_FLOOR];
};

const extractBuildingMetadata = (feature) => {
  const properties = feature?.properties || {};
  const id = properties.id;

  if (!isBuildingId(id)) {
    return null;
  }

  return {
    id,
    title: properties.title || "",
    description: properties.description || "",
    popupContent: properties.popupContent || "",
    floor: properties.floor ?? 0,
    floors: parseFloorsFromMetadata(properties),
    searchText: properties.searchText || "",
    geometry: feature?.geometry || null,
  };
};

const loadBackendBuildingOverrides = async (campus = getCurrentCampusKey()) => {
  const cached = backendBuildingOverridesCache.get(campus);
  if (cached) {
    return cached;
  }

  try {
    const backup = await loadBuildingBackupBundle(campus);
    const items = backup.syncedBuildings;
    const overrides = new Map();

    for (const item of Array.isArray(items) ? items : []) {
      overrides.set(item.externalId, item);
    }

    backendBuildingOverridesCache.set(campus, overrides);
    return backendBuildingOverridesCache.get(campus);
  } catch (error) {
    console.error("Error cargando overrides de edificios desde backend:", error);
    backendBuildingOverridesCache.set(campus, new Map());
    return backendBuildingOverridesCache.get(campus);
  }
};

export const loadBuildingGeometryOverrides = async (campus = getCurrentCampusKey()) => {
  const cached = buildingGeometryOverridesCache.get(campus);
  if (cached) {
    return cached;
  }

  try {
    const backup = await loadBuildingBackupBundle(campus);
    const items = backup.geometryOverrides;
    const overrides = new Map();

    for (const item of Array.isArray(items) ? items : []) {
      try {
        const geometry = JSON.parse(item.geometryJson || "{}");
        if (item.buildingExternalId && geometry?.type && geometry?.coordinates) {
          overrides.set(item.buildingExternalId, {
            ...item,
            geometry,
          });
        }
      } catch {
        // Ignore invalid geometry rows and keep rendering the original map.
      }
    }

    buildingGeometryOverridesCache.set(campus, overrides);
    return buildingGeometryOverridesCache.get(campus);
  } catch (error) {
    console.error("Error cargando overrides de geometria:", error);
    buildingGeometryOverridesCache.set(campus, new Map());
    return buildingGeometryOverridesCache.get(campus);
  }
};

const parseFloorsJson = (floorsJson) => {
  if (!floorsJson) {
    return [];
  }

  try {
    const parsed = JSON.parse(floorsJson);
    return uniqueSortedFloors(parsed);
  } catch {
    return [];
  }
};

export const loadManualBuildings = async (campus = getCurrentCampusKey()) => {
  const cached = manualBuildingsCache.get(campus);
  if (cached) {
    return cached;
  }

  try {
    const backup = await loadBuildingBackupBundle(campus);
    const items = backup.manualBuildings;
    manualBuildingsCache.set(campus, Array.isArray(items) ? items : []);
    return manualBuildingsCache.get(campus);
  } catch (error) {
    console.error("Error cargando edificios manuales:", error);
    manualBuildingsCache.set(campus, []);
    return manualBuildingsCache.get(campus);
  }
};

const applyBackendOverrideToBuilding = (building, backendOverride) => {
  if (!backendOverride) {
    return building;
  }

  if (backendOverride.isDeleted) {
    return null;
  }

  const backendDisplayName = backendOverride.displayName || building.displayName || building.realName || building.id;
  const backendFloors = parseFloorsJson(backendOverride.floorsJson);
  const mergedSearchText = [
    backendDisplayName,
    building.displayName || "",
    building.realName || "",
    building.shortName || "",
    building.id || "",
    building.searchTitle || "",
    building.searchDescription || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ...building,
    displayName: backendDisplayName,
    realName: backendDisplayName,
    searchTitle: backendDisplayName,
    searchDescription: mergedSearchText,
    floors: backendFloors.length ? backendFloors : building.floors,
    campus: backendOverride.campus || building.campus || "",
  };
};

const applyBackendOverrideToFeature = (feature, backendOverride) => {
  if (!backendOverride) {
    return feature;
  }

  const properties = feature?.properties || {};
  if (backendOverride.isDeleted) {
    return {
      ...feature,
      properties: {
        ...properties,
        isVisible: false,
        isPublished: false,
        isDeleted: true,
      },
    };
  }

  const backendDisplayName = backendOverride.displayName || properties.title || properties.name || properties.id;
  const mergedSearchText = [
    backendDisplayName,
    properties.title || "",
    properties.name || "",
    properties.id || "",
    properties.searchText || "",
    properties.description || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    ...feature,
    properties: {
      ...properties,
      name: backendDisplayName,
      title: backendDisplayName,
      searchText: mergedSearchText,
    },
  };
};

export const loadSearchMetadata = async (campus = getCurrentCampusKey()) => {
  const cached = searchMetadataCache.get(campus);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(getSearchPath(campus), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error("No se pudo cargar el índice de búsqueda");
    }

    const json = await response.json();
    const features = Array.isArray(json?.features) ? json.features : [];
    const metadataById = new Map();

    for (const feature of features) {
      const metadata = extractBuildingMetadata(feature);
      if (!metadata) continue;
      metadataById.set(metadata.id, metadata);
    }

    searchMetadataCache.set(campus, metadataById);
    return searchMetadataCache.get(campus);
  } catch (error) {
    console.error("Error cargando metadatos desde el índice de búsqueda:", error);
    searchMetadataCache.set(campus, new Map());
    return searchMetadataCache.get(campus);
  }
};

export const mergeCatalogWithSearch = async (catalog, campus = getCurrentCampusKey()) => {
  const metadataById = await loadSearchMetadata(campus);
  const backendOverridesById = await loadBackendBuildingOverrides(campus);
  const manualBuildings = await loadManualBuildings(campus);
  const buildings = Array.isArray(catalog?.buildings) ? catalog.buildings : [];
  const mergedBuildings = buildings.map((building) => {
    const metadata = metadataById.get(building.id);

    const mergedWithSearch = !metadata
      ? building
      : {
          ...building,
          displayName: metadata.title || building.displayName,
          realName: metadata.title || building.realName,
          floors: metadata.floors?.length ? metadata.floors : building.floors,
          searchTitle: metadata.title || "",
          searchDescription: metadata.description || "",
          searchPopupContent: metadata.popupContent || "",
        };

    return applyBackendOverrideToBuilding(mergedWithSearch, backendOverridesById.get(building.id));
  }).filter(Boolean);

  const existingIds = new Set(mergedBuildings.map((building) => building.id));

  for (const metadata of metadataById.values()) {
    if (existingIds.has(metadata.id)) continue;

    const mergedMetadataBuilding = applyBackendOverrideToBuilding(
      {
        id: metadata.id,
        slug: metadata.id.toLowerCase().replaceAll("_", "-"),
        displayName: metadata.title || metadata.id,
        shortName: metadata.id,
        realName: metadata.title || "",
        type: "unknown",
        floors: metadata.floors || [DEFAULT_FLOOR],
        hasInteriorMap: false,
        hasInventory: false,
        responsibleArea: "",
        notes: "",
        sourceId: "",
        centroid: null,
        searchTitle: metadata.title || "",
        searchDescription: metadata.description || "",
        searchPopupContent: metadata.popupContent || "",
      },
      backendOverridesById.get(metadata.id)
    );

    if (mergedMetadataBuilding) {
      mergedBuildings.push(mergedMetadataBuilding);
    }
  }

  for (const manualBuilding of manualBuildings) {
    if (existingIds.has(manualBuilding.externalId)) continue;

    const floors = parseFloorsJson(manualBuilding.floorsJson);
    mergedBuildings.push({
      id: manualBuilding.externalId,
      slug: manualBuilding.externalId.toLowerCase().replaceAll("_", "-"),
      displayName: manualBuilding.displayName || manualBuilding.externalId,
      shortName: manualBuilding.externalId,
      realName: manualBuilding.displayName || "",
      type: manualBuilding.type || "manual",
      floors: floors.length ? floors : [DEFAULT_FLOOR],
      hasInteriorMap: false,
      hasInventory: false,
      responsibleArea: "",
      notes: manualBuilding.notes || "",
      sourceId: "manual",
      centroid:
        manualBuilding.centroidLongitude && manualBuilding.centroidLatitude
          ? [manualBuilding.centroidLongitude, manualBuilding.centroidLatitude]
          : null,
      searchTitle: manualBuilding.displayName || manualBuilding.externalId,
      searchDescription: [manualBuilding.displayName, manualBuilding.externalId, manualBuilding.notes]
        .filter(Boolean)
        .join(" "),
      searchPopupContent: manualBuilding.notes || "",
      campus: manualBuilding.campus || campus,
    });
  }

  return {
    ...catalog,
    buildings: mergedBuildings,
  };
};

export const mergeGeoJsonWithSearch = async (geoJson, campus = getCurrentCampusKey()) => {
  const metadataById = await loadSearchMetadata(campus);
  const backendOverridesById = await loadBackendBuildingOverrides(campus);
  const geometryOverridesById = await loadBuildingGeometryOverrides(campus);
  const features = Array.isArray(geoJson?.features) ? geoJson.features : [];

  return {
    ...geoJson,
    features: features.map((feature) => {
      const properties = feature?.properties || {};
      const metadata = metadataById.get(properties.id);
      const geometryOverride = geometryOverridesById.get(properties.id);

      const enrichedFeature = !metadata
        ? feature
        : {
            ...feature,
            properties: {
              ...properties,
              name: metadata.title || properties.name,
              title: metadata.title || properties.title,
              description: metadata.description || properties.description,
              popupContent: metadata.popupContent || properties.popupContent,
              searchText: metadata.searchText || properties.searchText,
            },
          };

      const overriddenFeature = geometryOverride
        ? {
            ...enrichedFeature,
            geometry: geometryOverride.geometry,
            properties: {
              ...(enrichedFeature.properties || {}),
              centroid:
                geometryOverride.centroidLongitude && geometryOverride.centroidLatitude
                  ? [geometryOverride.centroidLongitude, geometryOverride.centroidLatitude]
                  : enrichedFeature.properties?.centroid,
            },
          }
        : enrichedFeature;

      return applyBackendOverrideToFeature(overriddenFeature, backendOverridesById.get(properties.id));
    }),
  };
};

export const resetSearchMetadataCaches = () => {
  searchMetadataCache = new Map();
  backendBuildingOverridesCache = new Map();
  manualBuildingsCache = new Map();
  buildingGeometryOverridesCache = new Map();
  resetBuildingBackupCache();
};

