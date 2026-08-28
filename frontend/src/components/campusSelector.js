/////////////////////////////////////////////////////////////////////////////////
/////////////////// Create buttons to choose campus location ////////////////////
/////////////////////////////////////////////////////////////////////////////////

import { getCookie } from "../utils/locationCookie.js";
import { goTo, goToFreeMap, getActiveCampus, setDefaultFloor } from "@app/goToCampus";
import { getSites, hasCampus, loadSites, getOrganizationName, getOrganizationColor, getSiteOrganizationName, getSiteOrganizationColor } from "../config/siteConfig.js";
import { identifiers } from "../utils/identifiers.js";

var SelectDiv,
  numberOfOptions,
  selectElmnts,
  selectedOption,
  optionsDiv,
  newSelectDivs;
SelectDiv = document.getElementById("custom-select");
selectElmnts = SelectDiv.getElementsByTagName("select")[0];

const EMPTY_LABEL = "Organización";

const parseHex = (hex) => {
  const h = hex.replace("#", "");
  if (h.length === 3) return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
};

const textColorFor = (hex) => {
  if (!hex || hex.length < 4) return "white";
  const [r, g, b] = parseHex(hex);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 150 ? "#1a1a1a" : "white";
};

const darken = (hex, amount = 0.2) => {
  if (!hex || hex.length < 4) return "var(--pi-primary)";
  const [r, g, b] = parseHex(hex);
  const d = (v) => Math.max(0, Math.round(v * (1 - amount)));
  return `rgb(${d(r)},${d(g)},${d(b)})`;
};

const setCampusBar = () => {
  const divs = document.getElementById("selected-option");
  if (!divs) {
    return;
  }

  const activeCampus = getActiveCampus();
  const siteName = activeCampus ? getSiteOrganizationName(activeCampus) : "";
  const siteColor = activeCampus ? getSiteOrganizationColor(activeCampus) : "";
  const label = activeCampus ? (siteName || getOrganizationName() || EMPTY_LABEL) : EMPTY_LABEL;
  divs.innerHTML = label;
  divs.classList.toggle("is-free-visible", Boolean(activeCampus));

  const color = siteColor || getOrganizationColor();
  if (activeCampus && color) {
    divs.style.backgroundColor = color;
    divs.style.borderColor = color;
    divs.style.color = textColorFor(color);
  } else {
    divs.style.backgroundColor = "";
    divs.style.borderColor = "";
    divs.style.color = "";
  }

  const freeButton = document.getElementById("campus-free-map-button");
  if (freeButton) {
    freeButton.hidden = !activeCampus;
  }

  updateTitleBadge();
};

const setSelectValue = (campus) => {
  const selectedIndex = Array.from(selectElmnts.options).findIndex((option) => option.value === campus);
  selectElmnts.selectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
};

const activateCampus = (campus, applyDefaultFloor = true) => {
  if (!campus || !hasCampus(campus)) {
    setSelectValue("");
    setCampusBar();
    goToFreeMap();
    return;
  }

  setSelectValue(campus);
  setCampusBar();
  goTo(campus);

  if (applyDefaultFloor) {
    setDefaultFloor(campus);
  }
};

const addOption = (campusKey, site) => {
  const selec = document.createElement("option");
  selec.value = campusKey;
  selec.innerHTML = `Sitio: ${site["fullName"]}`;
  selectElmnts.appendChild(selec);
};

const buildOptionDivs = () => {
  optionsDiv.innerHTML = "";
  const sites = getSites();
  numberOfOptions = selectElmnts.length;

  for (var j = 0; j < numberOfOptions; j++) {
    newSelectDivs = document.createElement("DIV");
    newSelectDivs.innerHTML = selectElmnts.options[j].innerHTML;
    const optKey = selectElmnts.options[j].value;
    const optColor = (optKey && getSiteOrganizationColor(optKey)) || getOrganizationColor();
    if (optColor) {
      newSelectDivs.style.borderLeft = `4px solid ${optColor}`;
    }
    newSelectDivs.addEventListener("click", function () {
      const campusValue = Array.from(selectElmnts.options).find(
        (option) => option.innerHTML === this.innerHTML
      )?.value;

      activateCampus(campusValue, true);
      this.parentNode.previousSibling.click();

      const selectedItems = this.parentNode.getElementsByClassName("same-as-selected");
      Array.from(selectedItems).forEach((item) => item.removeAttribute("class"));
      this.setAttribute("class", "same-as-selected");
    });
    optionsDiv.appendChild(newSelectDivs);
  }
};

