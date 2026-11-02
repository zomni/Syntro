import { clearInflightFetches, fetchInflight, fetchMutation } from "../utils/inflightFetch.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = () => ({ clone: () => ({}) });

afterEach(() => {
  clearInflightFetches();
  delete global.fetch;
});

test("shares matching concurrent reads only and clones each response", async () => {
  const pending = deferred();
  global.fetch = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(response());
  const first = fetchInflight("/items?floor=1", { cache: "no-store" });
  const second = fetchInflight("/items?floor=1", { cache: "no-store" });
  expect(fetch).toHaveBeenCalledTimes(1);
  pending.resolve(response());
  const [a, b] = await Promise.all([first, second]);
  expect(a).not.toBe(b);
  await fetchInflight("/items?floor=1", { cache: "no-store" });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("separates parameters and credentials and bypasses unsupported options", async () => {
  const pending = deferred();
  global.fetch = jest.fn().mockReturnValue(pending.promise);
  const requests = [
    fetchInflight("/items?q=a", { credentials: "include" }),
    fetchInflight("/items?q=b", { credentials: "include" }),
    fetchInflight("/items?q=a", { credentials: "omit" }),
    fetchInflight("/items?q=a", { headers: { Authorization: "token" } }),
    fetchInflight("/items?q=a", { headers: { Authorization: "token" } }),
  ];
  expect(fetch).toHaveBeenCalledTimes(5);
  pending.resolve(response());
  await Promise.all(requests);
});

test("writes isolate reads before, during and after mutation, even when old requests settle", async () => {
  const calls = Array.from({ length: 4 }, deferred);
  global.fetch = jest.fn().mockImplementation(() => calls[fetch.mock.calls.length - 1].promise);
  const old = fetchInflight("/markers");
  const write = fetchMutation("/markers", { method: "POST" });
  const during = fetchInflight("/markers");
  calls[1].resolve(response());
  await write;
  const fresh = fetchInflight("/markers");
  calls[0].resolve(response());
  await old;
  const joined = fetchInflight("/markers");
  expect(fetch).toHaveBeenCalledTimes(4);
  calls[2].resolve(response());
  calls[3].resolve(response());
  await Promise.all([during, fresh, joined]);
});

test("rejections and explicit invalidation allow fresh requests", async () => {
  const old = deferred();
  global.fetch = jest.fn().mockReturnValueOnce(old.promise).mockResolvedValue(response());
  const first = fetchInflight("/items");
  clearInflightFetches();
  const next = fetchInflight("/items");
  old.reject(new Error("offline"));
  await expect(first).rejects.toThrow("offline");
  await next;
  await fetchInflight("/items");
  expect(fetch).toHaveBeenCalledTimes(3);
});

test("a mutation started while a read is being registered cannot leave that read reusable", async () => {
  const old = deferred();
  const save = deferred();
  const fresh = deferred();
  let write;
  global.fetch = jest.fn()
    .mockImplementationOnce(() => {
      write = fetchMutation("/markers", { method: "POST" });
      return old.promise;
    })
    .mockReturnValueOnce(save.promise)
    .mockReturnValueOnce(fresh.promise);

  const before = fetchInflight("/markers");
  save.resolve(response());
  await write;
  const after = fetchInflight("/markers");
  expect(fetch).toHaveBeenCalledTimes(3);
  old.resolve(response());
  fresh.resolve(response());
  await Promise.all([before, after]);
});

test("overlapping mutations keep reads isolated until all writes settle, including failures", async () => {
  const firstSave = deferred();
  const secondSave = deferred();
  const read = deferred();
  global.fetch = jest.fn()
    .mockReturnValueOnce(firstSave.promise)
    .mockReturnValueOnce(secondSave.promise)
    .mockReturnValue(read.promise);
  const first = fetchMutation("/markers/1", { method: "PUT" });
  const second = fetchMutation("/markers/2", { method: "PUT" });
  firstSave.resolve(response());
  await first;
  const during1 = fetchInflight("/markers");
  const during2 = fetchInflight("/markers");
  expect(fetch).toHaveBeenCalledTimes(4);
  secondSave.reject(new Error("save failed"));
  await expect(second).rejects.toThrow("save failed");
  const after1 = fetchInflight("/markers");
  const after2 = fetchInflight("/markers");
  expect(fetch).toHaveBeenCalledTimes(5);
  read.resolve(response());
  await Promise.all([during1, during2, after1, after2]);
});
