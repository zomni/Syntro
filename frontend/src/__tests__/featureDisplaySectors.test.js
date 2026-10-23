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

  it("un sector unico no lleva contador propio; solo el total del piso", () => {
    expect(source).toContain("const showSectorCounters = sectors.length >= 2;");
    expect(source).toContain("if (!canViewEquipment || !showSectorCounters) continue;");
    expect(source).toContain(
      "placeFloorTotalBubble(overlay, floorRing, devicesInFloor.length, floor, featureId);"
    );
  });
});

describe("subtitulo de sala seleccionada", () => {
  it("solo renderiza el subtitulo cuando hay sala seleccionada", () => {
    expect(source).toContain(
      'const buildBuildingPanelHeaderHtml = (featureName, selectedRoomName = "", featureId = "")'
    );
    expect(source).toContain(
      '${selectedRoomName ? `<span class="building-panel-subtitle">${escapeHtml(selectedRoomName)}</span>` : ""}'
    );
  });

  it("resuelve el nombre desde el filtro de sector o la sala seleccionada", () => {
    expect(source).toContain(
      "const selectedRoomHeaderId = popupSectorFilterState[featureId] || selectedRoomId;"
    );
    expect(source).toContain("selectedRoomName,");
  });
});

describe("acciones del panel de edificio", () => {
  it("convierte PC e impresora en filtros internos del popup", () => {
    expect(source).toContain("const buildDevicesSummaryHtml = (devices, featureId, activeType = \"\")");
    expect(source).toContain("window.setDeviceTypeFilter && window.setDeviceTypeFilter('${escapeHtml(featureId)}', '${type}')");
    expect(source).toContain("popupDeviceTypeFilterState[featureId] === nextType ? \"\" : nextType");
    expect(source).toContain("window.clearDevicePanelFilters");
  });

  it("ofrece la navegación al edificio desde el encabezado lateral", () => {
    expect(source).toContain("window.openRoutePlannerWithDestination");
    expect(source).toContain('title="Ir al edificio"');
    expect(source).toContain("const ROUTE_ICON_SVG");
    expect(source).not.toContain("<span>Ir al edificio</span>");
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
