import {
  distanceMeters,
  pointInRing,
  projectPointOnSegment,
  buildSnapRefs,
  simplifyRing,
  generateContourRooms,
} from "../utils/roomEditorGeometry.js";

describe("distanceMeters", () => {
  test("same point returns 0", () => {
    expect(distanceMeters([0, 0], [0, 0])).toBe(0);
  });

  test("known distance Santiago to Valparaiso ~98km", () => {
    const d = distanceMeters([-33.4489, -70.6693], [-33.0472, -71.6127]);
    expect(d).toBeGreaterThan(90000);
    expect(d).toBeLessThan(110000);
  });
});

describe("pointInRing", () => {
  const square = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [0, 0],
  ];

  test("point inside returns true", () => {
    expect(pointInRing([5, 5], square)).toBe(true);
  });

  test("point outside returns false", () => {
    expect(pointInRing([15, 5], square)).toBe(false);
  });

  test("point on edge is ambiguous but consistent", () => {
    const result = pointInRing([0, 5], square);
    expect(typeof result).toBe("boolean");
  });

  test("L-shaped polygon", () => {
    const lShape = [
      [0, 0],
      [0, 10],
      [5, 10],
      [5, 5],
      [10, 5],
      [10, 0],
      [0, 0],
    ];
    expect(pointInRing([2, 2], lShape)).toBe(true);
    expect(pointInRing([7, 2], lShape)).toBe(true);
    expect(pointInRing([2, 7], lShape)).toBe(true);
    expect(pointInRing([7, 7], lShape)).toBe(false);
  });
});

describe("projectPointOnSegment", () => {
  test("projects onto middle of horizontal segment", () => {
    const result = projectPointOnSegment([5, 5], [0, 0], [0, 10]);
    expect(result.latlng[0]).toBeCloseTo(0, 5);
    expect(result.latlng[1]).toBeCloseTo(5, 5);
    expect(result.t).toBeCloseTo(0.5, 5);
  });

  test("clamps to start when before segment", () => {
    const result = projectPointOnSegment([0, -1], [0, 0], [0, 10]);
    expect(result.t).toBe(0);
  });

  test("clamps to end when after segment", () => {
    const result = projectPointOnSegment([0, 11], [0, 0], [0, 10]);
    expect(result.t).toBe(1);
  });

  test("zero-length segment returns the point", () => {
    const result = projectPointOnSegment([5, 5], [3, 3], [3, 3]);
    expect(result.latlng).toEqual([3, 3]);
  });
});

describe("buildSnapRefs", () => {
  test("builds refs from building coords", () => {
    const building = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const refs = buildSnapRefs(building, null);
    expect(refs.points.length).toBe(5);
    expect(refs.segments.length).toBe(5);
  });

  test("includes room coords", () => {
    const building = [
      [0, 0],
      [0, 10],
      [10, 10],
      [10, 0],
      [0, 0],
    ];
    const rooms = [
      [
        [2, 2],
        [2, 4],
        [4, 4],
        [4, 2],
        [2, 2],
      ],
    ];
    const refs = buildSnapRefs(building, rooms);
    expect(refs.points.length).toBe(10);
    expect(refs.segments.length).toBe(10);
  });
});

describe("simplifyRing", () => {
  test("returns same array if too short", () => {
    const pts = [
      [0, 0],
      [0, 1],
      [1, 1],
    ];
    expect(simplifyRing(pts)).toBe(pts);
  });

  test("simplifies straight line with noise", () => {
    const pts = [
      [0, 0],
      [0, 0.00001],
      [0, 0.00002],
      [0, 0.00003],
      [0, 0.00004],
      [0, 0],
    ];
    const result = simplifyRing(pts, 2);
    expect(result.length).toBeLessThanOrEqual(pts.length);
  });
});

describe("generateContourRooms", () => {
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

  test("generates rooms for rectangular building", () => {
    const rooms = generateContourRooms(rectBuilding, 4);
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms.length).toBeLessThanOrEqual(4);
    for (const room of rooms) {
      expect(room.Coordinates.length).toBe(5);
      expect(room.DisplayName).toBeTruthy();
      expect(room.Type).toBe("sala");
    }
  });

  test("returns empty for null geometry", () => {
    expect(generateContourRooms(null, 4)).toEqual([]);
  });

  test("returns empty for zero rooms", () => {
    expect(generateContourRooms(rectBuilding, 0)).toEqual([]);
  });

  test("each room has 5 coordinate pairs (closed ring)", () => {
    const rooms = generateContourRooms(rectBuilding, 2);
    for (const room of rooms) {
      expect(room.Coordinates[0]).toEqual(room.Coordinates[4]);
    }
  });
});
