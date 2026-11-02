const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { createBuildingNameLabelController, getBuildingDisplayName } = require("../utils/buildingNameLabelController.js");

const source = fs.readFileSync(path.join(__dirname, "..", "views", "featureDisplay.js"), "utf8");
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing section: ${start}`);
  return source.slice(from, to);
};

test("the real tooltip binding registers, updates, removes and re-adds its layer", async () => {
  const request = {};
  request.promise = new Promise((resolve) => { request.resolve = resolve; });
  const context = vm.createContext({
    createBuildingNameLabelController,
    getFeatureDisplayName: getBuildingDisplayName,
    loadBuildingsCatalog: () => request.promise,
    getCurrentCampusKey: () => "campus",
    buildingLabelsVisible: true,
    setBuildingLabelsVisible: jest.fn(),
    scheduleReconcileBuildingNameLabels: jest.fn(),
  });
  vm.runInContext(section("const getFeatureMapLabel =", "const normalizeDeviceKey =") +
    "this.bind = bindBuildingNameLabel; this.controller = buildingNameLabels;", context);

  const handlers = {};
  const layer = {
    bindTooltip: jest.fn(),
    setTooltipContent: jest.fn(),
    openTooltip: jest.fn(),
    on: (event, handler) => { handlers[event] = handler; },
  };
  const feature = { properties: { id: "a", name: "Old" } };
  context.bind(feature, layer);
  expect(layer.bindTooltip).toHaveBeenCalled();
  expect(layer.setTooltipContent).toHaveBeenLastCalledWith('<span title="Old">Old</span>');
  handlers.remove();
  request.resolve({ buildings: [{ id: "a", searchTitle: 'New & "safe"' }] });
  await context.controller.refresh();
  expect(layer.setTooltipContent).toHaveBeenCalledTimes(1);
  handlers.add();
  expect(layer.setTooltipContent).toHaveBeenLastCalledWith('<span title="New &amp; &quot;safe&quot;">New &amp; &quot;safe&quot;</span>');
});

test("rendering an empty equipment list does not access label-layer variables", () => {
  const context = vm.createContext({
    buildRoomsMap: () => new Map(),
    filterPanelDevices: () => ({ filteredDevices: [], queryFilteredDevices: [] }),
    escapeHtml: (value) => value,
  });
  vm.runInContext(section("const buildDevicesListHtml =", "const buildHistorySummaryHtml =") +
    "this.build = buildDevicesListHtml;", context);
  expect(context.build("a", [], [], [], [], "Piso 1")).toContain("Piso 1");
});
