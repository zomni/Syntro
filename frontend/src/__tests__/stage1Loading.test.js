import fs from "fs";
import path from "path";

const addDataSource = fs.readFileSync(
  path.join(__dirname, "..", "utils", "addData.js"),
  "utf8"
);
const mapSource = fs.readFileSync(path.join(__dirname, "..", "views", "map.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("carga progresiva de la etapa 1", () => {
  test("oculta el overlay después de pintar edificios, antes de capas auxiliares", () => {
    const buildings = addDataSource.indexOf("featuresLayerGroup(");
    const overlay = addDataSource.indexOf("hideMapLoading();", buildings);
    const rooms = addDataSource.indexOf("loadManualFeaturesForFloor", overlay);
    const markers = addDataSource.indexOf("addMapMarkersForFloor", rooms);

    expect(buildings).toBeGreaterThan(-1);
    expect(overlay).toBeGreaterThan(buildings);
    expect(rooms).toBeGreaterThan(overlay);
    expect(markers).toBeGreaterThan(rooms);
    expect(addDataSource).toContain("map-auxiliary-loading");
  });

  test("mantiene el orden seguro manuales, salas y marcadores", () => {
    const manual = addDataSource.indexOf("loadManualFeaturesForFloor(floorNumber)");
    const rooms = addDataSource.indexOf("addManualRoomPolygonsForFloor(floorNumber", manual);
    const markers = addDataSource.indexOf("addMapMarkersForFloor(floorNumber", rooms);

    expect(manual).toBeGreaterThan(-1);
    expect(rooms).toBeGreaterThan(manual);
    expect(markers).toBeGreaterThan(rooms);
  });

  test("las capas auxiliares entran con indicador discreto y transicion", () => {
    expect(cssSource).toContain(".map-auxiliary-loading::after");
    expect(cssSource).toContain(".map-auxiliary-layer");
    expect(cssSource).toContain(".manual-room-polygon");
  });

  test("la vista inicia con satelite salvo preferencia guardada de calles", () => {
    expect(mapSource).toContain('getItem("syntro-map-layer") !== "streets"');
    expect(mapSource).toContain("getSatellitePreference() ? satelliteLayer : osmLayer");
  });
});
