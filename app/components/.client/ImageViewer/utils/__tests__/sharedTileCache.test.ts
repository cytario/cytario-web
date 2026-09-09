import { describe, expect, test } from "vitest";

import { getCachedTile, OVERLAY_CACHE_NS, trimSharedTileCaches } from "../sharedTileCache";

describe("sharedTileCache", () => {
  test("memoizes the fetcher result by key", async () => {
    const ns = {};
    const fetcher = vi.fn(async () => "tile");

    const first = await getCachedTile(ns, "k", fetcher);
    const second = await getCachedTile(ns, "k", fetcher);

    expect(first).toBe("tile");
    expect(second).toBe("tile");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("evicts a failed fetch so the next caller refetches", async () => {
    const ns = {};
    let attempts = 0;
    const fetcher = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("boom");
      return "tile";
    });

    await expect(getCachedTile(ns, "k", fetcher)).rejects.toThrow("boom");
    const retry = await getCachedTile(ns, "k", fetcher);
    expect(retry).toBe("tile");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("trimSharedTileCaches drops overlay entries", async () => {
    await getCachedTile(OVERLAY_CACHE_NS, "k", async () => "overlay");
    trimSharedTileCaches();
    const fetcher = vi.fn(async () => "overlay-2");
    const result = await getCachedTile(OVERLAY_CACHE_NS, "k", fetcher);
    expect(result).toBe("overlay-2");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test("namespaces never collide", async () => {
    const a = {};
    const b = {};
    await getCachedTile(a, "same-key", async () => "from-a");
    const result = await getCachedTile(b, "same-key", async () => "from-b");
    expect(result).toBe("from-b");
  });
});
