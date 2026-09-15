// Ray casting point-in-polygon (anillo exterior, coords [lat, lng]).
export const pointInRing = (latlng, ring) => {
  if (!latlng || !Array.isArray(ring) || ring.length < 3) return false;

  const y = latlng.lat;
  const x = latlng.lng;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0];
    const xi = ring[i][1];
    const yj = ring[j][0];
    const xj = ring[j][1];

    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
};
