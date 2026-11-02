const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Execute the production functions in isolation: the editors are not modular DOM
// components, and these tests must never send writes to a real backend.
const source = (name) => fs.readFileSync(path.join(__dirname, "..", "components", name), "utf8");
const section = (text, start, end) => {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing editor section: ${start}`);
  return text.slice(from, to);
};
const noop = () => {};
const ring = [[1, 2], [3, 2], [3, 4], [1, 2]];
const copy = (value) => JSON.parse(JSON.stringify(value));

function roomHarness(fetch) {
  const text = source("roomEditor.js");
  const state = {
    buildingExternalId: "B / 1", selectedFloor: 1, rooms: [], markers: [],
    roomSignatures: {}, removedExternalIds: [], removedManualRoomExternalIds: [],
    removedSyncedRoomExternalIds: [], removedMarkerExternalIds: [], mode: "select",
  };
  const context = vm.createContext({
    fetch, fetchInflight: fetch, fetchMutation: fetch, currentEditorState: state, getApiUrl: () => "http://example.test",
    clearSuggestionPreviewLayers: noop, clearDrawState: noop, clearVertexMarkers: noop,
    renderBuildingBoundary: jest.fn(), renderRooms: jest.fn(), updatePopupContent: noop,
    setAdminMapToolsStatus: jest.fn(), showSaveToast: jest.fn(), destroyPopup: noop,
    clearRoomEditorState: noop, requestAdminMapToolMode: noop, refreshCurrentMapData: jest.fn(),
    window: { dispatchEvent: jest.fn() }, CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    console: { error: noop, warn: noop },
  });
  vm.runInContext([
    section(text, "const fetchBuildingGeometry", "const loadRoomsForFloor"),
    section(text, "const loadRoomsForFloor", "const createPopup"),
    section(text, "const selectRoomEditorFloor", "const clearVertexMarkers"),
    section(text, "const saveRoomEditorMarkers", "const showSaveToast"),
    section(text, "const saveRoomEditor =", "const cancelRoomEditor"),
    section(text, "const parseGeometryToCoordinates", "const METERS_PER_DEG_LAT"),
    "this.api = { selectRoomEditorFloor, saveRoomEditor };",
  ].join("\n"), context);
  return { state, context, ...context.api };
}

describe("admin editor persistence with an in-memory API", () => {
  test("edits a manual room, then reloads it after changing floors", async () => {
    const rooms = {
      1: [{ externalId: "R / 1", buildingExternalId: "B / 1", floor: 1, displayName: "Before", isManual: true, geometryJson: JSON.stringify({ coordinates: [ring] }) }],
      2: [{ externalId: "R2", floor: 2, displayName: "Other floor", isManual: true }],
    };
    const calls = [];
    const fetch = jest.fn(async (url, options = {}) => {
      calls.push([url, options]);
      const parsed = new URL(url);
      let data = [];
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        rooms[1][0] = { ...rooms[1][0], ...body, geometryJson: JSON.stringify({ coordinates: [body.coordinates] }) };
      } else if (parsed.pathname.endsWith("/geometry")) data = { floor: Number(parsed.searchParams.get("floor")) };
      else if (parsed.pathname.endsWith("/room-layouts")) data = rooms[parsed.searchParams.get("floor")];
      return { ok: true, json: async () => copy(data) };
    });
    const editor = roomHarness(fetch);
    await editor.selectRoomEditorFloor(1);
    editor.state.rooms[0].displayName = "Updated";
    await editor.saveRoomEditor();
    const write = calls.find(([, options]) => options.method === "PUT");
    expect(write[0]).toBe("http://example.test/api/manual-rooms/R%20%2F%201");
    expect(JSON.parse(write[1].body)).toMatchObject({ displayName: "Updated", floor: 1, coordinates: ring });
    expect(editor.context.refreshCurrentMapData).toHaveBeenCalledTimes(1);
    await editor.selectRoomEditorFloor(2);
    expect(editor.state.rooms[0].displayName).toBe("Other floor");
    await editor.selectRoomEditorFloor(1);
    expect(editor.state.rooms[0].displayName).toBe("Updated");
    expect(editor.state.buildingGeometry.floor).toBe(1);
    expect(calls.filter(([, options]) => !options.method).every(([, options]) => options.cache === "no-store")).toBe(true);
  });

  test("saves building geometry for the selected floor and undo retains that floor", async () => {
    const text = source("buildingGeometryEditor.js");
    const fetch = jest.fn(async () => ({ ok: true }));
    const undo = jest.fn();
    const refresh = jest.fn();
    const selected = { floor: 2 };
    const context = vm.createContext({
      fetch, BACKEND_API_URL: "http://example.test", activeBuildingId: "B1", activeMode: "edit",
      originalLatLngs: [{ lat: 2, lng: 1 }, { lat: 2, lng: 3 }, { lat: 4, lng: 3 }],
      getPreviewLatLngs: () => [{ lat: 5, lng: 6 }, { lat: 5, lng: 7 }, { lat: 8, lng: 7 }],
      getSelectedMapFloor: () => selected.floor, registerBuildingUndo: undo,
      resetSearchMetadataCaches: noop, resetBuildingsCatalogCache: noop,
      stopGeometryEditor: noop, refreshCurrentMapData: refresh, setStatus: jest.fn(),
    });
    vm.runInContext(section(text, "const latLngsToCoordinates", "const restoreOriginalShape") + "\nthis.save = saveGeometry;", context);
    await context.save();
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ buildingExternalId: "B1", floor: 2, coordinates: [[6, 5], [7, 5], [7, 8], [6, 5]] });
    selected.floor = 3;
    await undo.mock.calls[0][0].restore();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ buildingExternalId: "B1", floor: 2, coordinates: ring });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