const populateSelector = () => {
  selectElmnts.innerHTML = "";
  const sites = getSites();
  for (var campus in sites) {
    addOption(campus, sites[campus]);
  }
  buildOptionDivs();
};

document
  .querySelectorAll("#custom-select > .select-selected, #custom-select > .select-items")
  .forEach((node) => node.remove());

selectedOption = document.createElement("DIV");
selectedOption.setAttribute("class", "select-selected");
selectedOption.setAttribute("id", "selected-option");
selectedOption.innerHTML = EMPTY_LABEL;
SelectDiv.appendChild(selectedOption);
optionsDiv = document.createElement("DIV");
optionsDiv.setAttribute("class", "select-items select-hide");
SelectDiv.appendChild(optionsDiv);
selectedOption.addEventListener("click", function (e) {
  e.stopPropagation();
  closeAllSelect(this);
  this.nextSibling.classList.toggle("select-hide");
  this.classList.toggle("select-arrow-active");
});

let freeMapButton = document.getElementById("campus-free-map-button");
if (!freeMapButton) {
  freeMapButton = document.createElement("button");
  freeMapButton.type = "button";
  freeMapButton.id = "campus-free-map-button";
  freeMapButton.className = "campus-free-map-button";
  freeMapButton.title = "Volver al mapa libre";
  freeMapButton.setAttribute("aria-label", "Volver al mapa libre");
  freeMapButton.innerHTML = "&times;";
  freeMapButton.hidden = true;
  freeMapButton.addEventListener("click", (event) => {
    event.stopPropagation();
    goToFreeMap();
  });
  SelectDiv.appendChild(freeMapButton);
}

let titleBadge = document.getElementById("org-title-badge");
if (!titleBadge) {
  titleBadge = document.createElement("div");
  titleBadge.id = "org-title-badge";
  titleBadge.className = "org-title-badge";
  titleBadge.hidden = true;
  const mapEl = document.getElementById("map");
  if (mapEl) {
    mapEl.appendChild(titleBadge);
  }
}

const PIREON_COLOR = "#0f766e";

const updateTitleBadge = () => {
  if (!titleBadge) return;
  const activeCampus = getActiveCampus();
  if (activeCampus) {
    const site = getSites()[activeCampus];
    const name = getSiteOrganizationName(activeCampus) || getOrganizationName() || site?.fullName || "";
    const color = getSiteOrganizationColor(activeCampus) || getOrganizationColor() || PIREON_COLOR;
    titleBadge.textContent = name;
    titleBadge.hidden = false;
    titleBadge.style.backgroundColor = color;
    titleBadge.style.color = textColorFor(color);
  } else {
    titleBadge.textContent = "Mapa Libre";
    titleBadge.hidden = false;
    titleBadge.style.backgroundColor = PIREON_COLOR;
    titleBadge.style.color = textColorFor(PIREON_COLOR);
  }
};

function closeAllSelect(elmnt) {
  var x,
    y,
    i,
    xl,
    yl,
    arrNo = [];
  x = document.getElementsByClassName("select-items");
  y = document.getElementsByClassName("select-selected");
  xl = x.length;
  yl = y.length;
  for (i = 0; i < yl; i++) {
    if (elmnt == y[i]) {
      arrNo.push(i);
    } else {
      y[i].classList.remove("select-arrow-active");
    }
  }
  for (i = 0; i < xl; i++) {
    if (arrNo.indexOf(i)) {
      x[i].classList.add("select-hide");
    }
  }
}

document.addEventListener("click", closeAllSelect);

const applyRememberedCampus = () => {
  const rememberedCampus = getCookie("location");
  if (rememberedCampus && hasCampus(rememberedCampus)) {
    activateCampus(rememberedCampus, true);
    return;
  }

  if (getActiveCampus()) {
    goToFreeMap();
  }
};

const refreshSelectorFromSession = () => {
  populateSelector();
  applyRememberedCampus();
};

const applySitesContext = () => {
  populateSelector();

  if (Object.keys(getSites()).length === 0) {
    goToFreeMap();
    return;
  }

  applyRememberedCampus();
};

window.addEventListener(identifiers.events.sitesLoaded, applySitesContext);

window.addEventListener(identifiers.events.sessionChanged, refreshSelectorFromSession);

window.addEventListener(identifiers.events.campusChanged, (event) => {
  const campus = event?.detail?.campus || "";
  setSelectValue(campus);
  setCampusBar();
});

populateSelector();
applyRememberedCampus();
loadSites();
