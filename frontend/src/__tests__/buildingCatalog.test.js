import {
  computeAllowedBuildingIdsForFloor,
  BASE_FLOOR_NUMBER,
} from "../utils/buildingCatalog.js";

describe("computeAllowedBuildingIdsForFloor", () => {
  test("returns null when there is no catalog so features are not filtered", () => {
    expect(computeAllowedBuildingIdsForFloor([], 0)).toBeNull();
    expect(computeAllowedBuildingIdsForFloor(null, 0)).toBeNull();
  });

  test("allows buildings that list the requested floor", () => {
    const buildings = [
      { id: "a", floors: [0, 1] },
      { id: "b", floors: [1, 2] },
    ];
    expect(computeAllowedBuildingIdsForFloor(buildings, 0)).toEqual(new Set(["a"]));
    expect(computeAllowedBuildingIdsForFloor(buildings, 1)).toEqual(new Set(["a", "b"]));
    expect(computeAllowedBuildingIdsForFloor(buildings, 2)).toEqual(new Set(["b"]));
  });

  test("falls back to the base floor for buildings without floors", () => {
    // RemoveFloorZero (9bedfa0) consolidó la planta 0 en la 1: el piso 0 ya no
    // existe, así que el fallback va a la planta base y no a un piso fantasma.
    expect(BASE_FLOOR_NUMBER).toBe(1);

    const buildings = [
      { id: "a", floors: [] },
      { id: "b", floors: [1] },
    ];

    expect(computeAllowedBuildingIdsForFloor(buildings, BASE_FLOOR_NUMBER)).toEqual(
      new Set(["a", "b"])
    );
    expect(computeAllowedBuildingIdsForFloor(buildings, 0)).toEqual(new Set());
    expect(computeAllowedBuildingIdsForFloor(buildings, 2)).toEqual(new Set());
  });
});
