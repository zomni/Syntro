import { identifiers } from "../utils/identifiers.js";

describe("identifiers", () => {
  test("uses the configured instance prefix", () => {
    expect(identifiers.prefix).toBe("syntro");
  });

  test("scopes localStorage keys with the prefix", () => {
    expect(identifiers.storage.buildingBackup).toBe("syntro_building_backup");
    expect(identifiers.storage.walkingRoutesBackup).toBe("syntro_walking_routes_backup");
    expect(identifiers.storage.networkTelemetry).toBe("syntro_network_telemetry");
  });

  test("scopes event names with the prefix", () => {
    expect(identifiers.events.sessionChanged).toBe("syntro-session-changed");
    expect(identifiers.events.adminMapToolMode).toBe("syntro-admin-map-tool-mode");
    expect(identifiers.events.mapDataRefreshed).toBe("syntro-map-data-refreshed");
    expect(identifiers.events.sitesLoaded).toBe("syntro-sites-loaded");
    expect(identifiers.events.campusChanged).toBe("syntro-campus-changed");
  });

  test("scopes globals and window name with the prefix", () => {
    expect(identifiers.globals.adminMapToolMode).toBe("syntroAdminMapToolMode");
    expect(identifiers.windowName).toBe("syntro-dashboard");
  });
});
