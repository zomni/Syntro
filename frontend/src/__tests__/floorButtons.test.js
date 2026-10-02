import { resolveFloorButtonId, queryFloorButtons } from "../utils/floorButtons.js";

describe("queryFloorButtons", () => {
  afterEach(() => {
    delete global.document;
  });

  test("busca en ambos contenedores y excluye bLoc", () => {
    // Regresión: en modo normal los botones se mueven a #map-floor-filter-buttons.
    // Si el lector consulta un solo host, la lista queda vacía y waitForFloorButtons
    // reintenta 10-12 s antes de rendirse (buscador y rutas entre edificios).
    const selectors = [];
    global.document = {
      querySelectorAll: (selector) => {
        selectors.push(selector);
        return [{ id: "b0" }, { id: "bLoc" }, { id: "b1" }, { id: "b2" }];
      },
    };

    expect(queryFloorButtons().map((button) => button.id)).toEqual(["b0", "b1", "b2"]);
    expect(selectors[0]).toContain("#floorButtons-container");
    expect(selectors[0]).toContain("#map-floor-filter-buttons");
  });
});

describe("resolveFloorButtonId", () => {
  test("maps a remote floor value to its button id", () => {
    expect(resolveFloorButtonId("0", ["0", "1"])).toBe("b0");
    expect(resolveFloorButtonId("1", ["0", "1"])).toBe("b1");
  });

  test("keeps a template-style button id untouched", () => {
    expect(resolveFloorButtonId("b1", ["0", "1"])).toBe("b1");
  });

  test("falls back to the base floor when the floor is not listed", () => {
    // RemoveFloorZero: el fallback es la planta base (piso 1), no el piso 0.
    expect(resolveFloorButtonId("7", ["-1", "1", "2"])).toBe("b1");
  });

  test("falls back to the base floor when there is no default floor", () => {
    expect(resolveFloorButtonId("", ["-1", "1", "2"])).toBe("b1");
    expect(resolveFloorButtonId(undefined, ["-1", "1", "2"])).toBe("b1");
  });

  test("falls back to b0 when there are no floors", () => {
    expect(resolveFloorButtonId("0", [])).toBe("b0");
  });
});
