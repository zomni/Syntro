const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("boton para ocultar el contador de equipos", () => {
  it("persiste el estado en sessionStorage y arranca visible salvo eleccion previa", () => {
    expect(source).toContain('const EQUIPMENT_BUBBLES_STORAGE_KEY = "syntro_equipment_bubbles_visible";');
    expect(source).toContain('window.sessionStorage?.getItem(EQUIPMENT_BUBBLES_STORAGE_KEY) !== "false"');
    expect(source).toContain("window.sessionStorage?.setItem(EQUIPMENT_BUBBLES_STORAGE_KEY, String(equipmentBubblesVisible));");
  });

  it("solo alterna la vista, con title y aria acordes al estado", () => {
    expect(source).toContain('document.documentElement.classList.toggle("equipment-bubbles-hidden", !isVisible);');
    expect(source).toContain('const title = isVisible ? "Ocultar contador" : "Mostrar contador";');
    expect(source).toContain('button.setAttribute("aria-label", title);');
    expect(source).toContain('button.setAttribute("aria-pressed", String(isVisible));');
  });

  it("crea el boton solo en el wrapper de la vista general, no en wayfinding", () => {
    expect(source).toContain('id: "equipment-bubble-toggle"');
    const creationIndex = source.indexOf("const equipmentBubbleToggle = createFilterToggleButton(");
    const filterWrapperIndex = source.indexOf("const ensureMapEquipmentTypeFilter = (summaryMap) => {");
    const wayfindingIndex = source.indexOf("const ensureWayfindingControls = () => {");
    expect(filterWrapperIndex).toBeGreaterThan(-1);
    expect(creationIndex).toBeGreaterThan(filterWrapperIndex);
    const wayfindingBlock = source.slice(wayfindingIndex, filterWrapperIndex);
    expect(wayfindingBlock).not.toContain("equipment-bubble-toggle");
  });

  it("el boton solo se muestra con la sesion que permite ver el contador", () => {
    expect(source).toContain("const canSeeCounters = !isWayfindingMode() && lastKnownSessionIsAuthenticated;");
    expect(source).toContain('if (equipmentToggle) equipmentToggle.classList.toggle("is-filter-hidden", !canSeeCounters);');
    // display:inline-flex !important de .building-label-toggle ganaba al
    // style.display, por eso el ocultado vive en una clase con !important.
    expect(css).toMatch(/\.is-filter-hidden \{\s*display: none !important;/);
  });

  it("restaura el estado guardado al arranque", () => {
    expect(source).toContain("const initEquipmentBubbleToggle = () => {");
    expect(source).toContain("initEquipmentBubbleToggle();");
    expect(source).toContain("setEquipmentBubblesVisible(equipmentBubblesVisible);");
  });

  it("recalcula los nombres al alternar el contador para liberar huecos", () => {
    expect(source).toMatch(/const setEquipmentBubblesVisible = \(isVisible\) => \{[\s\S]{0,700}scheduleReconcileBuildingNameLabels\(\);/);
  });

  it("oculta solo los contadores de #map, sin tocar la vista edificio", () => {
    expect(css).toMatch(/\.equipment-bubbles-hidden #map \.building-equipment-bubble \{[\s\S]*?display: none;[\s\S]*?visibility: hidden;/);
  });
});
