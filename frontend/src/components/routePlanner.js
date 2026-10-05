import { getPrimaryCampusKey, getCatalogFileName } from "../utils/campusConfig.js";
import { getActiveCampus } from "../utils/goToCampus.js";
import { identifiers } from "../utils/identifiers.js";
import { queryFloorButtons } from "../utils/floorButtons.js";
import { BASE_FLOOR_NUMBER } from "../utils/buildingCatalog.js";
import { map } from "../views/map.js";
import { mergeCatalogWithSearch } from "@app/searchMetadata";
import { clearRouteHighlight, closeCurrentPopup, setRouteHighlight } from "@app/featureDisplay";
import { loadWalkingRouteNetwork } from "../utils/walkingRouteStorage.js?v=20260608b";

const DEFAULT_CAMPUS = () => String(getActiveCampus() || getPrimaryCampusKey() || "").trim();
const MAX_ATTEMPTS = 48;
const RETRY_DELAY_MS = 250;
// Amarillo de senalizacion: la ruta activa y sus flechas se leen como
// transito sobre el mapa, no como una alerta. El blanco de debajo hace de
// contorno, asi que un tono medio mantiene el filo definido.
const SELECTED_ROUTE_COLOR = "#eab308";

let plannerElements = null;
let routeOverlayLayer = null;
let buildingsCache = null;
let walkingRoutesCache = null;
let activeRoute = {
  originId: "",
  destinationId: "",
};
let activeRouteRequestId = 0;
let routeRequestInFlight = false;

const stopEventPropagation = (event) => {
  if (!event) return;
  event.stopPropagation();
};

const registerControlSurface = (element) => {
  if (!element || element.dataset.mapControlBound === "true") {
    return;
  }

  element.dataset.mapControlBound = "true";

  if (window.L?.DomEvent) {
    window.L.DomEvent.disableClickPropagation(element);
    window.L.DomEvent.disableScrollPropagation(element);
  }

  ["pointerdown", "mousedown", "touchstart", "dblclick", "click", "wheel"].forEach((eventName) => {
    element.addEventListener(eventName, stopEventPropagation, { passive: false });
  });
};

const getPlannerElements = () => {
  if (
    plannerElements &&
    plannerElements.toggleButton?.isConnected &&
    plannerElements.panel?.isConnected
  ) {
    return plannerElements;
  }

  const toggleButton = document.getElementById("route-planner-toggle");
  const panel = document.getElementById("route-planner-panel");
  const originSearch = document.getElementById("route-origin-search");
  const originSelect = document.getElementById("route-origin-select");
  const originOptions = document.getElementById("route-origin-options");
  const destinationSearch = document.getElementById("route-destination-search");
  const destinationSelect = document.getElementById("route-destination-select");
  const destinationOptions = document.getElementById("route-destination-options");
  const submitButton = document.getElementById("route-planner-submit");
  const clearButton = document.getElementById("route-planner-clear");
  const status = document.getElementById("route-planner-status");

  if (!toggleButton || !panel || !originSearch || !originSelect || !originOptions || !destinationSearch || !destinationSelect || !destinationOptions || !submitButton || !clearButton || !status) {
    return null;
  }

  plannerElements = {
    toggleButton,
    panel,
    originSearch,
    originSelect,
    originOptions,
    destinationSearch,
    destinationSelect,
    destinationOptions,
    submitButton,
    clearButton,
    status,
  };

  registerControlSurface(document.getElementById("top-container"));
  registerControlSurface(document.getElementById("map-status-panel"));
  registerControlSurface(panel);

  return plannerElements;
};

const ensureRouteOverlayLayer = () => {
  if (!routeOverlayLayer) {
    routeOverlayLayer = L.layerGroup().addTo(map);
  }

  return routeOverlayLayer;
};

const getBuildingDisplayName = (building) =>
  String(
    building?.displayName || building?.realName || building?.searchTitle || building?.shortName || building?.id || "Edificio"
  ).trim();

const getBuildingOptionLabel = (building) => `${getBuildingDisplayName(building)} (${building.id})`;

