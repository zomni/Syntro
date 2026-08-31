/////////////////////////////////////////////////////////////////////////////////
////////////////// Url search by id redirection to map feature //////////////////
/////////////////////////////////////////////////////////////////////////////////

import { goTo } from "@app/goToCampus";
import { map } from "../views/map.js";
import { openBuildingPopupLayer, setCurrentOpenFeatureId } from "@app/featureDisplay";
import { getPrimaryCampusKey, getCurrentCampusKey } from "./campusConfig.js";
import { hasCampus } from "../config/siteConfig.js";

const url = new URL(window.location.href);
const MAX_ATTEMPTS = 48;
const RETRY_DELAY_MS = 250;

const getDeepLinkCampus = () => {
  const current = getCurrentCampusKey();
  if (current && hasCampus(current)) {
    return current;
  }
  return getPrimaryCampusKey();
};

const clearDeepLinkFromUrl = () => {
  if (!window.history?.replaceState) {
    return;
  }

  window.history.replaceState({}, document.title, window.location.pathname);
};

const getFeatureLayerById = (featureId) => {
  let matchedLayer = null;

  map.eachLayer((layer) => {
    if (matchedLayer) {
      return;
    }

    if (layer?.feature?.properties?.id === featureId) {
      matchedLayer = layer;
      return;
    }

    if (typeof layer?.eachLayer === "function") {
      layer.eachLayer((childLayer) => {
        if (matchedLayer) {
          return;
        }

        if (childLayer?.feature?.properties?.id === featureId) {
          matchedLayer = childLayer;
        }
      });
    }
  });

  return matchedLayer;
};

const getFloorButtons = () =>
  Array.from(document.querySelectorAll("#floorButtons-container .floorButton")).filter(
    (button) => button.id !== "bLoc"
  );

const getFloorButtonForValue = (floorValue) => {
  const normalizedFloor = String(floorValue ?? "0").trim();
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
    console.warn("No se encontraron botones de piso para resolver el deep link.");
    clearDeepLinkFromUrl();
    return;
  }

  window.setTimeout(() => waitForFloorButtons(callback, attempt + 1), RETRY_DELAY_MS);
};

const openFeatureLayer = (featureId, zoom) => {
  const layer = getFeatureLayerById(featureId);
  if (!layer) {
    return false;
  }

  openBuildingPopupLayer(layer, {
    zoom: true,
    rememberView: true,
    maxZoom: zoom ?? 20,
    padding: [40, 40],
  });

  clearDeepLinkFromUrl();
  return true;
};

const waitForFeatureLayer = (featureId, zoom, attempt = 0) => {
  const opened = openFeatureLayer(featureId, zoom);
  if (opened) {
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    console.warn(`No se encontro el edificio ${featureId} durante el deep link.`);
    clearDeepLinkFromUrl();
    return;
  }

  window.setTimeout(() => {
    waitForFeatureLayer(featureId, zoom, attempt + 1);
  }, RETRY_DELAY_MS);
};

const getRequestedFloor = () => {
  const rawFloor = url.searchParams.get("floor");
  const parsedFloor = Number(rawFloor);
  return Number.isFinite(parsedFloor) ? parsedFloor : 0;
};

const getRequestedZoom = () => {
  const rawZoom = Number(url.searchParams.get("zoom") || 20);
  return Number.isFinite(rawZoom) ? rawZoom : 20;
};

const loadFeatureFromUrl = () => {
  const featureId = url.searchParams.get("id");
  if (!featureId) {
    return;
  }

  const requestedFloor = getRequestedFloor();
  const requestedDeviceKey = url.searchParams.get("deviceKey") || "";
  const requestedView = url.searchParams.get("view") || (requestedDeviceKey ? "devices" : "summary");
  const requestedRoomId = url.searchParams.get("roomId") || "";
  const requestedZoom = getRequestedZoom();

  if (typeof window.preparePopupNavigation === "function") {
    window.preparePopupNavigation(featureId, requestedView, requestedRoomId, requestedDeviceKey);
  }

  setCurrentOpenFeatureId(featureId);
  goTo(getDeepLinkCampus());

  waitForFloorButtons((floorButtons) => {
    const fallbackFloorButton = getFloorButtonForValue(0) || floorButtons[0] || null;
    const requestedFloorButton = getFloorButtonForValue(requestedFloor) || fallbackFloorButton;

    if (!requestedFloorButton) {
      console.warn("No se pudo resolver un piso para el deep link del mapa.");
      clearDeepLinkFromUrl();
      return;
    }

    requestedFloorButton.click();

    window.setTimeout(() => {
      waitForFeatureLayer(featureId, requestedZoom);
    }, RETRY_DELAY_MS);
  });
};

if (url.searchParams.get("id") != null) {
  loadFeatureFromUrl();
}




