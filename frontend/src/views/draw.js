/////////////////////////////////////////////////////////////////////////////////
///////////////////// Insert draw panel and drawing options  ////////////////////
/////////////////////////////////////////////////////////////////////////////////

import "../lib/leaflet.draw/leaflet.draw.js";
import { map } from "../views/map.js";
import { downloadDrawData } from "../utils/downloadDrawData.js"
import { getActiveCampusKey } from "../utils/campusConfig.js";

export var drawLayers = new L.FeatureGroup();

map.addLayer(drawLayers);

var options = {
  position: "topleft",
  draw: {
    polyline: false, // Turns off this drawing tool
    polygon: {
        allowIntersection: false, // Restricts shapes to simple polygons
        drawError: {
            color: '#e1e100', // Color the shape will turn when intersects
            message: '<strong>Oh snap!<strong> you can\'t draw that!' // Message that will show when intersect
        },
        shapeOptions: {
            color: '#bada55'
        }
    },
    circle: false, 
    circlemarker: false,
    rectangle: false,
    marker: true,
  },
  edit: {
    featureGroup: drawLayers, //REQUIRED!!
    remove: false,
  }
  };

var drawControl = new L.Control.Draw(options);

class properties {
  constructor(geometry, coord, featureName, placeType , building) {
    this.type="Feature",
    this.geometryType=geometry,
    this.geometryCoordinates=coord,
    this.id="giveMeId",
    this.name=featureName,
    this.alias="giveMeAlias",
    this.floor="noFloor",
    this.isPublished=true,
    this.isSearchable=true,
    this.isVisible=true,
    this.isClickable=true,
    this.style="giveMeStyle",
    this.placeType=placeType,
    this.translations="giveMeTranslation",
    this.center="giveMeCenterPoint",
    this.building=building
  }
  setCoord(coord) {
    this.geometryCoordinates = coord
  }
  setFloor(floor) {
    this.floor=floor
  }
}

const extractCoord = (latlng) => {
  return [latlng.lng, latlng.lat]
}

map.on(L.Draw.Event.CREATED, function(e) {
  var type = e.layerType,
      layer = e.layer,
      geometry, coord;
  
  if (type == "marker") {
    geometry = "Point";
    coord = layer._latlng;
    coord = extractCoord(coord);
  } else if (type == "polygon") {
    geometry = "Polygon";
    var tmp = layer._latlngs[0];
    coord = [];
    for (var latlng in tmp) {
      coord.push(extractCoord(tmp[latlng]))
    };
    coord = [coord];
  }
  var featureName = prompt("Enter marker/room name:");
  var placeType = prompt("Enter place type: \n (amusement_park, auditorium, bakery, break_room, building, bus_station, cafeteria, car_parking, casino, changing_room, cinema, class, classroom, computer_room, decoration, disabled_toilet, drinking_fountain, elevator, entranceexit, fast_food, fruits_and_vegetables, gym, hall, hotel, information_desk, library, liquor, meeting_area, meeting_available, meeting_point, meeting_room, men_restroom, menwomen_restroom, movie_rental, night_club, office-dark, office, park, pharmacy, printer, quiet_zone, ramp, reception, recycle, restaurant, restroom_2, room, school, seating_area, stairs, storage, studio_photo, technical_room, toilet_disabled, tv, university, welcome_house, wifi, women_restroom)");
  layer.options.properties = new properties(
    geometry,
    coord,
    featureName,
    placeType,
    prompt("Enter building: \n(rennes, metz, bouygues, eiffel, breguet)")
  )
  layer.bindPopup('Name: '+featureName+'; type: '+placeType);
  drawLayers.addLayer(layer);
});

// zoomSnap: 0.5,
// zoomDelta: 0.5,
// // maxZoom: 20,

let url = new URL(window.location.href);
if (url.searchParams.get("draw") == "true") {

    map.addControl(drawControl);

    let style = 'z-index: 1000;border: 2px solid #003366; border-radius: 25px; height: 60px; width: 80px; color: rgb(100, 100, 100); text-align: center; text-decoration: none; display: block; font-size: 14px; padding: 4px 9px; margin: 1px 4px; cursor: pointer; transition-duration: 0.4s;';  
    const elem = document.getElementById("top-container");

    let btnDownload = document.createElement("button"); 
    btnDownload.style.cssText = style
    btnDownload.innerHTML = "Download drawnings";
    btnDownload.addEventListener("click", function () {
        var result = confirm("Confirm download");
        if (result) {
            var floorNumber = parseInt(document.getElementsByClassName("selectedFloorButton")[0].innerHTML);
            downloadDrawData(drawLayers, floorNumber, getActiveCampusKey());
        }
    });
    elem.appendChild(btnDownload);
    
    let btnClear = document.createElement("button"); 
    btnClear.style.cssText = style
    btnClear.innerHTML = "Clear drawnings";
    btnClear.addEventListener("click", function () {
        var result = confirm("Confirm clear drawings");
        if (result) {
            drawLayers.clearLayers();
        }
    });
    elem.appendChild(btnClear);
    
}

