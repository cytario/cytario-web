import { describe, expect, test } from "vitest";

import { __testHooks, trimDecoderCache } from "../genericDecoder";

describe("decoder bufferCache", () => {
  test("is byte-bounded: oversized entries are not cached", () => {
    __testHooks.reset();

    // 100 MB buffer exceeds MAX_CACHE_ENTRY_BYTES (64 MB) — not cached.
    const oversized = new ArrayBuffer(100 * 1024 * 1024);
    __testHooks.cacheSet(1, oversized);
    expect(__testHooks.cacheGet(1)).toBeUndefined();

    const small = new ArrayBuffer(1024);
    __testHooks.cacheSet(2, small);
    expect(__testHooks.cacheGet(2)).toBe(small);
  });

  test("trimDecoderCache drops everything", () => {
    __testHooks.reset();
    __testHooks.cacheSet(3, new ArrayBuffer(1024));
    expect(__testHooks.cacheSize()).toBe(1);

    trimDecoderCache();

    expect(__testHooks.cacheSize()).toBe(0);
  });
});
