const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_catalog.json");
const interiorsBasePath = path.join(__dirname, "..", "src", "data", "interiors");

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function createDevicesFile(filePath, building) {
  if (fs.existsSync(filePath)) {
    return false;
  }

  const content = {
    buildingId: building.id,
    buildingName: building.realName || building.displayName || building.id,
    devices: []
  };

  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
  return true;
}

function main() {
  const raw = fs.readFileSync(catalogPath, "utf-8");
  const catalog = JSON.parse(raw);

  ensureDir(interiorsBasePath);

  let created = 0;

  for (const building of catalog.buildings || []) {
    if (!Array.isArray(building.floors) || building.floors.length === 0) {
      continue;
    }

    const buildingDir = path.join(interiorsBasePath, building.id);
    ensureDir(buildingDir);

    const devicesPath = path.join(buildingDir, "devices.json");

    if (createDevicesFile(devicesPath, building)) {
      created += 1;
    }
  }

  console.log(`Archivos devices.json creados: ${created}`);
}

main();