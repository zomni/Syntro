// Catalogo de iconos estaticos arrastrables al mapa.
// Los PNG viven en data/assets/static_icons/ y viajan dentro de
// frontend-data en el paquete de proyecto descargable/respaldable.

export const STATIC_ICON_KEYS = [
  "bus_station",
  "cafeteria",
  "car_parking",
  "disabled_toilet",
  "elevator",
  "entranceexit",
  "fast_food",
  "fruits_and_vegetables",
  "hall",
  "information_desk",
  "meeting_point",
  "menwomen_restroom",
  "park",
  "pharmacy",
  "printer",
  "recycle",
  "room",
  "stairs",
  "storage",
  "technical_room",
  "wifi",
];

export const STATIC_ICON_LABELS = {
  bus_station: "Paradero de buses",
  cafeteria: "Cafeteria",
  car_parking: "Estacionamiento",
  disabled_toilet: "Bano accesible",
  elevator: "Ascensor",
  entranceexit: "Puerta (entrada/salida)",
  fast_food: "Comida rapida",
  fruits_and_vegetables: "Verduras y frutas",
  hall: "Hall",
  information_desk: "Informaciones",
  meeting_point: "Punto de encuentro",
  menwomen_restroom: "Bano compartido",
  park: "Parque",
  pharmacy: "Farmacia",
  printer: "Impresora",
  recycle: "Reciclaje",
  room: "Sala",
  stairs: "Escalera",
  storage: "Bodega",
  technical_room: "Sala tecnica",
  wifi: "Wi-Fi",
};

// Icono usado cuando el IconKey guardado no existe en el catalogo. Sin este
// fallback, staticIconUrl("hotel") pedia data/assets/static_icons/hotel.png, el
// nginx no lo encuentra y try_files responde index.html con 200: el navegador
// recibe HTML donde espera un PNG y dibuja el icono roto.
const FALLBACK_STATIC_ICON_KEY = "information_desk";

export const staticIconUrl = (key) => {
  const safeKey = STATIC_ICON_KEYS.includes(key) ? key : FALLBACK_STATIC_ICON_KEY;
  return `data/assets/static_icons/${safeKey}.png`;
};

export const staticIconLabel = (key) => STATIC_ICON_LABELS[key] || key;

// Tamano fijo de los iconos de marcador en pantalla (px). No escala con el zoom:
// tanto el mapa general como el editor de salas usan L.marker con este mismo pixel.
export const STATIC_MARKER_ICON_SIZE = 28;