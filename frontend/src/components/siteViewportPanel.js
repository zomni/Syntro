import { BACKEND_API_URL, map } from "../views/map.js";
import { getActiveCampus, applyCampusZoomRange, applyCampusBounds } from "@app/goToCampus";
import { getSite, updateSiteViewport, updateSiteBounds, resetSiteBounds } from "../config/siteConfig.js";
import {
  getAdminMapToolsButtons,
  getAdminMapToolSection,
  removeAdminMapToolsPanelIfEmpty,
  setAdminMapToolsStatus,
} from "./adminMapToolsPanel.js";
import { identifiers } from "../utils/identifiers.js";
import { validateZoomRange } from "../utils/viewportRules.js";
import { registerBuildingUndo } from "@app/walkingRouteEditor";

const controlsClass = "site-viewport-controls";
const statusClass = "site-viewport-status";
let boundaryEditing = false;
let boundaryLayer = null;
let boundaryMarkers = [];
let boundaryPoints = [];
let boundaryOriginal = [];
let boundaryMapDraggingWasEnabled = true;

const loadSession = async () => {
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/auth/session`, {
      credentials: "include",
      cache: "no-store",
    });

    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
};

const showStatus = (message, isError = false) => {
  const status = document.querySelector(`.${controlsClass} .${statusClass}`);
  if (status) {
    status.classList.toggle("is-error", isError);
  }
  setAdminMapToolsStatus(message || "");
};

const getInputs = () => {
  const minInput = document.querySelector(`.${controlsClass} [data-site-viewport-min]`);
  const maxInput = document.querySelector(`.${controlsClass} [data-site-viewport-max]`);
  const saveButton = document.querySelector(`.${controlsClass} [data-site-viewport-save]`);
  const useMinButton = document.querySelector(`.${controlsClass} [data-site-viewport-use-min]`);
  const useMaxButton = document.querySelector(`.${controlsClass} [data-site-viewport-use-max]`);
  const editBoundsButton = document.querySelector(`.${controlsClass} [data-site-bounds-edit]`);
  const saveBoundsButton = document.querySelector(`.${controlsClass} [data-site-bounds-save]`);
  const cancelBoundsButton = document.querySelector(`.${controlsClass} [data-site-bounds-cancel]`);
  const resetBoundsButton = document.querySelector(`.${controlsClass} [data-site-bounds-reset]`);
  return { minInput, maxInput, saveButton, useMinButton, useMaxButton, editBoundsButton, saveBoundsButton, cancelBoundsButton, resetBoundsButton };
};

const boundsToLatLngs = (bounds) => {
  if (!Array.isArray(bounds) || bounds.length < 2) return [];
  if (bounds.length === 2) {
    const south = Math.min(bounds[0][0], bounds[1][0]);
    const north = Math.max(bounds[0][0], bounds[1][0]);
    const west = Math.min(bounds[0][1], bounds[1][1]);
    const east = Math.max(bounds[0][1], bounds[1][1]);
    return [[south, west], [south, east], [north, east], [north, west]];
  }
  return bounds.slice(0, -1).map((point) => [Number(point[0]), Number(point[1])]);
};

const latLngsToBounds = (latlngs) => latlngs.map((point) => [point.lat, point.lng]);

const clearBoundaryEditor = () => {
  boundaryMarkers.forEach((marker) => map.removeLayer(marker));
  boundaryMarkers = [];
  boundaryPoints = [];
  if (boundaryLayer) {
    map.removeLayer(boundaryLayer);
    boundaryLayer = null;
  }
};

const redrawBoundary = (latlngs) => {
  clearBoundaryEditor();
  boundaryPoints = latlngs.slice(0, 4).map((point) => L.latLng(point.lat, point.lng));
  const closed = [...boundaryPoints, boundaryPoints[0]];
  boundaryLayer = L.polygon(closed, {
    color: "#2563eb",
    weight: 3,
    dashArray: "8 6",
    fillColor: "#60a5fa",
    fillOpacity: 0.12,
    interactive: false,
  }).addTo(map);
  const sidePoints = [
    L.latLng(boundaryPoints[0].lat, (boundaryPoints[0].lng + boundaryPoints[1].lng) / 2),
    L.latLng((boundaryPoints[1].lat + boundaryPoints[2].lat) / 2, boundaryPoints[1].lng),
    L.latLng(boundaryPoints[2].lat, (boundaryPoints[2].lng + boundaryPoints[3].lng) / 2),
    L.latLng((boundaryPoints[3].lat + boundaryPoints[0].lat) / 2, boundaryPoints[0].lng),
  ];
  boundaryMarkers = sidePoints.map((point, side) => {
    const marker = L.marker(point, {
      draggable: true,
      zIndexOffset: 3000,
      icon: L.divIcon({ className: `site-boundary-side-marker site-boundary-side-${side}`, html: "", iconSize: [18, 18], iconAnchor: [9, 9] }),
    }).addTo(map);
    marker.on("drag", (event) => {
      const next = boundaryPoints.map((item) => L.latLng(item.lat, item.lng));
      if (side === 0) {
        next[0].lat = event.latlng.lat;
        next[1].lat = event.latlng.lat;
      } else if (side === 1) {
        next[1].lng = event.latlng.lng;
        next[2].lng = event.latlng.lng;
      } else if (side === 2) {
        next[2].lat = event.latlng.lat;
        next[3].lat = event.latlng.lat;
      } else {
        next[3].lng = event.latlng.lng;
        next[0].lng = event.latlng.lng;
      }
      boundaryPoints = next;
      boundaryLayer?.setLatLngs([...next, next[0]]);
      const first = side === 0 ? 0 : side === 1 ? 1 : side === 2 ? 2 : 3;
      const second = side === 0 ? 1 : side === 1 ? 2 : side === 2 ? 3 : 0;
      marker.setLatLng(L.latLng(
        (next[first].lat + next[second].lat) / 2,
        (next[first].lng + next[second].lng) / 2
      ));
    });
    return marker;
  });
};

const stopBoundaryEditing = () => {
  boundaryEditing = false;
  clearBoundaryEditor();
  if (boundaryMapDraggingWasEnabled) map.dragging.enable();
  const campus = getActiveCampus();
  if (campus) applyCampusBounds(campus, true);
  document.querySelector(`.${controlsClass}`)?.classList.remove("is-boundary-editing");
  const { editBoundsButton, saveBoundsButton, cancelBoundsButton, resetBoundsButton } = getInputs();
  if (editBoundsButton) editBoundsButton.hidden = false;
  if (saveBoundsButton) saveBoundsButton.hidden = true;
  if (cancelBoundsButton) cancelBoundsButton.hidden = true;
  if (resetBoundsButton) resetBoundsButton.hidden = false;
};

const startBoundaryEditing = () => {
  const campus = getActiveCampus();
  const site = campus ? getSite(campus) : null;
  const points = boundsToLatLngs(site?.bounds);
  if (!site || points.length < 3) {
    showStatus("El campus no tiene un limite editable.", true);
    return;
  }
  boundaryEditing = true;
  boundaryOriginal = points.map((point) => [...point]);
  boundaryMapDraggingWasEnabled = map.dragging.enabled();
  map.dragging.disable();
  map.setMaxBounds(null);
  map.options.maxBoundsViscosity = 0;
  redrawBoundary(points.map((point) => L.latLng(point[0], point[1])));
  document.querySelector(`.${controlsClass}`)?.classList.add("is-boundary-editing");
  const { editBoundsButton, saveBoundsButton, cancelBoundsButton, resetBoundsButton } = getInputs();
  if (editBoundsButton) editBoundsButton.hidden = true;
  if (saveBoundsButton) saveBoundsButton.hidden = false;
  if (cancelBoundsButton) cancelBoundsButton.hidden = false;
  if (resetBoundsButton) resetBoundsButton.hidden = true;
  showStatus("Arrastra los vértices para ajustar el limite y guarda cuando termines.");
};

const saveBoundary = async () => {
  const campus = getActiveCampus();
  const site = campus ? getSite(campus) : null;
  if (!site || !boundaryEditing || boundaryPoints.length < 4) return;
  const previousBounds = site.bounds.map((point) => [...point]);
  const nextBounds = latLngsToBounds(boundaryPoints);

  showStatus("Guardando limite...");

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/sites/${encodeURIComponent(campus)}/bounds`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ bounds: nextBounds }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      showStatus(data?.message || `No se pudo guardar el limite (${response.status}).`, true);
      return;
    }
  } catch (error) {
    console.error("Error guardando el limite del campus:", error);
    showStatus("Error de red al guardar el limite.", true);
    return;
  }

  if (!updateSiteBounds(campus, nextBounds)) {
    showStatus("No se pudo guardar el limite del campus.", true);
    return;
  }
  registerBuildingUndo({
    label: "editar limite del campus",
    restore: async () => {
      updateSiteBounds(campus, previousBounds);
      applyCampusBounds(campus, true);
    },
  });
  stopBoundaryEditing();
  applyCampusBounds(campus, true);
  showStatus("Limite del campus guardado.");
};

