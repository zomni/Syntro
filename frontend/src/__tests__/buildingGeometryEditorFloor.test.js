const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "buildingGeometryEditor.js"),
  "utf8"
);

describe("editor de forma de edificio por piso", () => {
  test("guarda la forma con el piso seleccionado", () => {
    // El editor no enviaba floor, asi que todo se guardaba como floor 0 y
    // pisos con forma propia heredaban la del piso 0.
    expect(source).toContain("const undoFloor = getSelectedMapFloor() ?? 0;");
    expect(source).toMatch(/floor:\s*undoFloor,/);
    expect(source).toContain('import { getSelectedMapFloor } from "../utils/floorButtons.js";');
  });

  test("el estado posterior al guardado menciona el piso", () => {
    expect(source).toContain('`Forma guardada solo para el piso ${undoFloor}.`');
    expect(source).toContain('"Forma guardada para todos los pisos."');
  });

  test("ofrece restaurar la forma original via DELETE por piso", () => {
    expect(source).toContain("const restoreOriginalShape = async () => {");
    expect(source).toContain(
      "`${BACKEND_API_URL}/api/building-geometry-overrides/${encodeURIComponent(restoreBuildingId)}?floor=${floor}`"
    );
    expect(source).toContain("method: \"DELETE\"");
    expect(source).toContain("data?.removedShared");
    expect(source).toContain("data-geometry-restore");
    expect(source).toContain("restoreOriginalShape();");
  });

  test("la restauracion se puede deshacer con registerBuildingUndo", () => {
    expect(source).toMatch(/label:\s*"restaurar forma del edificio",/);
    expect(source).toContain("coordinates: undoCoordinates,");
    expect(source).toContain("floor,");
  });
});
