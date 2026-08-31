/////////////////////////////////////////////////////////////////////////////////
/////////////////// Create buttons to choose campus location ////////////////////
/////////////////////////////////////////////////////////////////////////////////

var location = "";

import { map, toggleLocationTracking } from "../views/map.js";

import {
  showSearch,
  removeSearchContainerElements,
} from "@app/autocompleteSearchBox";

import { addDataToMap, clearAllMapData, resetBuildingsCatalogCache } from "./addData.js";

import { resetSearchMetadataCaches } from "@app/searchMetadata";
import { identifiers } from "./identifiers.js";
import { getSite, hasCampus, setActiveCampus } from "../config/siteConfig.js";
import { resolveFloorButtonId } from "./floorButtons.js";

const selectFloor = (floorButtonId) => {
  var floorButtonsId = document.querySelectorAll("#floorButtons-container [id^='b']");
  floorButtonsId = Array.from(floorButtonsId).map((element) => element.id);
  floorButtonsId.filter((value, index, array) => {
    if (value == floorButtonId) {
      array.splice(index, 1);
      return true;
    }
    return false;
  });
  document.getElementById(floorButtonId).classList.add("selectedFloorButton");
  for (var i = 0; i < floorButtonsId.length; i++) {
    document
      .getElementById(floorButtonsId[i])
      .classList.remove("selectedFloorButton");
  }
};

const addFloorData = (school, floorButtonId, location) => {
  const floorButton = document.getElementById(floorButtonId);
  if (!floorButton) {
    return;
  }

  addDataToMap(
    school,
    parseInt(floorButton.innerHTML),
    location
  );
  window.dispatchEvent(new CustomEvent(identifiers.events.mapDataRefreshed));
};

const forceChange = (school, button, location) => {
  addFloorData(school, button, location);
  selectFloor(button);
};

const applySiteZoomRange = (campusInfo) => {
  const minZoom = Number(campusInfo?.minZoom);
  const maxZoom = Number(campusInfo?.maxZoom);

  map.setMinZoom(Number.isInteger(minZoom) && minZoom >= 0 ? minZoom : 0);
  map.setMaxZoom(Number.isInteger(maxZoom) && maxZoom >= 0 ? Math.min(maxZoom, 19) : 19);
};

const applySyntroBounds = (campusInfo, preserveView = false) => {
  if (!Array.isArray(campusInfo?.bounds) || campusInfo.bounds.length < 2) {
    map.setMaxBounds(null);
    applySiteZoomRange(campusInfo);
    return;
  }

  const bounds = L.latLngBounds(campusInfo.bounds);
  map.setMaxBounds(bounds.pad(0.02));
  map.options.maxBoundsViscosity = 1.0;
  applySiteZoomRange(campusInfo);

  if (!preserveView) {
    map.fitBounds(bounds, {
      animate: false,
      padding: [20, 20],
      maxZoom: campusInfo.zoom,
    });
  } else {
    map.panInsideBounds(bounds, { animate: false });
  }
};

/////////////////////////////////////////////////////////////////////////////////
/////////////////// Create buttons for displaying each floor ////////////////////
/////////////////////////////////////////////////////////////////////////////////

document.getElementById("bLoc").onclick = function () {
  toggleLocationTracking();
};

document.getElementById("bLoc").setAttribute("aria-label", "Activar seguimiento de ubicación");
document.getElementById("bLoc").setAttribute("aria-pressed", "false");
document.getElementById("bLoc").title = "Activar seguimiento de ubicación";

/////////////////////////////////////////////////////////////////////////////////
////////////////// Export functions to go to a specific campus //////////////////
/////////////////////////////////////////////////////////////////////////////////

const removeFloorButtons = () => {
  var floorButtons = document.querySelectorAll("#floorButtons-container [id^='b']");

  for (var i = 0; i < floorButtons.length; i++) {
    if (floorButtons[i].id == "bLoc") continue;
    floorButtons[i].remove();
  }
};

const dispatchCampusChanged = (campus) => {
  window.dispatchEvent(new CustomEvent(identifiers.events.campusChanged, { detail: { campus } }));
};

export const goToFreeMap = () => {
  location = "";
  setActiveCampus("");
  removeSearchContainerElements();
  removeFloorButtons();
  clearAllMapData();
  map.setView([0, 0], 2);
  map.setMaxBounds(null);
  map.setMinZoom(0);
  map.setMaxZoom(19);
  dispatchCampusChanged("");
};

export const getActiveCampus = () => location;

export const applyCampusZoomRange = (campus) => {
  if (!hasCampus(campus)) {
    return;
  }
  applySiteZoomRange(getSite(campus));
};

export const goTo = (campus, options = {}) => {
  if (!hasCampus(campus)) {
    return;
  }

  const preserveView = !!options.preserveView;
  var campus_info = getSite(campus);
  location = campus;
  setActiveCampus(campus);
  removeSearchContainerElements();
  if (Array.isArray(campus_info?.bounds)) {
    applySyntroBounds(campus_info, preserveView);
  } else {
    if (!preserveView) {
      map.setView(campus_info["center"], campus_info["zoom"]);
    }
    applySiteZoomRange(campus_info);
  }
  // select in js all elements with id b*
  removeFloorButtons();
  // create new buttons
  for(var i = 0; i < campus_info["floors"].length; i++) {
    var button = document.createElement("button");
    button.id = "b" + i;
    
    button.innerHTML = parseInt(campus_info["floors"][i]);
    button.classList.add("floorButton");
    
    document.getElementById("floorButtons-container").appendChild(button);
  }

  showSearch(location, campus_info["school"]);

  document.querySelectorAll("#floorButtons-container [id^='b']").forEach((button) => {
    if (button.id == "bLoc") return;
    
    button.onclick = function () {
      forceChange(campus_info["school"], button.id, location);
    };
  });

  dispatchCampusChanged(location);

  return;
};

export const setDefaultFloor = (campus) => {
  if (!hasCampus(campus)) {
    return;
  }

  const campusInfo = getSite(campus);
  const buttonId = resolveFloorButtonId(campusInfo["defaultFloor"], campusInfo["floors"]);

  if (document.getElementById(buttonId)) {
    forceChange(campusInfo["school"], buttonId, campus);
  }

  return;
};
export const refreshCurrentMapData = () => {
  if (!hasCampus(location)) {
    return;
  }

  const selectedFloorButton = document.getElementsByClassName("selectedFloorButton")[0];
  if (!selectedFloorButton) {
    return;
  }

  const campusInfo = getSite(location);
  const currentFloor = parseInt(selectedFloorButton.innerHTML, 10);

  resetSearchMetadataCaches();
  resetBuildingsCatalogCache();
  removeSearchContainerElements();
  showSearch(location, campusInfo["school"]);
  addDataToMap(campusInfo["school"], currentFloor, location);
  window.dispatchEvent(new CustomEvent(identifiers.events.mapDataRefreshed));
};