const buildCollator = () => new Intl.Collator("es", { sensitivity: "base", numeric: true });

const normalizeSearchText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getBuildingSearchHaystack = (building) =>
  normalizeSearchText([
    building?.id,
    building?.displayName,
    building?.realName,
    building?.searchTitle,
    building?.shortName,
    building?.alias,
  ].filter(Boolean).join(" "));

const filterBuildings = (buildings, query) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return buildings;

  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return buildings.filter((building) => {
    const haystack = getBuildingSearchHaystack(building);
    return terms.every((term) => haystack.includes(term));
  });
};

const loadBuildingsCatalog = async () => {
  if (Array.isArray(buildingsCache)) {
    return buildingsCache;
  }

  try {
    const campusKey = getActiveCampus() || getPrimaryCampusKey();
    // Sin `?v=Date.now()` ni `no-store`: el catálogo es estático y se versiona en el
    // despliegue. Antes se re-descargaban 45 KB en cada population de selectores.
    const response = await fetch(getCatalogFileName(campusKey));

    if (!response.ok) {
      throw new Error("No se pudo cargar el catálogo de edificios");
    }

    const catalog = await response.json();
    const mergedCatalog = await mergeCatalogWithSearch(catalog);
    const collator = buildCollator();

    buildingsCache = [...(mergedCatalog?.buildings || [])].sort((a, b) =>
      collator.compare(getBuildingDisplayName(a), getBuildingDisplayName(b))
    );

    return buildingsCache;
  } catch (error) {
    console.error("Error cargando catalogo para rutas entre edificios:", error);
    buildingsCache = [];
    return buildingsCache;
  }
};

const findBuildingById = async (buildingId) => {
  const buildings = await loadBuildingsCatalog();
  return buildings.find((building) => building.id === buildingId) || null;
};

const normalizeRouteStatus = (status) => String(status || "open").trim().toLowerCase();

const loadWalkingRoutes = async () => {
  if (walkingRoutesCache) {
    return walkingRoutesCache;
  }

  try {
    const data = await loadWalkingRouteNetwork(DEFAULT_CAMPUS());
    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];
    const nodesById = new Map(nodes.map((node) => [node.externalId, node]));

    walkingRoutesCache = { nodes, edges, nodesById };
    return walkingRoutesCache;
  } catch (error) {
    console.error("Error cargando rutas caminables:", error);
    walkingRoutesCache = { nodes: [], edges: [], nodesById: new Map() };
    return walkingRoutesCache;
  }
};

const resetWalkingRoutesCache = () => {
  walkingRoutesCache = null;
};

window.refreshWalkingRoutesCache = resetWalkingRoutesCache;

const nodeToLatLng = (node) => L.latLng(Number(node.latitude), Number(node.longitude));

const normalizePolygonLatLngs = (layer) => {
  const latlngs = layer?.getLatLngs?.();
  if (!Array.isArray(latlngs) || latlngs.length === 0) return [];

  const ring = Array.isArray(latlngs[0]?.[0]) ? latlngs[0][0] : latlngs[0];
  return Array.isArray(ring) ? ring : [];
};

const nearestPointOnSegment = (latlng, start, end) => {
  const point = map.latLngToLayerPoint(latlng);
  const startPoint = map.latLngToLayerPoint(start);
  const endPoint = map.latLngToLayerPoint(end);
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - startPoint.x) * dx + (point.y - startPoint.y) * dy) / lengthSquared));
  return map.layerPointToLatLng(L.point(startPoint.x + t * dx, startPoint.y + t * dy));
};

const findNearestPointOnPolygonBoundary = (targetLatLng, layer) => {
  const ring = normalizePolygonLatLngs(layer);
  if (ring.length < 2) return null;

  let bestPoint = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const candidate = nearestPointOnSegment(targetLatLng, start, end);
    const distance = map.distance(targetLatLng, candidate);
    if (distance < bestDistance) {
      bestPoint = candidate;
      bestDistance = distance;
    }
  }

  return bestPoint;
};

