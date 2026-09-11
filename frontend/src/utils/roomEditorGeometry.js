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
  const { roomDepth = 5, corridorWidth = 1.5, packing = "touching" } = options;
  const spaced = packing !== "touching";
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

  const offsetRing = (rng, offsetM) => {
    const pts = uniqueRing(rng);
    const n = pts.length;
    if (n < 3) return rng;
    const [cLng, cLat] = ringCentroid(rng);

    const unitEdges = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % n];
      const dx = (b[0] - a[0]) * metersPerDegLng;
      const dy = (b[1] - a[1]) * METERS_PER_DEG_LAT;
      const len = Math.hypot(dx, dy) || 1e-9;
      unitEdges.push({ x: dx / len, y: dy / len });
    }

    const normals = [];
    for (let i = 0; i < n; i++) {
      let nx = -unitEdges[i].y;
      let ny = unitEdges[i].x;
      const mid = pts[(i + 1) % n];
      const dLng = cLng - mid[0];
      const dLat = cLat - mid[1];
      if (nx * dLng * metersPerDegLng + ny * dLat * METERS_PER_DEG_LAT > 0) {
        nx = -nx;
        ny = -ny;
      }
      normals.push({ x: nx, y: ny });
    }

    const shifted = [];
    for (let i = 0; i < n; i++) {
      const na = normals[(i - 1 + n) % n];
      const nb = normals[i];
      const sx = pts[i][0] * metersPerDegLng;
      const sy = pts[i][1] * METERS_PER_DEG_LAT;
      const det = na.x * nb.y - na.y * nb.x;
      if (Math.abs(det) < 1e-9) {
        shifted.push({ x: sx - na.x * offsetM, y: sy - na.y * offsetM });
      } else {
        const ca = na.x * sx + na.y * sy - offsetM;
        const cb = nb.x * sx + nb.y * sy - offsetM;
        shifted.push({ x: (ca * nb.y - cb * na.y) / det, y: (na.x * cb - nb.x * ca) / det });
      }
    }

    const ringLL = pts.map((p) => [p[1], p[0]]);
    const sharePt = (p, q) => p.x === q.x && p.y === q.y;
    const segCross = (a, b, c, d) => {
      const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
      const o1 = cross(a, b, c);
      const o2 = cross(a, b, d);
      const o3 = cross(c, d, a);
      const o4 = cross(c, d, b);
      return o1 * o2 < 0 && o3 * o4 < 0;
    };

    let valid = shifted.length === n;
    for (let i = 0; i < n && valid; i++) {
      const a = shifted[i];
      const b = shifted[(i + 1) % n];
      if (!pointInRing([a.y / METERS_PER_DEG_LAT, a.x / metersPerDegLng], ringLL)) {
        valid = false;
        break;
      }
      for (let j = i + 1; j < n && valid; j++) {
        const c = shifted[j];
        const d = shifted[(j + 1) % n];
        if (sharePt(a, c) || sharePt(a, d) || sharePt(b, c) || sharePt(b, d)) continue;
        if (segCross(a, b, c, d)) {
          valid = false;
          break;
        }
      }
    }
    if (!valid) return erodeRing(rng, offsetM);
    const out = shifted.map((p) => [p.x / metersPerDegLng, p.y / METERS_PER_DEG_LAT]);
    out.push([out[0][0], out[0][1]]);
    return out;
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
  const targetRoomWidth = Math.max(totalPerimeterM / roomCount - (spaced ? corridorWidth : 0), 2);

  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const crosses = (a, b, c, d) => {
    const o1 = orient(a, b, c);
    const o2 = orient(a, b, d);
    const o3 = orient(c, d, a);
    const o4 = orient(c, d, b);
    return o1 * o2 < 0 && o3 * o4 < 0;
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

  const distPtSegDeg = (p, a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };

  const pointStrictlyInside = (pt, poly) => {
    if (!pointInRing([pt[1], pt[0]], poly.map((p) => [p[1], p[0]]))) return false;
    for (let k = 0; k < 4; k++) {
      if (distPtSegDeg(pt, poly[k], poly[(k + 1) % 4]) < 1e-7) return false;
    }
    return true;
  };

  const intersectsRoom = (poly1, poly2) => {
    for (let r = 0; r < 2; r++) {
      const pa = r === 0 ? poly1 : poly2;
      const pb = r === 0 ? poly2 : poly1;
      for (let e = 0; e < 4; e++) {
        const a = pa[e];
        const b = pa[(e + 1) % 4];
        if (
          crosses(a, b, pb[0], pb[1]) ||
          crosses(a, b, pb[1], pb[2]) ||
          crosses(a, b, pb[2], pb[3]) ||
          crosses(a, b, pb[3], pb[0])
        ) {
          return true;
        }
        const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (pointStrictlyInside(mid, pb) || pointStrictlyInside(a, pb) || pointStrictlyInside(b, pb)) {
          return true;
        }
      }
    }
    return false;
  };

  const candidateRooms = [];
  let roomIndex = 0;
  const minSideM = corridorWidth * 2;
  const bandOffsetM = spaced ? (roomDepth + corridorWidth) * Math.SQRT2 : roomDepth + corridorWidth;
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
      let roomsOnEdge;
      let roomWidthM;
      if (spaced) {
        roomsOnEdge = Math.max(1, Math.round(edge.lenM / (targetRoomWidth + corridorWidth)));
        let usableLenM = edge.lenM - corridorWidth * roomsOnEdge;
        while (usableLenM <= 0 && roomsOnEdge > 1) {
          roomsOnEdge--;
          usableLenM = edge.lenM - corridorWidth * roomsOnEdge;
        }
        if (usableLenM <= 0) continue;
        roomWidthM = usableLenM / roomsOnEdge;
      } else {
        roomsOnEdge = Math.max(1, Math.round(edge.lenM / targetRoomWidth));
        roomWidthM = edge.lenM / roomsOnEdge;
      }

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

      let cursorM = spaced ? corridorWidth / 2 : 0;
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

        cursorM = spaced ? endM + corridorWidth : endM;
        if (!isInsideBuilding(testPoly)) continue;

        roomIndex++;
        candidateRooms.push({ poly, roomIndex });
      }
    }
    return true;
  };

  let curRing = ring;
  const maxBands = spaced ? 20 : 4;
  for (let band = 0; band < maxBands; band++) {
    if (ringMinSideM(curRing) < minSideM) break;
    buildBand(curRing);
    curRing = offsetRing(curRing, bandOffsetM);
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
