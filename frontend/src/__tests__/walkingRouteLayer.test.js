// Regresion del toggle "Mostrar rutas".
//
// Un refactor automatico cambio `routesLayer?.clearLayers()` por
// `routesLayer && clearLayers()` y `window.sessionStorage?.setItem()` por
// `window.sessionStorage && setItem()`. Los dos pierden el receptor, lanzan
// ReferenceError y abortan setWalkingRoutesVisible antes de
// updateButtonState() y renderWalkingRoutesLayer(): el boton se queda en
// "Mostrar rutas" y no se dibuja ninguna ruta. El build pasaba porque
// webpack solo valida exports, no identificadores libres.
//
// Acqui no hay jsdom instalado, asi que window, document y L se stubban a mano.

jest.mock("../views/map.js", () => ({
  map: { addLayer: jest.fn() },
  BACKEND_API_URL: "http://api.test",
}));

jest.mock("../utils/walkingRouteStorage.js", () => ({
  loadWalkingRouteNetwork: jest.fn(),
}));

jest.mock("../utils/goToCampus.js", () => ({
  getActiveCampus: () => "sotero",
}));

jest.mock("../utils/campusConfig.js", () => ({
  getPrimaryCampusKey: () => "sotero",
}));

const { identifiers } = require("../utils/identifiers.js");

const ROUTES_NETWORK = {
  nodes: [
    { externalId: "N1", latitude: -33.001, longitude: -71.001 },
    { externalId: "N2", latitude: -33.002, longitude: -71.002 },
  ],
  edges: [{ fromNodeExternalId: "N1", toNodeExternalId: "N2", status: "open" }],
};

const createSessionStorage = (seed = {}) => {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
};

const createButton = () => ({
  textContent: "",
  dataset: {},
  attributes: {},
  listeners: {},
  classList: { toggle: jest.fn() },
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  },
  setAttribute(name, value) {
    this.attributes[name] = value;
  },
  click() {
    this.listeners.click?.({ preventDefault() {}, stopPropagation() {} });
  },
});

const setupGlobals = ({ sessionStorage, button }) => {
  const polylines = [];
  const layerGroup = {
    clearLayers: jest.fn(),
    bringToFront: jest.fn(),
    addTo: jest.fn(),
  };
  layerGroup.addTo.mockReturnValue(layerGroup);

  global.window = {
    sessionStorage,
    addEventListener: jest.fn(),
  };
  global.document = { getElementById: () => button };
  global.L = {
    layerGroup: () => layerGroup,
    polyline: (points, options) => {
      const polyline = { points, options, addTo: jest.fn() };
      polyline.addTo.mockReturnValue(polyline);
      polylines.push(polyline);
      return polyline;
    },
    DomEvent: { disableClickPropagation: jest.fn() },
  };

  return { layerGroup, polylines };
};

// Deja correr las microtareas del render, que es async.
const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

// Un solo registro de modulos: el mock del storage y el modulo bajo prueba
// tienen que salir del mismo require para que se vean entre si.
const loadModule = () => {
  const storage = require("../utils/walkingRouteStorage.js");
  storage.loadWalkingRouteNetwork.mockReset();
  storage.loadWalkingRouteNetwork.mockResolvedValue(ROUTES_NETWORK);

  return {
    layerModule: require("../components/walkingRouteLayer.js"),
    storage,
  };
};

describe("walkingRouteLayer", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
    delete global.L;
  });

  // Este es el caso que reporto el usuario: la visibilidad guardada era "false",
  // asi que un click en "Mostrar rutas" debia pintar la red.
  it("pinta las rutas al pasar de oculto a visible y actualiza la etiqueta", async () => {
    const sessionStorage = createSessionStorage({
      [identifiers.storage.walkingRoutesVisible]: "false",
    });
    const button = createButton();
    const { polylines } = setupGlobals({ sessionStorage, button });

    const { layerModule, storage } = loadModule();
    layerModule.bindWalkingRouteToggleButton(button);

    expect(button.textContent).toBe("Mostrar rutas");

    button.click();
    await flush();

    expect(storage.loadWalkingRouteNetwork).toHaveBeenCalledWith("sotero");
    expect(polylines).toHaveLength(1);
    expect(polylines[0].points).toEqual([
      [-33.001, -71.001],
      [-33.002, -71.002],
    ]);
    expect(polylines[0].addTo).toHaveBeenCalled();
    expect(button.textContent).toBe("Ocultar rutas");
    expect(sessionStorage.getItem(identifiers.storage.walkingRoutesVisible)).toBe("true");
  });

  it("limpia la capa al pasar de visible a oculto", async () => {
    const sessionStorage = createSessionStorage({
      [identifiers.storage.walkingRoutesVisible]: "true",
    });
    const button = createButton();
    const { layerGroup, polylines } = setupGlobals({ sessionStorage, button });

    const { layerModule } = loadModule();
    layerModule.initWalkingRouteLayer();
    layerModule.bindWalkingRouteToggleButton(button);
    await flush();

    expect(polylines).toHaveLength(1);
    expect(button.textContent).toBe("Ocultar rutas");

    layerGroup.clearLayers.mockClear();

    button.click();
    await flush();

    expect(layerGroup.clearLayers).toHaveBeenCalled();
    expect(button.textContent).toBe("Mostrar rutas");
    expect(sessionStorage.getItem(identifiers.storage.walkingRoutesVisible)).toBe("false");
  });

  it("dibuja al cargar cuando no hay visibilidad guardada", async () => {
    const sessionStorage = createSessionStorage();
    const button = createButton();
    const { polylines } = setupGlobals({ sessionStorage, button });

    const { layerModule } = loadModule();
    layerModule.initWalkingRouteLayer();
    await flush();

    expect(polylines).toHaveLength(1);
    expect(button.textContent).toBe("Ocultar rutas");
  });

  it("no dibuja nada cuando no hay red", async () => {
    const sessionStorage = createSessionStorage({
      [identifiers.storage.walkingRoutesVisible]: "false",
    });
    const button = createButton();
    const { polylines } = setupGlobals({ sessionStorage, button });

    const { layerModule, storage } = loadModule();
    storage.loadWalkingRouteNetwork.mockResolvedValue({ nodes: [], edges: [] });
    layerModule.bindWalkingRouteToggleButton(button);

    button.click();
    await flush();

    expect(polylines).toHaveLength(0);
    // Aunque no haya red, la etiqueta debe quedar coherente con el estado.
    expect(button.textContent).toBe("Ocultar rutas");
  });

  // Guarda directa contra los dos regresores: un `&&` en vez de `?.` rompe el
  // receptor y el ReferenceError deja el toggle congelado.
  it("no deja identificadores libres en los puntos donde antes hubo ReferenceError", () => {
    const source = require("fs").readFileSync(
      require("path").join(__dirname, "..", "components", "walkingRouteLayer.js"),
      "utf8"
    );

    expect(source).not.toMatch(/&&\s*(clearLayers|setItem)\s*\(/);
    expect(source).toMatch(/routesLayer\?\.clearLayers\(\)/);
    expect(source).toMatch(/window\.sessionStorage\?\.setItem\(/);
  });
});