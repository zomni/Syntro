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
    expect(source).toContain("${total} equipos");
    expect(source).toContain("const matchFilteredDevices = matchFilter === \"not_seen\"");
  });

  it("conserva la fecha única con el formateador del sistema", () => {
    expect(source).toContain("const snapshotLabel = formatSyncTimestamp(snapshotDate);");
    expect(source).toContain("Última captura: ${escapeHtml(snapshotLabel)}");
    expect(source).toContain("timeZone: DISPLAY_TIME_ZONE");
  });

  it("conserva el sector activo dentro del alcance del listado", () => {
    expect(source).toContain("return { activeQuery, activeType, activeSectorFilter, queryFilteredDevices, filteredDevices };");
    expect(source).toContain("const { activeQuery, activeType, activeSectorFilter, queryFilteredDevices, filteredDevices } = filterPanelDevices(");
  });
});
