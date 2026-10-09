import { BACKEND_API_URL } from "../views/map.js";
import { identifiers } from "./identifiers.js";
import { getPrimaryCampusKey, toCampusFileSegment } from "./campusConfig.js";

const STORAGE_PREFIX = identifiers.storage.walkingRoutesBackup;
const STATIC_BACKUP_URL = "data/walking_routes_backup.json?v=20260608b";

const defaultCampus = () => getPrimaryCampusKey();

const normalizeCampus = (campus) => String(campus || defaultCampus()).trim() || defaultCampus();

const getStorageKey = (campus) => `${STORAGE_PREFIX}_${toCampusFileSegment(normalizeCampus(campus))}`;

const normalizeNetwork = (network) => ({
  nodes: Array.isArray(network?.nodes) ? network.nodes : [],
  edges: Array.isArray(network?.edges) ? network.edges : [],
  savedAt: network?.savedAt || new Date().toISOString(),
});

export const saveWalkingRouteBackup = (campus, network) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const payload = normalizeNetwork({
      ...network,
      savedAt: new Date().toISOString(),
    });
    window.localStorage?.setItem(getStorageKey(normalizedCampus), JSON.stringify(payload));
    console.info(`[walking-routes] respaldo local guardado (${normalizedCampus}).`);
    return payload;
  } catch (error) {
    console.error("[walking-routes] error al guardar rutas en respaldo local:", error);
    return null;
  }
};

export const loadWalkingRouteBackup = (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const raw = window.localStorage?.getItem(getStorageKey(normalizedCampus));
    if (!raw) return null;

    const parsed = normalizeNetwork(JSON.parse(raw));
    console.info(`[walking-routes] rutas cargadas desde respaldo local (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[walking-routes] error al cargar rutas desde respaldo local:", error);
    return null;
  }
};

export const loadWalkingRouteStaticBackup = async (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const response = await fetch(STATIC_BACKUP_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`respaldo estatico respondio ${response.status}`);
    }

    const parsed = normalizeNetwork(await response.json());
    console.info(`[walking-routes] rutas cargadas desde respaldo estatico (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[walking-routes] error al cargar rutas desde respaldo estatico:", error);
    return null;
  }
};

export const loadWalkingRouteNetwork = async (campus = defaultCampus()) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/walking-routes?campus=${encodeURIComponent(normalizedCampus)}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API respondio ${response.status}`);
    }

    const network = normalizeNetwork(await response.json());
    saveWalkingRouteBackup(normalizedCampus, network);
    console.info(`[walking-routes] rutas cargadas desde API (${normalizedCampus}).`);
    return {
      ...network,
      source: "api",
    };
  } catch (error) {
    console.error("[walking-routes] error al cargar rutas desde API:", error);
    const backup = loadWalkingRouteBackup(normalizedCampus);
    if (backup) {
      return {
        ...backup,
        source: "backup",
      };
    }

    const staticBackup = await loadWalkingRouteStaticBackup(normalizedCampus);
    if (staticBackup) {
      return {
        ...staticBackup,
        source: "static-backup",
      };
    }

    console.error("[walking-routes] error al cargar rutas: no hay API ni respaldo local disponible.");
    return {
      nodes: [],
      edges: [],
      source: "empty",
      savedAt: null,
    };
  }
};
