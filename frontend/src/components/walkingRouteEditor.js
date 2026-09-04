import { BACKEND_API_URL, map } from "../views/map.js";
import {
  getAdminMapToolSection,
  getAdminMapToolsFooter,
  removeAdminMapToolSection,
  requestAdminMapToolMode,
  setAdminMapToolActiveMode,
  setAdminMapToolsStatus,
} from "@app/adminMapToolsPanel";
import { refreshWalkingRoutesLayer } from "@app/walkingRouteLayer";
import { getPrimaryCampusKey } from "../utils/campusConfig.js";
import { getActiveCampus } from "../utils/goToCampus.js";
import { loadWalkingRouteNetwork } from "../utils/walkingRouteStorage.js?v=20260608b";

const controlsId = "walking-route-editor-controls";
const editorButtonId = "walking-route-editor-toggle";
const deleteButtonId = "walking-route-delete-toggle";
const splitButtonId = "walking-route-split-toggle";
const buildingConnectButtonId = "walking-route-building-toggle";
const undoButtonId = "walking-route-undo-toggle";
const activeActionsClass = "walking-route-active-actions";
const freeDrawMinDistanceMeters = 3;
const freeDrawSimplifyTolerancePixels = 5;
const routeNodeSnapDistanceMeters = 8;
const routeEdgeSnapDistanceMeters = 3;
const routeMergePreviewDistanceMeters = 8;

let isDrawing = false;
let isDeleteMode = false;
let isSplitMode = false;
let isBuildingConnectMode = false;
let isFreeDrawing = false;
let isFreePointerDown = false;
let suppressNextClick = false;
let points = [];
let previewLayer = null;
let pointsLayer = null;
let routesLayer = null;
let routeNodesLayer = null;
let modalRoot = null;
let routeNetworkCache = null;
let routeEdgeLayers = new Map();
let lastRouteUndoSnapshot = null;
let lastRouteUndoActionType = "";
let lastBuildingUndo = null;
let selectedBuildingConnectNode = null;

const setStatus = (message) => setAdminMapToolsStatus(message);
const getEditorButton = () => document.getElementById(editorButtonId);
const getDeleteButton = () => document.getElementById(deleteButtonId);
const getSplitButton = () => document.getElementById(splitButtonId);
const getBuildingConnectButton = () => document.getElementById(buildingConnectButtonId);
const getUndoButton = () => document.getElementById(undoButtonId);
const getEditorControls = () => document.getElementById(controlsId);

const setToolButtonContent = (button, icon, label = "") => {
  const labelMarkup = label ? `<span class="map-tool-button-label">${label}</span>` : "";
  button.innerHTML = `<span class="map-tool-button-icon" aria-hidden="true">${icon}</span>${labelMarkup}`;
  button.classList.toggle("is-icon-only", !label);
};

const isCtrlPressed = (event) => Boolean(event?.originalEvent?.ctrlKey || event?.ctrlKey);

const stopEvent = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.originalEvent?.preventDefault?.();
  event?.originalEvent?.stopPropagation?.();
};

const clearPreview = () => {
  if (previewLayer) {
    map.removeLayer(previewLayer);
    previewLayer = null;
  }

  if (pointsLayer) {
    map.removeLayer(pointsLayer);
    pointsLayer = null;
  }
};

const updatePreviewLine = () => {
  if (points.length < 2) {
    if (previewLayer) {
      map.removeLayer(previewLayer);
      previewLayer = null;
    }
    return;
  }

  if (previewLayer) {
    previewLayer.setLatLngs(points);
    return;
  }

  previewLayer = L.polyline(points, {
    color: "#003366",
    weight: 4,
    dashArray: "8 8",
    lineCap: "round",
  }).addTo(map);
};

const removeModal = () => {
  modalRoot?.remove();
  modalRoot = null;
};

const removeActiveControls = () => {
  document.querySelector(`.${activeActionsClass}`)?.remove();
};

const getFreeDrawButton = () => document.querySelector("[data-route-free-draw]");

const setFreeDrawingEnabled = (enabled) => {
  isFreeDrawing = Boolean(enabled);
  isFreePointerDown = false;
  document.documentElement.dataset.walkingRouteFreeDraw = isFreeDrawing ? "true" : "false";

  const button = getFreeDrawButton();
  if (button) {
    button.classList.toggle("is-active", isFreeDrawing);
    setToolButtonContent(button, "↝");
    button.title = isFreeDrawing ? "Dibujo libre activo" : "Dibujo libre";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", String(isFreeDrawing));
  }

  if (!isFreeDrawing) {
    map.dragging.enable();
    window.removeEventListener("mouseup", handleGlobalFreeDrawEnd);
  }
};

const pointSegmentDistance = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return point.distanceTo(start);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return point.distanceTo(L.point(start.x + t * dx, start.y + t * dy));
};

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

