import { createCatalogCache } from "../catalogCache.server";

vi.mock("~/config", () => ({
  cytarioConfig: {
    providers: {
      catalogFailureBackoffMs: 5_000,
    },
  },
}));

const BACKOFF_MS = 5_000;

interface FakeCatalog {
  label: string;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(
  results: Array<Promise<FakeCatalog> | (() => Promise<FakeCatalog>)>,
  keyFor = (organization: string) => `portal:${organization}`,
) {
  const fetchCatalog = vi.fn();
  for (const result of results) {
    if (typeof result === "function") {
      fetchCatalog.mockImplementationOnce(result);
    } else {
      fetchCatalog.mockImplementationOnce(() => result);
    }
  }
  return { cache: createCatalogCache<FakeCatalog>(fetchCatalog, keyFor), fetchCatalog };
}

describe("createCatalogCache", () => {
  test("fetches on demand and resolves the caller with the fetched value", async () => {
    const { cache, fetchCatalog } = setup([Promise.resolve({ label: "first" })]);

    await expect(cache.get("acme")).resolves.toEqual({ label: "first" });
    expect(fetchCatalog).toHaveBeenCalledWith("acme", undefined);
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("serves a success from the burst window without refetching", async () => {
    const { cache, fetchCatalog } = setup([Promise.resolve({ label: "first" })]);

    await cache.get("acme");
    await vi.advanceTimersByTimeAsync(1_999);
    await expect(cache.get("acme")).resolves.toEqual({ label: "first" });
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("refetches once the burst window has expired (never serves stale data)", async () => {
    const { cache, fetchCatalog } = setup([
      Promise.resolve({ label: "first" }),
      Promise.resolve({ label: "second" }),
    ]);

    await cache.get("acme");
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(cache.get("acme")).resolves.toEqual({ label: "second" });
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  test("coalesces concurrent callers onto one in-flight fetch", async () => {
    let releaseFetch: () => void = () => {};
    const { cache, fetchCatalog } = setup([
      new Promise<FakeCatalog>((resolve) => {
        releaseFetch = () => resolve({ label: "shared" });
      }),
    ]);

    const first = cache.get("acme", "token-1");
    const second = cache.get("acme", "token-2");
    releaseFetch();

    await expect(first).resolves.toEqual({ label: "shared" });
    await expect(second).resolves.toEqual({ label: "shared" });
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("coalesces a caller that arrives while the fetch is still in flight", async () => {
    let releaseFetch: () => void = () => {};
    const { cache, fetchCatalog } = setup([
      new Promise<FakeCatalog>((resolve) => {
        releaseFetch = () => resolve({ label: "shared" });
      }),
    ]);

    const first = cache.get("acme");
    await vi.advanceTimersByTimeAsync(1_000);
    const second = cache.get("acme");
    releaseFetch();

    await expect(first).resolves.toEqual({ label: "shared" });
    await expect(second).resolves.toEqual({ label: "shared" });
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("passes the access token through to the fetch", async () => {
    const { cache, fetchCatalog } = setup([Promise.resolve({ label: "first" })]);

    await cache.get("acme", "token-abc");
    expect(fetchCatalog).toHaveBeenCalledWith("acme", "token-abc");
  });

  test("fast-fails within the backoff window without refetching", async () => {
    const failure = new Error("portal down");
    const { cache, fetchCatalog } = setup([
      Promise.reject(failure),
      Promise.resolve({ label: "never reached" }),
    ]);

    await expect(cache.get("acme")).rejects.toThrow("portal down");
    await expect(cache.get("acme")).rejects.toThrow("portal down");
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("retries the fetch once the backoff window has expired", async () => {
    const { cache, fetchCatalog } = setup([
      Promise.reject(new Error("portal down")),
      Promise.resolve({ label: "recovered" }),
    ]);

    await expect(cache.get("acme")).rejects.toThrow("portal down");
    expect(fetchCatalog).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(BACKOFF_MS);
    await expect(cache.get("acme")).resolves.toEqual({ label: "recovered" });
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  test("never serves a success after the backoff window began", async () => {
    const { cache, fetchCatalog } = setup([
      Promise.resolve({ label: "first" }),
      () => Promise.reject(new Error("portal down")),
    ]);

    await cache.get("acme");
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(cache.get("acme")).rejects.toThrow("portal down");
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  test("keys the cache per organization", async () => {
    const { cache, fetchCatalog } = setup([
      Promise.resolve({ label: "acme" }),
      Promise.resolve({ label: "globex" }),
    ]);

    await cache.get("acme");
    await cache.get("globex");
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(fetchCatalog).toHaveBeenNthCalledWith(1, "acme", undefined);
    expect(fetchCatalog).toHaveBeenNthCalledWith(2, "globex", undefined);
  });

  test("the key builder decides the cache key (OSS vs portal)", async () => {
    const { cache, fetchCatalog } = setup([Promise.resolve({ label: "oss" })], () => "oss");

    await cache.get("ignored-org");
    await vi.advanceTimersByTimeAsync(1_000);
    await cache.get("other-org");
    expect(fetchCatalog).toHaveBeenCalledTimes(1);
  });

  test("clear drops every entry, forcing the next call to refetch", async () => {
    const { cache, fetchCatalog } = setup([
      Promise.resolve({ label: "first" }),
      Promise.resolve({ label: "second" }),
    ]);

    await cache.get("acme");
    cache.clear();
    await expect(cache.get("acme")).resolves.toEqual({ label: "second" });
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
  });

  test("evicts the oldest entry once the cache exceeds the entry cap", async () => {
    const { cache, fetchCatalog } = setup(
      Array.from({ length: 102 }, (_, index) => Promise.resolve({ label: `org-${index}` })),
    );

    for (let orgIndex = 0; orgIndex < 101; orgIndex++) {
      await cache.get(`org-${orgIndex}`);
    }
    expect(fetchCatalog).toHaveBeenCalledTimes(101);

    await vi.advanceTimersByTimeAsync(2_000);
    await cache.get("org-0");
    expect(fetchCatalog).toHaveBeenCalledTimes(102);
    expect(fetchCatalog).toHaveBeenLastCalledWith("org-0", undefined);
  });
});