const findNearestRouteNode = (latlng, nodes) => {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const nodeLatLng = nodeToLatLng(node);
    const distance = map.distance(latlng, nodeLatLng);
    if (distance < bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best ? { node: best, distance: bestDistance } : null;
};

// El grafo es derivado puro de la red y la red ya está memoizada: se cachea con
// WeakMap para no reconstruirse en cada cálculo de ruta.
const routeGraphCache = new WeakMap();

const buildRouteGraph = (network) => {
  if (!network || typeof network !== "object") {
    return new Map();
  }

  const cached = routeGraphCache.get(network);
  if (cached) {
    return cached;
  }

  const graph = new Map();

  for (const node of network.nodes) {
    graph.set(node.externalId, []);
  }

  for (const edge of network.edges) {
    const status = normalizeRouteStatus(edge.status);
    if (status === "closed") {
      continue;
    }

    const from = edge.fromNodeExternalId;
    const to = edge.toNodeExternalId;
    if (!graph.has(from) || !graph.has(to)) {
      continue;
    }

    const baseWeight = Number(edge.distanceMeters) || 1;
    const weight = status === "restricted" ? baseWeight * 1.8 : baseWeight;
    const entry = { to, edge, weight };
    const reverseEntry = { to: from, edge, weight };
    graph.get(from).push(entry);
    graph.get(to).push(reverseEntry);
  }

  routeGraphCache.set(network, graph);
  return graph;
};

const calculateShortestRoute = (network, originNodeId, destinationNodeId) => {
  const graph = buildRouteGraph(network);
  const distances = new Map();
  const previous = new Map();
  const visited = new Set();
  const queue = new Set(graph.keys());

  graph.forEach((_, nodeId) => distances.set(nodeId, Number.POSITIVE_INFINITY));
  distances.set(originNodeId, 0);

  while (queue.size > 0) {
    let current = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const nodeId of queue) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        current = nodeId;
        currentDistance = distance;
      }
    }

    if (!current || currentDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    queue.delete(current);
    visited.add(current);

    if (current === destinationNodeId) {
      break;
    }

    for (const next of graph.get(current) || []) {
      if (visited.has(next.to)) {
        continue;
      }

      const candidate = currentDistance + next.weight;
      if (candidate < (distances.get(next.to) ?? Number.POSITIVE_INFINITY)) {
        distances.set(next.to, candidate);
        previous.set(next.to, { nodeId: current, edge: next.edge });
      }
    }
  }

  if (!previous.has(destinationNodeId) && originNodeId !== destinationNodeId) {
    return null;
  }

  const nodeIds = [destinationNodeId];
  const edges = [];
  let cursor = destinationNodeId;

  while (cursor !== originNodeId) {
    const step = previous.get(cursor);
    if (!step) {
      return null;
    }

    edges.unshift(step.edge);
    cursor = step.nodeId;
    nodeIds.unshift(cursor);
  }

  return { nodeIds, edges, distance: distances.get(destinationNodeId) || 0 };
};

const setStatus = (message, tone = "neutral") => {
  const ui = getPlannerElements();
  if (!ui) return;

  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
};

const updateSubmitState = () => {
  const ui = getPlannerElements();
  if (!ui) return;

  const hasOrigin = !!ui.originSelect.value;
  const hasDestination = !!ui.destinationSelect.value;
  ui.submitButton.disabled = routeRequestInFlight || !(hasOrigin && hasDestination);
};

const getBuildingById = (buildings, buildingId) =>
  buildings.find((building) => building.id === buildingId) || null;

const setComboboxOpen = (searchInput, optionsElement, shouldOpen) => {
  if (!searchInput || !optionsElement) return;

  optionsElement.hidden = !shouldOpen;
  searchInput.setAttribute("aria-expanded", String(shouldOpen));
};

const closeComboboxes = () => {
  const ui = getPlannerElements();
  if (!ui) return;

  setComboboxOpen(ui.originSearch, ui.originOptions, false);
  setComboboxOpen(ui.destinationSearch, ui.destinationOptions, false);
};

