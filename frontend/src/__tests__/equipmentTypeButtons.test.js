const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("botones de tipo de equipo (PC / impresora)", () => {
  it("no crea el titulo Filtros ni el antiguo select", () => {
    expect(source).not.toContain('label.textContent = "Filtros";');
    expect(source).not.toContain('document.createElement("select")');
    expect(source).not.toContain("map-equipment-type-filter-select");
  });

  it("crea un boton por tipo con icono, aria y disabled si no hay datos", () => {
    expect(source).toContain('{ type: "pc", label: "Filtrar PC" }');
    expect(source).toContain('{ type: "printer", label: "Filtrar impresoras" }');
    expect(source).toContain("const EQUIPMENT_TYPE_ICONS = {");
    expect(source).toContain("EQUIPMENT_TYPE_ICONS[type]");
    expect(source).toContain("button.dataset.type = type;");
    expect(source).toContain("button.disabled = !availableTypes.includes(type);");
  });

  it("alterna el filtro single-select y vuelve a todos al deseleccionar", () => {
    expect(source).toContain('globalEquipmentTypeFilter = globalEquipmentTypeFilter === type ? "" : type;');
    expect(source).toMatch(
      /const syncEquipmentTypeButtons = \(\) => \{[\s\S]*?button\.dataset\.type === globalEquipmentTypeFilter/
    );
    expect(source).toContain('button.classList.toggle("is-active", isActive);');
  });

  it("repinta las burbujas al cambiar el tipo", () => {
    expect(source).toMatch(
      /globalEquipmentTypeFilter = globalEquipmentTypeFilter === type \? "" : type;[\s\S]{0,200}updateBuildingEquipmentBubbles\(\);/
    );
  });

  it("dibuja los iconos PC e impresora como SVG inline con currentColor", () => {
    expect(source).toMatch(/pc: `<svg [\s\S]*?<rect x="2" y="3" width="12" height="8" rx="1.5"\/>/);
    expect(source).toMatch(/printer: `<svg [\s\S]*?<rect x="2" y="6.5" width="12" height="5.5" rx="1.5"\/>/);
    expect(css).toContain(".map-equipment-type-icon svg {");
    expect(css).not.toContain(".map-equipment-type-icon-pc");
    expect(css).not.toContain(".map-equipment-type-icon-printer");
  });

  it("mantiene el campo visible/oculto con el mismo criterio que antes", () => {
    expect(source).toContain('if (field) field.classList.toggle("is-filter-hidden", !canSeeCounters);');
    expect(css).toMatch(/\.map-equipment-type-filter\.building-match-active \.map-equipment-type-filter-field \{/);
  });

  it("centra el contenido del panel con los botones agrupados", () => {
    expect(css).toMatch(/\.map-equipment-type-buttons \{[^}]*justify-content: center;/);
    expect(css).toMatch(/\.map-floor-filter-buttons::before,\s*\.map-floor-filter-buttons::after \{[^}]*margin: auto;/);
    expect(css).toMatch(/\.map-filter-icon-row \{[^}]*justify-content: center;/);
    expect(css).toMatch(/body\.map-ui-wayfinding \.map-equipment-type-filter \{[^}]*justify-content: center;/);
    expect(css).toMatch(/\.map-equipment-type-filter-field small \{[^}]*text-align: center;/);
    expect(css).toMatch(/\.map-floor-filter > small \{[^}]*text-align: center;/);
    expect(css).not.toMatch(/\.map-equipment-type-filter \{[^}]*space-between/);
    expect(css).not.toMatch(/\.map-filter-icon-row \{[^}]*space-between/);
  });
});
