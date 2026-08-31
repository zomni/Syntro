/* 
    Created on : Aug 31, 2015
    Author     : yeozkaya@gmail.com
    repo       : https://github.com/utahemre/Leaflet.GeoJSONAutocomplete
    https://github.com/utahemre/Leaflet.GeoJSONAutocomplete/blob/master/LICENSE.md
    Adapted for this project by commenting, keeping the good stuff (JQuery), removing paging and adding Fuse JS to search
*/

import { map, HOST_URL, BACKEND_API_URL } from "../views/map.js";
import { openBuildingPopupLayer, setCurrentOpenFeatureId } from "@app/featureDisplay";
import { mergeGeoJsonWithSearch } from "@app/searchMetadata";

// import "../lib/jquery/jquery-3.6.0.min.js"; // Not working with webpack

import Fuse from "../lib/fuse/fuse.basic.esm.min.js";

(function ($) {  const stripDiacritics = (value) =>
    String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const normalizeLower = (value) => stripDiacritics(value).toLowerCase().trim();

  const normalizeCompact = (value) =>
    normalizeLower(value)
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9\s]/gi, "")
      .replace(/\s+/g, " ")
      .trim();

  const normalizeDense = (value) =>
    normalizeLower(value).replace(/[^a-z0-9]+/gi, "").trim();

  const toTokens = (value) =>
    normalizeCompact(value)
      .split(" ")
      .filter(Boolean);

  const buildSearchProfile = (value) => {
    const raw = String(value ?? "").trim();
    const lower = raw.toLowerCase();
    const lowerNoDiacritics = normalizeLower(raw);
    const compact = normalizeCompact(raw);
    const dense = normalizeDense(raw);

    return {
      raw,
      lower,
      lowerNoDiacritics,
      compact,
      dense,
      tokens: toTokens(raw),
    };
  };

  const buildNormalizedFeature = (feature) => {
    const properties = feature?.properties || {};
    const combined = [
      properties.title,
      properties.searchText,
      properties.name,
      properties.description,
      properties.id,
    ]
      .filter(Boolean)
      .join(" ");

    return {
      ...feature,
      properties: {
        ...properties,
        searchProfiles: {
          title: buildSearchProfile(properties.title),
          searchText: buildSearchProfile(properties.searchText),
          name: buildSearchProfile(properties.name),
          description: buildSearchProfile(properties.description),
          id: buildSearchProfile(properties.id),
          combined: buildSearchProfile(combined),
        },
      },
    };
  };

  const includesAllTokens = (haystackTokens, needleTokens) => {
    if (!needleTokens.length) return false;
    return needleTokens.every((token) => haystackTokens.includes(token));
  };

  const includesAllTokensLoose = (haystackDense, needleTokens) => {
    if (!needleTokens.length) return false;
    return needleTokens.every((token) => haystackDense.includes(token));
  };

  const isSubsequence = (needle, haystack) => {
    if (!needle) return false;
    let i = 0;
    for (let j = 0; j < haystack.length && i < needle.length; j += 1) {
      if (haystack[j] === needle[i]) {
        i += 1;
      }
    }
    return i === needle.length;
  };

  const scoreProfile = (profile, queryProfile) => {
    if (!profile?.raw) {
      return 0;
    }

    const raw = profile.raw;
    const lower = profile.lower;
    const lowerNo = profile.lowerNoDiacritics;
    const compact = profile.compact;
    const dense = profile.dense;
    const tokens = profile.tokens;

    const qRaw = queryProfile.raw;
    const qLower = queryProfile.lower;
    const qLowerNo = queryProfile.lowerNoDiacritics;
    const qCompact = queryProfile.compact;
    const qDense = queryProfile.dense;
    const qTokens = queryProfile.tokens;

    if (!qRaw) {
      return 0;
    }

    let score = 0;

    if (raw === qRaw) score = Math.max(score, 100);
    if (lower === qLower) score = Math.max(score, 96);
    if (lowerNo === qLowerNo) score = Math.max(score, 92);

    if (raw.startsWith(qRaw)) score = Math.max(score, 88);
    if (lower.startsWith(qLower)) score = Math.max(score, 84);
    if (lowerNo.startsWith(qLowerNo)) score = Math.max(score, 82);

    if (raw.endsWith(qRaw)) score = Math.max(score, 78);
    if (lower.endsWith(qLower)) score = Math.max(score, 76);
    if (lowerNo.endsWith(qLowerNo)) score = Math.max(score, 74);

    if (raw.includes(qRaw)) score = Math.max(score, 70);
    if (lower.includes(qLower)) score = Math.max(score, 66);
    if (lowerNo.includes(qLowerNo)) score = Math.max(score, 64);
    if (compact.includes(qCompact)) score = Math.max(score, 62);
    if (dense.includes(qDense)) score = Math.max(score, 60);

    if (includesAllTokens(tokens, qTokens)) {
      score = Math.max(score, 60 + Math.min(qTokens.length, 3));
    }

    if (includesAllTokensLoose(dense, qTokens)) {
      score = Math.max(score, 58 + Math.min(qTokens.length, 3));
    }

    if (qRaw.match(/\d/)) {
      if (raw.includes(qRaw) || lower.includes(qLower)) {
        score = Math.max(score, 90);
      } else if (compact.includes(qCompact) || dense.includes(qDense)) {
        score = Math.max(score, 80);
      }
    }

    return score;
  };

  const fuseSearch = (geoJson, pattern, resultLimit) => {
    const queryProfile = buildSearchProfile(pattern);
    if (!queryProfile.raw) {
      return [];
    }

    const searchableFeatures = (geoJson?.features || []).map(buildNormalizedFeature);

    const directMatches = searchableFeatures.filter((feature) => {
      const profile = feature?.properties?.searchProfiles?.combined;
      if (!profile) return false;

      const hayLowerNo = profile.lowerNoDiacritics || "";
      const hayDense = profile.dense || "";
      const queryLowerNo = queryProfile.lowerNoDiacritics || "";
      const queryDense = queryProfile.dense || "";
      const queryTokens = queryProfile.tokens || [];

      if (!queryLowerNo) return false;

      if (hayLowerNo.includes(queryLowerNo)) return true;
      if (queryDense && hayDense.includes(queryDense)) return true;
      if (includesAllTokensLoose(hayDense, queryTokens)) return true;
      if (isSubsequence(queryDense, hayDense)) return true;

      return false;
    });

    if (directMatches.length > 0) {
      return directMatches.slice(0, resultLimit).map((entry) => entry);
    }

    const weightedResults = searchableFeatures
      .map((feature) => {
        const profiles = feature?.properties?.searchProfiles;
        if (!profiles) {
          return { feature, score: 0 };
        }

        const score =
          scoreProfile(profiles.title, queryProfile) * 1.0 +
          scoreProfile(profiles.searchText, queryProfile) * 0.9 +
          scoreProfile(profiles.name, queryProfile) * 0.75 +
          scoreProfile(profiles.id, queryProfile) * 0.9 +
          scoreProfile(profiles.description, queryProfile) * 0.4 +
          scoreProfile(profiles.combined, queryProfile) * 0.85;

        return { feature, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (weightedResults.length > 0) {
      return weightedResults.slice(0, resultLimit).map((entry) => entry.feature);
    }

    const tolerantResults = searchableFeatures
      .map((feature) => {
        const profile = feature?.properties?.searchProfiles?.combined;
        if (!profile) {
          return { feature, score: 0 };
        }

        const dense = profile.dense;
        const qDense = queryProfile.dense;
        const tokens = queryProfile.tokens;
        let score = 0;

        if (dense.includes(qDense)) score = Math.max(score, 55);
        if (includesAllTokensLoose(dense, tokens)) score = Math.max(score, 52);
        if (isSubsequence(qDense, dense)) score = Math.max(score, 45);

        return { feature, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    if (tolerantResults.length > 0) {
      return tolerantResults.slice(0, resultLimit).map((entry) => entry.feature);
    }

    const fallbackOptions = {
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
      keys: [
        { name: "properties.searchProfiles.title.lowerNoDiacritics", weight: 0.4 },
        { name: "properties.searchProfiles.searchText.lowerNoDiacritics", weight: 0.3 },
        { name: "properties.searchProfiles.name.lowerNoDiacritics", weight: 0.2 },
        { name: "properties.searchProfiles.id.lowerNoDiacritics", weight: 0.1 },
      ],
    };

    const fuse = new Fuse(searchableFeatures, fallbackOptions);
    return fuse.search(queryProfile.lowerNoDiacritics, { limit: resultLimit }).map((item) => item.item);
  };

  const buildEquipmentFeatures = (items, buildingLookup, resultLimit) => {
    if (!Array.isArray(items)) {
      return [];
    }

    const results = [];

    for (const item of items) {
      const buildingId = item?.assignedBuildingExternalId || "";
      if (!buildingId) {
        continue;
      }

      const buildingFeature = buildingLookup.get(buildingId);
      if (!buildingFeature) {
        continue;
      }

      const serial = item?.serialNumber || "";
      const deviceKey = serial || item?.itemNumber || item?.id || "";
      const title = serial ? `S/N: ${serial}` : (item?.description || "Equipo");
      const floorValue = Number.isFinite(Number(item?.assignedFloor)) ? Number(item.assignedFloor) : 0;
      const roomId = item?.assignedRoomExternalId || "";
      const view = "devices";
      const descriptionParts = [];

      if (item?.description) descriptionParts.push(item.description);
      if (roomId) descriptionParts.push(roomId);
      if (Number.isFinite(floorValue)) descriptionParts.push(`Piso ${floorValue}`);

      const description = descriptionParts.join(" · ");
      const searchText = `${title} ${description} ${buildingId} ${roomId}`.trim();

      results.push({
        type: "Feature",
        geometry: buildingFeature.geometry,
        properties: {
          ...buildingFeature.properties,
          title,
          description,
          searchText,
          id: buildingId,
          buildingId,
          floor: floorValue,
          view,
          roomId,
          deviceKey,
          deviceSerial: serial,
          image: buildingFeature.properties?.image,
        },
      });

      if (results.length >= resultLimit) {
        break;
      }
    }

    return results;
  };

  const fetchEquipmentMatches = async (query, buildingLookup, resultLimit) => {
    if (!query || window.syntroBackendSession?.isAuthenticated !== true) {
      return [];
    }

    try {
      const response = await fetch(
        `${BACKEND_API_URL}/api/inventory-import/items?search=${encodeURIComponent(query)}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return [];
      }

      const items = await response.json();
      return buildEquipmentFeatures(items, buildingLookup, resultLimit);
    } catch (error) {
      console.warn("No se pudo cargar inventario para busqueda avanzada.", error);
      return [];
    }
  };

  var options = {
    geojsonServiceAddress: "http://yourGeoJsonSearchAddress",
    placeholderMessage: "Edificios, Salas, Equipos",
    searchButtonTitle: "Search",
    clearButtonTitle: "Clear",
    foundRecordsMessage: "showing results.",
    limit: 10,
    notFoundMessage: "not found.",
    notFoundHint: "Make sure your search criteria is correct and try again.",
    drawColor: "blue",
    pointGeometryZoomLevel: -1, //Set zoom level for point geometries -1 means use leaflet default.
    place: "", // set campus
  };

  var activeResult = -1;
  var resultCount = 0; // Number of results found for the current search with ajax call
  var lastSearch = ""; // Current search box input value
  var searchLayer; // A layer to show the search results
  var features = [];
  var collapseOnBlur = true;
  const MAX_ATTEMPTS = 40;
  const RETRY_DELAY_MS = 250;

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
      console.warn("No se encontraron botones de piso para el buscador.");
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

    return true;
  };

  const waitForFeatureLayer = (featureId, zoom, attempt = 0) => {
    const opened = openFeatureLayer(featureId, zoom);
    if (opened) {
      return;
    }

    if (attempt >= MAX_ATTEMPTS) {
      console.warn(`No se encontro el edificio ${featureId} desde el buscador.`);
      return;
    }

    window.setTimeout(() => {
      waitForFeatureLayer(featureId, zoom, attempt + 1);
    }, RETRY_DELAY_MS);
  };

  // fn literally refers to the jquery prototype.
  $.fn.GeoJsonAutocomplete = function (userDefinedOptions) {
    var keys = Object.keys(userDefinedOptions);

    for (var i = 0; i < keys.length; i++) {
      // Change default keys value to the user defined options
      options[keys[i]] = userDefinedOptions[keys[i]];
    }

    $(this).each(function () {
      var element = $(this);
      // create search box in search container, this = div#searchContainer
      element.addClass("autocomplete-searchContainer"); // add class to search container this = div#searchContainer.autocomplete-searchContainer
      element.append(
        '<input id="searchBox" class="autocomplete-searchBox" placeholder="' +
          options.placeholderMessage +
          '"/>'
      ); // add input box to search container with id = searchBox
      element.append(
        '<input id="searchButton" class="autocomplete-searchButton" type="submit" value="" title="' +
          options.searchButtonTitle +
          '"/>'
      ); // add search button to search container with id = searchButton, class = autocomplete-searchButton
      element.append(
        '<span id="classDivider" class="autocomplete-divider"></span>'
      ); // add divider between search & clear buttons to search container
      element.append(
        '<input id="clearButton" class="autocomplete-clearButton" type="submit"  value="" title="' +
          options.clearButtonTitle +
          '">'
      ); // add clear button to search container with id = clearButton, class = autocomplete-clearButton

      $("#searchBox")[0].value = ""; // set search box value to empty string

      $("#searchBox").delayKeyup(function (event) {
        // add delayKeyup to search box arguments = (callback function, timeout)
        switch (event.keyCode) {
          case 13: // enter
            searchButtonClick(); // fix here when search button is clicked menu still open & same on search click
            break;
          case 38: // up arrow
            prevResult();
            break;
          case 40: // down arrow
            nextResult();
            break;
          case 37: //left arrow, Do Nothing
          case 39: //right arrow, Do Nothing
            break;
          default:
            if ($("#searchBox")[0].value.length > 0) {
              getValuesAsGeoJson();
            } else {
              clearButtonClick();
            }
            break;
        }
      }, 300);

      $("#searchBox").focus(function () {
        // make results menu visible when search box is focused (opened + results)
        if ($("#resultsDiv")[0] !== undefined) {
          $("#resultsDiv")[0].style.visibility = "visible";
        }
      });

      $("#searchBox").blur(function () {
        if ($("#resultsDiv")[0] !== undefined) {
          if (collapseOnBlur) {
            $("#resultsDiv")[0].style.visibility = "collapse";
          } else {
            collapseOnBlur = true;

            window.setTimeout(function () {
              $("#searchBox").focus();
            }, 0);
          }
        }
      });

      $("#searchButton").click(function () {
        // add click event to search button
        searchButtonClick();
      });

      $("#clearButton").click(function () {
        // clear search box and results menu
        clearButtonClick();
      });
    });
  };

  $.fn.delayKeyup = function (callback, ms) {
    // On keyup delay create callback except Up Down Enter
    var timer = 0;
    $(this).keyup(function (event) {
      if (
        event.keyCode !== 13 &&
        event.keyCode !== 38 &&
        event.keyCode !== 40
      ) {
        clearTimeout(timer);
        timer = setTimeout(function () {
          callback(event);
        }, ms);
      } else {
        callback(event);
      }
    });
    return $(this);
  };

  function getValuesAsGeoJson() {
    // get values as GeoJson with ajax call

    activeResult = -1;
    features = [];
    var limitToSend = options.limit;

    lastSearch = $("#searchBox")[0].value; // get current search box value

    if (lastSearch === "") {
      // if search box is empty do nothing
      return;
    }

    var data = {
      search: lastSearch,
      limit: limitToSend,
    };

    $.ajax({
      // HERE IS EVERYTHING,  USE FUSE JS FUNCTION TO SELECT THE ELEMENTS
      url: options.geojsonServiceAddress,
      type: "GET",
      data: data,
      dataType: "json",
      success: async function (json) {
        const enrichedJson = await mergeGeoJsonWithSearch(json);
        const query = String(lastSearch ?? "").trim().toLowerCase();
        const rawFeatures = enrichedJson?.features || [];

        const simpleMatches = query
          ? rawFeatures.filter((feature) => {
              const properties = feature?.properties || {};
              const haystack = [
                properties.title,
                properties.searchText,
                properties.id,
                properties.description,
                properties.popupContent,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

              return haystack.includes(query);
            })
          : [];

        const matchedFeatures = simpleMatches.length > 0
          ? simpleMatches.slice(0, options.limit)
          : fuseSearch(enrichedJson, lastSearch, options.limit);

        const buildingLookup = new Map(
          (enrichedJson?.features || []).map((feature) => [feature?.properties?.id, feature])
        );
        const equipmentFeatures = await fetchEquipmentMatches(lastSearch, buildingLookup, options.limit);

        const combined = [...equipmentFeatures, ...matchedFeatures];
        resultCount = combined.length;
        features = combined;
        createDropDown();
      },
      error: function () {
        processNoRecordsFoundOrError();
      },
    });
  }

  function createDropDown() {
    // Create the dropdown with the results
    var parent = $("#searchBox").parent();

    $("#resultsDiv").remove();
    parent.append(
      "<div id='resultsDiv' class='autocomplete-result'><ul id='resultList' class='autocomplete-list'></ul><div>"
    );

    $("#resultsDiv")[0].style.position = $("#searchBox")[0].style.position;
    $("#resultsDiv")[0].style.left =
      parseInt($("#searchBox")[0].style.left) - 10 + "px";
    $("#resultsDiv")[0].style.bottom = $("#searchBox")[0].style.bottom;
    $("#resultsDiv")[0].style.right = $("#searchBox")[0].style.right;
    $("#resultsDiv")[0].style.top =
      parseInt($("#searchBox")[0].style.top) + 25 + "px";
    $("#resultsDiv")[0].style.zIndex = $("#searchBox")[0].style.zIndex;

    var loopCount = features.length; // Number of results got from Ajax call + Fuse search

    for (var i = 0; i < loopCount; i++) {
      var html =
        "<li id='listElement" + i + "' class='autocomplete-listResult'>";
      html +=
        "<span id='listElementContent" +
        i +
        "' class='autocomplete-content'><img src='assets/icons_os/" +
        features[i].properties.image +
        "' class='autocomplete-iconStyle' align='middle'>";
      html +=
        "<font size='2' color='#333' class='autocomplete-title'>" +
        features[i].properties.title +
        "</font><font size='1' color='#8c8c8c'> " +
        features[i].properties.description +
        "<font></span></li>";
      $("#resultList").append(html);

      $("#listElement" + i).mouseenter(function () {
        listElementMouseEnter(this);
      });

      $("#listElement" + i).mouseleave(function () {
        listElementMouseLeave(this);
      });

      $("#listElement" + i).mousedown(function () {
        listElementMouseDown(this);
      });
    }
  }

  function listElementMouseEnter(listElement) {
    // Mouse enter on list element (mouse hover on)

    var index = parseInt(listElement.id.substr(11));

    if (index !== activeResult) {
      $("#listElement" + index).toggleClass("mouseover");
    }
  }

  function listElementMouseLeave(listElement) {
    // Mouse leave event (mouse hover off)
    var index = parseInt(listElement.id.substr(11));

    if (index !== activeResult) {
      $("#listElement" + index).removeClass("mouseover");
    }
  }

  function listElementMouseDown(listElement) {
    // Mouse down (click) on list element event
    var index = parseInt(listElement.id.substr(11));

    if (index !== activeResult) {
      if (activeResult !== -1) {
        $("#listElement" + activeResult).removeClass("active");
      }

      $("#listElement" + index).removeClass("mouseover");
      $("#listElement" + index).addClass("active");
      activeResult = index;
      fillSearchBox();
      drawGeoJson(activeResult);
    }
  }

  function drawGeoJson(index) {
    if (index === -1) return;

    const selectedProps = features[index]?.properties || {};
    const featureId = selectedProps.buildingId || selectedProps.id;

    if (!featureId) {
      console.warn("No se pudo resolver el edificio para el resultado del buscador.");
      return;
    }

    const requestedFloor = Number.isFinite(Number(selectedProps.floor))
      ? Number(selectedProps.floor)
      : 0;
    const requestedView = selectedProps.view || "summary";
    const requestedRoomId = selectedProps.roomId || "";
    const requestedDeviceKey =
      selectedProps.deviceSerial || selectedProps.deviceKey || selectedProps.serialNumber || "";

    if (window.preparePopupNavigation) {
      window.preparePopupNavigation(featureId, requestedView, requestedRoomId, requestedDeviceKey);
    }

    setCurrentOpenFeatureId(featureId);

    waitForFloorButtons((floorButtons) => {
      const fallbackFloorButton = getFloorButtonForValue(0) || floorButtons[0] || null;
      const requestedFloorButton = getFloorButtonForValue(requestedFloor) || fallbackFloorButton;

      if (!requestedFloorButton) {
        console.warn("No se pudo resolver un piso para el resultado del buscador.");
        return;
      }

      requestedFloorButton.click();

      window.setTimeout(() => {
        waitForFeatureLayer(featureId, 20);
      }, RETRY_DELAY_MS);
    });

    if (searchLayer !== undefined) {
      map.removeLayer(searchLayer);
      searchLayer = undefined;
    }
  }

  function fillSearchBox() {
    // fill the search box with the selected result when arrow up/down is used or
    if (activeResult === -1) {
      $("#searchBox")[0].value = lastSearch;
    } else {
      $("#searchBox")[0].value = features[activeResult].properties.title;
    }
  }

  function nextResult() {
    // for down arrow

    if (resultCount > 0) {
      if (activeResult !== -1) {
        $("#listElement" + activeResult).toggleClass("active");
      }

      if (activeResult < resultCount - 1) {
        $("#listElement" + (activeResult + 1)).toggleClass("active");
        activeResult++;
      } else {
        activeResult = -1;
      }

      fillSearchBox();

      if (activeResult !== -1) {
        drawGeoJson(activeResult);
      }
    }
  }

  function prevResult() {
    // for up arrow
    if (resultCount > 0) {
      if (activeResult !== -1) {
        $("#listElement" + activeResult).toggleClass("active");
      }

      if (activeResult === -1) {
        $("#listElement" + (resultCount - 1)).toggleClass("active");
        activeResult = resultCount - 1;
      } else if (activeResult === 0) {
        activeResult--;
      } else {
        $("#listElement" + (activeResult - 1)).toggleClass("active");
        activeResult--;
      }

      fillSearchBox();

      if (activeResult !== -1) {
        drawGeoJson(activeResult);
      }
    }
  }

  function clearButtonClick() {
    // clear the search box and remove the search layer
    $("#searchBox")[0].value = "";
    lastSearch = "";
    resultCount = 0;
    features = [];
    activeResult = -1;
    $("#resultsDiv").remove();
    if (searchLayer !== undefined) {
      map.removeLayer(searchLayer);
      searchLayer = undefined;
    }
  }

  function searchButtonClick() {
    // search for the entered text
    getValuesAsGeoJson();
  }

  function processNoRecordsFoundOrError() {
    // error message when ajax call fails
    resultCount = 0;
    features = [];
    activeResult = -1;
    $("#resultsDiv").remove();
    if (searchLayer !== undefined) {
      map.removeLayer(searchLayer);
      searchLayer = undefined;
    }

    var parent = $("#searchBox").parent();
    $("#resultsDiv").remove();
    parent.append(
      "<div id='resultsDiv' class='autocomplete-result'><i>" +
        lastSearch +
        " " +
        options.notFoundMessage +
        " <p><small>" +
        options.notFoundHint +
        "</small></i><div>"
    );
  }
})(jQuery);

/////////////////////////////////////////////////////////////////////////////////
///////////////////////////// Configure search box //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

export const loadSearchBox = (path, campus) => {
  // Avoid stacking multiple autocomplete instances after campus/session refreshes.
  const searchContainer = document.getElementById("searchContainer");
  if (searchContainer) {
    searchContainer.innerHTML = "";
    searchContainer.classList.remove("autocomplete-searchContainer");
  }

  var options = {
    geojsonServiceAddress: path,
    placeholderMessage: "Edificios, Salas, Equipos",
    searchButtonTitle: "Search",
    clearButtonTitle: "Clear",
    foundRecordsMessage: "showing results.",
    limit: 8,
    notFoundMessage: "not found.",
    notFoundHint: "Make sure your search criteria is correct and try again.",
    drawColor: "#4E5FC4",
    pointGeometryZoomLevel: -1,
    place: campus,
  };
  $("#searchContainer").GeoJsonAutocomplete(options);
};

export const removeSearchContainerElements = () => {
  // Remove search container elements so no duplicates are made when changing campuses
  var element = document.getElementById("searchContainer");
  element.innerHTML = "";
};

export const showSearch = (location, school) => {
  loadSearchBox(
    "data/" + school + "_" + location + "_search.json?v=" + Date.now(),
    location
  );
};