const selectComboboxBuilding = (hiddenInput, searchInput, optionsElement, building) => {
  if (!hiddenInput || !searchInput || !optionsElement || !building) return;

  hiddenInput.value = building.id;
  searchInput.value = getBuildingOptionLabel(building);
  setComboboxOpen(searchInput, optionsElement, false);
  updateSubmitState();
};

const renderComboboxOptions = (hiddenInput, searchInput, optionsElement, buildings, selectedValue, query = "") => {
  if (!hiddenInput || !searchInput || !optionsElement) return;

  const filteredBuildings = filterBuildings(buildings, query).slice(0, 80);
  const selectedBuilding = selectedValue ? getBuildingById(buildings, selectedValue) : null;
  const visibleBuildings = [...filteredBuildings];

  if (selectedBuilding && !visibleBuildings.some((building) => building.id === selectedBuilding.id)) {
    visibleBuildings.unshift(selectedBuilding);
  }

  optionsElement.innerHTML = "";

  if (selectedBuilding && !query) {
    searchInput.value = getBuildingOptionLabel(selectedBuilding);
  }

  if (visibleBuildings.length === 0) {
    const emptyOption = document.createElement("div");
    emptyOption.className = "route-building-option route-building-option-empty";
    emptyOption.textContent = query ? "Sin resultados" : "Empieza a escribir para buscar";
    optionsElement.append(emptyOption);
    return;
  }

  for (const building of visibleBuildings) {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "route-building-option";
    optionButton.dataset.value = building.id;
    optionButton.setAttribute("role", "option");
    optionButton.setAttribute("aria-selected", String(building.id === selectedValue));
    optionButton.textContent = getBuildingOptionLabel(building);
    optionButton.addEventListener("click", () => {
      selectComboboxBuilding(hiddenInput, searchInput, optionsElement, building);
    });
    optionsElement.append(optionButton);
  }
};

const getFirstComboboxOption = (optionsElement) =>
  optionsElement?.querySelector(".route-building-option[data-value]") || null;

const moveComboboxFocus = (optionsElement, direction = 1) => {
  const options = Array.from(optionsElement?.querySelectorAll(".route-building-option[data-value]") || []);
  if (options.length === 0) return;

  const currentIndex = options.findIndex((option) => option === document.activeElement);
  const nextIndex =
    currentIndex < 0
      ? 0
      : (currentIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
};

const populateBuildingSelectors = async (preserveSelection = true) => {
  const ui = getPlannerElements();
  if (!ui) return;

  const selectedOrigin = preserveSelection ? ui.originSelect.value : activeRoute.originId || "";
  const selectedDestination = preserveSelection ? ui.destinationSelect.value : activeRoute.destinationId || "";
  const buildings = await loadBuildingsCatalog();

  renderComboboxOptions(ui.originSelect, ui.originSearch, ui.originOptions, buildings, selectedOrigin, ui.originSearch.value);
  renderComboboxOptions(ui.destinationSelect, ui.destinationSearch, ui.destinationOptions, buildings, selectedDestination, ui.destinationSearch.value);
  updateSubmitState();
};

const COMBOBOX_DEBOUNCE_MS = 120;

// renderComboboxOptions vacía el innerHTML y reconstruye hasta 80 opciones, así que
// sin debounce se hacía eso en cada tecla y en cada focus.
const comboboxTimers = new WeakMap();

const scheduleComboboxRefresh = (hiddenInput, searchInput, optionsElement) => {
  const pending = comboboxTimers.get(searchInput);
  if (pending) {
    window.clearTimeout(pending);
  }

  comboboxTimers.set(
    searchInput,
    window.setTimeout(() => {
      comboboxTimers.delete(searchInput);
      void refreshCombobox(hiddenInput, searchInput, optionsElement);
    }, COMBOBOX_DEBOUNCE_MS)
  );
};

const refreshCombobox = async (hiddenInput, searchInput, optionsElement) => {
  const buildings = await loadBuildingsCatalog();
  renderComboboxOptions(hiddenInput, searchInput, optionsElement, buildings, hiddenInput.value, searchInput.value);
  setComboboxOpen(searchInput, optionsElement, true);
  updateSubmitState();
};

const bindComboboxEvents = (hiddenInput, searchInput, optionsElement) => {
  searchInput.addEventListener("focus", () => {
    scheduleComboboxRefresh(hiddenInput, searchInput, optionsElement);
  });

  searchInput.addEventListener("input", () => {
    hiddenInput.value = "";
    scheduleComboboxRefresh(hiddenInput, searchInput, optionsElement);
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setComboboxOpen(searchInput, optionsElement, true);
      moveComboboxFocus(optionsElement, 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setComboboxOpen(searchInput, optionsElement, true);
      moveComboboxFocus(optionsElement, -1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const firstOption = getFirstComboboxOption(optionsElement);
      firstOption?.click();
      return;
    }

    if (event.key === "Escape") {
      setComboboxOpen(searchInput, optionsElement, false);
    }
  });

  optionsElement.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveComboboxFocus(optionsElement, 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveComboboxFocus(optionsElement, -1);
      return;
    }

    if (event.key === "Escape") {
      setComboboxOpen(searchInput, optionsElement, false);
      searchInput.focus();
    }
  });
};

