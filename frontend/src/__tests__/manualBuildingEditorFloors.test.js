// Regresion del campo Pisos del alta de edificio.
//
// Era un input de texto libre con value="0, 1" hardcodeado, asi que todo
// edificio nuevo nace con el piso 0, que RemoveFloorZero ya consolido en el 1.
// Ahora es un selector con los pisos validos y el 1 marcado por defecto.

const fs = require("fs");
const path = require("path");

const { appConfig } = require("../config/appConfig.js");

const editorSource = fs.readFileSync(
  path.join(__dirname, "..", "components", "manualBuildingEditor.js"),
  "utf8"
);

describe("pisos del alta de edificio", () => {
  it("ofrece los pisos validos y deja el 1 por defecto", () => {
    expect(appConfig.floors.selectable).toEqual([-1, 1, 2, 3, 4, 5]);
    expect(appConfig.floors.defaultForNewBuilding).toBe(1);
  });

  it("no vuelve el piso 0 ni el texto libre con 0, 1", () => {
    expect(appConfig.floors.selectable).not.toContain(0);
    expect(editorSource).not.toMatch(/value="0,\s*1"/);
    expect(editorSource).not.toMatch(/\|\|\s*"0,\s*1"/);
  });

  it("arma el selector desde la configuracion, no desde una lista propia", () => {
    expect(editorSource).toMatch(/appConfig\.floors\.selectable/);
    expect(editorSource).toMatch(/appConfig\.floors\.defaultForNewBuilding/);
    expect(editorSource).toMatch(/manualBuildingFloor/);
  });

  it("exige al menos un piso antes de guardar", () => {
    expect(editorSource).toMatch(/collectSelectedFloors/);
    expect(editorSource).toMatch(/Elige al menos un piso/);
  });

  it("sigue enviando floorsCsv, que es lo que lee el backend", () => {
    expect(editorSource).toMatch(/floorsCsv/);
    expect(editorSource).toMatch(/collectSelectedFloors\(form\)\.join\(", "\)/);
  });
});