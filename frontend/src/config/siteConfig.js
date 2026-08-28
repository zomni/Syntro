// Configuración de sitios en runtime (multi-tenant, SPEC 03).
// Fuente de verdad de los sitios/campus: la sesión del backend
// (/api/auth/session) cuando el usuario está autenticado; fallback a
// campuses.js (plantilla estática) cuando no hay sesión o el backend
// no reporta sitios. Los módulos que leen la configuración de campus
// deben usar este módulo en lugar de importar campuses.js directamente.

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

const parseRemoteSite = (site) => {
  let floors = [];
  if (typeof site.floors === "string" && site.floors) {
    try {
      floors = JSON.parse(site.floors);
    } catch {
      floors = [];
    }
  } else if (Array.isArray(site.floors)) {
    floors = site.floors;
  }

  return {
    campusKey: site.campusKey,
    school: site.school || site.campusKey,
    fullName: site.name || site.campusKey,
    organizationId: site.organizationId || null,
    organizationName: site.organizationName || "",
    organizationColor: site.organizationColor || "",
    floors,
    defaultFloor: site.defaultFloor ?? (Array.isArray(floors) && floors.length ? floors[0] : "0"),
    center: Array.isArray(site.center) && site.center.length === 2 ? site.center : [0, 0],
    zoom: Number(site.zoom) || 16,
    minZoom: site.minZoom != null ? Number(site.minZoom) : 0,
    maxZoom: site.maxZoom != null ? Number(site.maxZoom) : 19,
    bounds: Array.isArray(site.bounds) && site.bounds.length === 2 ? site.bounds : [],
  };
};

let sites = normalizeStaticSites();
let sitesSource = "static";
let organizationName = "";
let organizationColor = "";
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
        const remoteSites = Array.isArray(session?.sites) ? session.sites : [];
        if (remoteSites.length === 0) {
          if (session?.isAuthenticated === false) {
            sites = {};
            organizationName = "";
            organizationColor = "";
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent(identifiers.events.sitesLoaded));
            }
          }
          sitesSource = "static";
          return;
        }

        const next = {};
        for (const site of remoteSites) {
          if (!site?.campusKey) {
            continue;
          }
          next[site.campusKey] = parseRemoteSite(site);
        }

        sites = next;
        sitesSource = "remote";
        organizationName = typeof session?.organizationName === "string" ? session.organizationName : "";
        organizationColor = typeof session?.organizationColor === "string" ? session.organizationColor : "";
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
export const getOrganizationName = () => organizationName;
export const getOrganizationColor = () => organizationColor;

export const getSiteOrganizationName = (campusKey) => {
  const site = sites[campusKey];
  return site?.organizationName || "";
};
export const getSiteOrganizationColor = (campusKey) => {
  const site = sites[campusKey];
  return site?.organizationColor || "";
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
  organizationName = "";
  organizationColor = "";
};

if (typeof window !== "undefined") {
  window.addEventListener(identifiers.events.sessionChanged, () => {
    resetSitesCache();
    loadSites();
  });
}