const togglePanel = async (forceOpen) => {
  const ui = getPlannerElements();
  if (!ui) return;

  const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : ui.panel.hidden;
  ui.panel.hidden = !shouldOpen;
  ui.toggleButton.setAttribute("aria-expanded", String(shouldOpen));

  if (shouldOpen) {
    await populateBuildingSelectors(true);
  } else {
    closeComboboxes();
  }
};

const getFeatureLayerById = (featureId) => {
  return getFeatureLayersByIds([featureId]).get(featureId) || null;
};

// Resuelve varios ids en una sola pasada sobre las capas del mapa. Pedir origen y
// destino por separado recorría el árbol de capas dos veces.
const getFeatureLayersByIds = (featureIds) => {
  const wanted = new Set((featureIds || []).filter(Boolean));
  const matched = new Map();

  if (wanted.size === 0) {
    return matched;
  }

  const stillWanted = new Set(wanted);

  const inspect = (layer) => {
    const layerId = layer?.feature?.properties?.id;
    if (layerId && stillWanted.has(layerId)) {
      matched.set(layerId, layer);
      stillWanted.delete(layerId);
    }
  };

  map.eachLayer((layer) => {
    if (stillWanted.size === 0) {
      return;
    }

    inspect(layer);

    if (stillWanted.size > 0 && typeof layer?.eachLayer === "function") {
      layer.eachLayer((childLayer) => {
        if (stillWanted.size === 0) {
          return;
        }
        inspect(childLayer);
      });
    }
  });

  return matched;
};

const getFloorButtons = () => queryFloorButtons();

const getFloorButtonForValue = (floorValue) => {
  const normalizedFloor = String(floorValue ?? BASE_FLOOR_NUMBER).trim();
  return (
    getFloorButtons().find(
      (button) => String((button.textContent || "").trim()) === normalizedFloor
    ) || null
  );
};

const waitForFloorButtons = (callback, attempt = 0) => {
  const floorButtons = getFloorButtons();
  if (floorButtons.length > 0) {
    callback(floorButtons);
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    console.warn("No se encontraron botones de piso para la ruta entre edificios.");
    callback([]);
    return;
  }

  window.setTimeout(() => waitForFloorButtons(callback, attempt + 1), RETRY_DELAY_MS);
};

const activateOverviewFloor = (requestId, callback) => {
  closeCurrentPopup();

  waitForFloorButtons((floorButtons) => {
    if (requestId !== activeRouteRequestId) {
      return;
    }

    const overviewButton = getFloorButtonForValue(BASE_FLOOR_NUMBER) || floorButtons[0] || null;

    if (!overviewButton || overviewButton.classList.contains("selectedFloorButton")) {
      callback();
      return;
    }

    overviewButton.click();
    window.setTimeout(() => {
      if (requestId !== activeRouteRequestId) {
        return;
      }
      callback();
    }, RETRY_DELAY_MS);
  });
};

