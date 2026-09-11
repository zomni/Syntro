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

  const M_PER_DEG = 111320;
  const buildingRing = rectBuilding.coordinates[0].map((c) => [c[1], c[0]]);
  const ringSegs = (ring) => {
    const segs = [];
    for (let i = 0; i < ring.length - 1; i++) segs.push([ring[i], ring[i + 1]]);
    return segs;
  };
  const distPtSegM = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + t * dx, a[1] + t * dy];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) * M_PER_DEG;
  };
  const distanceToRingM = (ptLatLng, ring) => {
    if (pointInRing(ptLatLng, ring)) return 0;
    let d = Infinity;
    for (const [a, b] of ringSegs([...ring, ring[0]])) d = Math.min(d, distPtSegM(ptLatLng, a, b));
    return d;
  };
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const properCross = (a, b, c, d) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
  };
  const ringsCross = (r1, r2) => {
    for (const [a, b] of ringSegs(r1)) {
      for (const [c, d] of ringSegs(r2)) {
        if (properCross(a, b, c, d)) return true;
      }
    }
    return false;
  };
  const distM = (p, q) => (p[0] === q[0] && p[1] === q[1] ? 0 : distanceMeters([p[1], p[0]], [q[1], q[0]]));
  const sharesWall = (r1, r2, tolM = 0.1) => {
    for (const [a1, a2] of ringSegs(r1.Coordinates)) {
      for (const [b1, b2] of ringSegs(r2.Coordinates)) {
        if (distM(a1, b2) <= tolM && distM(a2, b1) <= tolM) return true;
      }
    }
    return false;
  };

  test("adjacent rooms share a wall (no gaps between them)", () => {
    const rooms = generateContourRooms(rectBuilding, 6);
    expect(rooms.length).toBeGreaterThanOrEqual(2);
    let shared = false;
    for (let i = 0; i < rooms.length && !shared; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (sharesWall(rooms[i], rooms[j])) {
          shared = true;
          break;
        }
      }
    }
    expect(shared).toBe(true);
  });

  test("rooms do not overlap each other", () => {
    const rooms = generateContourRooms(rectBuilding, 6);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        expect(ringsCross(rooms[i].Coordinates, rooms[j].Coordinates)).toBe(false);
      }
    }
  });

  test("rooms stay inside the building contour", () => {
    const rooms = generateContourRooms(rectBuilding, 6);
    for (const room of rooms) {
      for (const [lng, lat] of room.Coordinates) {
        expect(distanceToRingM([lat, lng], buildingRing)).toBeLessThanOrEqual(1);
      }
    }
  });

  test("consecutive rows are separated by a corridor (no touching across rows)", () => {
    const w = 20 / M_PER_DEG;
    const h = 20 / M_PER_DEG;
    const bigBuilding = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [0, h],
          [w, h],
          [w, 0],
          [0, 0],
        ],
      ],
    };
    const rooms = generateContourRooms(bigBuilding, 10);
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        if (sharesWall(rooms[i], rooms[j])) continue;
        let d = Infinity;
        for (const p of rooms[i].Coordinates) {
          for (const q of rooms[j].Coordinates) d = Math.min(d, distM(p, q));
        }
        expect(d).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
