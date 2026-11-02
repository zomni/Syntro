jest.mock("../lib/leaflet/leaflet.js", () => ({}));
jest.mock("../config/siteConfig.js", () => ({
  getSitesSource: () => "local",
}));
jest.mock("../config/appConfig.js", () => ({ appConfig: {} }));

describe("satellite tile circuit breaker", () => {
  let map, osm, satellite, images, click, storage, container, windowEvents;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    images = [];
    global.Image = class {
      constructor() { images.push(this); }
    };
    storage = { getItem: jest.fn(() => null), setItem: jest.fn() };
    windowEvents = {};
    global.window = { localStorage: storage, location: { protocol: "http:", hostname: "localhost", port: "" }, addEventListener: (type, handler) => { windowEvents[type] = handler; } };
    container = { appendChild: jest.fn() };
    global.document = {
      createElement: () => ({ setAttribute: jest.fn() }),
      addEventListener: (type, handler) => { if (type === "click") click = handler; },
    };
    const layers = new Set();
    map = {
      setView() { return this; },
      handlers: {},
      on(type, handler) { this.handlers[type] = handler; },
      hasLayer: (layer) => layers.has(layer),
      getContainer: () => container,
    };
    const makeLayer = () => ({
      handlers: {},
      on(type, handler) { this.handlers[type] = handler; return this; },
      addTo() { layers.add(this); return this; },
      remove() { if (layers.delete(this) && this.handlers.remove) this.fire("remove"); return this; },
      getTileUrl: jest.fn(() => "https://arcgis/tile"),
      fire(type, event = {}) { this.handlers[type](event); },
    });
    global.L = { map: () => map, tileLayer: makeLayer, divIcon: () => ({}), Util: { template: () => "https://tile.openstreetmap.de/tile" } };
    ({ osmLayer: osm, satelliteLayer: satellite } = require("../views/map.js"));
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete global.L;
    delete global.Image;
    delete global.window;
    delete global.document;
  });

  const fail = (layer) => layer.fire("tileerror", { coords: { x: 1, y: 2, z: 3 } });
  const open = (layer) => { fail(layer); fail(layer); fail(layer); };
  const startTile = () => {
    const tile = {};
    satellite.fire("tileloadstart", { tile, coords: { x: 1, y: 2, z: 3 } });
    return tile;
  };

  test("starts with satellite and requires consecutive failures", () => {
    expect(map.hasLayer(satellite)).toBe(true);
    fail(satellite); fail(satellite);
    satellite.fire("tileload");
    fail(satellite); fail(satellite);
    expect(map.hasLayer(satellite)).toBe(true);
    fail(satellite);
    expect(map.hasLayer(osm)).toBe(true);
    expect(map.hasLayer(satellite)).toBe(false);
    expect(container.appendChild).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("honors a saved streets preference without starting probes", () => {
    jest.resetModules();
    storage.getItem.mockReturnValue("streets");
    ({ osmLayer: osm, satelliteLayer: satellite } = require("../views/map.js"));
    expect(map.hasLayer(osm)).toBe(true);
    expect(map.hasLayer(satellite)).toBe(false);
    fail(satellite);
    jest.advanceTimersByTime(60000);
    expect(images).toHaveLength(0);
  });

  test("uses spaced single probes and restores satellite only on success", () => {
    open(satellite);
    fail(satellite);
    jest.advanceTimersByTime(30000);
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("https://arcgis/tile");
    images[0].onerror();
    jest.advanceTimersByTime(29999);
    expect(images).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(images).toHaveLength(2);
    images[1].onload();
    expect(map.hasLayer(satellite)).toBe(true);
    expect(map.hasLayer(osm)).toBe(false);
    expect(container.appendChild.mock.calls[0][0].hidden).toBe(true);
    jest.advanceTimersByTime(60000);
    expect(images).toHaveLength(2);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("times out a stalled probe before scheduling another", () => {
    open(satellite);
    jest.advanceTimersByTime(30000);
    const staleSuccess = images[0].onload;
    jest.advanceTimersByTime(10000);
    staleSuccess();
    expect(map.hasLayer(osm)).toBe(true);
    jest.advanceTimersByTime(30000);
    expect(images).toHaveLength(2);
  });

  test("user layer choice cancels even an in-flight probe", () => {
    open(satellite);
    jest.advanceTimersByTime(30000);
    const staleSuccess = images[0].onload;
    click({ target: { closest: () => true } });
    staleSuccess();
    jest.advanceTimersByTime(60000);
    expect(map.hasLayer(osm)).toBe(true);
    expect(images).toHaveLength(1);
  });

  test("stalled tiles time out once and open the breaker", () => {
    const tiles = [startTile(), startTile(), startTile(), startTile()];
    jest.advanceTimersByTime(9999);
    expect(map.hasLayer(satellite)).toBe(true);
    jest.advanceTimersByTime(1);
    expect(map.hasLayer(osm)).toBe(true);
    expect(tiles[0].src).toMatch(/^data:image\/gif/);
    expect(tiles[1].src).toMatch(/^data:image\/gif/);
    expect(tiles[3].src).toBeUndefined();
    satellite.fire("tileerror", { tile: tiles[0], coords: { x: 1, y: 2, z: 3 } });
    satellite.fire("tileload", { tile: tiles[1] });
    jest.advanceTimersByTime(30000);
    expect(images).toHaveLength(1);
  });

  test("tile completion and unloading cancel their timeouts", () => {
    const loaded = startTile();
    const failed = startTile();
    const unloaded = startTile();
    satellite.fire("tileload", { tile: loaded });
    satellite.fire("tileerror", { tile: failed, coords: { x: 1, y: 2, z: 3 } });
    satellite.fire("tileunload", { tile: unloaded });
    jest.advanceTimersByTime(10000);
    expect(map.hasLayer(satellite)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("layer removal and page or map unload cancel pending work", () => {
    startTile(); startTile(); startTile();
    satellite.remove();
    jest.advanceTimersByTime(10000);
    expect(jest.getTimerCount()).toBe(0);
    satellite.addTo(map);
    open(satellite);
    jest.advanceTimersByTime(30000);
    const stale = images[0].onload;
    windowEvents.unload();
    stale();
    expect(jest.getTimerCount()).toBe(0);
    expect(map.hasLayer(osm)).toBe(true);
    satellite.addTo(map);
    startTile();
    map.handlers.unload();
    expect(jest.getTimerCount()).toBe(0);
  });

  test("a timed-out tile's late load cannot reset failures", () => {
    const tile = startTile();
    jest.advanceTimersByTime(10000);
    satellite.fire("tileload", { tile });
    fail(satellite); fail(satellite);
    expect(map.hasLayer(osm)).toBe(true);
  });

  test("successful satellite recovery does not hide an OSM failure", () => {
    open(satellite);
    const tile = { dataset: {}, addEventListener: jest.fn() };
    osm.fire("tileerror", { tile, coords: { x: 1, y: 2, z: 3 } });
    tile.addEventListener.mock.calls[0][1]();
    jest.advanceTimersByTime(30000);
    images[0].onload();
    expect(container.appendChild.mock.calls[0][0].hidden).toBe(false);
  });

  test("removing fallback OSM cancels a pending probe", () => {
    open(satellite);
    jest.advanceTimersByTime(30000);
    const stale = images[0].onload;
    osm.remove();
    stale();
    jest.advanceTimersByTime(60000);
    expect(map.hasLayer(satellite)).toBe(false);
    expect(images).toHaveLength(1);
    expect(container.appendChild.mock.calls[0][0].hidden).toBe(true);
  });
});