const getBuildingLatLng = (building, layer) => {
  if (typeof layer?.getBounds === "function") {
    return layer.getBounds().getCenter();
  }

  if (typeof layer?.getLatLng === "function") {
    return layer.getLatLng();
  }

  if (Array.isArray(building?.centroid) && building.centroid.length >= 2) {
    return L.latLng(Number(building.centroid[1]), Number(building.centroid[0]));
  }

  return null;
};

const getBuildingAccessLatLng = (building, layer, network) => {
  const fallback = getBuildingLatLng(building, layer);
  if (!fallback || !Array.isArray(network?.nodes) || network.nodes.length === 0) {
    return fallback;
  }

  const nearestToCenter = findNearestRouteNode(fallback, network.nodes);
  if (!nearestToCenter) {
    return fallback;
  }

  const routeLatLng = nodeToLatLng(nearestToCenter.node);
  return findNearestPointOnPolygonBoundary(routeLatLng, layer) || fallback;
};

const buildRouteBounds = (originLatLng, destinationLatLng, originLayer, destinationLayer) => {
  const bounds = L.latLngBounds([originLatLng, destinationLatLng]);

  if (typeof originLayer?.getBounds === "function") {
    bounds.extend(originLayer.getBounds());
  }

  if (typeof destinationLayer?.getBounds === "function") {
    bounds.extend(destinationLayer.getBounds());
  }

  return bounds;
};

const interpolateLatLng = (start, end, fraction) =>
  L.latLng(
    start.lat + (end.lat - start.lat) * fraction,
    start.lng + (end.lng - start.lng) * fraction
  );

const getArrowRotation = (originLatLng, destinationLatLng) => {
  const originPoint = map.latLngToLayerPoint(originLatLng);
  const destinationPoint = map.latLngToLayerPoint(destinationLatLng);
  return (Math.atan2(destinationPoint.y - originPoint.y, destinationPoint.x - originPoint.x) * 180) / Math.PI;
};

const createArrowMarker = (latlng, rotation) =>
  L.marker(latlng, {
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "route-arrow-icon-container",
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      html: `
        <div class="route-arrow-marker" style="transform: rotate(${rotation}deg);">
          <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden="true">
            <path d="M4 14 H18" stroke="${SELECTED_ROUTE_COLOR}" stroke-width="3.5" stroke-linecap="round" />
            <path d="M14 9 L20 14 L14 19" fill="none" stroke="${SELECTED_ROUTE_COLOR}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
      `,
    }),
  });

const clearRouteOverlay = () => {
  if (routeOverlayLayer) {
    routeOverlayLayer.clearLayers();
  }
};

const resolveRouteGeometry = async (originId, destinationId, originLayer, destinationLayer) => {
  const [originBuilding, destinationBuilding] = await Promise.all([
    findBuildingById(originId),
    findBuildingById(destinationId),
  ]);

  const network = await loadWalkingRoutes();
  const originLatLng = getBuildingAccessLatLng(originBuilding, originLayer, network);
  const destinationLatLng = getBuildingAccessLatLng(destinationBuilding, destinationLayer, network);

  if (!originLatLng || !destinationLatLng) {
    return null;
  }

  const nearestOrigin = findNearestRouteNode(originLatLng, network.nodes);
  const nearestDestination = findNearestRouteNode(destinationLatLng, network.nodes);
  const shortestRoute =
    nearestOrigin && nearestDestination
      ? calculateShortestRoute(network, nearestOrigin.node.externalId, nearestDestination.node.externalId)
      : null;

  if (shortestRoute) {
    const routeLatLngs = [
      originLatLng,
      ...shortestRoute.nodeIds
        .map((nodeId) => network.nodesById.get(nodeId))
        .filter(Boolean)
        .map(nodeToLatLng),
      destinationLatLng,
    ];
    const bounds = L.latLngBounds(routeLatLngs);
    const hasRestrictedSegments = shortestRoute.edges.some(
      (edge) => normalizeRouteStatus(edge.status) === "restricted"
    );

    return {
      originBuilding,
      destinationBuilding,
      originLatLng,
      destinationLatLng,
      routeLatLngs,
      routeEdges: shortestRoute.edges,
      hasWalkingNetwork: true,
      routeUnavailable: false,
      hasRestrictedSegments,
      bounds,
    };
  }

  if (network.nodes.length > 0 && nearestOrigin && nearestDestination) {
    return {
      originBuilding,
      destinationBuilding,
      originLatLng,
      destinationLatLng,
      routeLatLngs: [originLatLng, destinationLatLng],
      routeEdges: [],
      hasWalkingNetwork: true,
      routeUnavailable: true,
      hasRestrictedSegments: false,
      bounds: buildRouteBounds(originLatLng, destinationLatLng, originLayer, destinationLayer),
    };
  }

  return {
    originBuilding,
    destinationBuilding,
    originLatLng,
    destinationLatLng,
    routeLatLngs: [originLatLng, destinationLatLng],
    routeEdges: [],
    hasWalkingNetwork: false,
    routeUnavailable: false,
    hasRestrictedSegments: false,
    bounds: buildRouteBounds(originLatLng, destinationLatLng, originLayer, destinationLayer),
  };
};

