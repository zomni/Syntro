// Cálculo del conjunto de ids de edificios permitidos por piso según el
// catálogo de edificios del campus. Si no hay catálogo (campus nuevo sin datos)
// se devuelve `null` para indicar "permitir todos", evitando que un plano
// GeoJSON subido sea filtrado por completo.

// Planta base consolidada. La migración RemoveFloorZero (9bedfa0) fusionó la
// planta 0 en la 1, por lo que el piso 0 ya no existe en ninguna fuente de datos
// y la planta 1 cumple el rol de base, tanto para huellas como para defaults.
export const BASE_FLOOR_NUMBER = 1;

export const computeAllowedBuildingIdsForFloor = (buildings, floorNumber) => {
  if (!Array.isArray(buildings) || buildings.length === 0) {
    return null;
  }

  const allowedIds = new Set();

  for (const building of buildings) {
    const floors = Array.isArray(building.floors) ? building.floors : [];

    if (floors.length > 0) {
      if (floors.includes(Number(floorNumber))) {
        allowedIds.add(building.id);
      }
    } else if (Number(floorNumber) === BASE_FLOOR_NUMBER) {
      allowedIds.add(building.id);
    }
  }

  return allowedIds;
};
