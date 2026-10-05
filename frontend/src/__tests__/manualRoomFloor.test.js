import { shouldRenderRoomForFloor } from "../utils/manualRoomFloor.js";

const buildingIds = (ids) => new Set(ids);

const room = (externalId, buildingExternalId, floor) => ({
  externalId,
  buildingExternalId,
  floor,
});

describe("shouldRenderRoomForFloor", () => {
  test("pinta solo las salas del piso pedido", () => {
    const allowed = buildingIds(["SR-BLD-021"]);

    expect(shouldRenderRoomForFloor(room("a", "SR-BLD-021", 1), 1, allowed)).toBe(true);
    expect(shouldRenderRoomForFloor(room("b", "SR-BLD-021", 2), 2, allowed)).toBe(true);
  });

  test("no pinta en el piso 2 la sala que es del piso 1", () => {
    // Regresion del solapamiento: SR-BLD-021 (Corta Estadia 2) tiene salas en
    // 1 y 2. El filtro por edificio alone las pintaba en ambos pisos, superpuestas.
    const allowed = buildingIds(["SR-BLD-021"]);
    const piso1 = room("sala-1", "SR-BLD-021", 1);
    const piso2 = room("sala-2", "SR-BLD-021", 2);

    expect(shouldRenderRoomForFloor(piso1, 2, allowed)).toBe(false);
    expect(shouldRenderRoomForFloor(piso2, 2, allowed)).toBe(true);
    expect(shouldRenderRoomForFloor(piso1, 1, allowed)).toBe(true);
    expect(shouldRenderRoomForFloor(piso2, 1, allowed)).toBe(false);
  });

  test("descarta salas cuyo piso no es un numero utilizable", () => {
    const allowed = buildingIds(["SR-BLD-021"]);

    for (const floor of [null, undefined, "", "abc", {}, []]) {
      for (const target of [1, 2, 3]) {
        expect(shouldRenderRoomForFloor(room("x", "SR-BLD-021", floor), target, allowed)).toBe(false);
      }
    }
  });

  test("respeta el filtro de edificios permitidos del piso", () => {
    const allowed = buildingIds(["SR-BLD-021"]);

    expect(shouldRenderRoomForFloor(room("a", "SR-BLD-010", 1), 1, allowed)).toBe(false);
    expect(shouldRenderRoomForFloor(room("b", "SR-BLD-010", 1), 1, null)).toBe(true);
  });

  test("tolera string numerico en el piso", () => {
    const allowed = buildingIds(["SR-BLD-021"]);

    expect(shouldRenderRoomForFloor(room("a", "SR-BLD-021", "2"), 2, allowed)).toBe(true);
    expect(shouldRenderRoomForFloor(room("b", "SR-BLD-021", "2"), "2", allowed)).toBe(true);
  });

  test("no explota con sala ausente", () => {
    expect(shouldRenderRoomForFloor(null, 1, buildingIds(["SR-BLD-021"]))).toBe(false);
    expect(shouldRenderRoomForFloor(undefined, 1, null)).toBe(false);
  });

  test("el piso 0 no se dibuja nunca en la vista general", () => {
    // RemoveFloorZero fusiono la planta 0 en la 1: BASE_FLOOR_NUMBER es 1.
    const allowed = buildingIds(["SR-BLD-021"]);

    expect(shouldRenderRoomForFloor(room("a", "SR-BLD-021", 0), 0, allowed)).toBe(true);
    expect(shouldRenderRoomForFloor(room("a", "SR-BLD-021", 0), 1, allowed)).toBe(false);
  });
});