const focusRouteOnMap = async (originId, destinationId, originLayer, destinationLayer) => {
  const routeGeometry = await resolveRouteGeometry(originId, destinationId, originLayer, destinationLayer);
  if (!routeGeometry) {
    return null;
  }

  if (typeof map.stop === "function") {
    map.stop();
  }

  map.fitBounds(routeGeometry.bounds.pad(0.22), {
    maxZoom: 19,
    padding: [70, 70],
    animate: false,
  });

  return routeGeometry;
};

const buildRouteDescription = async (originId, destinationId) => {
  const [originBuilding, destinationBuilding] = await Promise.all([
    findBuildingById(originId),
    findBuildingById(destinationId),
  ]);

  return `${getBuildingDisplayName(originBuilding)} -> ${getBuildingDisplayName(destinationBuilding)}`;
};

const renderRoute = async (originId, destinationId, originLayer, destinationLayer, requestId = activeRouteRequestId) => {
  if (requestId !== activeRouteRequestId) {
    return;
  }

  const routeGeometry = await focusRouteOnMap(originId, destinationId, originLayer, destinationLayer);

  if (requestId !== activeRouteRequestId) {
    return;
  }

  if (!routeGeometry) {
    routeRequestInFlight = false;
    updateSubmitState();
    setStatus("No pude resolver la ubicacion de uno de los edificios.", "error");
    return;
  }

  const {
    originLatLng,
    destinationLatLng,
    routeLatLngs,
    hasWalkingNetwork,
    routeUnavailable,
    hasRestrictedSegments,
  } = routeGeometry;

  clearRouteOverlay();
  const overlay = ensureRouteOverlayLayer();

  L.polyline(routeLatLngs, {
    color: "#ffffff",
    weight: 12,
    opacity: 0.95,
    lineCap: "round",
    interactive: false,
  }).addTo(overlay);

  const selectedPolyline = L.polyline(routeLatLngs, {
    color: SELECTED_ROUTE_COLOR,
    weight: 8,
    opacity: 0.98,
    dashArray: !hasWalkingNetwork || routeUnavailable ? "12 10" : null,
    lineCap: "round",
    interactive: false,
  }).addTo(overlay);
  selectedPolyline.bringToFront?.();

  const arrowSegments = routeLatLngs.length > 1 ? routeLatLngs.slice(0, -1) : [originLatLng];
  [0.25, 0.5, 0.75].forEach((fraction) => {
    const segmentIndex = Math.min(
      arrowSegments.length - 1,
      Math.max(0, Math.floor((routeLatLngs.length - 1) * fraction))
    );
    const start = routeLatLngs[segmentIndex] || originLatLng;
    const end = routeLatLngs[segmentIndex + 1] || destinationLatLng;
    if (!routeUnavailable) {
      createArrowMarker(interpolateLatLng(start, end, 0.5), getArrowRotation(start, end)).addTo(overlay);
    }
  });

  const description = await buildRouteDescription(originId, destinationId);
  routeRequestInFlight = false;
  updateSubmitState();
  if (routeUnavailable) {
    setStatus(`No hay camino disponible entre ${description}. Revisa tramos cerrados o dibuja una alternativa.`, "error");
  } else if (!hasWalkingNetwork) {
    setStatus(`Ruta directa: ${description}. Dibuja rutas caminables para calcular un camino real.`, "warning");
  } else if (hasRestrictedSegments) {
    setStatus(`Ruta activa: ${description}. Incluye tramo(s) restringidos.`, "warning");
  } else {
    setStatus(`Ruta activa: ${description}.`, "success");
  }
};