const douglasPeucker = (latlngs, tolerancePixels) => {
  if (latlngs.length <= 2) return latlngs;

  const layerPoints = latlngs.map((point) => map.latLngToLayerPoint(point));
  let maxDistance = 0;
  let index = 0;
  const start = layerPoints[0];
  const end = layerPoints[layerPoints.length - 1];

  for (let i = 1; i < layerPoints.length - 1; i += 1) {
    const distance = pointSegmentDistance(layerPoints[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }

  if (maxDistance <= tolerancePixels) {
    return [latlngs[0], latlngs[latlngs.length - 1]];
  }

  const left = douglasPeucker(latlngs.slice(0, index + 1), tolerancePixels);
  const right = douglasPeucker(latlngs.slice(index), tolerancePixels);
  return [...left.slice(0, -1), ...right];
};

const simplifyRoutePoints = (latlngs) => {
  if (latlngs.length <= 2) return latlngs;
  return douglasPeucker(latlngs, freeDrawSimplifyTolerancePixels);
};

const projectLatLngOnSegment = (latlng, start, end) => {
  const point = map.latLngToLayerPoint(latlng);
  const startPoint = map.latLngToLayerPoint(start);
  const endPoint = map.latLngToLayerPoint(end);
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= 0 ? 0 : Math.max(0, Math.min(1, ((point.x - startPoint.x) * dx + (point.y - startPoint.y) * dy) / lengthSquared));
  return map.layerPointToLatLng(L.point(startPoint.x + t * dx, startPoint.y + t * dy));
};

const snapPointToRouteNetwork = (latlng) => {
  const network = routeNetworkCache;
  if (!latlng || !network) return latlng;

  let bestLatLng = latlng;
  let bestNodeDistance = routeNodeSnapDistanceMeters;
  let bestEdgeDistance = routeEdgeSnapDistanceMeters;
  const nodesById = new Map((network.nodes || []).map((node) => [node.externalId, node]));

  for (const node of network.nodes || []) {
    const nodeLatLng = L.latLng(Number(node.latitude), Number(node.longitude));
    const distance = map.distance(latlng, nodeLatLng);
    if (distance <= bestNodeDistance) {
      bestLatLng = nodeLatLng;
      bestNodeDistance = distance;
    }
  }

  if (bestLatLng !== latlng) {
    return bestLatLng;
  }

  for (const edge of network.edges || []) {
    const from = nodesById.get(edge.fromNodeExternalId);
    const to = nodesById.get(edge.toNodeExternalId);
    if (!from || !to) continue;

    const fromLatLng = L.latLng(Number(from.latitude), Number(from.longitude));
    const toLatLng = L.latLng(Number(to.latitude), Number(to.longitude));
    const projected = projectLatLngOnSegment(latlng, fromLatLng, toLatLng);
    const distance = map.distance(latlng, projected);
    if (distance <= bestEdgeDistance) {
      bestLatLng = projected;
      bestEdgeDistance = distance;
    }
  }

  return bestLatLng;
};

const snapRoutePointsToNetwork = (latlngs) => latlngs.map((point) => snapPointToRouteNetwork(point));

const findMergePreviewNode = (nodeExternalId, latlng) => {
  const network = routeNetworkCache;
  if (!network || !latlng) return null;

  let best = null;
  let bestDistance = routeMergePreviewDistanceMeters;

  for (const node of network.nodes || []) {
    if (node.externalId === nodeExternalId) continue;
    const nodeLatLng = L.latLng(Number(node.latitude), Number(node.longitude));
    const distance = map.distance(latlng, nodeLatLng);
    if (distance <= bestDistance) {
      best = node;
      bestDistance = distance;
    }
  }

  return best;
};

const redrawPreview = () => {
  clearPreview();

  if (!isFreePointerDown) {
    pointsLayer = L.layerGroup(
      points.map((point, index) => {
        const marker = L.marker(point, {
          draggable: true,
          zIndexOffset: 2600,
          title: "Arrastra para ajustar este punto de la ruta",
          icon: L.divIcon({
            className: "walking-route-vertex-marker",
            html: "",
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        });

        marker.on("dragstart", (event) => {
          stopEvent(event);
          isFreePointerDown = false;
          suppressNextClick = true;
          window.removeEventListener("mouseup", handleGlobalFreeDrawEnd);
        });
        marker.on("click", stopEvent);
        marker.on("drag", (event) => {
          points[index] = event.latlng;
          updatePreviewLine();
          setStatus(`${points.length} punto(s). Ajusta los vértices y guarda la ruta cuando termines.`);
        });
        marker.on("dragend", (event) => {
          stopEvent(event);
          const snapped = snapPointToRouteNetwork(event.target.getLatLng());
          points[index] = snapped;
          redrawPreview();
          setStatus(`${points.length} punto(s). Ajusta los vértices y guarda la ruta cuando termines.`);
        });

        return marker;
      })
    ).addTo(map);
  }

  updatePreviewLine();
};

const loadRoutes = async () => {
  if (routeNetworkCache) return routeNetworkCache;

  routeNetworkCache = await loadWalkingRouteNetwork(String(getActiveCampus() || getPrimaryCampusKey() || "").trim());
  return routeNetworkCache;
};

const resetRoutesCache = () => {
  routeNetworkCache = null;
  window.refreshWalkingRoutesCache?.();
};

const throwRouteSaveError = async (response, fallbackMessage) => {
  const error = await response.json().catch(() => ({}));
  const message = error?.message || fallbackMessage;
  console.error("[walking-routes] error al guardar rutas en API:", message);
  throw new Error(message);
};

const syncRoutesBackupAfterMutation = async () => {
  try {
    routeNetworkCache = null;
    routeNetworkCache = await loadWalkingRouteNetwork(String(getActiveCampus() || getPrimaryCampusKey() || "").trim());
  } catch (error) {
    console.error("[walking-routes] error al guardar rutas en respaldo local despues de modificar:", error);
  }
};

const cloneNetwork = (network) => ({
  nodes: (network?.nodes || []).map((node) => ({ ...node })),
  edges: (network?.edges || []).map((edge) => ({ ...edge })),
});

const updateUndoButtonState = () => {
  const button = getUndoButton();
  if (!button) return;
  const hasUndo = Boolean(lastRouteUndoSnapshot || lastBuildingUndo);
  button.disabled = !hasUndo;
  button.classList.toggle("is-muted", !hasUndo);
  button.title = hasUndo
    ? `Deshacer: ${lastBuildingUndo?.label || lastRouteUndoActionType || "ultima accion"}`
    : "Deshacer ultima accion";
  button.setAttribute("aria-label", button.title);
};

const captureRouteUndoSnapshot = async (actionType = "route") => {
  lastRouteUndoSnapshot = cloneNetwork(await loadRoutes());
  lastRouteUndoActionType = actionType;
  lastBuildingUndo = null;
  updateUndoButtonState();
};

export const registerBuildingUndo = ({ label, restore }) => {
  if (typeof restore !== "function") return;
  lastRouteUndoSnapshot = null;
  lastRouteUndoActionType = "";
  lastBuildingUndo = { label: label || "edificio", restore };
  updateUndoButtonState();
};

const restoreRouteUndoSnapshot = async () => {
  if (lastBuildingUndo) {
    const pending = lastBuildingUndo;
    await pending.restore();
    lastBuildingUndo = null;
    updateUndoButtonState();
    setStatus(`Se deshizo: ${pending.label}.`);
    return;
  }

  if (!lastRouteUndoSnapshot) {
    setStatus("No hay acciones de rutas para deshacer.");
    return;
  }

  const snapshot = lastRouteUndoSnapshot;
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/restore`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      campus: String(getActiveCampus() || getPrimaryCampusKey() || "").trim(),
      nodes: snapshot.nodes,
      edges: snapshot.edges,
    }),
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo deshacer la ultima accion.");
  }

  const actionType = lastRouteUndoActionType;
  lastRouteUndoSnapshot = null;
  lastRouteUndoActionType = "";
  lastBuildingUndo = null;
  updateUndoButtonState();
  await syncRoutesBackupAfterMutation();
  resetRoutesCache();
  await refreshWalkingRoutesLayer();
  if (actionType === "building-connection") {
    stopDrawing();
  } else {
    await renderRoutesLayer({ splitMode: isSplitMode, deleteMode: isDeleteMode });
  }
  await window.acknowledgeCurrentMapSyncState?.();
  setStatus("Ultima accion de rutas deshecha.");
};

const edgeColor = (status) => {
  const normalized = String(status || "open").toLowerCase();
  if (normalized === "closed") return "#dc2626";
  if (normalized === "restricted") return "#f59e0b";
  return "#003366";
};

const renderRoutesLayer = async ({
  deleteMode = isDeleteMode,
  splitMode = isSplitMode,
  buildingConnectMode = isBuildingConnectMode,
} = {}) => {
  if (!routesLayer) {
    routesLayer = L.layerGroup().addTo(map);
  }

  if (!routeNodesLayer) {
    routeNodesLayer = L.layerGroup().addTo(map);
  }

  routesLayer.clearLayers();
  routeNodesLayer.clearLayers();
  routeEdgeLayers = new Map();

  try {
    const network = await loadRoutes();
    const nodesById = new Map((network.nodes || []).map((node) => [node.externalId, node]));

    for (const edge of network.edges || []) {
      const from = nodesById.get(edge.fromNodeExternalId);
      const to = nodesById.get(edge.toNodeExternalId);
      if (!from || !to) continue;

      const polyline = L.polyline(
        [
          [from.latitude, from.longitude],
          [to.latitude, to.longitude],
        ],
        {
          color: deleteMode ? "#b91c1c" : edgeColor(edge.status),
          weight: deleteMode ? 7 : 5,
          opacity: deleteMode ? 0.88 : 0.78,
          dashArray: String(edge.status).toLowerCase() === "closed" ? "4 8" : null,
        }
      );

      polyline.on("click", (event) => {
        stopEvent(event);
        if (deleteMode) {
          void confirmDeleteEdge(edge);
        } else {
          openEdgeModal(edge);
        }
      });

      polyline.addTo(routesLayer);
      routeEdgeLayers.set(edge.externalId, polyline);
    }

    if (!deleteMode) {
      renderExistingRouteNodes(network.nodes || [], { splitMode, buildingConnectMode });
    }
  } catch (error) {
    setStatus(error.message || "No se pudieron cargar rutas caminables.");
  }
};

const hideRoutesLayer = () => {
  if (routesLayer) {
    routesLayer.clearLayers();
  }
  if (routeNodesLayer) {
    routeNodesLayer.clearLayers();
  }
};

const updateNode = async (nodeExternalId, latlng) => {
  await captureRouteUndoSnapshot();
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/nodes/${encodeURIComponent(nodeExternalId)}`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      latitude: latlng.lat,
      longitude: latlng.lng,
    }),
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo mover el vertice.");
  }

  return response.json();
};

const splitNode = async (nodeExternalId) => {
  await captureRouteUndoSnapshot();
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/nodes/${encodeURIComponent(nodeExternalId)}/split`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo separar el vertice.");
  }

  return response.json();
};

const updateConnectedRouteLines = (nodeExternalId, latlng) => {
  const network = routeNetworkCache;
  if (!network) return;

  const nodesById = new Map((network.nodes || []).map((node) => [node.externalId, node]));
  nodesById.set(nodeExternalId, {
    ...(nodesById.get(nodeExternalId) || {}),
    latitude: latlng.lat,
    longitude: latlng.lng,
  });

  for (const edge of network.edges || []) {
    if (edge.fromNodeExternalId !== nodeExternalId && edge.toNodeExternalId !== nodeExternalId) {
      continue;
    }

    const from = nodesById.get(edge.fromNodeExternalId);
    const to = nodesById.get(edge.toNodeExternalId);
    const polyline = routeEdgeLayers.get(edge.externalId);
    if (!from || !to || !polyline) continue;

    polyline.setLatLngs([
      [Number(from.latitude), Number(from.longitude)],
      [Number(to.latitude), Number(to.longitude)],
    ]);
  }
};

const connectSelectedNodeToBuilding = async (layer, featureId) => {
  if (!selectedBuildingConnectNode) {
    setStatus("Primero selecciona un vertice de ruta.");
    return;
  }

  const nodeLatLng = L.latLng(Number(selectedBuildingConnectNode.latitude), Number(selectedBuildingConnectNode.longitude));
  const buildingEdgeLatLng = findNearestPointOnPolygonBoundary(nodeLatLng, layer);
  if (!buildingEdgeLatLng) {
    setStatus("No pude calcular el borde de ese edificio.");
    return;
  }

  await createPathFromLatLngs(
    [nodeLatLng, buildingEdgeLatLng],
    "open",
    `Entrada edificio ${featureId || ""}`.trim(),
    {
      disableLastPointSnap: true,
      undoActionType: "building-connection",
    }
  );
  selectedBuildingConnectNode = null;
  await syncRoutesBackupAfterMutation();
  resetRoutesCache();
  await refreshWalkingRoutesLayer();
  await window.acknowledgeCurrentMapSyncState?.();
  await startDrawing();
  setStatus("Entrada al edificio creada. Editar rutas quedo activo para seguir ajustando caminos.");
};

function renderExistingRouteNodes(
  nodes,
  { splitMode = isSplitMode, buildingConnectMode = isBuildingConnectMode } = {}
) {
  if (!routeNodesLayer) return;

  for (const node of nodes) {
    let wasDragged = false;
    let dragEndedAt = 0;
    const marker = L.marker([Number(node.latitude), Number(node.longitude)], {
      draggable: !buildingConnectMode && !splitMode,
      zIndexOffset: 2700,
      title: "Arrastra para mover o unir este vertice",
      icon: L.divIcon({
        className: `walking-route-existing-vertex-marker${
          selectedBuildingConnectNode?.externalId === node.externalId ? " is-connect-selected" : ""
        }`,
        html: "",
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    });

    if (buildingConnectMode) {
      marker.dragging?.disable();
      marker.options.draggable = false;
      marker.off("dragstart");
      marker.off("drag");
      marker.off("dragend");
      marker.on("click", async (event) => {
        stopEvent(event);
        selectedBuildingConnectNode = node;
        await renderRoutesLayer({ buildingConnectMode: true });
        setStatus("Vertice seleccionado. Ahora haz click en el edificio para crear la entrada.");
      });
      marker.addTo(routeNodesLayer);
      continue;
    }

    if (splitMode) {
      marker.dragging?.disable();
      marker.on("click", async (event) => {
        stopEvent(event);
        try {
          await splitNode(node.externalId);
          await syncRoutesBackupAfterMutation();
          resetRoutesCache();
          await refreshWalkingRoutesLayer();
          await startDrawing();
          await window.acknowledgeCurrentMapSyncState?.();
          setStatus("Vertice separado. Editar rutas quedo activo para mover los puntos.");
        } catch (error) {
          setStatus(error.message || "No se pudo separar el vertice.");
        }
      });
      marker.addTo(routeNodesLayer);
      continue;
    }

    marker.on("dragstart", (event) => {
      stopEvent(event);
      wasDragged = true;
      setStatus("Moviendo vertice. Sueltalo cerca de otro para unirlos.");
    });

    marker.on("click", (event) => {
      stopEvent(event);
      if (wasDragged || Date.now() - dragEndedAt < 250) {
        wasDragged = false;
        return;
      }

      points = [L.latLng(Number(node.latitude), Number(node.longitude))];
      redrawPreview();
      setStatus("Ruta iniciada desde este vertice. Haz click en el mapa para agregar el siguiente punto.");
    });
    marker.on("drag", (event) => {
      updateConnectedRouteLines(node.externalId, event.latlng);
      const mergeTarget = findMergePreviewNode(node.externalId, event.latlng);
      const markerElement = event.target.getElement?.();
      markerElement?.classList.toggle("is-fusion-preview", Boolean(mergeTarget));
      setStatus(
        mergeTarget
          ? "Al soltar ahora, este vertice se unira con el punto marcado."
          : "Moviendo vertice. Sueltalo cerca de otro para unirlos."
      );
    });

    marker.on("dragend", async (event) => {
      stopEvent(event);
      dragEndedAt = Date.now();
      event.target.getElement?.()?.classList.remove("is-fusion-preview");
      try {
        const result = await updateNode(node.externalId, event.target.getLatLng());
        await syncRoutesBackupAfterMutation();
        resetRoutesCache();
        await refreshWalkingRoutesLayer();
        await renderRoutesLayer();
        await window.acknowledgeCurrentMapSyncState?.();
        setStatus(
          result?.merged
            ? "Vertices unidos correctamente."
            : result?.attached
              ? "Vertice unido a un tramo correctamente."
              : "Vertice movido correctamente."
        );
      } catch (error) {
        resetRoutesCache();
        await renderRoutesLayer();
        setStatus(error.message || "No se pudo mover el vertice.");
      }
    });

    marker.addTo(routeNodesLayer);
  }
}

const createPathFromLatLngs = async (latlngs, status, notes, options = {}) => {
  await captureRouteUndoSnapshot(options.undoActionType);
  const coordinates = latlngs.map((point) => [point.lng, point.lat]);
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/paths`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      campus: String(getActiveCampus() || getPrimaryCampusKey() || "").trim(),
      status,
      notes,
      disableLastPointSnap: Boolean(options.disableLastPointSnap),
      coordinates,
    }),
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo guardar la ruta.");
  }

  await syncRoutesBackupAfterMutation();
};

