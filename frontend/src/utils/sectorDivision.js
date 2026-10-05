const METERS_PER_DEG_LAT = 111320;

const toRad = (d) => (d * Math.PI) / 180;

const averageLat = (ring) => {
  let sum = 0;
  for (const c of ring) sum += c[1];
  return sum / Math.max(ring.length, 1);
};

const metersPerDegLngAt = (lat) => METERS_PER_DEG_LAT * Math.cos(toRad(lat));

const polygonArea = (ring) => {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
  }
  return Math.abs(area) / 2;
};

const bboxOf = (ring) => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of ring) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, maxX, minY, maxY };
};

const ringCentroid = (ring) => {
  const n = ring.length;
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = ring[i][0] * ring[j][1] - ring[j][0] * ring[i][1];
    twiceArea += cross;
    cx += (ring[i][0] + ring[j][0]) * cross;
    cy += (ring[i][1] + ring[j][1]) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    const bb = bboxOf(ring);
    return [(bb.minX + bb.maxX) / 2, (bb.minY + bb.maxY) / 2];
  }
  return [cx / (3 * twiceArea), cy / (3 * twiceArea)];
};

const sanitizeRing = (points) => {
  const deduped = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) {
      deduped.push([p[0], p[1]]);
    }
  }
  if (deduped.length < 3) return [];
  if (
    deduped.length > 1 &&
    Math.abs(deduped[0][0] - deduped[deduped.length - 1][0]) < 1e-6 &&
    Math.abs(deduped[0][1] - deduped[deduped.length - 1][1]) < 1e-6
  ) {
    deduped.pop();
  }
  if (deduped.length < 3) return [];
  const collinear = [];
  const count = deduped.length;
  for (let i = 0; i < count; i++) {
    const prev = deduped[(i + count - 1) % count];
    const cur = deduped[i];
    const next = deduped[(i + 1) % count];
    const cross = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]);
    if (Math.abs(cross) > 1e-9) {
      collinear.push([cur[0], cur[1]]);
    }
  }
  return collinear;
};

const clipAgainstLine = (ring, axis, cut, keep) => {
  const out = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const cur = ring[i];
    const nxt = ring[(i + 1) % n];
    const curV = axis === "x" ? cur[0] : cur[1];
    const nxtV = axis === "x" ? nxt[0] : nxt[1];
    const curIn = keep === 0 ? curV <= cut : curV >= cut;
    const nxtIn = keep === 0 ? nxtV <= cut : nxtV >= cut;
    if (curIn) out.push([cur[0], cur[1]]);
    if (curIn !== nxtIn) {
      const denom = axis === "x" ? nxt[0] - cur[0] : nxt[1] - cur[1];
      if (Math.abs(denom) > 1e-12) {
        const t = (cut - curV) / denom;
        out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]);
      }
    }
  }
  return sanitizeRing(out);
};

const binarySearchCut = (poly, axis, lo, hi, target) => {
  let l = lo;
  let h = hi;
  for (let i = 0; i < 64; i++) {
    const m = (l + h) / 2;
    const area = polygonArea(clipAgainstLine(poly, axis, m, 0));
    if (area < target) {
      l = m;
    } else {
      h = m;
    }
  }
  return (l + h) / 2;
};

const splitIntoTwo = (poly, axis, cut) => {
  const left = clipAgainstLine(poly, axis, cut, 0);
  const right = clipAgainstLine(poly, axis, cut, 1);
  const al = polygonArea(left);
  const ar = polygonArea(right);
  return {
    left,
    right,
    al,
    ar,
    valid: left.length >= 4 && right.length >= 4 && al > 0 && ar > 0,
  };
};

const bandFallback = (poly, k) => {
  const total = polygonArea(poly);
  const bb = bboxOf(poly);
  const cuts = [];
  for (let i = 1; i < k; i++) {
    cuts.push(binarySearchCut(poly, "x", bb.minX, bb.maxX, (total * i) / k));
  }
  const pieces = [];
  for (let i = 0; i < k; i++) {
    const loX = i === 0 ? -Infinity : cuts[i - 1];
    const hiX = i === k - 1 ? Infinity : cuts[i];
    let piece = poly;
    if (Number.isFinite(loX)) piece = clipAgainstLine(piece, "x", loX, 1);
    if (Number.isFinite(hiX)) piece = clipAgainstLine(piece, "x", hiX, 0);
    pieces.push(piece);
  }
  return pieces;
};

