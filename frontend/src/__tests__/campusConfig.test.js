import {
  getPrimaryCampusKey,
  getDataFileNames,
  getCatalogFileName,
  getBackupFileName,
} from "../utils/campusConfig.js";

describe("campusConfig", () => {
  test("keeps the primary campus available without an authenticated session", () => {
    expect(getPrimaryCampusKey()).toBe("sotero");
  });

  test("derives data file names from school + explicit campus key", () => {
    const names = getDataFileNames("sotero");
    expect(names.search).toBe("data/cs_sotero_search.json");
    expect(names.floor("1")).toBe("data/cs_sotero_1.json");
    expect(names.floor("b1")).toBe("data/cs_sotero_b1.json");
  });

  test("derives no data file names without a campus", () => {
    const names = getDataFileNames("");
    expect(names.search).toBe("data/tmpl__search.json");
    expect(names.floor("1")).toBe("data/tmpl__1.json");
  });

  test("derives catalog and backup file names from explicit campus key", () => {
    expect(getCatalogFileName("sotero")).toBe("data/sotero_buildings_catalog.json");
    expect(getBackupFileName("sotero")).toBe("data/sotero_buildings_backend_backup.json");
  });
});
