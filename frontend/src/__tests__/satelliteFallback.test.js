jest.mock("../lib/leaflet/leaflet.js", () => ({}));
jest.mock("../config/siteConfig.js", () => ({
  getSitesSource: () => "local",
}));
jest.mock("../config/appConfig.js", () => ({ appConfig: {} }));

describe("satellite tile circuit breaker", () => {
  let map, osm, satellite, images, click, storage, container, windowEvents, createdLayers;

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
    createdLayers = [];
    map = {
      setView() { return this; },
      createPane: () => ({ style: {} }),
      handlers: {},
      on(type, handler) { this.handlers[type] = handler; },
      hasLayer: (layer) => layers.has(layer),
      getContainer: () => container,
    };
    const makeLayer = (url, options) => {
      const layer = {
      url, options,
      handlers: {},
      on(type, handler) { (this.handlers[type] ||= []).push(handler); return this; },
      addTo() { if (!layers.has(this)) { layers.add(this); this.fire("add"); } return this; },
      remove() { if (layers.delete(this)) this.fire("remove"); return this; },
      _wrapCoords: (coords) => ({ ...coords, x: ((coords.x % (2 ** coords.z)) + (2 ** coords.z)) % (2 ** coords.z) }),
      fire(type, event = {}) { (this.handlers[type] || []).forEach((handler) => handler(event)); },
      };
      createdLayers.push(layer);
      return layer;
    };
    global.L = { map: () => map, tileLayer: makeLayer, divIcon: () => ({}), Util: { template: (url, data) => url.replace(/\{(\w+)\}/g, (_, key) => data[key]) } };
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

  test("starts with satellite even when streets was saved", () => {
    jest.resetModules();
    storage.getItem.mockReturnValue("streets");
    ({ osmLayer: osm, satelliteLayer: satellite } = require("../views/map.js"));
    expect(map.hasLayer(satellite)).toBe(true);
    expect(require("../views/map.js").getSatellitePreference()).toBe(true);
  });

  test("uses spaced single probes and restores satellite only on success", () => {
    open(satellite);
    fail(satellite);
    jest.advanceTimersByTime(30000);
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/1");
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

  test("aborted zoom tiles cannot trigger fallback or leave timers", () => {
    const tiles = [startTile(), startTile(), startTile()];
    tiles.forEach((tile) => satellite.fire("tileabort", { tile }));
    jest.advanceTimersByTime(10000);
    expect(map.hasLayer(satellite)).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  test("only the active provider has a bounded underlay, including fallback and recovery", () => {
    const [osmUnderlay, satelliteUnderlay] = createdLayers.slice(2);
    expect(satelliteUnderlay.options).toMatchObject({ tileSize: 1024, zoomOffset: -2, keepBuffer: 0, pane: "baseUnderlay" });
    expect(satelliteUnderlay.options.attribution).toBeUndefined();
    expect(map.hasLayer(satelliteUnderlay)).toBe(true);
    expect(map.hasLayer(osmUnderlay)).toBe(false);
    for (let i = 0; i < 3; i++) satelliteUnderlay.fire("tileerror", { coords: { x: 1, y: 2, z: 3 } });
    expect(map.hasLayer(satellite)).toBe(true);
    open(satellite);
    expect(map.hasLayer(satelliteUnderlay)).toBe(false);
    expect(map.hasLayer(osmUnderlay)).toBe(true);
    jest.advanceTimersByTime(30000);
    images[0].onload();
    expect(map.hasLayer(osmUnderlay)).toBe(false);
    expect(map.hasLayer(satelliteUnderlay)).toBe(true);
    satellite.remove();
    osm.addTo(map);
    expect(map.hasLayer(satelliteUnderlay)).toBe(false);
    expect(map.hasLayer(osmUnderlay)).toBe(true);
  });

  test("probe uses the failed tile zoom and wrapped coordinates after removal", () => {
    const coords = { x: -1, y: 2, z: 3 };
    for (let i = 0; i < 3; i++) satellite.fire("tileerror", { coords });
    jest.advanceTimersByTime(30000);
    expect(images[0].src).toBe("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/7");
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
