// La ruta activa del planificador se pide en amarillo de senalizacion
// (transito), no en rojo: el rojo se leia como una alerta. El color vive en una
// sola constante que pinta la linea y las flechas de direccion.
//
// Ademas la ruta se dibuja como cinta transportadora: casing blanco, canaleta
// ambar y cuentas amarillo claro que avanzan con una animacion css de
// stroke-dashoffset. Estos tests fijan el contrato entre el js y el css.

const fs = require("fs");
const path = require("path");

const read = (...segments) =>
  fs.readFileSync(path.join(__dirname, "..", ...segments), "utf8");

const source = read("components", "routePlanner.js");
const css = read("index.css");

const readHex = (name) => {
  const match = source.match(new RegExp(`const ${name} = "(#[0-9a-f]{6})";`, "i"));
  return match ? match[1] : null;
};

const readNumber = (name) => {
  const match = source.match(new RegExp(`const ${name} = (\\d+);`));
  return match ? Number(match[1]) : null;
};

const readDashPeriod = () => {
  const match = source.match(/const ROUTE_BEAD_DASH = "(\d+)\s+(\d+)";/);
  return match ? Number(match[1]) + Number(match[2]) : null;
};

const keyframeBlock = (name) => {
  const match = css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`));
  return match ? match[1] : null;
};

describe("color de la ruta activa", () => {
  it("declara un unico color de ruta", () => {
    expect(readHex("SELECTED_ROUTE_COLOR")).toBeTruthy();
  });

  it("es amarillo, no rojo", () => {
    const hex = readHex("SELECTED_ROUTE_COLOR");
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
    const [red, green, blue] = channels;

    // Amarillo de senalizacion: rojo y verde altos, azul bajo.
    expect(red).toBeGreaterThanOrEqual(200);
    expect(green).toBeGreaterThanOrEqual(140);
    expect(blue).toBeLessThanOrEqual(90);
  });

  it("pinta con el mismo color la linea y las flechas de direccion", () => {
    const usages = source.match(/SELECTED_ROUTE_COLOR/g) || [];

    // Una declaracion, la linea del trazo y las dos flechas del svg.
    expect(usages).toHaveLength(4);
  });

  it("ya no usa el rojo anterior para la ruta", () => {
    expect(source).not.toMatch(/SELECTED_ROUTE_COLOR = "#ef4444"/);
  });

  it("mantiene el contorno blanco debajo de la linea", () => {
    expect(readHex("ROUTE_CASING_COLOR")).toBe("#ffffff");
    expect(source).toMatch(/color: ROUTE_CASING_COLOR,\s*\n\s*weight: ROUTE_CASING_WEIGHT/);
  });
});

describe("cinta transportadora de la ruta", () => {
  it("arma las tres capas con la canaleta entre el casing y las cuentas", () => {
    // Si los pesos no crecen hacia afuera las cuentas quedan tapadas por la
    // canaleta o se salen del contorno blanco.
    expect(readNumber("ROUTE_BEAD_WEIGHT")).toBeLessThan(readNumber("ROUTE_CHANNEL_WEIGHT"));
    expect(readNumber("ROUTE_CHANNEL_WEIGHT")).toBeLessThan(readNumber("ROUTE_CASING_WEIGHT"));
  });

  it("usa un canaleta ambar y cuentas amarillo claro", () => {
    const channel = readHex("ROUTE_CHANNEL_COLOR");
    const bead = readHex("ROUTE_BEAD_COLOR");

    expect(channel).toBeTruthy();
    expect(bead).toBeTruthy();
    // Las cuentas tienen que ser mas claras que la canaleta para que se lea
    // el avance por dentro y no como una raya oscura encima.
    const channelBlue = parseInt(channel.slice(5, 7), 16);
    const beadBlue = parseInt(bead.slice(5, 7), 16);
    expect(beadBlue).toBeGreaterThan(channelBlue);
  });

  it("marca las cuentas con la clase que anima el css", () => {
    const className = source.match(/const ROUTE_BEAD_CLASS = "([a-z-]+)";/);

    expect(className).toBeTruthy();
    expect(source).toContain("className: ROUTE_BEAD_CLASS,");
    expect(css).toContain(`.${className[1]} {`);
  });

  it("el recorrido de la animacion es igual al periodo del patron", () => {
    const block = keyframeBlock("route-conveyor-advance");
    const offset = block && block.match(/stroke-dashoffset:\s*(-?\d+)/);

    expect(readDashPeriod()).toBeTruthy();
    expect(offset).toBeTruthy();
    // Si el js cambia el patron y el css no acompana, el bucle reinicia con un
    // salto visible en cada vuelta.
    expect(Number(offset[1])).toBe(-readDashPeriod());
  });

  it("desplaza en negativo para que las cuentas avancen hacia el destino", () => {
    const block = keyframeBlock("route-conveyor-advance");
    const offset = block.match(/stroke-dashoffset:\s*(-?\d+)/);

    expect(Number(offset[1])).toBeLessThan(0);
  });

  it("respeta a quien pidio menos movimiento", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none;/);
  });
});

describe("cuando no hay un camino real", () => {
  it("solo dibuja las cuentas cuando hay red caminable y camino", () => {
    expect(source).toMatch(/const routeIsReal = hasWalkingNetwork && !routeUnavailable;/);
  });

  it("no dibuja las cuentas por fuera de ese caso", () => {
    const guard = source.indexOf("if (routeIsReal) {");
    const beads = source.indexOf("color: ROUTE_BEAD_COLOR,");

    expect(guard).toBeGreaterThan(-1);
    expect(beads).toBeGreaterThan(guard);
  });

  it("deja la linea punteada para que no parezca un trayecto real", () => {
    expect(source).toMatch(/dashArray: routeIsReal \? null : "12 10"/);
  });
});

describe("orden de las capas", () => {
  it("sube las cuentas despues de la canaleta, porque Leaflet ordena por el DOM", () => {
    const channelFront = source.indexOf("selectedPolyline.bringToFront?.();");
    const guard = source.indexOf("if (routeIsReal) {");
    const beadFront = source.indexOf("beadPolyline.bringToFront?.();");

    // Si las cuentas se dibujaran antes del bringToFront de la canaleta, la
    // canaleta quedaria arriba y el avance no se veria.
    expect(channelFront).toBeLessThan(guard);
    expect(guard).toBeLessThan(beadFront);
  });
});