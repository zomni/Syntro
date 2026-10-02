import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// nextResult/prevResult viven dentro del IIFE de jQuery y el proyecto corre los tests en
// testEnvironment:"node", sin DOM: no se pueden invocar. Estos tests son un guard de
// fuente sobre el comportamiento que se pidió, para que una edición futura no vuelva a
// meter la navegación dentro del movimiento con flechas.
const source = readFileSync(
  resolve(__dirname, "..", "components", "autocompleteSearchBox.js"),
  "utf8"
);

// Los comentarios explican justo lo que estos tests verifican (el prefijo "S/N", el
// drawGeoJson que estaba en las flechas), así que se sacan antes de afirmar sobre el
// código: si no, un comentario bien escrito haría fallar el test.
const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const extractFunction = (name) => {
  // El archivo mezcla declaraciones function y arrow const, así que se buscan las dos.
  const candidates = [`function ${name}(`, `const ${name} = (`];
  const starts = candidates
    .map((needle) => source.indexOf(needle))
    .filter((index) => index > -1);

  expect(starts.length).toBeGreaterThan(0);

  const start = Math.min(...starts);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let index = bodyStart;

  for (; index < source.length; index++) {
    if (source[index] === "{") depth++;
    if (source[index] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }

  return stripComments(source.slice(start, index + 1));
};

describe("moverse con las flechas no navega", () => {
  // Regresión: nextResult/prevResult llamaban a drawGeoJson al final, así que el mapa
  // saltaba apenas el cursor se posaba sobre un resultado. La navegación la dispara el
  // Enter, no el movimiento.
  test("nextResult solo mueve el resaltado", () => {
    const body = extractFunction("nextResult");

    expect(body).not.toMatch(/drawGeoJson/);
    expect(body).toMatch(/fillSearchBox\(\)/);
  });

  test("prevResult solo mueve el resaltado", () => {
    const body = extractFunction("prevResult");

    expect(body).not.toMatch(/drawGeoJson/);
    expect(body).toMatch(/fillSearchBox\(\)/);
  });

  test("fillSearchBox deja el input con el resultado resaltado a la vista", () => {
    // fillSearchBox es lo que pone el título del resultado en el input, así que el
    // usuario ve en qué está parado antes de confirmar.
    expect(extractFunction("fillSearchBox")).toMatch(/searchBox/);
  });
});

describe("Enter confirma el resultado resaltado", () => {
  const keyHandler = stripComments(source.slice(source.indexOf("case 13:"), source.indexOf("case 38:")));

  test("el handler de Enter commitea si hay algo resaltado", () => {
    expect(keyHandler).toMatch(/activeResult !== -1/);
    expect(keyHandler).toMatch(/commitResult\(activeResult\)/);
  });

  test("sin resaltado sigue buscando", () => {
    expect(keyHandler).toMatch(/activeResult !== -1[\s\S]{0,200}else[\s\S]{0,120}searchButtonClick\(\)/);
  });

  test("commitResult es el camino único de navegación", () => {
    const body = extractFunction("commitResult");

    expect(body).toMatch(/drawGeoJson\(index\)/);
    // El dropdown se saca para no tapar el mapa al que se acaba de llegar.
    expect(body).toMatch(/resultsDiv.*remove/);
    // Y activeResult se resetea, para que el próximo Enter vuelva a buscar en vez de
    // re-confirmar el mismo resultado.
    expect(body).toMatch(/activeResult = -1/);
  });

  test("el input queda con el título elegido, venga por click o por Enter", () => {
    const body = extractFunction("commitResult");

    expect(body).toMatch(/fillSearchBox\(\)/);
    // fillSearchBox lee activeResult, así que tiene que correr antes del reset.
    expect(body.indexOf("fillSearchBox()")).toBeLessThan(body.indexOf("activeResult = -1"));
  });
});

describe("el título del equipo es solo la serie", () => {
  // Regresión: el prefijo "S/N: " contaminaba el título, que además se copia al input
  // al moverse con las flechas, y el searchText, que hacía que buscar "S/N" matcheara.
  test("ya no se escribe el prefijo S/N en el constructor del título", () => {
    const body = extractFunction("buildEquipmentFeatures");

    expect(body).toMatch(/const title = serial \|\|/);
    expect(body).not.toMatch(/S\/N/);
  });

  test("searchText se arma solo con la serie y la descripción", () => {
    expect(source).toMatch(
      /const searchText = `\$\{title\} \$\{description\} \$\{buildingId\} \$\{roomId\}`/
    );
  });

  test("el equipo de inventario declara su tipo para el ícono", () => {
    const body = extractFunction("buildEquipmentFeatures");

    expect(body).toMatch(/resultKind: "equipment"/);
    expect(body).toMatch(/equipmentType: item\?\.inferredCategory/);
  });
});

describe("createDropDown no revienta con propiedades vacías", () => {
  // El índice de búsqueda traía dos features al final con properties:{} que, si se
  // renderizaban, producían una fila "undefined". createDropDown ahora las tolera.
  test("lee las propiedades una vez con fallback", () => {
    const body = extractFunction("createDropDown");

    expect(body).toMatch(/features\[i\]\?\.properties \|\| \{\}/);
    expect(body).toMatch(/resolveResultIcon\(properties\)/);
  });

  test("no accede a properties.title sin guard", () => {
    expect(source).not.toMatch(/features\[i\]\.properties\.title/);
    expect(source).not.toMatch(/features\[i\]\.properties\.description/);
  });
});