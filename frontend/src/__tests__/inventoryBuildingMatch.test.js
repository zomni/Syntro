const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const backendSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "..", "backend", "Syntro.API", "Controllers", "InventoryImportController.cs"),
  "utf8"
);

describe("estado de coincidencias de inventario del panel", () => {
  it("expone solo campos de lectura del snapshot más reciente", () => {
    expect(backendSource).toContain("latestSnapshotAvailable = latestSnapshot is not null");
    expect(backendSource).toContain("latestSnapshotObservedAtUtc = latestSnapshot?.ObservedAtUtc");
    expect(backendSource).toContain("comparableIdentifierTypes = GetComparableIdentifierTypes");
    expect(source).toContain("latestSnapshotAvailable: Boolean(item?.latestSnapshotAvailable)");
    expect(source).toContain("latestSnapshotObservedAtUtc: item?.latestSnapshotObservedAtUtc || \"\"");
  });

  it("mantiene la suma de estados igual al total del alcance", () => {
    expect(source).toContain("const total = counts.seen + counts.notSeen + counts.noIdentifier;");
    expect(source).toContain("counts.seen > 0 ?");
    expect(source).toContain("counts.notSeen > 0 ?");
    expect(source).toContain("counts.noIdentifier > 0 ?");
    expect(source).toContain("const matchFilteredDevices = matchFilter === \"not_seen\"");
  });

  it("usa proporciones de conteo para la barra y evita divisiones por cero", () => {
    expect(source).toContain("const getInventoryMatchSegmentWidth = (count, total) => (total > 0 ? `${(count / total) * 100}%` : \"0%\");");
    expect(source).toContain("getInventoryMatchSegmentWidth(segment.count, total)");
    expect(source).toContain("total > 0");
    expect(source).toContain("Sin equipos");
  });

  it("etiqueta el alcance del piso y del edificio completo", () => {
    expect(source).toContain('deviceScope === "building" ? "Edificio completo" : `Piso ${floorLabel}`');
    expect(source).toContain("Coincidencias · ${scopeLabel}");
  });

  it("conserva la fecha única con el formateador del sistema", () => {
    expect(source).toContain("const snapshotLabel = formatSyncTimestamp(snapshotDate);");
    expect(source).toContain("const snapshotTooltip = `Última captura: ${snapshotLabel}. Este dato proviene de la última captura de red, no de la conexión en tiempo real.`;");
    expect(source).toContain('year: "numeric"');
    expect(source).toContain("hour12: false");
    expect(source).toContain("timeZone: DISPLAY_TIME_ZONE");
  });

  it("conserva el sector activo dentro del alcance del listado", () => {
    expect(source).toContain("return { activeQuery, activeType, activeSectorFilter, queryFilteredDevices, filteredDevices };");
    expect(source).toContain("const { activeQuery, activeType, activeSectorFilter, queryFilteredDevices, filteredDevices } = filterPanelDevices(");
  });

  it("usa las salas del backend sin solicitar archivos estaticos inexistentes", () => {
    expect(source).toContain("const [backendRooms, manualRooms] = await Promise.all([");
    expect(source).not.toContain("data/interiors/${building.id}/floor_");
    expect(source).not.toContain("data/interiors/${building.id}/building_detail.json");
  });

  it("usa el icono de coincidencias de la vista general en el boton del edificio", () => {
    expect(source).toContain('<span class="session-mode-match-icon" aria-hidden="true"></span>');
    expect(source).toContain("window.toggleBuildingMatchInPanel");
    expect(source).toContain('aria-pressed="${String(matchActive)}"');
    expect(source).toContain("Mostrar coincidencias de inventario en el mapa");
  });

  it("mantiene la escala del mapa general y separa sin identificador", () => {
    expect(source).toContain("const seenColor = buildingMatchColor(100)");
    expect(source).toContain("const notSeenColor = buildingMatchColor(0)");
    expect(source).toContain('const noIdentifierColor = "#2563eb"');
    expect(source).toContain("building-panel-inventory-match-bar");
  });
});
