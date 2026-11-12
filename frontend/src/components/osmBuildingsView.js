import { identifiers } from "../utils/identifiers.js";

const CDN = "https://cdn.osmbuildings.org/4.1.1";
const BUILDINGS = "https://{s}.data.osmbuildings.org/0.2/59fcc2e8/tile/{z}/{x}/{y}.json";

export function initOsmBuildingsView(map) {
  const toggle = document.getElementById("osm-3d-toggle");
  const back = document.getElementById("osm-3d-return");
  const view = document.getElementById("osm-3d-view");
  const status = document.getElementById("osm-3d-status");
  if (!toggle || !back || !view || !status) return;

  let viewer;
  let pending;
  let savedView;
  let currentView;
  let opening = false;
  let syncTimer;

  const editing = () => document.documentElement.dataset.adminMapToolMode ||
    document.getElementById("room-editor-popup") || document.querySelector(".is-boundary-editing");

  function syncView() {
    if (!viewer) return;
    const center = map.getCenter();
    const zoom = Math.max(15, Math.min(20, map.getZoom()));
    if (!currentView || center.lat !== currentView.lat || center.lng !== currentView.lng) {
      viewer.setPosition({ latitude: center.lat, longitude: center.lng });
    }
    if (!currentView || zoom !== currentView.zoom) viewer.setZoom(zoom);
    currentView = { lat: center.lat, lng: center.lng, zoom };
  }

  function prepare() {
    if (viewer) return Promise.resolve(viewer);
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      if (window.OSMBuildings) { resolve(); return; }
      const style = document.createElement("link");
      style.rel = "stylesheet";
      style.href = `${CDN}/OSMBuildings.css`;
      document.head.appendChild(style);
      const script = document.createElement("script");
      script.src = `${CDN}/OSMBuildings.js`;
      script.onload = () => window.OSMBuildings ? resolve() : reject(new Error("OSM Buildings unavailable"));
      script.onerror = () => { script.remove(); style.remove(); reject(new Error("OSM Buildings unavailable")); };
      document.head.appendChild(script);
    }).then(() => {
      const center = map.getCenter();
      const zoom = Math.max(15, Math.min(20, map.getZoom()));
      viewer = new window.OSMBuildings({
        container: "osm-3d-map",
        position: { latitude: center.lat, longitude: center.lng },
        zoom, minZoom: 15, maxZoom: 20, tilt: 30,
        attribution: '© Data <a href="https://openstreetmap.org/copyright/">OpenStreetMap</a> © Map <a href="https://osmbuildings.org/copyright/">OSM Buildings</a>',
      });
      currentView = { lat: center.lat, lng: center.lng, zoom };
      viewer.addMapTiles("https://tile-a.openstreetmap.fr/hot/{z}/{x}/{y}.png");
      viewer.addGeoJSONTiles(BUILDINGS, { fixedZoom: 15 });
      return viewer;
    }).catch((error) => {
      if (viewer) viewer.destroy();
      viewer = null;
      pending = null;
      throw error;
    });
    return pending;
  }

  window.addEventListener(identifiers.events.campusChanged, () => {
    prepare().then(syncView).catch(() => {
      status.textContent = "No se pudo precargar la vista 3D. Pulsa el boton para reintentar.";
    });
  });
  map.on("moveend", () => {
    if (!viewer || view.classList.contains("is-active")) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncView, 800);
  });

  toggle.addEventListener("click", async () => {
    if (opening) return;
    if (editing()) {
      status.textContent = "Termina o cancela la edicion antes de abrir la vista 3D.";
      return;
    }
    opening = true;
    toggle.disabled = true;
    status.textContent = "Preparando vista 3D...";
    try {
      await prepare();
      if (editing()) {
        status.textContent = "Termina o cancela la edicion antes de abrir la vista 3D.";
        return;
      }
      clearTimeout(syncTimer);
      savedView = { center: map.getCenter(), zoom: map.getZoom() };
      syncView();
      viewer.setRotation(0);
      viewer.setTilt(30);
      const size = viewer.getSize && viewer.getSize();
      if (viewer.setSize && (!size || size.width !== view.clientWidth || size.height !== view.clientHeight)) {
        viewer.setSize(view.clientWidth, view.clientHeight);
      }
      view.classList.add("is-active");
      view.setAttribute("aria-hidden", "false");
      back.setAttribute("tabindex", "0");
      toggle.setAttribute("aria-pressed", "true");
      toggle.classList.add("is-active");
      toggle.classList.remove("is-muted");
      status.textContent = "";
      if (back.focus) back.focus();
    } catch (error) {
      status.textContent = "No se pudo cargar la vista 3D. El mapa 2D sigue disponible.";
    } finally {
      opening = false;
      toggle.disabled = false;
    }
  });

  back.addEventListener("click", () => {
    view.classList.remove("is-active");
    view.setAttribute("aria-hidden", "true");
    back.setAttribute("tabindex", "-1");
    toggle.setAttribute("aria-pressed", "false");
    toggle.classList.remove("is-active");
    toggle.classList.add("is-muted");
    status.textContent = "";
    map.invalidateSize();
    if (savedView && map.setView) map.setView(savedView.center, savedView.zoom, { animate: false });
    currentView = null;
    syncView();
    if (toggle.focus) toggle.focus();
  });
}
