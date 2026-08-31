const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_catalog.json");
const interiorsBasePath = path.join(__dirname, "..", "src", "data", "interiors");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createEmptyRoomsFile(filePath, building) {
  if (fs.existsSync(filePath)) {
    return;
  }

  const content = {
    buildingId: building.id,
    buildingName: building.realName || building.displayName || building.id,
    floor: Number(path.basename(filePath).match(/floor_(\-?\d+)_rooms\.json/)?.[1] ?? 0),
    rooms: []
  };

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
}

function main() {
  const raw = fs.readFileSync(catalogPath, "utf-8");
  const catalog = JSON.parse(raw);

  ensureDir(interiorsBasePath);

  let totalFilesCreated = 0;

  for (const building of catalog.buildings || []) {
    if (!Array.isArray(building.floors) || building.floors.length === 0) {
      continue;
    }

    const buildingDir = path.join(interiorsBasePath, building.id);
    ensureDir(buildingDir);

    for (const floor of building.floors) {
      const filePath = path.join(buildingDir, `floor_${floor}_rooms.json`);
      const existedBefore = fs.existsSync(filePath);

      createEmptyRoomsFile(filePath, building);

      if (!existedBefore) {
        totalFilesCreated += 1;
      }
    }
  }

  console.log(`Estructura de interiores generada en: ${interiorsBasePath}`);
  console.log(`Archivos nuevos creados: ${totalFilesCreated}`);
}

main();