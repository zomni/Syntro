import {
  computeDropDownPosition,
  resolveEquipmentType,
  resolveResultIcon,
  resolveResultKind,
} from "../utils/searchDropDown.js";

// Los tres tipos salen del description del índice de búsqueda, que ya usa ese formato:
// "Edificio · BLD-001 · piso(s): 1", "Sala · Hospitalización · piso 1",
// "Equipo · pc · Sala 101 · piso 1".
describe("resolveResultKind", () => {
  test("reconoce los tres tipos del índice estático", () => {
    expect(resolveResultKind({ description: "Edificio · BLD-001 · piso(s): 1" })).toBe("building");
    expect(resolveResultKind({ description: "Sala · Hospitalización · piso 1" })).toBe("sector");
    expect(resolveResultKind({ description: "Equipo · pc · Sala 101 · piso 1" })).toBe("equipment");
  });

  test("el resultKind explícito manda sobre el description", () => {
    // Los equipos de inventario no traen properties.description con prefijo.
    expect(resolveResultKind({ resultKind: "equipment", description: "Informatica CASR" })).toBe(
      "equipment"
    );
  });

  test("no se rompe con propiedades vacías o ausentes", () => {
    expect(resolveResultKind(undefined)).toBe("");
    expect(resolveResultKind({})).toBe("");
    expect(resolveResultKind({ properties: undefined })).toBe("");
  });

  test("devuelve vacío cuando no puede clasificar", () => {
    expect(resolveResultKind({ description: "algo sin prefijo" })).toBe("");
  });
});

describe("resolveEquipmentType", () => {
  test("lee el tipo desde el description del índice estático", () => {
    expect(resolveEquipmentType({ description: "Equipo · printer · Sala 101 · piso 1" })).toBe(
      "printer"
    );
  });

  test("usa el equipmentType explícito del endpoint de inventario", () => {
    expect(resolveEquipmentType({ equipmentType: "pc" })).toBe("pc");
  });

  test("es case-insensitive", () => {
    expect(resolveEquipmentType({ description: "Equipo · PC · Sala 101 · piso 1" })).toBe("pc");
  });

  test("devuelve vacío si no hay tipo", () => {
    expect(resolveEquipmentType(undefined)).toBe("");
    expect(resolveEquipmentType({ description: "Equipo" })).toBe("");
  });
});

describe("resolveResultIcon", () => {
  // Regresión: ni cs_sotero_search.json ni el catálogo traen properties.image, así que
  // createDropDown pedía assets/icons_os/undefined y el fallback SPA del servidor
  // respondía 200 text/html con index.html. El <img> quedaba roto en todos los
  // resultados, no solo en los de equipos.
  test("distingue edificio, sector y equipo", () => {
    expect(resolveResultIcon({ description: "Edificio · BLD-001 · piso(s): 1" })).toBe("building.svg");
    expect(resolveResultIcon({ description: "Sala · Hospitalización · piso 1" })).toBe("room.svg");
  });

  test("distingue los tipos de equipo", () => {
    expect(resolveResultIcon({ description: "Equipo · pc · Sala 101 · piso 1" })).toBe(
      "computer_room.svg"
    );
    expect(resolveResultIcon({ description: "Equipo · printer · Sala 101 · piso 1" })).toBe(
      "printer.svg"
    );
  });

  test("el equipo de inventario se tipea por InferredCategory", () => {
    expect(resolveResultIcon({ resultKind: "equipment", equipmentType: "pc" })).toBe(
      "computer_room.svg"
    );
    expect(resolveResultIcon({ resultKind: "equipment", equipmentType: "printer" })).toBe(
      "printer.svg"
    );
  });

  // El campus solo tiene pc e impresora, así que cualquier categoría desconocida cae al
  // glifo genérico en vez de inventar un icono nuevo por cada una.
  test("una categoría desconocida cae al ícono genérico de equipo", () => {
    expect(resolveResultIcon({ resultKind: "equipment", equipmentType: "other" })).toBe("device.svg");
    expect(resolveResultIcon({ resultKind: "equipment", equipmentType: "" })).toBe("device.svg");
  });

  // El índice todavía trae un par de entradas etiquetadas como phone, pero en este
  // campus no existen teléfonos: tienen que verse como equipo genérico, no como icono
  // de teléfono ni reventar.
  test("un tipo que no corresponde a este campus no rompe el ícono", () => {
    expect(resolveResultIcon({ description: "Equipo · phone · Sala 101 · piso 1" })).toBe(
      "device.svg"
    );
  });

  test("cae al ícono por defecto cuando no puede clasificar", () => {
    expect(resolveResultIcon(undefined)).toBe("building.svg");
    expect(resolveResultIcon(null)).toBe("building.svg");
    expect(resolveResultIcon({})).toBe("building.svg");
  });

  test("respeta un ícono propio si el room editor lo define", () => {
    expect(resolveResultIcon({ image: "cafeteria.svg" })).toBe("cafeteria.svg");
    expect(resolveResultIcon({ image: "hospital" })).toBe("hospital.svg");
  });

  test("trata los strings 'undefined' y 'null' como ícono ausente", () => {
    expect(resolveResultIcon({ image: "undefined" })).toBe("building.svg");
    expect(resolveResultIcon({ image: "null" })).toBe("building.svg");
    expect(resolveResultIcon({ image: "" })).toBe("building.svg");
  });

  test("nunca devuelve undefined", () => {
    const cases = [
      undefined,
      null,
      {},
      { description: "" },
      { resultKind: "equipment", equipmentType: "other" },
      { image: "undefined" },
      { description: "Edificio · CDT · piso(s): 1" },
    ];

    for (const value of cases) {
      expect(resolveResultIcon(value)).toBeTruthy();
    }
  });
});

describe("computeDropDownPosition", () => {
  const inputRect = {
    left: 24,
    top: 12,
    bottom: 56,
    right: 414,
    width: 390,
    height: 44,
  };

  // El dropdown se monta en body porque #searchContainer.autocomplete-searchContainer
  // tiene overflow:hidden con height 44px: colgado dentro, los 38px del resultado
  // quedaban recortados y el usuario no veía nada.
  test("usa position fixed para salir del overflow del contenedor", () => {
    expect(computeDropDownPosition(inputRect).position).toBe("fixed");
  });

  test("alinea left y width con el input", () => {
    const position = computeDropDownPosition(inputRect);

    expect(position.left).toBe("24px");
    expect(position.width).toBe("390px");
  });

  test("se ubica debajo del input con un pequeño margen", () => {
    expect(computeDropDownPosition(inputRect).top).toBe("60px");
  });

  test("limpia bottom y right para no pelear con el CSS heredado", () => {
    const position = computeDropDownPosition(inputRect);

    expect(position.bottom).toBe("auto");
    expect(position.right).toBe("auto");
  });

  test("queda por encima del panel de rutas y los controles", () => {
    expect(Number(computeDropDownPosition(inputRect).zIndex)).toBeGreaterThan(1202);
  });

  test("nunca produce NaN como el copiado de estilos inline", () => {
    // El código anterior hacía parseInt(input.style.top), que con el input posicionado
    // por flexbox devolvía NaN y el navegador descartaba el valor.
    const allValues = Object.values(computeDropDownPosition(inputRect));
    expect(allValues.some((value) => String(value).includes("NaN"))).toBe(false);
  });
});