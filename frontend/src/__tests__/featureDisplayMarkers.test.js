const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "views", "featureDisplay.js"),
  "utf8"
);

describe("marcadores en la vista de sectores del edificio", () => {
  it("reutiliza el icono estatico del catalogue en vez de construir uno propio", () => {
    expect(source).toContain(
      'import { resetBuildingsCatalogCache, buildStaticMarkerIcon, staticMarkerSizeForZoom } from "@app/addData";'
    );
  });

  it("pide los marcadores del edificio y del piso mostrado", () => {
    expect(source).toContain("const [allRooms, backendInventoryItems, mapMarkers] = await Promise.all([");
    expect(source).toContain("/api/map-markers?buildingExternalId=");
    expect(source).toContain("}&floor=${encodeURIComponent(floor)}");
  });

  it("no rompe la vista de sectores si el backend de marcadores falla", () => {
    expect(source).toContain("console.warn(\"[mapa] no se pudieron cargar los marcadores de la vista edificio:\"");
    expect(source).toContain("return [];");
  });

  it("descarta el fetch si el render quedo obsoleto antes de pintar", () => {
    const staleGuardIndex = source.indexOf("if (isStale() || !buildingViewMap) {");
    const markerRenderIndex = source.indexOf("const buildingViewZoom = buildingViewMap.getZoom();");
    expect(staleGuardIndex).toBeGreaterThan(-1);
    expect(markerRenderIndex).toBeGreaterThan(staleGuardIndex);
  });

  it("pinta los marcadores en el overlay con icono estatico y sin interaccion", () => {
    expect(source).toContain("icon: buildStaticMarkerIcon(marker.iconKey, staticMarkerSizeForZoom(buildingViewZoom)),");
    expect(source).toContain("zIndexOffset: 600,");
    expect(source).toContain("interactive: false,");
    expect(source).toContain("}).addTo(overlay);");
  });

  it("ignora marcadores sin coordenadas validas", () => {
    expect(source).toContain("const lat = Number(marker?.latitude);");
    expect(source).toContain("const lng = Number(marker?.longitude);");
    expect(source).toContain("if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;");
  });
});
