const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_catalog.json");

function normalizeSourceId(value) {
  if (value === null || value === undefined || value === "") return "";
  return String(value).padStart(3, "0");
}

function normalizeBuilding(building) {
  const normalizedId = building.id || "";
  const normalizedSourceId = normalizeSourceId(building.sourceId);

  return {
    id: normalizedId,
    slug: building.slug || "",
    displayName: building.displayName || building.name || "",
    shortName: building.shortName || (normalizedId ? normalizedId.replace("SR-", "") : ""),
    realName: building.realName || "",
    type: building.type || "unknown",
    floors: Array.isArray(building.floors) ? building.floors : [],
    hasInteriorMap: Boolean(building.hasInteriorMap),
    hasInventory: Boolean(building.hasInventory),
    responsibleArea: building.responsibleArea || "",
    notes: building.notes || "",
    sourceId: normalizedSourceId,
    centroid: building.centroid || null
  };
}

function main() {
  const raw = fs.readFileSync(catalogPath, "utf-8");
  const data = JSON.parse(raw);

  const buildings = (data.buildings || []).map(normalizeBuilding);

  const normalized = { buildings };

  fs.writeFileSync(catalogPath, JSON.stringify(normalized, null, 2), "utf-8");

  console.log(`Catálogo normalizado: ${catalogPath}`);
  console.log(`Total de edificios: ${buildings.length}`);
}

main();