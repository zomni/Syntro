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
    expect(displaySource).toContain("const createFilterToggleButton = ({ id, title, icon, ariaPressed }) => {");
    expect(displaySource).toContain("const FILTER_TOGGLE_ICONS = {");
    expect(displaySource).toContain("icon: FILTER_TOGGLE_ICONS.names");
    expect(displaySource).toContain("icon: FILTER_TOGGLE_ICONS.routes");
    expect(displaySource).toContain("icon: FILTER_TOGGLE_ICONS.counter");
    expect(displaySource).not.toContain("glyph:");
    expect(displaySource).toContain('const title = isVisible ? "Ocultar nombres" : "Mostrar nombres";');
    expect(css).toContain(".map-filter-icon-row {");
    expect(css).toContain(".filter-toggle-icon {");
    expect(css).toContain(".filter-toggle-icon svg {");
  });

  it("los iconos de los toggles son SVG inline con stroke currentColor", () => {
    expect(displaySource).toMatch(/const SVG_ICON_ATTRS = 'width="16" height="16" viewBox="0 0 16 16"[^']*stroke="currentColor"/);
    expect(displaySource).toMatch(/names: `<svg \$\{SVG_ICON_ATTRS\}>/);
    expect(displaySource).toMatch(/routes: `<svg \$\{SVG_ICON_ATTRS\}>/);
    expect(displaySource).toMatch(/counter: `<svg \$\{SVG_ICON_ATTRS\}>/);
  });


  it("sin texto de modo, los botones ocupan el hueco a la izquierda", () => {
    expect(css).not.toMatch(/\.session-mode-heading-buttons \{[^}]*margin-left: auto/);
  });

  it("repinta satelital/coincidencias con la paleta del panel de filtros", () => {
    expect(css).toContain(".map-equipment-type-filter .session-mode-globe,");
    expect(css).toMatch(/\.map-equipment-type-filter \.session-mode-match \{[\s\S]*?color: var\(--pi-primary-deep\);/);
  });
});
