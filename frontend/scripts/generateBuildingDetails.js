const fs = require("fs");
const path = require("path");

const catalogPath = path.join(__dirname, "..", "src", "data", "syntro_buildings_catalog.json");
const interiorsBasePath = path.join(__dirname, "..", "src", "data", "interiors");

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error leyendo JSON: ${filePath}`, error);
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function countDevicesByFloor(devices, rooms) {
  const roomFloorMap = new Map();

  for (const room of rooms) {
    roomFloorMap.set(room.roomId, room.floor);
  }

  const counts = {};

  for (const device of devices) {
    const floor = roomFloorMap.get(device.roomId);
    if (floor === undefined || floor === null) continue;

    if (!counts[floor]) {
      counts[floor] = 0;
    }

    counts[floor] += 1;
  }

  return counts;
}

function buildFloorSummaries(building, allRooms, devices) {
  const devicesByFloor = countDevicesByFloor(devices, allRooms);

  return (building.floors || []).map((floor) => {
    const floorRooms = allRooms.filter((room) => room.floor === floor);
    const mappedRoomsCount = floorRooms.filter((room) => room.isMapped === true).length;
    const devicesCount = devicesByFloor[floor] || 0;

    return {
      floor,
      roomsCount: floorRooms.length,
      mappedRoomsCount,
      devicesCount,
      notes: ""
    };
  });
}

function createOrUpdateBuildingDetail(building) {
  const buildingDir = path.join(interiorsBasePath, building.id);
  ensureDir(buildingDir);

  const detailPath = path.join(buildingDir, "building_detail.json");
  const devicesPath = path.join(buildingDir, "devices.json");

  const existingDetail = readJsonSafe(detailPath, null);
  const devicesData = readJsonSafe(devicesPath, { devices: [] });
  const devices = Array.isArray(devicesData.devices) ? devicesData.devices : [];

  let allRooms = [];

  for (const floor of building.floors || []) {
    const roomsPath = path.join(buildingDir, `floor_${floor}_rooms.json`);
    const roomsData = readJsonSafe(roomsPath, { rooms: [] });
    const rooms = Array.isArray(roomsData.rooms) ? roomsData.rooms : [];
    allRooms = allRooms.concat(rooms);
  }

  const floorSummaries = buildFloorSummaries(building, allRooms, devices);

  const detail = {
    buildingId: building.id,
    buildingName: building.realName || building.displayName || building.id,
    shortName: building.shortName || "",
    realName: building.realName || "",
    type: building.type || "unknown",
    responsibleArea: building.responsibleArea || "",
    floors: Array.isArray(building.floors) ? building.floors : [],
    hasInteriorMap: Boolean(building.hasInteriorMap),
    hasInventory: Boolean(building.hasInventory),
    inventoryStatus: existingDetail?.inventoryStatus || "pendiente",
    mappingStatus: existingDetail?.mappingStatus || "pendiente",
    floorSummaries,
    operationalNotes: existingDetail?.operationalNotes || "",
    technicalNotes: existingDetail?.technicalNotes || "",
    lastUpdate: existingDetail?.lastUpdate || "",
    contacts: Array.isArray(existingDetail?.contacts) ? existingDetail.contacts : [],
    tags: Array.isArray(existingDetail?.tags) ? existingDetail.tags : []
  };

  writeJson(detailPath, detail);
}

function main() {
  const catalog = readJsonSafe(catalogPath, { buildings: [] });
  const buildings = Array.isArray(catalog.buildings) ? catalog.buildings : [];

  let processed = 0;

  for (const building of buildings) {
    if (!Array.isArray(building.floors) || building.floors.length === 0) {
      continue;
    }

    createOrUpdateBuildingDetail(building);
    processed += 1;
  }

  console.log(`building_detail.json generados/actualizados: ${processed}`);
}

main();