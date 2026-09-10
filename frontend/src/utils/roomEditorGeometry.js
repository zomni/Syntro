const METERS_PER_DEG_LAT = 111320;
const EARTH_RADIUS_M = 6371000;

export const distanceMeters = (ll1, ll2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(ll2[0] - ll1[0]);
  const dLng = toRad(ll2[1] - ll1[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(ll1[0])) * Math.cos(toRad(ll2[0])) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const pointInRing = (latlng, ring) => {
  const [lat, lng] = latlng;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

export const projectPointOnSegment = (p, a, b) => {
  const dx = b[1] - a[1];
  const dy = b[0] - a[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { latlng: a, t: 0, distance: distanceMeters(p, a) };
  let t = ((p[1] - a[1]) * dx + (p[0] - a[0]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const proj = [a[0] + t * dy, a[1] + t * dx];
  return { latlng: proj, t, distance: distanceMeters(p, proj) };
};

export const buildSnapRefs = (buildingCoords, roomsCoords) => {
  const points = [];
  const segments = [];
  const addRing = (ring) => {
    for (let i = 0; i < ring.length; i++) {
      points.push(ring[i]);
      segments.push([ring[i], ring[(i + 1) % ring.length]]);
    }
  };
  if (buildingCoords) addRing(buildingCoords);
  if (roomsCoords) {
    for (const ring of roomsCoords) addRing(ring);
  }
  return { points, segments };
};

export const snapToReferences = (map, latlng, refs, tolPx, snapMarker) => {
  if (!refs || !map) return { latlng, kind: null };
  const cursorPt = map.latLngToContainerPoint(latlng);
  let bestDist = tolPx;
  let best = null;
  for (const pt of refs.points) {
    const ptLatLng = Array.isArray(pt) ? L.latLng(pt[1], pt[0]) : L.latLng(pt.lat, pt.lng);
    const d = cursorPt.distanceTo(map.latLngToContainerPoint(ptLatLng));
    if (d < bestDist) {
      bestDist = d;
      best = { latlng: ptLatLng, kind: "vertex" };
    }
  }
  for (const [a, b] of refs.segments) {
    const aLL = Array.isArray(a) ? L.latLng(a[1], a[0]) : L.latLng(a.lat, a.lng);
    const bLL = Array.isArray(b) ? L.latLng(b[1], b[0]) : L.latLng(b.lat, b.lng);
    const proj = projectPointOnSegment(
      [latlng.lat, latlng.lng],
      [aLL.lat, aLL.lng],
      [bLL.lat, bLL.lng]
    );
    const projLL = L.latLng(proj.latlng[0], proj.latlng[1]);
    const d = cursorPt.distanceTo(map.latLngToContainerPoint(projLL));
    if (d < bestDist) {
      bestDist = d;
      best = { latlng: projLL, kind: "edge" };
    }
  }
  if (snapMarker) {
    if (best) {
      if (!snapMarker._map) snapMarker.addTo(map);
      snapMarker.setLatLng(best.latlng);
    } else if (snapMarker._map) {
      map.removeLayer(snapMarker);
    }
  }
  return best || { latlng, kind: null };
};

const simplifyRdp = (points, tolerance) => {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDist(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplifyRdp(points.slice(0, maxIdx + 1), tolerance);
    const right = simplifyRdp(points.slice(maxIdx), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
};

const perpendicularDist = (pt, lineA, lineB) => {
  const dx = lineB[1] - lineA[1];
  const dy = lineB[0] - lineA[0];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distanceMeters(pt, lineA);
  const t = Math.max(0, Math.min(1, ((pt[1] - lineA[1]) * dx + (pt[0] - lineA[0]) * dy) / lenSq));
  const proj = [lineA[0] + t * dy, lineA[1] + t * dx];
  return distanceMeters(pt, proj);
};

export const simplifyRing = (pointsLatLng, toleranceMeters = 2) => {
  if (!pointsLatLng || pointsLatLng.length < 4) return pointsLatLng;
  const tolDeg = toleranceMeters / METERS_PER_DEG_LAT;
  const simplified = simplifyRdp(pointsLatLng, tolDeg);
  if (simplified.length < 4) return pointsLatLng;
  return simplified;
};

export const generateContourRooms = (buildingGeometry, roomCount, options = {}) => {
  const { roomDepth = 5, corridorWidth = 1.5 } = options;
  if (!buildingGeometry?.coordinates?.[0]) return [];
  const ring = buildingGeometry.coordinates[0];
  if (ring.length < 3 || roomCount < 1) return [];

  const centerLat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  const toRad = (d) => (d * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(toRad(centerLat));
  const mToLng = (m) => m / metersPerDegLng;
  const mToLat = (m) => m / METERS_PER_DEG_LAT;

  const uniqueRing = (rng) => {
    const first = rng[0];
    const last = rng[rng.length - 1];
    return first[0] === last[0] && first[1] === last[1] ? rng.slice(0, -1) : rng.slice();
  };

  const ringCentroid = (rng) => {
    const pts = uniqueRing(rng);
    const cLng = pts.reduce((s, c) => s + c[0], 0) / pts.length;
    const cLat = pts.reduce((s, c) => s + c[1], 0) / pts.length;
    return [cLng, cLat];
  };

  const edgeLenM = (a, b) => {
    const dx = (b[0] - a[0]) * metersPerDegLng;
    const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const ringPerimeter = (rng) => {
    let per = 0;
    for (let i = 0; i < rng.length - 1; i++) per += edgeLenM(rng[i], rng[i + 1]);
    return per;
  };

  const erodeRing = (rng, offsetM) => {
    const pts = uniqueRing(rng);
    const [cLng, cLat] = ringCentroid(rng);
    const eroded = pts.map((pt) => {
      const dLng = cLng - pt[0];
      const dLat = cLat - pt[1];
      const distM = Math.sqrt((dLng * metersPerDegLng) ** 2 + (dLat * METERS_PER_DEG_LAT) ** 2);
      if (distM < 1e-9) return [pt[0], pt[1]];
      const stepM = Math.min(offsetM, distM * 0.99);
      const stepLng = (dLng * stepM) / distM;
      const stepLat = (dLat * stepM) / distM;
      return [pt[0] + stepLng, pt[1] + stepLat];
    });
    const first = eroded[0];
    eroded.push([first[0], first[1]]);
    return eroded;
  };

  const ringMinSideM = (rng) => {
    let minLng = Infinity;
    let maxLng = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const p of rng) {
      if (p[0] < minLng) minLng = p[0];
      if (p[0] > maxLng) maxLng = p[0];
      if (p[1] < minLat) minLat = p[1];
      if (p[1] > maxLat) maxLat = p[1];
    }
    return Math.min((maxLng - minLng) * metersPerDegLng, (maxLat - minLat) * METERS_PER_DEG_LAT);
  };

  const totalPerimeterM = ringPerimeter(ring);
  if (totalPerimeterM <= 0) return [];
  const ringLatLng = ring.map((c) => [c[1], c[0]]);
  const targetRoomWidth = Math.max(totalPerimeterM / roomCount - corridorWidth, 2);

  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const crosses = (a, b, c, d) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
  };

  const ringEdges = [];
  for (let i = 0; i < ring.length - 1; i++) ringEdges.push([ring[i], ring[i + 1]]);

  const isInsideBuilding = (poly) => {
    for (let k = 0; k < 4; k++) {
      if (!pointInRing([poly[k][1], poly[k][0]], ringLatLng)) return false;
    }
    for (let e = 0; e < 4; e++) {
      const a = poly[e];
      const b = poly[(e + 1) % 4];
      for (const [c, d] of ringEdges) {
        if (crosses(a, b, c, d)) return false;
      }
    }
    return true;
  };

  const intersectsRoom = (poly1, poly2) => {
    for (let e = 0; e < 4; e++) {
      for (let f = 0; f < 4; f++) {
        if (crosses(poly1[e], poly1[(e + 1) % 4], poly2[f], poly2[(f + 1) % 4])) return true;
      }
    }
    return false;
  };

  const candidateRooms = [];
  let roomIndex = 0;
  const minSideM = corridorWidth * 2;
  const bandOffsetM = (roomDepth + corridorWidth) * Math.SQRT2;
  const EPSILON_M = 0.02;
  const epsLng = mToLng(EPSILON_M);
  const epsLat = mToLat(EPSILON_M);

  const buildBand = (curRing) => {
    const [cLng, cLat] = ringCentroid(curRing);

    const edges = [];
    let bandPerimeter = 0;
    for (let i = 0; i < curRing.length - 1; i++) {
      const a = curRing[i];
      const b = curRing[i + 1];
      const lenM = edgeLenM(a, b);
      edges.push({ a, b, lenM, dxM: (b[0] - a[0]) * metersPerDegLng, dyM: (b[1] - a[1]) * METERS_PER_DEG_LAT });
      bandPerimeter += lenM;
    }
    if (bandPerimeter <= 0) return false;

    const depthLng = mToLng(roomDepth);
    const depthLat = mToLat(roomDepth);

    for (const edge of edges) {
      if (edge.lenM < corridorWidth * 2) continue;
      let roomsOnEdge = Math.max(1, Math.round(edge.lenM / (targetRoomWidth + corridorWidth)));
      let usableLenM = edge.lenM - corridorWidth * roomsOnEdge;
      while (usableLenM <= 0 && roomsOnEdge > 1) {
        roomsOnEdge--;
        usableLenM = edge.lenM - corridorWidth * roomsOnEdge;
      }
      if (usableLenM <= 0) continue;
      const roomWidthM = usableLenM / roomsOnEdge;

      const ux = edge.dxM / edge.lenM;
      const uy = edge.dyM / edge.lenM;
      let nx = -uy;
      let ny = ux;

      const midLng = (edge.a[0] + edge.b[0]) / 2;
      const midLat = (edge.a[1] + edge.b[1]) / 2;
      const dot = nx * (cLng - midLng) + ny * (cLat - midLat);
      if (dot > 0) {
        nx = -nx;
        ny = -ny;
      }

      let cursorM = corridorWidth / 2;
      for (let r = 0; r < roomsOnEdge; r++) {
        const startM = cursorM;
        const endM = cursorM + roomWidthM;
        const sx = edge.a[0] + ux * mToLng(startM);
        const sy = edge.a[1] + uy * mToLat(startM);
        const ex = edge.a[0] + ux * mToLng(endM);
        const ey = edge.a[1] + uy * mToLat(endM);

        const p1 = [sx, sy];
        const p2 = [ex, ey];
        const p3 = [ex - nx * depthLng, ey - ny * depthLat];
        const p4 = [sx - nx * depthLng, sy - ny * depthLat];
        const poly = [p1, p2, p3, p4];

        const testPoly = [
          [p1[0] - nx * epsLng, p1[1] - ny * epsLat],
          [p2[0] - nx * epsLng, p2[1] - ny * epsLat],
          p3,
          p4,
        ];

        cursorM = endM + corridorWidth;
        if (!isInsideBuilding(testPoly)) continue;

        roomIndex++;
        candidateRooms.push({ poly, roomIndex });
      }
    }
    return true;
  };

  let curRing = ring;
  const maxBands = 20;
  for (let band = 0; band < maxBands; band++) {
    if (ringMinSideM(curRing) < minSideM) break;
    buildBand(curRing);
    curRing = erodeRing(curRing, bandOffsetM);
  }

  const kept = [];
  for (const cand of candidateRooms) {
    let ok = true;
    for (const prev of kept) {
      if (intersectsRoom(cand.poly, prev.poly)) {
        ok = false;
        break;
      }
    }
    if (ok) kept.push(cand);
  }

  return kept.map((cand) => ({
    DisplayName: `Sala ${cand.roomIndex}`,
    Type: "sala",
    Coordinates: [...cand.poly, cand.poly[0]],
  }));
};
