import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeAllowedBuildingIdsForFloor, BASE_FLOOR_NUMBER } from "../utils/buildingCatalog.js";

const readData = (name) =>
  JSON.parse(readFileSync(resolve(__dirname, "..", "data", name), "utf8"));

const readCatalog = () => readData("sotero_buildings_catalog.json");

// frontend/src/data/*.json esta en .gitignore a proposito: el contenido de datos
// no se versiona. En un clon limpio estos archivos no existen, asi que los tests
// no tienen contra que fallar. Donde si existen, esta es la red que detecta una
// planta base a medio populatear antes de que llegue al navegador.
const baseFloorFile = resolve(__dirname, "..", "data", "cs_sotero_1.json");
const retiredFloorFile = resolve(__dirname, "..", "data", "cs_sotero_0.json");
const hasBaseFloorData = existsSync(baseFloorFile);

const describeWithData = hasBaseFloorData ? describe : describe.skip;

if (!hasBaseFloorData) {
  // eslint-disable-next-line no-console
  console.warn(
    "[baseFloorFootprints] omitido: no existe data/cs_sotero_1.json en este clon."
  );
}

describeWithData("huellas de la planta base", () => {
  // Regresión: RemoveFloorZero fusionó la planta 0 en la 1, pero
  // cs_sotero_0.json siguió siendo el archivo con las 99 huellas y cs_sotero_1.json
  // solo traia 3. El commit 99f86b1 dejo de leer el piso 0 como fuente de huellas,
  // asi que 96 edificios permitidos quedaron sin poligono: no se dibujaban ni eran
  // clickeables (Block Central entre ellos).
  test("el piso base tiene al menos tantas huellas como edificios permite el catalogo", () => {
    const catalog = readCatalog();
    const allowed = computeAllowedBuildingIdsForFloor(catalog.buildings, BASE_FLOOR_NUMBER);
    const baseFloor = readData("cs_sotero_1.json");

    expect(allowed).not.toBeNull();
    expect(baseFloor.features.length).toBeGreaterThanOrEqual(allowed.size);
  });

  test("el archivo del piso base ya no existe", () => {
    expect(existsSync(retiredFloorFile)).toBe(false);
  });

  test("ninguna huella del piso base conserva floor 0", () => {
    const baseFloor = readData("cs_sotero_1.json");

    for (const feature of baseFloor.features) {
      expect(feature.properties.floor).not.toBe(0);
    }
  });

  test("todos los edificios permitidos en la planta base tienen poligono", () => {
    const catalog = readCatalog();
    const allowed = computeAllowedBuildingIdsForFloor(catalog.buildings, BASE_FLOOR_NUMBER);
    const baseFloor = readData("cs_sotero_1.json");
    const withGeometry = new Set(
      baseFloor.features.filter((f) => f.geometry?.type && f.geometry?.coordinates).map((f) => f.properties.id)
    );

    const missing = [...allowed].filter((id) => !withGeometry.has(id));
    expect(missing).toEqual([]);
  });

  test("los ids del piso base son unicos", () => {
    const baseFloor = readData("cs_sotero_1.json");
    const ids = baseFloor.features.map((f) => f.properties.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("las huellas migradas conservan footprintFloor 0 como trazabilidad", () => {
    const baseFloor = readData("cs_sotero_1.json");

    expect(baseFloor.features.some((f) => f.properties.footprintFloor === 0)).toBe(true);
  });

  // Regresion: Movilizacion (SR-BLD-088) tiene pisos 1 y 2 pero la huella solo
  // existia en cs_sotero_2.json y el catalogo declaraba floors [2]. En el campus
  // el piso 1 la omitia porque la fuente de fallback del piso base es el propio
  // cs_sotero_1.json: sin feature ahi, no hay nada que clonar.
  test("Movilizacion declara pisos 1 y 2 y tiene huella en la planta base", () => {
    const catalog = readCatalog();
    const building = catalog.buildings.find((b) => b.id === "SR-BLD-088");

    expect(building).toBeDefined();
    expect(building.floors).toEqual(expect.arrayContaining([1, 2]));

    const baseFloor = readData("cs_sotero_1.json");
    const feature = baseFloor.features.find((f) => f.properties.id === "SR-BLD-088");

    expect(feature).toBeDefined();
    expect(feature.properties.floor).toBe(1);
    expect(feature.geometry?.type).toBe("Polygon");
    expect(feature.geometry?.coordinates?.length).toBeGreaterThan(0);
  });
});