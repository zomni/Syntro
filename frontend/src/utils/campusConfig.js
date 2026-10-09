// Configuración del campus (SPEC 03).
// La configuración canónica de los sitios/campus la provee siteConfig
// (sesión del backend con fallback a campuses.js); de aquí derivan los
// nombres de archivos de datos, el índice de búsqueda y el catálogo de edificios.

import { getSite, getPrimaryCampusKey, getCurrentCampusKey, getActiveCampusKey } from "../config/siteConfig.js";

export { getPrimaryCampusKey, getActiveCampusKey, getCurrentCampusKey };

const getSchool = (campusKey = getCurrentCampusKey()) => getSite(campusKey)?.school || "tmpl";

export const toCampusFileSegment = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized;
};

export const getDataFileNames = (campusKey = getCurrentCampusKey()) => {
  const school = getSchool(campusKey);
  const prefix = `${toCampusFileSegment(school)}_${toCampusFileSegment(campusKey)}`;
  return {
    search: `data/${prefix}_search.json`,
    floor: (floor) => `data/${prefix}_${floor}.json`,
  };
};

export const getCatalogFileName = (campusKey = getCurrentCampusKey()) =>
  `data/${toCampusFileSegment(campusKey)}_buildings_catalog.json`;

export const getBackupFileName = (campusKey = getCurrentCampusKey()) =>
  `data/${toCampusFileSegment(campusKey)}_buildings_backend_backup.json`;
