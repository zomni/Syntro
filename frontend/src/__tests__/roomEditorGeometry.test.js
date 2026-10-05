import {
  distanceMeters,
  pointInRing,
  projectPointOnSegment,
  buildSnapRefs,
  simplifyRing,
  ringCentroidLatLng,
  squareRingFromCorner,
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

describe("ringCentroidLatLng", () => {
  test("mantiene el centro dentro de un sector pequeno con coordenadas absolutas", () => {
    const sector = [
      [-33.578790914811215, -70.57787512356481],
      [-33.578790914811215, -70.5777855],
      [-33.5787525, -70.5777855],
      [-33.5787525, -70.57787512356481],
      [-33.578790914811215, -70.57787512356481],
    ];
    const centroid = ringCentroidLatLng(sector);

    expect(pointInRing(centroid, sector)).toBe(true);
    expect(centroid[0]).toBeCloseTo(-33.5787717, 7);
    expect(centroid[1]).toBeCloseTo(-70.5778303, 7);
  });

  test("no devuelve un centroide desplazado por cancelacion numerica", () => {
    const sector = [
      [-33.578790914811215, -70.57787512356481],
      [-33.578790914811215, -70.5777855],
      [-33.5787525, -70.5777855],
      [-33.5787525, -70.57787512356481],
    ];
    const centroid = ringCentroidLatLng(sector);

    expect(Math.abs(centroid[0] - sector[0][0])).toBeLessThan(0.0001);
    expect(Math.abs(centroid[1] - sector[0][1])).toBeLessThan(0.0001);
  });
});

describe("squareRingFromCorner", () => {
  const corner = [-33.45, -70.67];
  const metersPerLatDegree = 111320;
  const metersPerLngDegree = 111194.9 * Math.cos((-33.45 * Math.PI) / 180);

  test("pone la esquina en el primer vertice", () => {
    const ring = squareRingFromCorner(corner, [-33.44, -70.66]);

    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual(corner);
  });

  test("crece hacia el cuadrante del puntero", () => {
    const ring = squareRingFromCorner(corner, [-33.44, -70.66]);

    ring.forEach(([lat, lng]) => {
      expect(lat).toBeGreaterThanOrEqual(corner[0]);
      expect(lng).toBeGreaterThanOrEqual(corner[1]);
    });
  });

  test("se da vuelta segun el cuadrante del puntero", () => {
    const ring = squareRingFromCorner(corner, [-33.46, -70.68]);

    ring.forEach(([lat, lng]) => {
      expect(lat).toBeLessThanOrEqual(corner[0]);
      expect(lng).toBeLessThanOrEqual(corner[1]);
    });
  });

  test("los cuatro lados miden lo mismo en metros", () => {
    const ring = squareRingFromCorner(corner, [-33.44, -70.66]);
    const sides = [0, 1, 2, 3].map((i) => distanceMeters(ring[i], ring[(i + 1) % 4]));

    sides.forEach((side) => {
      expect(Math.abs(side - sides[0]) / sides[0]).toBeLessThan(0.002);
    });
  });

  test("corrige la proporcion real entre latitud y longitud", () => {
    const ring = squareRingFromCorner(corner, [-33.44, -70.66]);
    const width = Math.abs(ring[2][1] - ring[0][1]);
    const height = Math.abs(ring[2][0] - ring[0][0]);

    expect(width / height).toBeCloseTo(metersPerLatDegree / metersPerLngDegree, 2);
    expect(width / height).toBeGreaterThan(1.1);
  });

  test("usa el mayor de los dos ejes para definir el lado", () => {
    const ring = squareRingFromCorner(corner, [-33.43, -70.665]);
    const expectedMeters = Math.abs(-33.43 - corner[0]) * metersPerLatDegree;

    expect(Math.abs(distanceMeters(ring[0], ring[3]) - expectedMeters)).toBeLessThan(5);
  });

  test("no produce NaN ni Infinity cerca de los polos", () => {
    const ring = squareRingFromCorner([89.999, 0], [89.999, 1]);

    ring.forEach(([lat, lng]) => {
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    });
  });

  test("con el puntero sobre la esquina no cambia la figura", () => {
    const ring = squareRingFromCorner(corner, corner);

    ring.forEach((point) => expect(point).toEqual(corner));
  });
});

describe("el editor usa el cuadrado por esquina", () => {
  const fs = require("fs");
  const path = require("path");
  const editor = fs.readFileSync(
    path.join(__dirname, "..", "components", "roomEditor.js"),
    "utf8"
  );
  const squareBody = editor.slice(
    editor.indexOf("const startDrawSquare"),
    editor.indexOf("const startDrawRect")
  );

  test("importa la geometria nueva", () => {
    expect(editor).toContain("squareRingFromCorner,");
  });

  test("el preview usa la funcion de esquina y no la cuenta centrada", () => {
    expect(squareBody).toContain("squareRingFromCorner([p1.lat, p1.lng]");
    expect(squareBody).not.toContain("p1.lat + d * sLat");
    expect(squareBody).not.toContain("p1.lat - d * sLat");
  });
});
