import { BACKEND_API_URL } from "../views/map.js";
import { identifiers } from "./identifiers.js";
import { getCurrentCampusKey } from "./campusConfig.js";

const STORAGE_PREFIX = identifiers.storage.buildingBackup;
const STATIC_BACKUP_URL = "data/sotero_buildings_backend_backup.json?v=20260608b";

let buildingBackupPromise = null;

const defaultCampus = () => getCurrentCampusKey();

const normalizeCampus = (campus) => String(campus || defaultCampus()).trim() || defaultCampus();

const getStorageKey = (campus) => `${STORAGE_PREFIX}_${normalizeCampus(campus)}`;

const normalizeBackup = (backup) => ({
  campus: backup?.campus || defaultCampus(),
  syncedBuildings: Array.isArray(backup?.syncedBuildings) ? backup.syncedBuildings : [],
  manualBuildings: Array.isArray(backup?.manualBuildings) ? backup.manualBuildings : [],
  geometryOverrides: Array.isArray(backup?.geometryOverrides) ? backup.geometryOverrides : [],
  savedAt: backup?.savedAt || new Date().toISOString(),
});

const fetchJson = async (url) => {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`${url} respondio ${response.status}`);
  }

  return response.json();
};

export const saveBuildingBackup = (campus, backup) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const payload = normalizeBackup({
      ...backup,
      campus: normalizedCampus,
      savedAt: new Date().toISOString(),
    });
    window.localStorage?.setItem(getStorageKey(normalizedCampus), JSON.stringify(payload));
    console.info(`[building-backup] respaldo local guardado (${normalizedCampus}).`);
    return payload;
  } catch (error) {
    console.error("[building-backup] error al guardar respaldo local:", error);
    return null;
  }
};

export const loadBuildingBackup = (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const raw = window.localStorage?.getItem(getStorageKey(normalizedCampus));
    if (!raw) return null;

    const parsed = normalizeBackup(JSON.parse(raw));
    console.info(`[building-backup] edificios cargados desde respaldo local (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[building-backup] error al cargar respaldo local:", error);
    return null;
  }
};

export const loadBuildingStaticBackup = async (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const response = await fetch(STATIC_BACKUP_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`respaldo estatico respondio ${response.status}`);
    }

    const parsed = normalizeBackup(await response.json());
    console.info(`[building-backup] edificios cargados desde respaldo estatico (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[building-backup] error al cargar respaldo estatico:", error);
    return null;
  }
};

export const loadBuildingBackupBundle = async (campus = defaultCampus(), { forceRefresh = false } = {}) => {
  const normalizedCampus = normalizeCampus(campus);

  if (buildingBackupPromise && !forceRefresh) {
    return buildingBackupPromise;
  }

  buildingBackupPromise = (async () => {
    try {
      const [manualBuildings, syncedBuildings, geometryOverrides] = await Promise.all([
        fetchJson(`${BACKEND_API_URL}/api/manual-buildings`),
        fetchJson(`${BACKEND_API_URL}/api/synced-buildings`),
        fetchJson(`${BACKEND_API_URL}/api/building-geometry-overrides`),
      ]);

      const backup = normalizeBackup({
        campus: normalizedCampus,
        manualBuildings,
        syncedBuildings,
        geometryOverrides,
      });

      saveBuildingBackup(normalizedCampus, backup);
      console.info(`[building-backup] edificios cargados desde API (${normalizedCampus}).`);
      return {
        ...backup,
        source: "api",
      };
    } catch (error) {
      console.error("[building-backup] error al cargar edificios desde API:", error);

      const localBackup = loadBuildingBackup(normalizedCampus);
      if (localBackup) {
        return {
          ...localBackup,
          source: "backup",
        };
      }

      const staticBackup = await loadBuildingStaticBackup(normalizedCampus);
      if (staticBackup) {
        return {
          ...staticBackup,
          source: "static-backup",
        };
      }

      console.error("[building-backup] no hay API ni respaldo local/estatico disponible.");
      return {
        campus: normalizedCampus,
        syncedBuildings: [],
        manualBuildings: [],
        geometryOverrides: [],
        savedAt: null,
        source: "empty",
      };
    }
  })();

  return buildingBackupPromise;
};

export const resetBuildingBackupCache = () => {
  buildingBackupPromise = null;
};
