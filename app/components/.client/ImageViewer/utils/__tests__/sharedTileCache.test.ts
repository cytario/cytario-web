import { describe, expect, test } from "vitest";

import {
  getCachedTile,
  invalidateOverlayTiles,
  OVERLAY_CACHE_NS,
  trimSharedTileCaches,
} from "../sharedTileCache";

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

  test("keeps in-budget tiles cached after re-sizing with their real footprint", async () => {
    const ns = {};
    const tile = { data: new Uint8Array(1024), width: 1, height: 1 };

    await getCachedTile(ns, "small", async () => tile);
    const refetch = vi.fn(async () => tile);
    const result = await getCachedTile(ns, "small", refetch);

    expect(result).toBe(tile);
    expect(refetch).not.toHaveBeenCalled();
  });

  test("drops resolved entries larger than maxEntrySize and refetches", async () => {
    const ns = {};
    const tile = { data: new Uint8Array(64 * 1024 * 1024 + 1), width: 1, height: 1 };
    const fetcher = vi.fn(async () => tile);

    await getCachedTile(ns, "big", fetcher);
    await getCachedTile(ns, "big", fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("sizes entries by the sum of multi-buffer channel data", async () => {
    const ns = {};
    const tile = {
      data: [new Uint8Array(33 * 1024 * 1024), new Uint8Array(33 * 1024 * 1024)],
      width: 1,
      height: 1,
    };

    await getCachedTile(ns, "multi", async () => tile);
    const refetch = vi.fn(async () => tile);
    const result = await getCachedTile(ns, "multi", refetch);

    expect(result).toBe(tile);
    expect(refetch).toHaveBeenCalledTimes(1);
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

  test("invalidateOverlayTiles drops only the targeted resource's entries", async () => {
    await getCachedTile(OVERLAY_CACHE_NS, "res-1|0-0-0|cfg", async () => "res1");
    await getCachedTile(OVERLAY_CACHE_NS, "res-1|1-0-0|cfg", async () => "res1");
    await getCachedTile(OVERLAY_CACHE_NS, "res-2|0-0-0|cfg", async () => "res2");

    invalidateOverlayTiles("res-1");

    const refetch1 = vi.fn(async () => "res1-new");
    const refetch2 = vi.fn(async () => "res2-new");
    await getCachedTile(OVERLAY_CACHE_NS, "res-1|0-0-0|cfg", refetch1);
    await getCachedTile(OVERLAY_CACHE_NS, "res-2|0-0-0|cfg", refetch2);

    expect(refetch1).toHaveBeenCalledTimes(1);
    expect(refetch2).not.toHaveBeenCalled();
  });

  test("invalidateOverlayTiles without a resource clears everything", async () => {
    await getCachedTile(OVERLAY_CACHE_NS, "res-1|0-0-0|cfg", async () => "res1");
    await getCachedTile(OVERLAY_CACHE_NS, "res-2|0-0-0|cfg", async () => "res2");

    invalidateOverlayTiles();

    const refetch1 = vi.fn(async () => "x");
    const refetch2 = vi.fn(async () => "x");
    await getCachedTile(OVERLAY_CACHE_NS, "res-1|0-0-0|cfg", refetch1);
    await getCachedTile(OVERLAY_CACHE_NS, "res-2|0-0-0|cfg", refetch2);

    expect(refetch1).toHaveBeenCalledTimes(1);
    expect(refetch2).toHaveBeenCalledTimes(1);
  });

  test("namespaces never collide", async () => {
    const a = {};
    const b = {};
    await getCachedTile(a, "same-key", async () => "from-a");
    const result = await getCachedTile(b, "same-key", async () => "from-b");
    expect(result).toBe("from-b");
  });
});