const handleSubmit = async () => {
  const ui = getPlannerElements();
  if (!ui) return;

  const originId = ui.originSelect.value;
  const destinationId = ui.destinationSelect.value;

  if (!originId || !destinationId) {
    setStatus("Selecciona origen y destino.", "warning");
    updateSubmitState();
    return;
  }

  if (originId === destinationId) {
    setStatus("El origen y el destino deben ser distintos.", "error");
    return;
  }

  activeRoute = { originId, destinationId };
  activeRouteRequestId += 1;
  routeRequestInFlight = true;
  const requestId = activeRouteRequestId;
  updateSubmitState();
  setRouteHighlight(originId, destinationId);
  setStatus("Preparando ruta sobre la vista general del campus...", "neutral");

  activateOverviewFloor(requestId, () => {
    if (requestId !== activeRouteRequestId) {
      return;
    }

    const routeLayers = getFeatureLayersByIds([originId, destinationId]);

    void renderRoute(
      originId,
      destinationId,
      routeLayers.get(originId) || null,
      routeLayers.get(destinationId) || null,
      requestId
    );
  });
};

const handleClear = () => {
  const ui = getPlannerElements();
  if (!ui) return;

  activeRouteRequestId += 1;
  routeRequestInFlight = false;
  activeRoute = { originId: "", destinationId: "" };
  ui.originSearch.value = "";
  ui.destinationSearch.value = "";
  ui.originSelect.value = "";
  ui.destinationSelect.value = "";
  void populateBuildingSelectors(false);
  clearRouteOverlay();
  clearRouteHighlight();
  updateSubmitState();
  setStatus("Sin ruta activa.", "neutral");
};

const attachPlannerEvents = () => {
  const ui = getPlannerElements();
  if (!ui || ui.panel.dataset.bound === "true") {
    return;
  }

  ui.panel.dataset.bound = "true";
  ui.toggleButton.addEventListener("click", () => {
    void togglePanel();
  });
  bindComboboxEvents(ui.originSelect, ui.originSearch, ui.originOptions);
  bindComboboxEvents(ui.destinationSelect, ui.destinationSearch, ui.destinationOptions);
  ui.submitButton.addEventListener("click", () => {
    void handleSubmit();
  });
  ui.clearButton.addEventListener("click", handleClear);
  document.addEventListener("click", (event) => {
    if (!ui.panel.contains(event.target)) {
      closeComboboxes();
    }
  });
};

const initializeRoutePlanner = async () => {
  const ui = getPlannerElements();
  if (!ui) return;

  attachPlannerEvents();
  await populateBuildingSelectors(true);
  updateSubmitState();
  setStatus("Selecciona origen y destino.", "neutral");

  window.refreshRoutePlannerBuildings = async () => {
    buildingsCache = null;
    resetWalkingRoutesCache();
    await populateBuildingSelectors(true);

    if (activeRoute.originId && activeRoute.destinationId) {
      const description = await buildRouteDescription(activeRoute.originId, activeRoute.destinationId);
      setStatus(`Ruta activa: ${description}.`, "success");
      return;
    }

    setStatus("Selecciona origen y destino.", "neutral");
  };

  window.addEventListener(identifiers.events.campusChanged, () => {
    buildingsCache = null;
    resetWalkingRoutesCache();
    void populateBuildingSelectors(false);
    setStatus("Selecciona origen y destino.", "neutral");
  });
};

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    void initializeRoutePlanner();
  }, { once: true });
} else {
  void initializeRoutePlanner();
}
