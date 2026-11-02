import { fetchRevalidated, resetRevalidatedFetch } from "../utils/revalidatedFetch.js";

afterEach(() => {
  resetRevalidatedFetch();
  delete global.fetch;
});

test("shares only concurrent requests and returns independently consumable responses", async () => {
  const response = { clone: jest.fn(() => ({})) };
  let resolve;
  global.fetch = jest.fn(() => new Promise((done) => { resolve = done; }));
  const first = fetchRevalidated("catalog.json");
  const second = fetchRevalidated("catalog.json");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("catalog.json", { cache: "no-cache" });
  resolve(response);
  const results = await Promise.all([first, second]);
  expect(results[0]).not.toBe(results[1]);
  expect(response.clone).toHaveBeenCalledTimes(2);
  fetch.mockResolvedValueOnce(response);
  await fetchRevalidated("catalog.json");
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("reset isolates new requests from old completions", async () => {
  const resolves = [];
  global.fetch = jest.fn(() => new Promise((done) => resolves.push(done)));
  const old = fetchRevalidated("catalog.json");
  resetRevalidatedFetch();
  const current = fetchRevalidated("catalog.json");
  resolves[0]({ clone: () => ({}) });
  await old;
  const joined = fetchRevalidated("catalog.json");
  expect(fetch).toHaveBeenCalledTimes(2);
  resolves[1]({ clone: () => ({}) });
  await Promise.all([current, joined]);
});

test("failed requests can be retried", async () => {
  global.fetch = jest.fn().mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ clone: () => ({}) });
  await expect(fetchRevalidated("catalog.json")).rejects.toThrow("offline");
  await fetchRevalidated("catalog.json");
  expect(fetch).toHaveBeenCalledTimes(2);
});
