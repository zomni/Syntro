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
    expect(source).toContain('{ type: "pc", label: "Filtrar PC", iconClass: "map-equipment-type-icon-pc" }');
    expect(source).toContain('{ type: "printer", label: "Filtrar impresoras", iconClass: "map-equipment-type-icon-printer" }');
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

  it("dibuja los iconos PC e impresora en CSS sobre currentColor", () => {
    expect(css).toContain(".map-equipment-type-icon-pc");
    expect(css).toContain(".map-equipment-type-icon-printer");
    expect(css).toMatch(/\.map-equipment-type-icon \{[\s\S]*?color: inherit;/);
  });

  it("mantiene el campo visible/oculto con el mismo criterio que antes", () => {
    expect(source).toContain("const field = document.querySelector(\".map-equipment-type-filter-field\");");
    expect(css).toMatch(/\.map-equipment-type-filter\.building-match-active \.map-equipment-type-filter-field \{/);
  });
});
