const pending = new Map();
let writes = 0;
let generation = 0;

export const clearInflightFetches = () => {
  generation += 1;
  pending.clear();
};

export const fetchInflight = async (url, options = {}) => {
  // Signals and other options can have per-caller semantics; do not share them.
  if (writes || Object.keys(options).some((key) => !["cache", "credentials"].includes(key))) {
    return fetch(url, options);
  }
  const key = JSON.stringify([url, options.cache || "default", options.credentials || "same-origin"]);
  let request = pending.get(key);
  if (!request) {
    const startedAt = generation;
    request = fetch(url, options);
    if (startedAt === generation && !writes) {
      pending.set(key, request);
      const clear = () => { if (pending.get(key) === request) pending.delete(key); };
      request.then(clear, clear);
    }
  }
  return (await request).clone();
};

export const fetchMutation = async (url, options) => {
  writes += 1;
  clearInflightFetches();
  try {
    return await fetch(url, options);
  } finally {
    clearInflightFetches();
    writes -= 1;
  }
};
