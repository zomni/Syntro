// Apply instance theme before any UI renders (SPEC 01/02).
import { applyBrandingTheme, appConfig } from "./config/appConfig.js";

// Load site configuration from the backend session, with
// fallback to the static campuses.js template.
import {
  loadSites,
  getBackendAuthStatus,
  getPrimaryCampusKey,
} from "./config/siteConfig.js";
import { identifiers } from "./utils/identifiers.js";
import { goTo, setDefaultFloor } from "@app/goToCampus";

// Search for the feature by id/alias in URL
import "@app/findByUrl";

// Building-to-building route planner
import "@app/routePlanner";

// Backend session mode indicator
import { initSessionModeBadge } from "@app/sessionModeBadge";

// Session expiry warning overlay with automatic renewal on activity
import { initSessionExpiryOverlay } from "@app/sessionExpiryOverlay";

// Manual building polygon editor for admins
import { initManualBuildingEditor } from "@app/manualBuildingEditor";

// Existing building geometry editor for admins
import { initBuildingGeometryEditor } from "@app/buildingGeometryEditor";

// Campus-wide icon markers editor for admins
import { initCampusMarkerEditor } from "@app/campusMarkerEditor";

// Walking route network editor for admins
import { initWalkingRouteEditor } from "@app/walkingRouteEditor";

// Persistent walking route visibility layer
import { initWalkingRouteLayer } from "@app/walkingRouteLayer";

// Network telemetry panel and heat overlay
import { initNetworkTelemetryPanel } from "@app/networkTelemetryPanel";

// Site zoom range (min/max) editing from the map
import { initSiteViewportPanel } from "@app/siteViewportPanel";

// Room editor for admins
import { initRoomEditor } from "@app/roomEditor";

// Mobile "wayfinding" mode (map only: orientation + routes)
import { initWayfindingMode } from "./utils/wayfinding.js";
import { initWayfindingControls } from "@app/featureDisplay";

applyBrandingTheme();

initWayfindingMode();

const bootstrapLoadingOverlay = document.getElementById("map-loading-overlay");
if (bootstrapLoadingOverlay) {
  bootstrapLoadingOverlay.hidden = false;
}

window.addEventListener(
  identifiers.events.mapDataRefreshed,
  () => {
    const overlay = document.getElementById("map-loading-overlay");
    if (overlay) {
      overlay.hidden = true;
    }
  },
  { once: true }
);

loadSites();

const urlParams = new URLSearchParams(window.location.search);
const cameFromWelcome = urlParams.has("welcome");

const runWelcomeLoading = () => {
  const overlay = document.getElementById("welcome-loading-overlay");
  if (!overlay) return;

  overlay.hidden = false;
  overlay.classList.remove("is-fading");

  window.setTimeout(() => {
    if (!overlay.isConnected) return;
    overlay.classList.add("is-fading");
    window.setTimeout(() => {
      overlay.hidden = true;
    }, 500);
  }, 2000);
};

window.showWelcomeLoading = runWelcomeLoading;

const handleWelcomeGate = () => {
  loadSites().then(() => {
    if (cameFromWelcome) {
      runWelcomeLoading();
      return;
    }

    const authStatus = getBackendAuthStatus();
    if (authStatus === false) {
      window.location.replace(`${appConfig.apiBaseUrl}/Auth/Login`);
      return;
    }
  });
};

handleWelcomeGate();

let appliedInitialCampus = false;

const applyInitialCampus = () => {
  if (appliedInitialCampus) {
    return;
  }
  appliedInitialCampus = true;

  const primary = getPrimaryCampusKey();
  if (primary) {
    goTo(primary);
    setDefaultFloor(primary);
  }
};

window.addEventListener(identifiers.events.sitesLoaded, applyInitialCampus);

initSessionModeBadge();
initSessionExpiryOverlay();
initWalkingRouteLayer();
initNetworkTelemetryPanel();
initManualBuildingEditor();
initBuildingGeometryEditor();
initCampusMarkerEditor();
initRoomEditor();
initWalkingRouteEditor();
initSiteViewportPanel();

initWayfindingControls();
window.addEventListener("syntro-wayfinding-changed", initWayfindingControls);
