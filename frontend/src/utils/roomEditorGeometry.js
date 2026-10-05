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

export const ringCentroidLatLng = (latLngs) => {
  const n = latLngs.length;
  if (n < 3) return null;

  const centerLat = latLngs.reduce((sum, point) => sum + point[0], 0) / n;
  const lngScale = Math.cos((centerLat * Math.PI) / 180);
  // Translate the polygon before the shoelace calculation. Using absolute
  // coordinates such as -33/-70 loses precision for small sectors.
  const originX = latLngs[0][1] * lngScale;
  const originY = latLngs[0][0];
  const points = latLngs.map((point) => [
    point[1] * lngScale - originX,
    point[0] - originY,
  ]);
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const cross = points[i][0] * points[j][1] - points[j][0] * points[i][1];
    twiceArea += cross;
    cx += (points[i][0] + points[j][0]) * cross;
    cy += (points[i][1] + points[j][1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    const lngs = latLngs.map((point) => point[1]);
    const lats = latLngs.map((point) => point[0]);
    return [
      (Math.min(...lats) + Math.max(...lats)) / 2,
      (Math.min(...lngs) + Math.max(...lngs)) / 2,
    ];
  }

  return [
    originY + cy / (3 * twiceArea),
    (originX + cx / (3 * twiceArea)) / lngScale,
  ];
};

// Arma un cuadrado con la esquina en 'corner' y el lado hacia donde apunta el
// puntero. El lado se decide en metros y recien ahi se pasa a grados, porque un
// grado de longitud mide menos que uno de latitud: a -33 grados son 92.7 km
// contra 111.3 km. Mezclar los dos ejes en grados deja un cuadrado ~20% mas
// ancho que alto, que es lo que pasaba antes de sacar la cuenta de las unidades.
export const squareRingFromCorner = (corner, pointer) => {
  const [lat, lng] = corner;
  const [pLat, pLng] = pointer;
  const mPerDegLat = METERS_PER_DEG_LAT;
  const mPerDegLng = Math.max(
    EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180) * (Math.PI / 180),
    1
  );
  const sideM = Math.max(
    Math.abs(pLat - lat) * mPerDegLat,
    Math.abs(pLng - lng) * mPerDegLng
  );
  const dLat = sideM / mPerDegLat;
  const dLng = sideM / mPerDegLng;
  const latDir = pLat >= lat ? 1 : -1;
  const lngDir = pLng >= lng ? 1 : -1;
  return [
    [lat, lng],
    [lat, lng + dLng * lngDir],
    [lat + dLat * latDir, lng + dLng * lngDir],
    [lat + dLat * latDir, lng],
  ];
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
