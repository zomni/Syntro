const fs = require("fs");
const path = require("path");

const badgeSource = fs.readFileSync(path.join(__dirname, "..", "components", "sessionModeBadge.js"), "utf8");
const displaySource = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("badge de sesion y botones movidos al panel de filtros", () => {
  it("no muestra el texto de modo de vista", () => {
    expect(badgeSource).not.toContain("buildLabel");
    expect(badgeSource).not.toContain("Modo vista");
    expect(badgeSource).not.toContain("Modo Administrador");
    expect(badgeSource).not.toContain("session-mode-label");
    expect(css).not.toContain(".session-mode-label");
  });

  it("colorea el email de sesion segun el rol y conserva Sin sesion", () => {
    expect(badgeSource).toContain("const getRoleClass = (session) => {");
    expect(badgeSource).toContain("role-${role}");
    expect(badgeSource).toContain('`<span class="session-mode-user">Sin sesion</span>`');
    expect(css).toContain(".session-mode-user.role-admin");
    expect(css).toContain(".session-mode-user.role-editor");
    expect(css).toContain(".session-mode-user.role-auditor");
    expect(css).toContain(".session-mode-user.role-viewer");
  });

  it("incluye el rol en la clave de sesion para re-renderizar", () => {
    expect(badgeSource).toContain('session?.role || "",');
  });

  it("mueve satelital y coincidencias al panel de filtros y los devuelve en wayfinding", () => {
    expect(displaySource).toContain("export const syncSessionButtonsToFilters = () => {");
    expect(displaySource).toContain('"#map-equipment-filters .map-filter-icon-row"');
    expect(displaySource).toContain('[".session-mode-globe", ".session-mode-match"].forEach');
    expect(badgeSource).toContain("syncSessionButtonsToFilters();");
    expect(displaySource).toContain("syncSessionButtonsToFilters();");
  });

  it("recoloca los botones movidos antes de re-renderizar el badge", () => {
    expect(badgeSource).toContain("if (button && !badge.contains(button)) badge.appendChild(button);");
    expect(displaySource).toContain("heading.prepend(button);");
  });

  it("usa currentTarget para seguir tocando los botones una vez movidos", () => {
    expect(badgeSource).toContain("const btn = event.currentTarget;");
    expect(badgeSource).not.toContain('const btn = badge.querySelector(".session-mode-globe");');
    expect(badgeSource).not.toContain('const btn = badge.querySelector(".session-mode-match");');
  });

  it("los toggles de la fila son de solo-icono con estado en title", () => {
    expect(displaySource).toContain("const createFilterToggleButton = ({ id, title, glyph, ariaPressed }) => {");
    expect(displaySource).toContain('glyph: "Aa"');
    expect(displaySource).toContain('glyph: "↝"');
    expect(displaySource).toContain('glyph: "#"');
    expect(displaySource).toContain('const title = isVisible ? "Ocultar nombres" : "Mostrar nombres";');
    expect(css).toContain(".map-filter-icon-row {");
    expect(css).toContain(".filter-toggle-icon {");
  });

  it("repinta satelital/coincidencias con la paleta del panel de filtros", () => {
    expect(css).toContain(".map-equipment-type-filter .session-mode-globe,");
    expect(css).toMatch(/\.map-equipment-type-filter \.session-mode-match \{[\s\S]*?color: var\(--pi-primary-deep\);/);
  });
});
