import { map, BACKEND_API_URL } from "../views/map.js";
import { getPrimaryCampusKey } from "../utils/campusConfig.js";
import { refreshCurrentMapData } from "@app/goToCampus";
import { resetBuildingsCatalogCache } from "@app/addData";
import { resetSearchMetadataCaches } from "@app/searchMetadata";
import {
  getAdminMapToolSection,
  removeAdminMapToolsPanelIfEmpty,
  requestAdminMapToolMode,
  setAdminMapToolActiveMode,
  setAdminMapToolsStatus,
} from "@app/adminMapToolsPanel";
import { registerBuildingUndo } from "@app/walkingRouteEditor";

let isDrawing = false;
let points = [];
let previewLayer = null;
let markerLayer = null;
let modalRoot = null;

const editorStatusId = "manual-building-editor-status";
const editorButtonId = "manual-building-editor-toggle";
const activeActionsClass = "manual-building-active-actions";

const getEditorButton = () => document.getElementById(editorButtonId);
const getEditorControls = () => document.getElementById("manual-building-editor-controls");

const setToolButtonContent = (button, icon, label = "") => {
  const labelMarkup = label ? `<span class="map-tool-button-label">${label}</span>` : "";
  button.innerHTML = `<span class="map-tool-button-icon" aria-hidden="true">${icon}</span>${labelMarkup}`;
  button.classList.toggle("is-icon-only", !label);
};

const setStatus = (message) => {
  setAdminMapToolsStatus(message);
};

const removeActiveControls = () => {
  document.querySelector(`.${activeActionsClass}`)?.remove();
};

const buildActionButtons = () => {
  const wrapper = document.createElement("div");
  wrapper.className = `${activeActionsClass} building-geometry-active-actions`;
  wrapper.innerHTML = `
    <button type="button" class="dashboard-link manual-building-editor-button building-tool-button action-save-button is-icon-only" data-manual-building-save-shape title="Guardar forma" aria-label="Guardar forma"><span class="map-tool-button-icon" aria-hidden="true">✓</span></button>
    <button type="button" class="dashboard-link action-cancel-button is-icon-only" data-manual-building-cancel-shape title="Cancelar" aria-label="Cancelar"><span class="map-tool-button-icon" aria-hidden="true">&times;</span></button>
  `;
  wrapper.querySelector("[data-manual-building-save-shape]")?.classList.remove("building-tool-button");

  wrapper.querySelector("[data-manual-building-save-shape]")?.addEventListener("click", finishPolygon);
  wrapper.querySelector("[data-manual-building-cancel-shape]")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    stopDrawing();
    setStatus("");
  });

  return wrapper;
};

const setActiveControls = () => {
  const controls = getEditorControls();
  if (!controls || controls.querySelector(`.${activeActionsClass}`)) return;
  controls.appendChild(buildActionButtons());
};

const clearPreview = () => {
  if (previewLayer) {
    map.removeLayer(previewLayer);
    previewLayer = null;
  }

  if (markerLayer) {
    map.removeLayer(markerLayer);
    markerLayer = null;
  }
};

const redrawPreview = () => {
  clearPreview();

  markerLayer = L.layerGroup(
    points.map((point) =>
      L.circleMarker(point, {
        radius: 5,
        color: "#003366",
        weight: 2,
        fillColor: "#99f6e4",
        fillOpacity: 0.9,
      })
    )
  ).addTo(map);

  if (points.length >= 2) {
    previewLayer = L.polyline(points, {
      color: "#003366",
      weight: 3,
      dashArray: "6 6",
    }).addTo(map);
  }
};

const buildDefaultId = () => `MAN-BLD-${Date.now().toString().slice(-6)}`;

const removeModal = () => {
  modalRoot?.remove();
  modalRoot = null;
};

const getFormValue = (form, name) => String(form.elements[name]?.value || "").trim();

