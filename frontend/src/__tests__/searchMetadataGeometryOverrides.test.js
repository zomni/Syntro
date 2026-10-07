const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "utils", "searchMetadata.js"),
  "utf8"
);

describe("overrides de geometria por piso (searchMetadata)", () => {
  test("cachea los overrides con clave buildingId:piso", () => {
    // Regresion: con clave solo por ID, la forma guardada de un piso se
    // aplicaba a todos los pisos del edificio (silueta duplicada en planta).
    expect(source).toContain(
      "overrides.set(`${item.buildingExternalId}:${Number(item.floor) || 0}`, {"
    );
    expect(source).not.toContain("overrides.set(item.buildingExternalId, {");
  });

  test("pickGeometryOverride prioriza el piso propio y cae al floor 0", () => {
    expect(source).toContain("export const pickGeometryOverride = (overridesById, buildingId, floorNumber) => {");
    expect(source).toContain("overridesById.get(`${buildingId}:${floor}`) ??");
    expect(source).toContain("overridesById.get(`${buildingId}:0`) ??");
  });

  test("mergeGeoJsonWithSearch recibe el piso renderizado", () => {
    expect(source).toMatch(
      /export const mergeGeoJsonWithSearch = async \(\s*geoJson,\s*campus = getCurrentCampusKey\(\),\s*floorNumber = getSelectedMapFloor\(\) \?\? 0\s*\)/
    );
    expect(source).toContain(
      "pickGeometryOverride(geometryOverridesById, properties.id, floorNumber)"
    );
    expect(source).not.toContain("geometryOverridesById.get(properties.id)");
  });

  test("lee el piso seleccionado del mapa", () => {
    expect(source).toContain(
      'import { getSelectedMapFloor } from "./floorButtons.js";'
    );
  });
});
