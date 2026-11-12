function element(id = "") {
  const listeners = {};
  const classes = new Set();
  return {
    id,
    style: {},
    dataset: {},
    hidden: false,
    textContent: "",
    children: [],
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classes.has(name) : force;
        if (enabled) classes.add(name); else classes.delete(name);
        return enabled;
      },
    },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] ?? null; },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler); },
    removeEventListener(type, handler) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== handler);
    },
    dispatchEvent(event) {
      event.target = this;
      (listeners[event.type] || []).forEach((handler) => handler.call(this, event));
      if (typeof this[`on${event.type}`] === "function") this[`on${event.type}`](event);
      return true;
    },
    click() { this.dispatchEvent({ type: "click", preventDefault() {} }); },
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    },
  };
}

describe("OSM Buildings view", () => {
  let elements, head, map, OSMBuildings, instance, windowListeners;
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const script = () => head.children.find((child) => child.tagName === "SCRIPT");
  const campusChanged = () => {
    expect(windowListeners["syntro-campus-changed"]).toBeDefined();
    windowListeners["syntro-campus-changed"].forEach((handler) => handler({ type: "syntro-campus-changed" }));
  };
  const finishLoading = async () => {
    window.OSMBuildings = OSMBuildings;
    script().dispatchEvent({ type: "load" });
    await flush();
  };

  beforeEach(() => {
    jest.resetModules();
    elements = Object.fromEntries(["osm-3d-toggle", "osm-3d-return", "osm-3d-view", "osm-3d-map", "osm-3d-status", "map"]
      .map((id) => [id, element(id)]));
    head = element();
    global.document = {
      documentElement: element(),
      head,
      body: element(),
      getElementById: (id) => elements[id] || null,
      createElement: (tag) => Object.assign(element(), { tagName: tag.toUpperCase() }),
      querySelector: (selector) => selector.startsWith("#") ? elements[selector.slice(1)] || null : null,
    };
    windowListeners = {};
    global.window = {
      addEventListener: jest.fn((type, handler) => (windowListeners[type] ||= []).push(handler)),
      removeEventListener: jest.fn((type, handler) => {
        windowListeners[type] = (windowListeners[type] || []).filter((item) => item !== handler);
      }),
      localStorage: { getItem: jest.fn(() => null), setItem: jest.fn(), removeItem: jest.fn() },
    };
    map = {
      getCenter: jest.fn(() => ({ lat: -33.6, lng: -70.6 })),
      getZoom: jest.fn(() => 17),
      invalidateSize: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };
    instance = {
      addMapTiles: jest.fn(),
      addGeoJSONTiles: jest.fn(),
      setPosition: jest.fn(),
      setZoom: jest.fn(),
      setRotation: jest.fn(),
      setTilt: jest.fn(),
      on: jest.fn(),
      destroy: jest.fn(),
    };
    OSMBuildings = jest.fn(() => instance);
    require("../components/osmBuildingsView.js").initOsmBuildingsView(map);
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  test("preloads on campus change without opening the 3D view", async () => {
    expect(script()).toBeUndefined();
    campusChanged();
    expect(script()).toBeDefined();
    expect(OSMBuildings).not.toHaveBeenCalled();
    await finishLoading();
    expect(OSMBuildings).toHaveBeenCalledTimes(1);
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(false);
  });

  test("opens on toggle and closes on return", async () => {
    campusChanged();
    await finishLoading();
    elements["osm-3d-toggle"].click();
    await flush();
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(true);
    expect(OSMBuildings).toHaveBeenCalledTimes(1);

    elements["osm-3d-return"].click();
    await flush();
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(false);
    expect(map.invalidateSize).toHaveBeenCalled();
  });

  test("does not enter 3D while an admin map tool is active", async () => {
    campusChanged();
    await finishLoading();
    document.documentElement.dataset.adminMapToolMode = "edit";
    elements["osm-3d-toggle"].click();
    await flush();
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(false);
    expect(elements["osm-3d-status"].textContent).not.toBe("");
  });

  test("reports a CDN script error and retries on a later attempt", async () => {
    campusChanged();
    expect(script()).toBeDefined();
    const failedScript = script();
    failedScript.dispatchEvent({ type: "error" });
    await flush();
    expect(OSMBuildings).not.toHaveBeenCalled();
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(false);
    expect(elements["osm-3d-status"].textContent).not.toBe("");

    elements["osm-3d-toggle"].click();
    expect(script()).toBeDefined();
    expect(script()).not.toBe(failedScript);
    await finishLoading();
    expect(OSMBuildings).toHaveBeenCalledTimes(1);
    expect(elements["osm-3d-view"].classList.contains("is-active")).toBe(true);
  });
});