const savePath = async (status, notes) => {
  await createPathFromLatLngs(points, status, notes);
};

const openPathModal = () => {
  removeModal();

  if (points.length < 2) {
    setStatus("Marca al menos 2 puntos para guardar una ruta caminable.");
    return;
  }

  modalRoot = document.createElement("div");
  modalRoot.className = "manual-building-modal-backdrop";
  modalRoot.innerHTML = `
    <div class="manual-building-modal" role="dialog" aria-modal="true" aria-label="Guardar ruta caminable">
      <div class="manual-building-modal-header">
        <div>
          <div class="manual-building-modal-title">Guardar ruta caminable</div>
          <div class="manual-building-modal-subtitle">${points.length} puntos marcados</div>
        </div>
        <button type="button" class="manual-building-icon-button" data-route-close>&times;</button>
      </div>
      <form class="manual-building-form">
        <label>
          <span>Estado</span>
          <select name="status" class="walking-route-select">
            <option value="open">Abierta</option>
            <option value="restricted">Restringida / con aviso</option>
            <option value="closed">Cerrada / cortada</option>
          </select>
        </label>
        <label>
          <span>Notas</span>
          <textarea name="notes" rows="3" placeholder="Ej: Pasillo principal, acceso temporal, obra, etc."></textarea>
        </label>
        <div class="manual-building-modal-actions">
          <button type="button" class="manual-building-secondary" data-route-cancel>Cancelar</button>
          <button type="submit" class="manual-building-primary">Guardar ruta</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalRoot);
  const form = modalRoot.querySelector("form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
      const formData = new FormData(form);
      try {
        await savePath(String(formData.get("status") || "open"), String(formData.get("notes") || ""));
        removeModal();
        points = [];
        clearPreview();
        resetRoutesCache();
        await refreshWalkingRoutesLayer();
        await renderRoutesLayer();
        await window.acknowledgeCurrentMapSyncState?.();
        setStatus("Ruta caminable guardada. Puedes seguir marcando otra ruta.");
      } catch (error) {
      setStatus(error.message || "No se pudo guardar la ruta.");
    }
  });

  modalRoot.querySelector("[data-route-close]")?.addEventListener("click", removeModal);
  modalRoot.querySelector("[data-route-cancel]")?.addEventListener("click", removeModal);
};

const updateEdge = async (edgeExternalId, status, notes) => {
  await captureRouteUndoSnapshot();
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/edges/${encodeURIComponent(edgeExternalId)}`, {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status, notes }),
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo actualizar el tramo.");
  }

  await syncRoutesBackupAfterMutation();
};

