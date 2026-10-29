const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "views", "featureDisplay.js"),
  "utf8"
);
const css = fs.readFileSync(path.join(__dirname, "..", "index.css"), "utf8");

describe("burbujas de sectores", () => {
  it("no descarta un sector cuando la burbuja no cabe completa", () => {
    expect(source).toContain("let nonCollidingFallback = null;");
    expect(source).toContain("let insideFallback = null;");
    expect(source).toContain(
      "return isLatLngInsideRing(baseLatLng, ring) ? baseLatLng : null;"
    );
  });

  it("usa el centroide estable de la geometria compartida", () => {
    expect(source).toContain(
      'import { pointInRing, ringCentroidLatLng } from "../utils/roomEditorGeometry.js";'
    );
    expect(source).not.toContain("const ringCentroidLatLng = (latLngs) =>");
  });

  it("usa la burbuja vacia solo para sectores sin equipos", () => {
    expect(source).toContain("const createEquipmentBubbleIcon = (count, { emptyWhenZero = false } = {})");
    expect(source).toContain("createEquipmentBubbleIcon(count, { emptyWhenZero: true })");
    expect(source).toContain('className: `building-equipment-bubble${isEmpty ? " is-empty" : ""}`');
    expect(source).toContain("iconSize: isEmpty ? [17, 17] : [34, 34]");
    expect(source).toContain('const visibleCount = isEmpty ? "" : normalizedCount;');
  });

  it("mantiene una etiqueta accesible aunque la burbuja no muestre cero", () => {
    expect(source).toContain('"Sin equipos asignados"');
    expect(source).toContain('aria-label="${label}"');
  });

  it("mantiene el tamano normal cuando el sector tiene equipos", () => {
    expect(source).toContain("iconAnchor: isEmpty ? [8.5, 8.5] : [17, 17]");
    expect(css).toMatch(/\.building-equipment-bubble\.is-empty button \{[\s\S]*?width: 17px;[\s\S]*?height: 17px;/);
  });

  it("centra los contadores de tres digitos dentro de la burbuja", () => {
    expect(css).toMatch(/\.building-equipment-bubble button \{[\s\S]*?box-sizing: border-box;[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;[\s\S]*?padding: 0;/);
  });

  it("muestra el contador del sector aunque sea el unico del piso y filtra los contadores", () => {
    expect(source).toContain("const showSectorCounters = sectors.length >= 1;");
    expect(source).toContain("if (!canViewEquipment || !showSectorCounters) continue;");
    expect(source).toContain("placeFloorTotalBubble(overlay, floorRing, countedDevicesInFloor.length, floor, featureId);");
    expect(source).toContain("const popupTypeFilter = popupDeviceTypeFilterState[featureId] || globalEquipmentTypeFilter;");
  });
});

describe("jerarquia visual de edificio y sector", () => {
  it("identifica el edificio como titulo principal y conserva los pisos en su bloque", () => {
    expect(source).toContain(
      'const buildBuildingPanelHeaderHtml = (featureName, featureId = "")'
    );
    expect(source).toContain("building-panel-building-label");
    expect(source).toContain("building-panel-building-context");
    expect(source).toContain("building-panel-floor-context");
    expect(css).toContain(".building-panel-building-context {");
  });

  it("agrupa el sector seleccionado, su contador y quitar filtro con el color del poligono", () => {
    expect(source).toContain("const buildSelectedSectorContextHtml = (name, count, featureId) =>");
    expect(source).toContain("building-panel-sector-context");
    expect(source).toContain("window.clearSectorFilter && window.clearSectorFilter('${escapeHtml(featureId)}')");
    expect(source).toContain('aria-label="Quitar filtro de sector"');
    expect(source).toContain('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"');
    expect(source).not.toContain(">Quitar filtro</button>");
    expect(source).toContain("building-panel-sector-count");
    expect(css).toContain("border-left: 5px solid #6d28d9;");
    expect(css).toContain("color: #6d28d9;");
  });

  it("omite repetir el nombre del sector en cada equipo cuando ya esta filtrado", () => {
    expect(source).toContain("const roomChip = activeSectorFilter && device.roomId === activeSectorFilter");
    expect(source).toContain("          roomChip,");
    expect(source).not.toContain('class="building-panel-subtitle"');
  });
});

describe("acciones del panel de edificio", () => {
  it("mantiene los contadores como chips visuales y deja el tipo dentro de Filtros", () => {
    expect(source).toContain("const buildDevicesSummaryHtml = (devices) =>");
    expect(source).toContain('const typeChips = ["all", "pc", "printer"]');
    expect(source).toContain('return `<span style="${CHIP_BASE_STYLE}; background:${getDeviceTypeColor(type)}1f; color:${getDeviceTypeColor(type)};">${content}</span>`;');
    expect(source).not.toContain("equipment-panel-counter-button");
    expect(source).toContain("popupDeviceTypeFilterState[featureId] === nextType ? \"\" : nextType");
    expect(source).toContain("window.clearDevicePanelFilters");
  });

  it("muestra el contador de filtros y borra filtros en la misma fila", () => {
    expect(source).toContain("const activeFilterCount = [hasTypeFilter, Boolean(activeSector), Boolean(String(query || \"\").trim())]");
    expect(source).toContain("Filtros${activeFilterCount ? ` · ${activeFilterCount}` : \"\"}");
    expect(source).toContain('class="floorButton equipment-panel-clear-filters"');
    expect(source).toContain("popupDeviceSearchOpenState[featureId] = false;");
    expect(source).toContain('aria-label="Borrar filtros activos"');
    expect(source).toContain(">×</button>`");
    expect(css).toMatch(/\.equipment-panel-clear-filters\s*\{[\s\S]*?border-radius:\s*50%;/);
  });

  it("permite que los chips de sector envuelvan sin desbordar el panel", () => {
    expect(source).toContain("equipment-panel-sector-chips");
    expect(css).toMatch(/\.equipment-panel-filter-chips\s*\{[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?min-width:\s*0;/);
    expect(css).not.toMatch(/\.equipment-panel-sector-chips\s*\{[\s\S]*?overflow-y:/);
  });

  it("mantiene el estado de coincidencia de inventario en las tarjetas", () => {
    expect(source).toContain("foundInLatestSnapshot: Boolean(item?.matchedInLatestSnapshot)");
    expect(source).toContain("const buildInventoryMatchBadgeHtml = (device) =>");
    expect(source).toContain("buildInventoryMatchBadgeHtml(device)");
    expect(source).toContain('seen: { color: "#16a34a", label: "Visto" }');
    expect(source).toContain('not_seen: { color: "#dc2626", label: "No visto" }');
    expect(source).toContain('no_identifier: { color: "#d97706", label: "Sin identificador" }');
    expect(source).not.toContain("... y ${filteredDevices.length - resolvedPageSize} equipo(s) mas");
  });

  it("resume el mismo alcance del listado y abre solo los no vistos", () => {
    expect(source).toContain("const buildInventoryMatchSummaryHtml = (featureId, devices, matchActive = false) =>");
    expect(source).toContain("const total = counts.seen + counts.notSeen + counts.noIdentifier;");
    expect(source).toContain("window.toggleBuildingMatchInPanel");
    expect(source).toContain("buildingMatchColorForView");
    expect(source).toContain("buildingMatchLabelForView");
    expect(source).toContain('popupDeviceMatchFilterState[featureId] = popupBuildingMatchState[featureId] ? "not_seen" : "";');
    expect(source).toContain('matchFilter === "not_seen"');
    expect(source).toContain("building-panel-inventory-match-summary");
  });

  it("muestra un aviso único cuando no existe captura y explica el identificador faltante", () => {
    expect(source).toContain("No existe ninguna captura de red disponible para comparar este inventario.");
    expect(source).toContain("getMissingComparableIdentifierLabel");
    expect(source).toContain("El cruce usa serie, MAC o IP; también puede usar una IP embebida en el nombre de red.");
  });

  it("mantiene las cinco opciones de cantidad junto al resumen del listado", () => {
    expect(source).toContain("const buildDevicePageSizeHtml = (featureId, pageSize) =>");
    expect(source).toContain("[5, 10, 20, 50, \"all\"]");
    expect(source).toContain("equipment-panel-results-toolbar");
    expect(source).toContain("Mostrando ${Math.min(displayDevices.length, matchFilteredDevices.length)} de ${matchFilteredDevices.length}");
  });

  it("ofrece la navegación al edificio desde el encabezado lateral", () => {
    expect(source).toContain("window.openRoutePlannerWithDestination");
    expect(source).toContain('title="Ir al edificio"');
    expect(source).toContain("const ROUTE_ICON_SVG");
    expect(source).not.toContain("<span>Ir al edificio</span>");
  });

  it("muestra el alcance actual y anima el equipo encontrado", () => {
    expect(source).toContain("const buildDeviceScopeSummaryHtml");
    expect(source).toContain("building-panel-device-results");
    expect(source).toContain("equipment-panel-found-label");
    expect(css).toContain("@keyframes equipment-found-pulse");
    expect(css).toContain("@keyframes equipment-counter-pop");
  });
});

describe("visibilidad de los sectores", () => {
  it("usa fondo y borde visibles en reposo", () => {
    expect(source).toMatch(/const baseSectorStyle = \{[\s\S]*?weight: 1\.8,[\s\S]*?fillOpacity: 0\.16/);
  });

  it("aumenta el contraste al pasar el mouse y elimina el difuminado", () => {
    expect(source).toMatch(/const hoverSectorStyle = \{[\s\S]*?weight: 4,[\s\S]*?fillOpacity: 0\.32/);
    expect(css).toMatch(/\.building-view-sector \{[\s\S]*?filter: none;/);
    expect(source).toContain("polygon.bringToFront();");
  });
});

describe("loading al cambiar de piso", () => {
  it("muestra un estado breve sobre el mapa interno mientras carga el piso", () => {
    expect(source).toContain("const showBuildingFloorLoading = (floor) =>");
    expect(source).toContain('class="building-floor-loading-spinner" aria-label="Cargando piso"');
    expect(source).not.toContain("building-floor-loading-text");
    expect(source).toContain("const BUILDING_FLOOR_LOADING_MIN_MS = 220;");
    expect(source).toContain("const loadingToken = showBuildingFloorLoading(floor);");
    expect(source).toContain("await hideBuildingFloorLoading(loadingToken);");
  });

  it("mantiene el loading accesible y respeta la reduccion de movimiento", () => {
    expect(source).toContain('buildingFloorLoadingElement.setAttribute("role", "status")');
    expect(css).toContain(".building-floor-loading.is-visible");
    expect(css).toContain("@keyframes building-floor-loading-spin");
    expect(css).toContain("width: 52px;");
    expect(css).toContain(".building-floor-loading-spinner {\n        animation: none;");
  });
});
