import { BACKEND_API_URL } from "../views/map.js";
import { identifiers } from "./identifiers.js";
import { getPrimaryCampusKey } from "./campusConfig.js";

const STORAGE_PREFIX = identifiers.storage.networkTelemetry;
const STATIC_BACKUP_URL = "data/network_telemetry_backup.json?v=20260615a";

let telemetryPromise = null;

const defaultCampus = () => getPrimaryCampusKey();

const normalizeCampus = (campus) => String(campus || defaultCampus()).trim() || defaultCampus();

const getStorageKey = (campus) => `${STORAGE_PREFIX}_${normalizeCampus(campus)}`;

const normalizeList = (items) => (Array.isArray(items) ? items : []);

const normalizeTelemetry = (telemetry) => ({
  campus: telemetry?.campus || defaultCampus(),
  enabled: Boolean(telemetry?.enabled ?? true),
  hasData: Boolean(telemetry?.hasData ?? false),
  isFresh: Boolean(telemetry?.isFresh ?? false),
  healthLabel: telemetry?.healthLabel || "Sin datos",
  healthTone: telemetry?.healthTone || "secondary",
  latestSourceName: telemetry?.latestSourceName || "",
  latestSourceType: telemetry?.latestSourceType || "",
  latestRiskLevel: telemetry?.latestRiskLevel || "",
  latestStatus: telemetry?.latestStatus || "",
  notes: telemetry?.notes || "",
  latestRiskScore: Number(telemetry?.latestRiskScore) || 0,
  totalSnapshots: Number(telemetry?.totalSnapshots) || 0,
  latestDeviceCount: Number(telemetry?.latestDeviceCount) || 0,
  latestConnectedUserCount: Number(telemetry?.latestConnectedUserCount) || 0,
  latestHighRiskDeviceCount: Number(telemetry?.latestHighRiskDeviceCount) || 0,
  latestMediumRiskDeviceCount: Number(telemetry?.latestMediumRiskDeviceCount) || 0,
  latestLowRiskDeviceCount: Number(telemetry?.latestLowRiskDeviceCount) || 0,
  latestObservedAtUtc: telemetry?.latestObservedAtUtc || null,
  latestWindowStartUtc: telemetry?.latestWindowStartUtc || null,
  latestWindowEndUtc: telemetry?.latestWindowEndUtc || null,
  recentSnapshots: normalizeList(telemetry?.recentSnapshots),
  topRiskObservations: normalizeList(telemetry?.topRiskObservations),
  buildingRiskSummaries: normalizeList(telemetry?.buildingRiskSummaries),
  savedAt: telemetry?.savedAt || null,
  source: telemetry?.source || "empty",
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

export const saveNetworkTelemetryBackup = (campus, telemetry) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const payload = normalizeTelemetry({
      ...telemetry,
      campus: normalizedCampus,
      savedAt: new Date().toISOString(),
      source: telemetry?.source || "backup",
    });

    window.localStorage?.setItem(getStorageKey(normalizedCampus), JSON.stringify(payload));
    console.info(`[network-telemetry] respaldo local guardado (${normalizedCampus}).`);
    return payload;
  } catch (error) {
    console.error("[network-telemetry] error al guardar respaldo local:", error);
    return null;
  }
};

export const loadNetworkTelemetryBackup = (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const raw = window.localStorage?.getItem(getStorageKey(normalizedCampus));
    if (!raw) return null;

    const parsed = normalizeTelemetry(JSON.parse(raw));
    console.info(`[network-telemetry] telemetria cargada desde respaldo local (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[network-telemetry] error al cargar respaldo local:", error);
    return null;
  }
};

export const loadNetworkTelemetryStaticBackup = async (campus) => {
  const normalizedCampus = normalizeCampus(campus);

  try {
    const response = await fetch(STATIC_BACKUP_URL, {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`respaldo estatico respondio ${response.status}`);
    }

    const parsed = normalizeTelemetry(await response.json());
    console.info(`[network-telemetry] telemetria cargada desde respaldo estatico (${normalizedCampus}).`);
    return parsed;
  } catch (error) {
    console.error("[network-telemetry] error al cargar respaldo estatico:", error);
    return null;
  }
};

const loadSession = async () => {
  try {
    return await fetchJson(`${BACKEND_API_URL}/api/auth/session`);
  } catch (error) {
    console.error("[network-telemetry] error consultando sesion:", error);
    return null;
  }
};

export const canAccessLiveTelemetry = (session) => {
  const role = String(session?.role || "").trim().toLowerCase();
  return Boolean(session?.isAuthenticated) && (session?.isAdmin || role === "auditor");
};

export const loadNetworkTelemetryStatus = async (campus = defaultCampus(), { forceRefresh = false } = {}) => {
  const normalizedCampus = normalizeCampus(campus);

  if (telemetryPromise && !forceRefresh) {
    return telemetryPromise;
  }

  telemetryPromise = (async () => {
    const session = await loadSession();

    if (canAccessLiveTelemetry(session)) {
      try {
        const response = await fetch(`${BACKEND_API_URL}/api/network-telemetry/status?take=10`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`API respondio ${response.status}`);
        }

        const telemetry = normalizeTelemetry(await response.json());
        saveNetworkTelemetryBackup(normalizedCampus, telemetry);
        console.info(`[network-telemetry] telemetria cargada desde API (${normalizedCampus}).`);
        return {
          ...telemetry,
          source: "api",
        };
      } catch (error) {
        console.error("[network-telemetry] error al cargar telemetria desde API:", error);
      }
    } else {
      console.info("[network-telemetry] sesion sin permiso para consulta en vivo; usando respaldo local.");
    }

    const localBackup = loadNetworkTelemetryBackup(normalizedCampus);
    if (localBackup) {
      return {
        ...localBackup,
        source: "backup",
      };
    }

    const staticBackup = await loadNetworkTelemetryStaticBackup(normalizedCampus);
    if (staticBackup) {
      return {
        ...staticBackup,
        source: "static-backup",
      };
    }

    console.error("[network-telemetry] no hay API ni respaldo local/estatico disponible.");
    return normalizeTelemetry({
      campus: normalizedCampus,
      source: "empty",
      recentSnapshots: [],
      topRiskObservations: [],
    });
  })();

  return telemetryPromise;
};

export const resetNetworkTelemetryCache = () => {
  telemetryPromise = null;
};
