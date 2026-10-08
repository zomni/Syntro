const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "components", "adminMapToolsPanel.js"),
  "utf8"
);

describe("orden fijo de secciones del panel de herramientas admin", () => {
  it("toma el orden canonico de las claves de sectionDefinitions", () => {
    expect(source).toContain("const sectionOrderKeys = Object.keys(sectionDefinitions);");
    expect(source).toMatch(
      /const sectionDefinitions = \{\s*dimensions: \["Dimensiones", "&#9638;"\],\s*buildings: \["Edificios", "&#9634;"\],\s*rooms: \["Sectores", "&#9635;"\],\s*routes: \["Rutas", "&#8734;"\],\s*\};/
    );
  });

  it("reordena las secciones existentes en lugar de solo agregar la nueva", () => {
    expect(source).toContain("const reorderAdminMapToolSections = (buttons) => {");
    expect(source).toContain("sectionOrderKeys.forEach((key) => {");
    expect(source).toContain('const section = buttons.querySelector(`[data-admin-tool-section="${key}"]`);');
    expect(source).toContain("if (section) buttons.appendChild(section);");
  });

  it("mantiene el footer siempre al final", () => {
    expect(source).toContain("const footer = buttons.querySelector(`#${footerId}`);");
    expect(source).toContain("if (footer) buttons.appendChild(footer);");
  });

  it("reordena cada vez que se pide una seccion, no solo al crearla", () => {
    expect(source).toContain("reorderAdminMapToolSections(buttons);");
    const creationIndex = source.indexOf("buttons.appendChild(section);");
    const reorderIndex = source.indexOf("reorderAdminMapToolSections(buttons);");
    const returnIndex = source.indexOf('return section.querySelector(".admin-map-tool-section-body");');
    expect(creationIndex).toBeGreaterThan(-1);
    expect(reorderIndex).toBeGreaterThan(creationIndex);
    expect(returnIndex).toBeGreaterThan(reorderIndex);
  });
});
