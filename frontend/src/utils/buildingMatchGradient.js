const normalizeRate = (rate) => {
  if (rate === null || rate === undefined || rate === "") return null;

  const numeric = Number(rate);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric));
};

export const buildingMatchColor = (rate) => {
  const clamped = normalizeRate(rate);
  if (clamped === null) return null;

  const hue = Math.round((clamped / 100) * 120);
  return `hsl(${hue}, 65%, 45%)`;
};

export const buildingMatchPercentLabel = (rate) => {
  const clamped = normalizeRate(rate);
  if (clamped === null) return null;

  return `${Math.round(clamped)}%`;
};

export const isValidMatchRate = (rate) => normalizeRate(rate) !== null;