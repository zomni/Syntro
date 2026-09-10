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

  const edges = [];
  let totalPerimeterM = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i];
    const b = ring[i + 1];
    const dxM = (b[0] - a[0]) * metersPerDegLng;
    const dyM = (b[1] - a[1]) * METERS_PER_DEG_LAT;
    const lenM = Math.sqrt(dxM * dxM + dyM * dyM);
    edges.push({ a, b, lenM, dxM, dyM });
    totalPerimeterM += lenM;
  }

  if (totalPerimeterM <= 0) return [];

  const rooms = [];
  let roomIndex = 0;

  for (const edge of edges) {
    if (edge.lenM < 2) continue;
    const roomsOnEdge = Math.max(1, Math.round((edge.lenM / totalPerimeterM) * roomCount));
    const usableLenM = edge.lenM - corridorWidth * (roomsOnEdge - 1);
    if (usableLenM <= 0) continue;
    const roomWidthM = usableLenM / roomsOnEdge;

    const ux = edge.dxM / edge.lenM;
    const uy = edge.dyM / edge.lenM;
    const nx = -uy;
    const ny = ux;

    const depthLng = mToLng(roomDepth);
    const depthLat = mToLat(roomDepth);
    const halfGapLng = mToLng(corridorWidth / 2);

    let cursorM = corridorWidth / 2;
    for (let r = 0; r < roomsOnEdge; r++) {
      const startM = cursorM;
      const endM = cursorM + roomWidthM;
      const sx = edge.a[0] + ux * mToLng(startM);
      const sy = edge.a[1] + uy * mToLat(startM);
      const ex = edge.a[0] + ux * mToLng(endM);
      const ey = edge.a[1] + uy * mToLat(endM);

      const p1 = [sx + nx * halfGapLng, sy + ny * mToLat(corridorWidth / 2)];
      const p2 = [ex + nx * halfGapLng, ey + ny * mToLat(corridorWidth / 2)];
      const p3 = [ex - nx * depthLng, ey - ny * depthLat];
      const p4 = [sx - nx * depthLng, sy - ny * depthLat];
      const poly = [p1, p2, p3, p4, p1];

      const cx = (p1[0] + p2[0] + p3[0] + p4[0]) / 4;
      const cy = (p1[1] + p2[1] + p3[1] + p4[1]) / 4;
      if (!pointInRing([cy, cx], ring)) {
        cursorM = endM + corridorWidth;
        continue;
      }

      roomIndex++;
      rooms.push({
        DisplayName: `Sala ${roomIndex}`,
        Type: "sala",
        Coordinates: poly.map((c) => [c[0], c[1]]),
      });
      cursorM = endM + corridorWidth;
    }
  }

  return rooms.slice(0, roomCount);
};