const submitManualBuildingForm = async (form) => {
  const externalId = getFormValue(form, "externalId");
  const displayName = getFormValue(form, "displayName");
  const campus = getFormValue(form, "campus") || getPrimaryCampusKey();
  const floorsCsv = getFormValue(form, "floorsCsv") || "0, 1";
  const type = getFormValue(form, "type") || "manual";
  const notes = getFormValue(form, "notes");
  const coordinates = points.map((point) => [point.lng, point.lat]);

  if (!externalId || !displayName) {
    setStatus("Completa ID y nombre del edificio.");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_API_URL}/api/manual-buildings`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        externalId,
        campus,
        displayName,
        floorsCsv,
        type,
        notes,
        coordinates,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.message || "No se pudo guardar el edificio manual.");
    }

    registerBuildingUndo({
      label: "crear edificio",
      restore: async () => {
        const undoResponse = await fetch(`${BACKEND_API_URL}/api/manual-buildings/${encodeURIComponent(externalId)}`, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        });
        if (!undoResponse.ok) throw new Error("No se pudo deshacer la creación del edificio.");
        resetSearchMetadataCaches();
        resetBuildingsCatalogCache();
        await refreshCurrentMapData();
      },
    });

    removeModal();
    stopDrawing();
    resetSearchMetadataCaches();
    resetBuildingsCatalogCache();
    refreshCurrentMapData();
    setStatus("Edificio manual guardado correctamente.");
  } catch (error) {
    setStatus(error.message || "Error guardando edificio manual.");
  }
};

const openManualBuildingForm = () => {
  removeModal();

  modalRoot = document.createElement("div");
  modalRoot.className = "manual-building-modal-backdrop";
  modalRoot.innerHTML = `
    <div class="manual-building-modal" role="dialog" aria-modal="true" aria-label="Agregar edificio">
      <div class="manual-building-modal-header">
        <div>
          <div class="manual-building-modal-title">Agregar edificio</div>
          <div class="manual-building-modal-subtitle">${points.length} puntos marcados en el mapa</div>
        </div>
        <button type="button" class="manual-building-icon-button" data-manual-building-close>&times;</button>
      </div>
      <form class="manual-building-form">
        <label>
          <span>ID</span>
          <input name="externalId" value="${buildDefaultId()}" required />
        </label>
        <label>
          <span>Nombre</span>
          <input name="displayName" value="Nuevo edificio manual" required />
        </label>
        <label>
          <span>Campus</span>
          <input name="campus" value="${getPrimaryCampusKey()}" />
        </label>
        <label>
          <span>Pisos</span>
          <input name="floorsCsv" value="0, 1" />
        </label>
        <label>
          <span>Tipo</span>
          <input name="type" value="manual" />
        </label>
        <label>
          <span>Notas</span>
          <textarea name="notes" rows="3"></textarea>
        </label>
        <div class="manual-building-modal-actions">
          <button type="button" class="manual-building-secondary" data-manual-building-cancel>Cancelar</button>
          <button type="submit" class="manual-building-primary">Guardar edificio</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modalRoot);

  const form = modalRoot.querySelector("form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitManualBuildingForm(form);
  });

  modalRoot.querySelector("[data-manual-building-close]")?.addEventListener("click", removeModal);
  modalRoot.querySelector("[data-manual-building-cancel]")?.addEventListener("click", removeModal);
};

const stopDrawing = ({ clearActiveTool = true } = {}) => {
  isDrawing = false;
  points = [];
  clearPreview();
  map.off("click", handleMapClick);
  map.off("dblclick", finishPolygon);
  map.doubleClickZoom.enable();
  getEditorButton()?.classList.remove("is-active");
  removeActiveControls();
  if (clearActiveTool) {
    setAdminMapToolActiveMode(null);
  }
};

async function finishPolygon(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.originalEvent?.preventDefault?.();
  event?.originalEvent?.stopPropagation?.();

  if (!isDrawing || points.length < 3) {
    setStatus("Marca al menos 3 puntos para guardar la forma.");
    return;
  }

  openManualBuildingForm();
}

function handleMapClick(event) {
  if (!isDrawing) return;

  points.push(event.latlng);
  redrawPreview();
  setStatus(`${points.length} punto(s). Usa Guardar forma para continuar.`);
}

const startDrawing = () => {
  stopDrawing();
  requestAdminMapToolMode("manual-building");
  isDrawing = true;
  points = [];
  map.doubleClickZoom.disable();
  map.on("click", handleMapClick);
  map.on("dblclick", finishPolygon);
  getEditorButton()?.classList.add("is-active");
  setActiveControls();
  setStatus("Modo agregar edificio: marca puntos en el mapa.");
};

const toggleDrawing = () => {
  if (isDrawing) {
    stopDrawing();
    setStatus("");
    return;
  }

  startDrawing();
};

const createEditorControls = () => {
  const sectionBody = getAdminMapToolSection("buildings");
  if (!sectionBody || getEditorButton()) return;

  const wrapper = document.createElement("div");
  wrapper.id = "manual-building-editor-controls";
  wrapper.className = "admin-map-tools-group";

  const button = document.createElement("button");
  button.id = editorButtonId;
  button.className = "dashboard-link manual-building-editor-button building-tool-button";
  button.type = "button";
  setToolButtonContent(button, "+");
  button.title = "Agregar edificio";
  button.setAttribute("aria-label", button.title);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleDrawing();
  });

  wrapper.appendChild(button);
  sectionBody.appendChild(wrapper);
};

const removeEditorControls = () => {
  stopDrawing();
  removeModal();
  getEditorControls()?.remove();
  removeAdminMapToolsPanelIfEmpty();
};

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

export const initManualBuildingEditor = async () => {
  const session = await loadSession();
  syncManualBuildingEditorForSession(session);
};

export const syncManualBuildingEditorForSession = (session) => {
  if (session?.isAdmin) {
    createEditorControls();
  } else {
    removeEditorControls();
  }
};

window.addEventListener("syntro-session-changed", (event) => {
  syncManualBuildingEditorForSession(event.detail || {});
});

window.addEventListener("syntro-admin-map-tool-mode", (event) => {
  if (event.detail?.mode !== "manual-building" && isDrawing) {
    stopDrawing({ clearActiveTool: false });
  }
});
