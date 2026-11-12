import { describe, expect, test, vi } from "vitest";

import { selectionKey } from "../useChannelsLayer";

// `getTile` runs per tile per channel and re-derived the shared-tile-cache key
// from `params.selection` on every call. The memo must produce a stable key for
// the same selection instance without re-serializing it.
describe("selectionKey", () => {
  test("serializes an object selection", () => {
    expect(selectionKey({ c: 0, t: 0 })).toBe(JSON.stringify({ c: 0, t: 0 }));
  });

  test("caches per instance — repeated calls do not re-serialize", () => {
    const selection = { c: 3, t: 1 };
    const stringifySpy = vi.spyOn(JSON, "stringify");

    selectionKey(selection);
    selectionKey(selection);
    selectionKey(selection);

    expect(stringifySpy).toHaveBeenCalledTimes(1);
    stringifySpy.mockRestore();
  });

  test("distinct instances hash independently", () => {
    expect(selectionKey({ c: 1 })).not.toBe(selectionKey({ c: 2 }));
  });

  test("falls back for non-object selections", () => {
    expect(selectionKey("all")).toBe("all");
    expect(selectionKey(null)).toBe("null");
    expect(selectionKey(7)).toBe("7");
  });
});
