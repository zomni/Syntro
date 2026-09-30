import {
  divideBuildingIntoSectors,
  sectorCountForArea,
} from "../utils/sectorDivision.js";
import { pointInRing } from "../utils/roomEditorGeometry.js";

const M_PER_DEG = 111320;

const rectBuilding = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [0, 0.0001],
      [0.0001, 0.0001],
      [0.0001, 0],
      [0, 0],
    ],
  ],
};

describe("sectorCountForArea", () => {
  test("caps at 12 and floors at 2", () => {
    expect(sectorCountForArea(10000 * 20)).toBe(12);
    expect(sectorCountForArea(1)).toBe(2);
  });

  test("scales proportionally", () => {
    expect(sectorCountForArea(1500)).toBe(2);
    expect(sectorCountForArea(3200)).toBe(3);
    expect(sectorCountForArea(20000)).toBe(12);
  });
});

describe("divideBuildingIntoSectors", () => {
  test("returns empty for null geometry", () => {
    expect(divideBuildingIntoSectors(null, 4)).toEqual([]);
  });

  test("divides rectangular building into requested count", () => {
    const sectors = divideBuildingIntoSectors(rectBuilding, 4);
    expect(sectors).toHaveLength(4);
    for (const sector of sectors) {
      expect(sector.type).toBe("sector");
      expect(sector.displayName).toMatch(/^Sector \d+$/);
      expect(sector.coordinates[0]).toEqual(sector.coordinates[sector.coordinates.length - 1]);
      expect(sector.areaM2).toBeGreaterThan(0);
    }
  });

  test("clamps count between 2 and 12", () => {
    const sectorsLow = divideBuildingIntoSectors(rectBuilding, 1);
    expect(sectorsLow.length).toBeGreaterThanOrEqual(2);
    const sectorsHigh = divideBuildingIntoSectors(rectBuilding, 99);
    expect(sectorsHigh.length).toBeLessThanOrEqual(12);
  });

  test("sectors cover the full building area", () => {
    const buildingRing = rectBuilding.coordinates[0].map((c) => [c[1], c[0]]);
    const buildingArea = 0.0001 * M_PER_DEG * 0.0001 * M_PER_DEG;
    const sectors = divideBuildingIntoSectors(rectBuilding, 6);
    const totalArea = sectors.reduce((sum, s) => sum + s.areaM2, 0);
    expect(totalArea / buildingArea).toBeGreaterThan(0.99);
    expect(totalArea / buildingArea).toBeLessThan(1.01);

    const insideCounts = sectors.map((s) =>
      s.coordinates.filter(([lng, lat]) => pointInRing([lat, lng], buildingRing)).length
    );
    for (const count of insideCounts) {
      expect(count).toBeGreaterThan(0);
    }
  });

  test("sectors do not overlap badly", () => {
    const sectors = divideBuildingIntoSectors(rectBuilding, 8);
    const centroids = sectors.map((s) => s.centroid);
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const [lngI, latI] = centroids[i];
        const [lngJ, latJ] = centroids[j];
        const dLng = (lngI - lngJ) * M_PER_DEG;
        const dLat = (latI - latJ) * M_PER_DEG;
        const distance = Math.hypot(dLng, dLat);
        expect(distance).toBeGreaterThan(M_PER_DEG * 1e-6);
      }
    }
  });

  test("all sectors similar in size", () => {
    const sectors = divideBuildingIntoSectors(rectBuilding, 6);
    const areas = sectors.map((s) => s.areaM2);
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    expect(max / min).toBeLessThan(2.5);
  });

  test("works on an L-shaped building", () => {
    const lShape = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, 0.0001],
          [0.00005, 0.0001],
          [0.00005, 0.00005],
          [0.0001, 0.00005],
          [0.0001, 0],
          [0, 0],
        ],
      ],
    };
    const sectors = divideBuildingIntoSectors(lShape, 4);
    expect(sectors.length).toBe(4);
    const totalArea = sectors.reduce((sum, s) => sum + s.areaM2, 0);
    const lRing = lShape.coordinates[0].map((c) => [c[1], c[0]]);
    let inside = 0;
    for (const s of sectors) {
      for (const [lng, lat] of s.coordinates) {
        if (pointInRing([lat, lng], lRing)) inside++;
      }
    }
    expect(inside).toBeGreaterThan(0);
    expect(totalArea).toBeGreaterThan(0);
  });
});