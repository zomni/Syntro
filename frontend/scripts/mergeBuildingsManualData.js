const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_catalog.json");
const manualDataPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_manual_data.json");

function main() {
  const catalogRaw = fs.readFileSync(catalogPath, "utf-8");
  const manualRaw = fs.readFileSync(manualDataPath, "utf-8");

  const catalog = JSON.parse(catalogRaw);
  const manualData = JSON.parse(manualRaw);

  const manualMap = new Map(
    (manualData.buildings || []).map((item) => [item.id, item])
  );

  let matchedCount = 0;

  const mergedBuildings = (catalog.buildings || []).map((building) => {
    const manual = manualMap.get(building.id);

    if (!manual) {
      return building;
    }

    matchedCount += 1;

    return {
      ...building,
      realName: manual.realName ?? building.realName,
      type: manual.type ?? building.type,
      floors: Array.isArray(manual.floors) ? manual.floors : building.floors,
      hasInteriorMap: manual.hasInteriorMap ?? building.hasInteriorMap,
      hasInventory: manual.hasInventory ?? building.hasInventory,
      responsibleArea: manual.responsibleArea ?? building.responsibleArea,
      notes: manual.notes ?? building.notes
    };
  });

  const merged = { buildings: mergedBuildings };

  fs.writeFileSync(catalogPath, JSON.stringify(merged, null, 2), "utf-8");

  console.log(`Catálogo actualizado: ${catalogPath}`);
  console.log(`Edificios con datos manuales aplicados: ${matchedCount}`);
}

main();