const deleteEdge = async (edgeExternalId) => {
  await captureRouteUndoSnapshot();
  const response = await fetch(`${BACKEND_API_URL}/api/walking-routes/edges/${encodeURIComponent(edgeExternalId)}`, {
    method: "DELETE",
    credentials: "include",
    cache: "no-store",
  });

  if (!response.ok) {
    await throwRouteSaveError(response, "No se pudo eliminar el tramo.");
  }

  await syncRoutesBackupAfterMutation();
};

const confirmDeleteEdge = async (edge) => {
  if (!window.confirm("¿Estas seguro que quieres borrar esta ruta?")) return;

  try {
    await deleteEdge(edge.externalId);
    removeModal();
    resetRoutesCache();
    await refreshWalkingRoutesLayer();
    await renderRoutesLayer({ deleteMode: true });
    await window.acknowledgeCurrentMapSyncState?.();
    setStatus("Ruta eliminada. Puedes seguir borrando otra ruta.");
  } catch (error) {
    setStatus(error.message || "No se pudo eliminar la ruta.");
  }
};

const openEdgeModal = (edge) => {
  removeModal();
  modalRoot = document.createElement("div");
  modalRoot.className = "manual-building-modal-backdrop";
  modalRoot.innerHTML = `
    <div class="manual-building-modal" role="dialog" aria-modal="true" aria-label="Editar tramo caminable">
      <div class="manual-building-modal-header">
        <div>
          <div class="manual-building-modal-title">Editar tramo</div>
          <div class="manual-building-modal-subtitle">${edge.externalId}</div>
        </div>
        <button type="button" class="manual-building-icon-button" data-route-close>&times;</button>
      </div>
      <form class="manual-building-form">
        <label>
          <span>Estado</span>
          <select name="status" class="walking-route-select">
            <option value="open">Abierta</option>
            <option value="restricted">Restringida / con aviso</option>
            <option value="closed">Cerrada / cortada</option>
          </select>
        </label>
        <label>
          <span>Notas</span>
          <textarea name="notes" rows="3"></textarea>
        </label>
        <div class="manual-building-modal-actions">
          <button type="button" class="manual-building-secondary" data-route-delete>Eliminar tramo</button>
          <button type="submit" class="manual-building-primary">Guardar estado</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalRoot);
  const form = modalRoot.querySelector("form");
  form.elements.status.value = String(edge.status || "open").toLowerCase();
  form.elements.notes.value = edge.notes || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    try {
      await updateEdge(edge.externalId, String(formData.get("status") || "open"), String(formData.get("notes") || ""));
      removeModal();
      resetRoutesCache();
      await refreshWalkingRoutesLayer();
      await renderRoutesLayer();
      await window.acknowledgeCurrentMapSyncState?.();
      setStatus("Tramo actualizado. Los caminos cerrados ya no se usaran al calcular rutas.");
    } catch (error) {
      setStatus(error.message || "No se pudo actualizar el tramo.");
    }
  });

  modalRoot.querySelector("[data-route-close]")?.addEventListener("click", removeModal);
  modalRoot.querySelector("[data-route-delete]")?.addEventListener("click", async () => {
    try {
      await deleteEdge(edge.externalId);
      removeModal();
      resetRoutesCache();
      await refreshWalkingRoutesLayer();
      await renderRoutesLayer();
      await window.acknowledgeCurrentMapSyncState?.();
      setStatus("Tramo eliminado.");
    } catch (error) {
      setStatus(error.message || "No se pudo eliminar el tramo.");
    }
  });
};

const buildActionButtons = () => {
  const wrapper = document.createElement("div");
  wrapper.className = `${activeActionsClass} building-geometry-active-actions`;
  wrapper.innerHTML = `
    <button type="button" class="dashboard-link route-tool-button is-icon-only" data-route-free-draw aria-pressed="false" title="Dibujo libre" aria-label="Dibujo libre"><span class="map-tool-button-icon" aria-hidden="true">↝</span></button>
    <button type="button" class="dashboard-link manual-building-editor-button route-tool-button action-save-button is-icon-only" data-route-save title="Guardar ruta" aria-label="Guardar ruta"><span class="map-tool-button-icon" aria-hidden="true">✓</span></button>
    <button type="button" class="dashboard-link action-cancel-button is-icon-only" data-route-cancel title="Cancelar" aria-label="Cancelar"><span class="map-tool-button-icon" aria-hidden="true">&times;</span></button>
  `;
  wrapper.querySelector("[data-route-free-draw]")?.classList.remove("route-tool-button");
  wrapper.querySelector("[data-route-save]")?.classList.remove("route-tool-button");

  wrapper.querySelector("[data-route-save]")?.addEventListener("click", (event) => {
    stopEvent(event);
    openPathModal();
  });
  wrapper.querySelector("[data-route-free-draw]")?.addEventListener("click", (event) => {
    stopEvent(event);
    setFreeDrawingEnabled(!isFreeDrawing);
    setStatus(
      isFreeDrawing
        ? "Dibujo libre activo: mantén presionado y arrastra para trazar la ruta."
        : "Modo rutas: marca puntos con clicks o activa Dibujo libre."
    );
  });
  wrapper.querySelector("[data-route-cancel]")?.addEventListener("click", (event) => {
    stopEvent(event);
    stopDrawing();
    setStatus("");
  });

  return wrapper;
};

const setActiveControls = () => {
  const controls = getEditorControls();
  if (!controls || controls.querySelector(`.${activeActionsClass}`)) return;
  const actionButtons = buildActionButtons();
  controls.appendChild(actionButtons);
};

const stopDrawing = ({ clearActiveTool = true } = {}) => {
  isDrawing = false;
  isDeleteMode = false;
  isSplitMode = false;
  isBuildingConnectMode = false;
  selectedBuildingConnectNode = null;
  setFreeDrawingEnabled(false);
  points = [];
  clearPreview();
  removeActiveControls();
  map.off("click", handleMapClick);
  map.off("mousedown", handleFreeDrawStart);
  map.off("mousemove", handleFreeDrawMove);
  map.off("mouseup", handleFreeDrawEnd);
  map.doubleClickZoom.enable();
  getEditorButton()?.classList.remove("is-active");
  getDeleteButton()?.classList.remove("is-active");
  getSplitButton()?.classList.remove("is-active");
  getBuildingConnectButton()?.classList.remove("is-active");
  if (clearActiveTool) {
    setAdminMapToolActiveMode(null);
    hideRoutesLayer();
  }
};

function handleMapClick(event) {
  if (!isDrawing) return;
  if (isFreeDrawing || suppressNextClick || isCtrlPressed(event)) {
    suppressNextClick = false;
    return;
  }
  points.push(snapPointToRouteNetwork(event.latlng));
  redrawPreview();
  setStatus(`${points.length} punto(s). Guarda la ruta cuando termines.`);
}

function handleFreeDrawStart(event) {
  if (!isDrawing || !isFreeDrawing || event?.originalEvent?.button !== 0) return;
  if (isCtrlPressed(event)) {
    suppressNextClick = true;
    map.dragging.enable();
    setStatus("Ctrl presionado: puedes moverte por el mapa sin dibujar.");
    return;
  }

  stopEvent(event);
  isFreePointerDown = true;
  suppressNextClick = true;
  points = [snapPointToRouteNetwork(event.latlng)];
  map.dragging.disable();
  window.addEventListener("mouseup", handleGlobalFreeDrawEnd);
  redrawPreview();
  setStatus("Dibujando ruta... suelta el mouse para terminar el trazo.");
}

function handleFreeDrawMove(event) {
  if (!isDrawing || !isFreeDrawing || !isFreePointerDown || !event?.latlng) return;

  const lastPoint = points[points.length - 1];
  if (!lastPoint || map.distance(lastPoint, event.latlng) >= freeDrawMinDistanceMeters) {
    points.push(event.latlng);
    updatePreviewLine();
  }
}

function handleFreeDrawEnd(event) {
  if (!isDrawing || !isFreeDrawing || !isFreePointerDown) return;
  stopEvent(event);
  isFreePointerDown = false;
  window.removeEventListener("mouseup", handleGlobalFreeDrawEnd);
  map.dragging.enable();

  if (event?.latlng) {
    const lastPoint = points[points.length - 1];
    if (!lastPoint || map.distance(lastPoint, event.latlng) >= 1) {
      points.push(event.latlng);
    }
  }

  const originalCount = points.length;
  points = snapRoutePointsToNetwork(simplifyRoutePoints(points));
  redrawPreview();
  setStatus(`Ruta dibujada: ${points.length} punto(s) guardables, simplificada desde ${originalCount}.`);
}

function handleGlobalFreeDrawEnd() {
  if (!isFreePointerDown) return;
  isFreePointerDown = false;
  window.removeEventListener("mouseup", handleGlobalFreeDrawEnd);
  map.dragging.enable();

  const originalCount = points.length;
  points = snapRoutePointsToNetwork(simplifyRoutePoints(points));
  redrawPreview();
  setStatus(`Ruta dibujada: ${points.length} punto(s) guardables, simplificada desde ${originalCount}.`);
}

const startDrawing = async () => {
  stopDrawing();
  requestAdminMapToolMode("walking-routes");
  isDrawing = true;
  isDeleteMode = false;
  points = [];
  map.doubleClickZoom.disable();
  map.on("click", handleMapClick);
  map.on("mousedown", handleFreeDrawStart);
  map.on("mousemove", handleFreeDrawMove);
  map.on("mouseup", handleFreeDrawEnd);
  getEditorButton()?.classList.add("is-active");
  setActiveControls();
  await renderRoutesLayer();
  setStatus("Modo rutas: marca puntos para crear caminos. Haz click en un tramo existente para cambiar su estado.");
};

const startDeleteMode = async () => {
  stopDrawing();
  requestAdminMapToolMode("walking-route-delete");
  isDeleteMode = true;
  points = [];
  getDeleteButton()?.classList.add("is-active");
  await renderRoutesLayer({ deleteMode: true });
  setStatus("Modo eliminar rutas: haz click en una ruta y confirma para borrarla.");
};

const startSplitMode = async () => {
  stopDrawing();
  requestAdminMapToolMode("walking-route-split");
  isSplitMode = true;
  points = [];
  getSplitButton()?.classList.add("is-active");
  await renderRoutesLayer({ splitMode: true });
  setStatus("Modo separar vértice: haz click en un vértice con 2 o más tramos conectados.");
};

const startBuildingConnectMode = async () => {
  stopDrawing();
  requestAdminMapToolMode("walking-route-building");
  isBuildingConnectMode = true;
  selectedBuildingConnectNode = null;
  points = [];
  getBuildingConnectButton()?.classList.add("is-active");
  await renderRoutesLayer({ buildingConnectMode: true });
  setStatus("Modo conectar edificio: selecciona un vertice de ruta y luego haz click en el edificio.");
};

const toggleDrawing = () => {
  if (isDrawing) {
    stopDrawing();
    setStatus("");
    return;
  }

  void startDrawing();
};

const toggleDeleteMode = () => {
  if (isDeleteMode) {
    stopDrawing();
    setStatus("");
    return;
  }

  void startDeleteMode();
};

const toggleSplitMode = () => {
  if (isSplitMode) {
    stopDrawing();
    setStatus("");
    return;
  }

  void startSplitMode();
};

const toggleBuildingConnectMode = () => {
  if (isBuildingConnectMode) {
    stopDrawing();
    setStatus("");
    return;
  }

  void startBuildingConnectMode();
};

const createEditorControls = () => {
  const sectionBody = getAdminMapToolSection("routes");
  if (!sectionBody || getEditorButton()) return;

  const wrapper = document.createElement("div");
  wrapper.id = controlsId;
  wrapper.className = "admin-map-tools-group";

  const button = document.createElement("button");
  button.id = editorButtonId;
  button.className = "dashboard-link manual-building-editor-button route-tool-button";
  button.type = "button";
  setToolButtonContent(button, "&#8764;");
  button.title = "Editar rutas";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", (event) => {
    stopEvent(event);
    toggleDrawing();
  });

  const deleteButton = document.createElement("button");
  deleteButton.id = deleteButtonId;
  deleteButton.className = "dashboard-link manual-building-editor-button route-tool-button";
  deleteButton.type = "button";
  setToolButtonContent(deleteButton, "&#10005;");
  deleteButton.title = "Eliminar ruta";
  deleteButton.setAttribute("aria-label", deleteButton.title);
  deleteButton.addEventListener("click", (event) => {
    stopEvent(event);
    toggleDeleteMode();
  });

  const splitButton = document.createElement("button");
  splitButton.id = splitButtonId;
  splitButton.className = "dashboard-link manual-building-editor-button route-tool-button";
  splitButton.type = "button";
  setToolButtonContent(splitButton, "&#9585;");
  splitButton.title = "Separar vertice";
  splitButton.setAttribute("aria-label", splitButton.title);
  splitButton.addEventListener("click", (event) => {
    stopEvent(event);
    toggleSplitMode();
  });

  const buildingConnectButton = document.createElement("button");
  buildingConnectButton.id = buildingConnectButtonId;
  buildingConnectButton.className = "dashboard-link manual-building-editor-button route-tool-button";
  buildingConnectButton.type = "button";
  setToolButtonContent(buildingConnectButton, "&#9673;");
  buildingConnectButton.title = "Conectar edificio";
  buildingConnectButton.setAttribute("aria-label", buildingConnectButton.title);
  buildingConnectButton.addEventListener("click", (event) => {
    stopEvent(event);
    toggleBuildingConnectMode();
  });

  const undoButton = document.createElement("button");
  undoButton.id = undoButtonId;
  undoButton.className = "dashboard-link manual-building-editor-button route-undo-button is-muted";
  undoButton.type = "button";
  undoButton.title = "Deshacer ultima accion";
  undoButton.setAttribute("aria-label", "Deshacer ultima accion");
  setToolButtonContent(undoButton, "↶");
  undoButton.disabled = !(lastRouteUndoSnapshot || lastBuildingUndo);
  undoButton.addEventListener("click", async (event) => {
    stopEvent(event);
    try {
      await restoreRouteUndoSnapshot();
    } catch (error) {
      setStatus(error.message || "No se pudo deshacer la ultima accion.");
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(deleteButton);
  wrapper.appendChild(splitButton);
  wrapper.appendChild(buildingConnectButton);
  const footer = getAdminMapToolsFooter();
  footer?.appendChild(undoButton);
  updateUndoButtonState();
  sectionBody.appendChild(wrapper);
};

const removeEditorControls = () => {
  stopDrawing();
  removeModal();
  getEditorControls()?.remove();
  removeAdminMapToolSection("routes");
};

const loadSession = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
};

export const syncWalkingRouteEditorForSession = (session) => {
  if (session?.isAdmin) {
    createEditorControls();
  } else {
    removeEditorControls();
  }
};

export const initWalkingRouteEditor = async () => {
  syncWalkingRouteEditorForSession(await loadSession());
};

window.addEventListener("syntro-session-changed", (event) => {
  syncWalkingRouteEditorForSession(event.detail || {});
});

window.addEventListener("syntro-admin-map-tool-mode", (event) => {
  const mode = event.detail?.mode;
  if (
    !["walking-routes", "walking-route-delete", "walking-route-split", "walking-route-building"].includes(mode) &&
    (isDrawing || isDeleteMode || isSplitMode || isBuildingConnectMode)
  ) {
    stopDrawing({ clearActiveTool: false });
    hideRoutesLayer();
  }
});

window.addEventListener("syntro-building-layer-click", (event) => {
  if (!isBuildingConnectMode) return;

  event.preventDefault();
  event.stopPropagation();
  void connectSelectedNodeToBuilding(event.detail?.layer, event.detail?.featureId);
});
