// Configuración de sitios en runtime (single-campus "sotero").
// Fuente de verdad del campus: la plantilla estática campuses.js, que
// define el único campus "sotero". La sesión del backend (/api/auth/session)
// solo determina el modo (autenticado vs. mapa libre); no aporta sitios
// adicionales. Los módulos que leen la configuración de campus deben usar
// este módulo en lugar de importar campuses.js directamente.

import campuses from "../data/campuses.js";
import { appConfig } from "./appConfig.js";
import { identifiers } from "../utils/identifiers.js";

const parseStaticSite = (campusKey, config) => ({
  campusKey,
  school: config.school || campusKey,
  fullName: config.fullName || config.name || campusKey,
  floors: Array.isArray(config.floors) ? config.floors : [],
  defaultFloor: config.defaultFloor ?? "0",
  center: Array.isArray(config.center) ? config.center : [0, 0],
  zoom: Number(config.zoom) || 16,
  minZoom: config.minZoom != null ? Number(config.minZoom) : 0,
  maxZoom: config.maxZoom != null ? Number(config.maxZoom) : 19,
  bounds: Array.isArray(config.bounds) ? config.bounds : [],
});

const normalizeStaticSites = () => {
  const sites = {};
  for (const [campusKey, config] of Object.entries(campuses)) {
    sites[campusKey] = parseStaticSite(campusKey, config);
  }
  return sites;
};

let sites = normalizeStaticSites();
let sitesSource = "static";
let sitesLoadedPromise = null;
let isBackendAuthenticated = null;

export const loadSites = () => {
  if (!sitesLoadedPromise) {
    sitesLoadedPromise = (async () => {
      try {
        const response = await fetch(`${appConfig.apiBaseUrl}/api/auth/session`, {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const session = await response.json();
        isBackendAuthenticated = session?.isAuthenticated === true;
        sites = normalizeStaticSites();
        sitesSource = "static";
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent(identifiers.events.sitesLoaded));
        }
      } catch {
        // Mantener el fallback estático de campuses.js.
      }
    })();
  }

  return sitesLoadedPromise;
};

export const getSites = () => sites;
export const getSite = (campusKey) => sites[campusKey];
export const hasCampus = (campusKey) => campusKey in sites;
export const isAuthenticated = () => isBackendAuthenticated === true;
export const getPrimaryCampusKey = () => {
  if (isBackendAuthenticated !== true) {
    return "";
  }
  return Object.keys(sites)[0] || "";
};
export const getSitesSource = () => sitesSource;

let activeCampus = "";

export const setActiveCampus = (campus) => {
  activeCampus = typeof campus === "string" ? campus : "";
};

export const getActiveCampusKey = () => activeCampus;

export const getCurrentCampusKey = () => {
  if (isBackendAuthenticated !== true) {
    return "";
  }
  return getActiveCampusKey() || getPrimaryCampusKey() || "";
};

export const updateSiteViewport = (campusKey, viewport) => {
  const site = sites[campusKey];
  if (!site || viewport == null) {
    return false;
  }

  const minZoom = Number(viewport.minZoom);
  const maxZoom = Number(viewport.maxZoom);
  if (!Number.isInteger(minZoom) || !Number.isInteger(maxZoom)) {
    return false;
  }

  site.minZoom = minZoom;
  site.maxZoom = maxZoom;
  return true;
};

export const resetSitesCache = (keepStatic = true) => {
  sitesLoadedPromise = null;
  isBackendAuthenticated = null;
  sites = keepStatic ? normalizeStaticSites() : {};
  sitesSource = "static";
};

if (typeof window !== "undefined") {
  window.addEventListener(identifiers.events.sessionChanged, () => {
    resetSitesCache();
    loadSites();
  });
}
