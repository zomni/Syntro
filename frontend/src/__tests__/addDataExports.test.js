import fs from "fs";
import path from "path";

const addDataPath = path.join(__dirname, "..", "utils", "addData.js");

const source = fs.readFileSync(addDataPath, "utf8");

describe("addData.js", () => {
  test("declara los exports que importan otros modulos", () => {
    // Regresion del merge 94da17f: addData.js quedo vacio (723 lineas -> 1) y
    // webpack solo emitio warning por los exports faltantes, asi que goToCampus,
    // featureDisplay, manualBuildingEditor y buildingGeometryEditor se quedaron
    // importando undefined sin que ningun test lo notara. Es un guard de fuente
    // porque el modulo arrastra draw.js/map.js/featureDisplay y no se puede
    // importar en un test sin DOM.
    const required = [
      "addDataToMap",
      "clearAllMapData",
      "resetBuildingsCatalogCache",
      "CAMPUS_MARKER_BUILDING_ID",
      "buildStaticMarkerIcon",
      "renderMapMarkerLayer",
      "isPointOverBuilding",
    ];

    for (const name of required) {
      expect(source).toMatch(new RegExp(`export\\s+(function|const|let|class)\\s+${name}\\b`));
    }
  });

  test("no queda vacio ni truncado", () => {
    expect(source.trim().length).toBeGreaterThan(1000);
    expect(source.split("\n").length).toBeGreaterThan(600);
  });

  test("filtra las salas manuales por piso, no solo por edificio", () => {
    // El filtro por piso se perdio al resolver el merge: el loop filtraba por
    // allowedBuildingIds y pintaba todas las salas del edificio en cada piso.
    expect(source).toMatch(/shouldRenderRoomForFloor\(room,\s*floorNumber,\s*allowedBuildingIds\)/);
    expect(source).not.toMatch(/if\s*\(!allowedBuildingIds\.has\(room\.buildingExternalId\)\)\s*continue;/);
  });

  test("iconos de servicios viven en iconsPane por encima de los sectores", () => {
    // Los iconos estaban en roomsPane (450) junto con los sectores manuales:
    // el orden dependia del z interno del marcador y los sectores los tapaban.
    // El pane con z-index 455 lo decide a nivel de capa: 450 < 455 < 600.
    expect(source).toMatch(/map\.createPane\("iconsPane"\)/);
    expect(source).toMatch(/iconsPane\.style\.zIndex\s*=\s*455/);
    expect(source).toMatch(/roomsPane\.style\.zIndex\s*=\s*450/);
    expect(source).toMatch(
      /pane:\s*"iconsPane",\s*interactive:\s*false,\s*keyboard:\s*false,\s*zIndexOffset:\s*400/
    );
    expect(455).toBeGreaterThan(450);
    expect(455).toBeLessThan(600);
  });
});