const divide = (poly, k, depth) => {
  const area = polygonArea(poly);
  if (k <= 1) return [poly];
  if (area < 1e-6) return [];

  const k1 = Math.round(k / 2);
  const k2 = k - k1;
  const target = (area * k1) / k;
  const axes = depth % 2 === 0 ? ["x", "y"] : ["y", "x"];

  let best = null;
  for (const axis of axes) {
    const bb = bboxOf(poly);
    const lo = axis === "x" ? bb.minX : bb.minY;
    const hi = axis === "x" ? bb.maxX : bb.maxY;
    if (hi - lo < 1e-6) continue;
    const cut = binarySearchCut(poly, axis, lo, hi, target);
    const split = splitIntoTwo(poly, axis, cut);
    if (!split.valid) continue;
    const coverageDev = Math.abs(split.al + split.ar - area) / area;
    const balanceDev = target > 0 ? Math.abs(split.al - target) / target : 0;
    const quality = balanceDev + coverageDev * 5;
    if (!best || quality < best.quality) {
      best = { split, quality };
    }
  }

  if (!best) {
    return bandFallback(poly, k);
  }

  const leftPieces = divide(best.split.left, k1, depth + 1);
  const rightPieces = divide(best.split.right, k2, depth + 1);
  return leftPieces.concat(rightPieces);
};

export const divideBuildingIntoSectors = (buildingGeometry, sectorCount, options = {}) => {
  const minCount = options.minCount ?? 2;
  const maxCount = options.maxCount ?? 12;
  const requested = Math.floor(Number(sectorCount));
  // Uno es un caso especial: el sector debe conservar exactamente la silueta
  // del edificio. Desde dos en adelante se mantiene la division habitual.
  const count = requested === 1
    ? 1
    : Number.isFinite(requested)
    ? Math.max(minCount, Math.min(maxCount, requested))
    : Math.max(minCount, Math.min(maxCount, 2));

  if (!buildingGeometry?.coordinates?.[0]) return [];
  const ring = buildingGeometry.coordinates[0];
  if (ring.length < 4) return [];

  const centerLat = averageLat(ring);
  const mPerLng = metersPerDegLngAt(centerLat);
  const toMeters = (c) => [c[0] * mPerLng, c[1] * METERS_PER_DEG_LAT];
  const toLatLng = (c) => [c[0] / mPerLng, c[1] / METERS_PER_DEG_LAT];

  const metersRing = sanitizeRing(ring.map(toMeters));
  if (metersRing.length < 3) return [];
  const originalArea = polygonArea(metersRing);
  if (!(originalArea > 0)) return [];

  if (count === 1) {
    const [cxM, cyM] = ringCentroid(metersRing);
    return [{
      index: 1,
      displayName: "Sector 1",
      type: "sector",
      coordinates: ring.map((coordinate) => [coordinate[0], coordinate[1]]),
      areaM2: originalArea,
      centroid: [cxM / mPerLng, cyM / METERS_PER_DEG_LAT],
    }];
  }

  const pieces = divide(metersRing, count, 0).filter((p) => p.length >= 3 && polygonArea(p) > 1e-6);

  return pieces.slice(0, count).map((pieceMeters, index) => {
    const [cxM, cyM] = ringCentroid(pieceMeters);
    const centroid = [cxM / mPerLng, cyM / METERS_PER_DEG_LAT];
    const closed = pieceMeters.map(toLatLng);
    closed.push([closed[0][0], closed[0][1]]);
    return {
      index: index + 1,
      displayName: `Sector ${index + 1}`,
      type: "sector",
      coordinates: closed,
      areaM2: polygonArea(pieceMeters),
      centroid,
    };
  });
};

export const sectorCountForArea = (areaM2, targetM2 = 1500) => {
  if (!Number.isFinite(areaM2) || areaM2 <= 0) return 2;
  return Math.max(2, Math.min(12, Math.ceil(areaM2 / targetM2)));
};

export default divideBuildingIntoSectors;