const cancelBoundary = () => {
  stopBoundaryEditing();
  showStatus("");
};

const restoreBoundary = async () => {
  const campus = getActiveCampus();
  if (!campus) return;

  showStatus("Restaurando limite...");

  try {
    await fetch(`${BACKEND_API_URL}/api/sites/${encodeURIComponent(campus)}/bounds`, {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // Continuar con el reset local incluso si el backend falla.
  }

  if (!resetSiteBounds(campus)) return;
  applyCampusBounds(campus, true);
  showStatus("Limite original restaurado.");
};

const setInputsDisabled = (disabled) => {
  const { minInput, maxInput, saveButton, useMinButton, useMaxButton } = getInputs();
  [minInput, maxInput, saveButton, useMinButton, useMaxButton].forEach((elm) => {
    if (elm) elm.disabled = disabled;
  });
};

const syncControls = () => {
  const campus = getActiveCampus();
  const site = campus ? getSite(campus) : null;
  const { minInput, maxInput } = getInputs();

  if (!site) {
    if (minInput) minInput.value = "";
    if (maxInput) maxInput.value = "";
    setInputsDisabled(true);
    showStatus("");
    return;
  }

  if (minInput) minInput.value = site.minZoom;
  if (maxInput) maxInput.value = site.maxZoom;
  setInputsDisabled(false);
  showStatus("");
};

const saveViewport = async () => {
  const campus = getActiveCampus();
  const site = campus ? getSite(campus) : null;
  if (!site) {
    showStatus("Selecciona un sitio primero.", true);
    return;
  }

  const { minInput, maxInput } = getInputs();
  const minZoom = parseInt(minInput?.value, 10);
  const maxZoom = parseInt(maxInput?.value, 10);
  const validationError = validateZoomRange(minZoom, maxZoom);
  if (validationError) {
    showStatus(validationError, true);
    return;
  }

  setInputsDisabled(true);
  showStatus("Guardando...");

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/sites/${encodeURIComponent(campus)}/viewport`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify({ minZoom, maxZoom }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      showStatus(data?.message || `No se pudo guardar el zoom (${response.status}).`, true);
      return;
    }

    if (updateSiteViewport(campus, data)) {
      applyCampusZoomRange(campus);
      showStatus("Zoom guardado y sincronizado.");
    } else {
      showStatus("No se pudo actualizar el sitio local.", true);
    }
  } catch (error) {
    console.error("Error guardando el rango de zoom:", error);
    showStatus("Error de red al guardar el zoom.", true);
  } finally {
    setInputsDisabled(false);
  }
};

const bindControls = () => {
  const { saveButton, useMinButton, useMaxButton, editBoundsButton, saveBoundsButton, cancelBoundsButton, resetBoundsButton } = getInputs();
  if (saveButton && saveButton.dataset.bound !== "true") {
    saveButton.dataset.bound = "true";
    saveButton.addEventListener("click", saveViewport);
  }
  if (useMinButton && useMinButton.dataset.bound !== "true") {
    useMinButton.dataset.bound = "true";
    useMinButton.addEventListener("click", () => {
      const { minInput } = getInputs();
      if (minInput) minInput.value = String(Math.round(map.getZoom()));
    });
  }
  if (useMaxButton && useMaxButton.dataset.bound !== "true") {
    useMaxButton.dataset.bound = "true";
    useMaxButton.addEventListener("click", () => {
      const { maxInput } = getInputs();
      if (maxInput) maxInput.value = String(Math.round(map.getZoom()));
    });
  }
  if (editBoundsButton && editBoundsButton.dataset.bound !== "true") {
    editBoundsButton.dataset.bound = "true";
    editBoundsButton.addEventListener("click", startBoundaryEditing);
  }
  if (saveBoundsButton && saveBoundsButton.dataset.bound !== "true") {
    saveBoundsButton.dataset.bound = "true";
    saveBoundsButton.addEventListener("click", saveBoundary);
  }
  if (cancelBoundsButton && cancelBoundsButton.dataset.bound !== "true") {
    cancelBoundsButton.dataset.bound = "true";
    cancelBoundsButton.addEventListener("click", cancelBoundary);
  }
  if (resetBoundsButton && resetBoundsButton.dataset.bound !== "true") {
    resetBoundsButton.dataset.bound = "true";
    resetBoundsButton.addEventListener("click", restoreBoundary);
  }

};

const createSiteViewportControls = () => {
  const sectionBody = getAdminMapToolSection("dimensions");
  if (!sectionBody) return;

  if (!document.querySelector(`.${controlsClass}`)) {
    sectionBody.insertAdjacentHTML(
      "beforeend",
      `
      <div class="${controlsClass}">
          <div class="site-viewport-fields">
            <label class="site-viewport-field">M&iacute;n
              <input type="number" min="0" max="21" step="1" data-site-viewport-min />
            </label>
            <label class="site-viewport-field">M&aacute;x
              <input type="number" min="0" max="21" step="1" data-site-viewport-max />
            </label>
          </div>
          <div class="site-viewport-actions">
            <div class="site-viewport-current-actions">
              <button type="button" class="dashboard-link" data-site-viewport-use-min title="Usar el zoom actual como m&iacute;nimo">Actual min</button>
              <button type="button" class="dashboard-link" data-site-viewport-use-max title="Usar el zoom actual como m&aacute;ximo">Actual max</button>
            </div>
            <button type="button" class="dashboard-link site-viewport-save" data-site-viewport-save>Guardar zoom</button>
          </div>
          <div class="site-viewport-boundary-actions">
            <button type="button" class="dashboard-link" data-site-bounds-edit>Editar limite</button>
            <button type="button" class="dashboard-link action-save-button" data-site-bounds-save hidden>Guardar limite</button>
            <button type="button" class="dashboard-link action-cancel-button" data-site-bounds-cancel hidden>Cancelar</button>
            <button type="button" class="dashboard-link" data-site-bounds-reset>Restaurar limite</button>
          </div>
          <div class="${statusClass}"></div>
      </div>
      `
    );
  }

  bindControls();
  syncControls();
};

const removeSiteViewportControls = () => {
  document.querySelector(`.${controlsClass}`)?.remove();
  removeAdminMapToolsPanelIfEmpty();
};

export const syncSiteViewportPanelForSession = (session) => {
  if (session?.isAdmin) {
    createSiteViewportControls();
  } else {
    removeSiteViewportControls();
  }
};

export const initSiteViewportPanel = async () => {
  const session = await loadSession();
  syncSiteViewportPanelForSession(session);
};

window.addEventListener(identifiers.events.sessionChanged, (event) => {
  syncSiteViewportPanelForSession(event.detail || {});
});

window.addEventListener(identifiers.events.campusChanged, () => {
  if (boundaryEditing) stopBoundaryEditing();
  syncControls();
});

window.addEventListener("adminMapToolsHidden", () => {
  if (boundaryEditing) stopBoundaryEditing();
  showStatus("");
});

window.addEventListener("adminMapToolSectionChanged", (event) => {
  const detail = event.detail || {};
  if (boundaryEditing && (detail.key !== "dimensions" || !detail.open)) stopBoundaryEditing();
});
