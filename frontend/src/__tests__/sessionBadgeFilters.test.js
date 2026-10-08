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

  it("mueve satelital y coincidencias al panel de filtros y los estaciona en wayfinding", () => {
    expect(displaySource).toContain("export const syncSessionButtonsToFilters = () => {");
    expect(displaySource).toContain('"#map-equipment-filters .map-filter-icon-row"');
    expect(displaySource).toContain('[".session-mode-globe", ".session-mode-match"].forEach');
    expect(displaySource).toContain('"session-mode-stash"');
    expect(badgeSource).toContain("syncSessionButtonsToFilters();");
    expect(displaySource).toContain("syncSessionButtonsToFilters();");
  });

  it("el badge solo lleva cajon, fila usuario+ojo y boton de sesion", () => {
    expect(badgeSource).not.toContain("session-mode-heading");
    expect(badgeSource).not.toContain("session-mode-info");
    expect(badgeSource).toContain('<div class="session-mode-user-row">');
    expect(badgeSource).toContain("ensureSessionToggleButtons(session);");
    expect(badgeSource).toContain("ensureSessionButtonStash");
    // Globe/match se crean con createElement fuera del badge y se estacionan.
    expect(badgeSource).not.toContain('<button type="button" class="session-mode-globe"');
    expect(badgeSource).not.toContain("badge.contains(button)");
    expect(css).toContain(".session-mode-user-row {");
    expect(css).not.toContain(".session-mode-heading {");
    expect(css).not.toContain(".session-mode-heading-buttons");
    expect(css).not.toContain(".session-mode-info {");
  });

  it("el email queda con el ojo a su derecha y cerrar sesion debajo", () => {
    const rowStart = badgeSource.indexOf('<div class="session-mode-user-row">');
    expect(rowStart).toBeGreaterThan(-1);
    expect(badgeSource.indexOf("${userLabel}", rowStart)).toBeGreaterThan(rowStart);
    expect(badgeSource.indexOf('class="session-mode-visibility"', rowStart)).toBeGreaterThan(rowStart);
    expect(badgeSource.indexOf("${userLabel}", rowStart)).toBeLessThan(
      badgeSource.indexOf('class="session-mode-visibility"', rowStart)
    );
    expect(badgeSource.indexOf('class="session-mode-logout"')).toBeGreaterThan(
      badgeSource.indexOf("</div>", rowStart)
    );
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


  it("sin texto de modo, el badge no tiene huecos ni heading", () => {
    expect(css).not.toContain(".session-mode-heading-buttons");
    expect(css).not.toMatch(/\.session-mode-badge \{[^}]*justify-content: space-between/);
    expect(css).toMatch(/\.session-mode-badge \{[\s\S]*?justify-content: flex-start;/);
  });

  it("repinta satelital/coincidencias con la paleta del panel de filtros", () => {
    expect(css).toContain(".map-equipment-type-filter .session-mode-globe,");
    expect(css).toMatch(/\.map-equipment-type-filter \.session-mode-match \{[\s\S]*?color: var\(--pi-primary-deep\);/);
  });

  it("cambia el color del icono de satelital/coincidencias como los demas toggles", () => {
    expect(badgeSource).toContain('globe.classList.toggle("is-muted", !satelliteActive);');
    expect(badgeSource).toContain('btn.classList.toggle("is-muted", !satelliteActive);');
    expect(badgeSource).toContain('button.classList.toggle("is-muted", !buildingMatchActive);');
    expect(badgeSource).toContain('btn.classList.toggle("is-muted", !buildingMatchActive);');
    expect(css).toMatch(
      /\.map-equipment-type-filter \.session-mode-globe\.is-muted,\s*\.map-equipment-type-filter \.session-mode-match\.is-muted \{\s*color: var\(--pi-gray-500\);/
    );
  });
});
