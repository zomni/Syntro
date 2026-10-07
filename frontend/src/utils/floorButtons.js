// Resolución del id de botón de piso (`b0`, `b1`, ...) a partir de la
// configuración del campus. Los sitios remotos guardan el piso por defecto como
// valor ("0", "1", ...) mientras que la plantilla estática usa el id del botón
// ("b1"); este helper normaliza ambos casos.

import { BASE_FLOOR_NUMBER } from "./buildingCatalog.js";

// Los botones de piso se reparten entre dos contenedores: `#floorButtons-container`
// (modo wayfinding) y `#map-floor-filter-buttons` (panel de filtros del mapa). Quien
// los crea y mueve contempla ambos, así que quien los lee debe hacer lo mismo; en
// caso contrario, al abrir el panel de filtros `syncFloorButtonsToFilter()` mueve
// todos los botones y los lectores de un solo host ven la lista vacía.
export const queryFloorButtons = () =>
  Array.from(
    document.querySelectorAll(
      "#floorButtons-container .floorButton, #map-floor-filter-buttons .floorButton"
    )
  ).filter((button) => button.id !== "bLoc");

// Piso activo del mapa según el botón seleccionado; null si no hay ninguno.
// Mismo criterio que el editor de sectores (roomEditor.readSelectedMapFloor) y
// el panel de filtros: los botones viven en dos contenedores posibles.
export const getSelectedMapFloor = () => {
  const button = document.querySelector(
    "#floorButtons-container .selectedFloorButton, #map-floor-filter-buttons .selectedFloorButton"
  );
  if (!button) return null;
  const parsed = parseInt(button.textContent.trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const resolveFloorButtonId = (defaultFloor, floors) => {
  const normalized = String(defaultFloor ?? "");

  if (normalized.startsWith("b")) {
    return normalized;
  }

  const floorList = Array.isArray(floors) ? floors : [];
  const index = floorList.findIndex((floor) => String(floor) === normalized);

  if (index >= 0) {
    return `b${index}`;
  }

  // Sin coincidencia, la planta base consolidada (piso 1) en vez del piso 0,
  // que ya no existe tras RemoveFloorZero.
  const baseIndex = floorList.findIndex((floor) => Number(floor) === BASE_FLOOR_NUMBER);
  if (baseIndex >= 0) {
    return `b${baseIndex}`;
  }

  // Sin lista de plantas no hay ningun id derivable. `b0` es el id del primer
  // boton que genera goToCampus.js, asi que es la unica referencia valida; los
  // llamadores ya verifican que el boton exista antes de usarlo.
  return "b0";
};
