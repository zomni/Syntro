const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "roomEditor.js"),
  "utf8"
);

describe("sugerencia de un solo sector", () => {
  test("acepta 1 como cantidad valida", () => {
    expect(source).toContain("Ingresa cuantos sectores quieres generar (1-12).");
    expect(source).toContain("count < 1 || count > 12");
    expect(source).toContain('El numero de sectores debe estar entre 1 y 12.');
  });

  test("pasa el minimo 1 al generador", () => {
    expect(source).toContain(
      "divideBuildingIntoSectors(buildingGeometry, count, { minCount: 1, maxCount: 12 })"
    );
  });
});
