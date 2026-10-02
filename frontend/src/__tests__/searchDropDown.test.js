import { computeDropDownPosition, resolveResultIcon } from "../utils/searchDropDown.js";

describe("resolveResultIcon", () => {
  // Regresión: ni cs_sotero_search.json ni el catálogo traen properties.image, así que
  // createDropDown pedía assets/icons_os/undefined y el fallback SPA del servidor
  // respondía 200 text/html con index.html. El <img> quedaba roto en todos los
  // resultados, no solo en los de equipos.
  test("cae al ícono por defecto cuando no hay imagen", () => {
    expect(resolveResultIcon(undefined)).toBe("building.svg");
    expect(resolveResultIcon(null)).toBe("building.svg");
    expect(resolveResultIcon("")).toBe("building.svg");
    expect(resolveResultIcon("   ")).toBe("building.svg");
  });

  test("trata los strings 'undefined' y 'null' como ausentes", () => {
    expect(resolveResultIcon("undefined")).toBe("building.svg");
    expect(resolveResultIcon("null")).toBe("building.svg");
  });

  test("respeta una extensión válida", () => {
    expect(resolveResultIcon("cafeteria.svg")).toBe("cafeteria.svg");
    expect(resolveResultIcon("car_parking.png")).toBe("car_parking.png");
  });

  test("agrega .svg a los nombres sin extensión", () => {
    expect(resolveResultIcon("hospital")).toBe("hospital.svg");
  });

  test("nunca devuelve undefined", () => {
    for (const value of [undefined, null, "", "  ", "undefined", "null", "x.svg"]) {
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