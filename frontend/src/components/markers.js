/////////////////////////////////////////////////////////////////////////////////
//////////////////////////// Add markers on the map /////////////////////////////
/////////////////////////////////////////////////////////////////////////////////

import { reArrange } from "../utils/tools.js";

const deriveCenterFromGeometry = (feature) => {
  const coordinates = feature?.geometry?.coordinates;
  const ring = Array.isArray(coordinates) ? coordinates[0] : null;
  if (!Array.isArray(ring)) {
    return null;
  }

  const points = ring.filter((point) => Array.isArray(point) && point.length >= 2);
  if (points.length === 0) return null;

  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
    [0, 0]
  );

  return [sum[0] / points.length, sum[1] / points.length];
};

const createMarker = (element) => {
  const rawCenter =
    Array.isArray(element.properties.center) && element.properties.center.length === 2
      ? element.properties.center
      : deriveCenterFromGeometry(element);

  if (!rawCenter) {
    return null;
  }

  var markerUrle = element.properties.style.icon;
  var markerName = element.properties.name;
  // Customize the marker icon
  var mapIcon = L.icon({
    iconUrl: "assets/icons_os/" + markerUrle,
    iconSize: [11, 11],
    iconAnchor: [5, 3],
    popupAnchor: [0, 0],
    alt: "icon",
    className: "marker_circle",
  });
  var centerPoint = reArrange(rawCenter);
  var marker = L.marker(centerPoint, { icon: mapIcon }).bindPopup(markerName +", piso "+ element.properties.floor.toString());
  return marker;
};

export const createMarkers = (geoJson) => {
  let markers = [];
  geoJson.features.map((element) => {
    if (element.properties.isPublished && element.properties.isVisible) {
      let marker = createMarker(element);
      if (marker) {
        markers.push(marker);
      }
    }
  });
  return markers;
};
