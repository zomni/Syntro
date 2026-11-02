const pending = new Map();

// Only use for public static assets, never authenticated or mutable API reads.
export const fetchRevalidated = async (url) => {
  let request = pending.get(url);
  if (!request) {
    request = fetch(url, { cache: "no-cache" });
    pending.set(url, request);
    request.then(
      () => { if (pending.get(url) === request) pending.delete(url); },
      () => { if (pending.get(url) === request) pending.delete(url); }
    );
  }
  return (await request).clone();
};

export const resetRevalidatedFetch = () => pending.clear();
