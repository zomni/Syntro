const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("reconciliador de nombres de edificios", () => {
  it("define la lista de offsets con la que se busca hueco libre", () => {
    expect(source).toContain("const LABEL_OFFSET_CANDIDATES = [");
    expect(source).toContain("[0, -22],");
    expect(source).toContain("[0, 22],");
    expect(source).toContain("[-70, 0],");
    expect(source).toContain("[140, 0],");
  });

  it("compara rectangulos con margen y desplaza por margin sin tocar el transform de Leaflet", () => {
    expect(source).toContain("const rectsOverlap = (a, b, margin) =>");
    expect(source).toContain("const moveRect = (rect, x, y) => ({");
    expect(source).toContain("label.style.marginLeft = `${x}px`;");
    expect(source).toContain("label.style.marginTop = `${y}px`;");
    expect(source).not.toContain("label.style.transform");
  });

  it("acepta la posicion base primero y solo desplaza si choca", () => {
    expect(source).toContain("const baseRect = label.getBoundingClientRect();");
    expect(source).toContain("if (isFree(baseRect)) {");
    expect(source).toContain("const offset = LABEL_OFFSET_CANDIDATES.find(([x, y]) => isFree(moveRect(baseRect, x, y)));");
  });

  it("oculta la etiqueta solo cuando no cabe en ningun offset", () => {
    expect(source).toContain("if (!offset) {");
    expect(source).toContain('label.style.visibility = "hidden";');
  });

  it("ordena por prioridad determinista: ancho desc, luego posicion", () => {
    expect(source).toContain("if (rectB.width !== rectA.width) return rectB.width - rectA.width;");
    expect(source).toContain("if (rectA.top !== rectB.top) return rectA.top - rectB.top;");
    expect(source).toContain("return rectA.left - rectB.left;");
  });

  it("usa las burbujas de equipos y de match como obstaculos fijos", () => {
    expect(source).toContain('document.querySelectorAll(".building-equipment-bubble, .building-match-bubble")');
  });

  it("limpia los ajustes cuando los nombres estan ocultos", () => {
    expect(source).toMatch(/if \(!buildingLabelsVisible\) \{[\s\S]{0,220}label\.style\.marginLeft = "";/);
  });

  it("recalcula con debounce ante zoom, pan, resize y capas nuevas", () => {
    expect(source).toContain("const scheduleReconcileBuildingNameLabels = () => {");
    expect(source).toContain('map.on("zoomend", scheduleReconcileBuildingNameLabels);');
    expect(source).toContain('map.on("moveend", scheduleReconcileBuildingNameLabels);');
    expect(source).toContain('window.addEventListener("resize", scheduleReconcileBuildingNameLabels);');
    expect(source).toContain("scheduleReconcileBuildingNameLabels();");
  });

  it("se recalcula al actualizar o quitar burbujas de equipos", () => {
    expect(source).toMatch(/const updateBuildingEquipmentBubbles = \(\) => \{\s*scheduleReconcileBuildingNameLabels\(\);/);
    expect(source).toContain("buildingEquipmentBubbleEntries.delete(featureId);");
  });

  it("pasa el offset con transicion suave de margen", () => {
    expect(css).toMatch(/\.building-name-label \{[\s\S]*?transition: margin 120ms ease;/);
  });
});
