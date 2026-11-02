import { createBuildingNameLabelController, getBuildingDisplayName } from "../utils/buildingNameLabelController.js";

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

const feature = (id, name = "GeoJSON") => ({ properties: { id, name } });
const catalog = (name) => ({ buildings: [{ id: "a", searchTitle: name }] });

describe("building name label lifecycle", () => {
  let loadCatalog, render, campus, controller;

  beforeEach(() => {
    campus = "one";
    loadCatalog = jest.fn();
    render = jest.fn((item, layer, building) => {
      layer.name = building ? getBuildingDisplayName(item, building) : item.properties.name;
    });
    controller = createBuildingNameLabelController({ loadCatalog, render, getCampus: () => campus });
  });

  it("uses the popup's merged name precedence and falls back to GeoJSON", async () => {
    expect(getBuildingDisplayName(feature("a"), { searchTitle: "Override", realName: "Real", displayName: "Display" })).toBe("Override");
    expect(getBuildingDisplayName(feature("a"), { realName: "Real", displayName: "Display" })).toBe("Real");
    expect(getBuildingDisplayName(feature("a"), { displayName: "Display" })).toBe("Display");
    loadCatalog.mockResolvedValue(catalog("Backend override"));
    const layer = {};
    controller.add(feature("a"), layer);
    expect(layer.name).toBe("GeoJSON");
    await controller.refresh();
    expect(layer.name).toBe("Backend override");
    loadCatalog.mockRejectedValue(new Error("offline"));
    await controller.refresh();
    expect(layer.name).toBe("GeoJSON");
    loadCatalog.mockResolvedValue({ buildings: [] });
    await controller.refresh();
    expect(layer.name).toBe("GeoJSON");
  });

  it("shares a load across layers and applies the result to late additions", async () => {
    const request = deferred();
    loadCatalog.mockReturnValue(request.promise);
    const first = {}, second = {};
    controller.add(feature("a"), first);
    controller.add(feature("a"), second);
    await Promise.resolve();
    expect(loadCatalog).toHaveBeenCalledTimes(1);
    request.resolve(catalog("Merged"));
    await request.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.name).toBe("Merged");
    expect(second.name).toBe("Merged");
    const third = {};
    controller.add(feature("a"), third);
    expect(third.name).toBe("Merged");
    expect(loadCatalog).toHaveBeenCalledTimes(1);
  });

  it("ignores older refreshes and removed layers, but updates re-added layers", async () => {
    const old = deferred(), latest = deferred();
    loadCatalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(latest.promise);
    const layer = {};
    controller.add(feature("a"), layer);
    await Promise.resolve();
    const refreshing = controller.refresh();
    await Promise.resolve();
    controller.remove(layer);
    latest.resolve(catalog("Latest"));
    await refreshing;
    expect(layer.name).toBe("GeoJSON");
    controller.add(feature("a"), layer);
    expect(layer.name).toBe("Latest");
    old.resolve(catalog("Stale"));
    await old.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(layer.name).toBe("Latest");
  });

  it("discards a previous campus request and clears its layers", async () => {
    const old = deferred(), next = deferred();
    loadCatalog.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const first = {}, second = {};
    controller.add(feature("a"), first);
    await Promise.resolve();
    campus = "two";
    controller.clear();
    controller.add(feature("a", "New campus"), second);
    await Promise.resolve();
    old.resolve(catalog("Wrong campus"));
    next.resolve(catalog("Correct campus"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.name).toBe("GeoJSON");
    expect(second.name).toBe("Correct campus");
  });
});
