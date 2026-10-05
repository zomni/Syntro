// La ruta activa del planificador se pide en amarillo de senalizacion
// (transito), no en rojo: el rojo se leia como una alerta. El color vive en una
// sola constante que pinta la linea y las flechas de direccion.

const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "routePlanner.js"),
  "utf8"
);

const readColor = () => {
  const match = source.match(/const SELECTED_ROUTE_COLOR = "(#[0-9a-f]{6})";/i);
  return match ? match[1] : null;
};

describe("color de la ruta activa", () => {
  it("declara un unico color de ruta", () => {
    expect(readColor()).toBeTruthy();
  });

  it("es amarillo, no rojo", () => {
    const hex = readColor();
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

  it("mantiene el contorno blanco debajo de la linea", () => {
    expect(source).toMatch(/color: "#ffffff",\s*\n\s*weight: 12/);
  });

  it("ya no usa el rojo anterior para la ruta", () => {
    expect(source).not.toMatch(/SELECTED_ROUTE_COLOR = "#ef4444"/);
  });
});