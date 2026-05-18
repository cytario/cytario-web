import { describe, expect, test } from "vitest";

import { mapWithConcurrency } from "../limitConcurrency";

/** Manually-resolvable promise so a test can sequence start/finish events. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("mapWithConcurrency", () => {
  test("preserves input order in the result array", async () => {
    const items = [10, 20, 30, 40, 50];
    const result = await mapWithConcurrency(items, 2, async (n, i) => {
      // Shuffle completion order: smaller items finish later.
      await new Promise((r) => setTimeout(r, items.length - i));
      return n * 2;
    });

    expect(result).toEqual([20, 40, 60, 80, 100]);
  });

  test("never runs more than `limit` calls in flight at once", async () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    const inFlight = { current: 0, peak: 0 };
    const gates = items.map(() => deferred<void>());

    const run = mapWithConcurrency(items, 3, async (_item, i) => {
      inFlight.current++;
      inFlight.peak = Math.max(inFlight.peak, inFlight.current);
      await gates[i].promise;
      inFlight.current--;
      return i;
    });

    // Let the workers pick up their first slots, then release one at a time.
    for (let i = 0; i < items.length; i++) {
      await Promise.resolve();
      await Promise.resolve();
      gates[i].resolve();
    }

    const out = await run;
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(inFlight.peak).toBeLessThanOrEqual(3);
    expect(inFlight.peak).toBeGreaterThan(0);
  });

  test("propagates the first rejection", async () => {
    const items = [1, 2, 3, 4];
    const err = new Error("boom");

    await expect(
      mapWithConcurrency(items, 2, async (n) => {
        if (n === 2) throw err;
        await new Promise((r) => setTimeout(r, 5));
        return n;
      }),
    ).rejects.toBe(err);
  });

  test("returns an empty array for empty input without invoking fn", async () => {
    const fn = vi.fn(async (n: number) => n);
    const result = await mapWithConcurrency([], 4, fn);
    expect(result).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  test("handles limit greater than items length", async () => {
    const result = await mapWithConcurrency([1, 2, 3], 100, async (n) => n + 1);
    expect(result).toEqual([2, 3, 4]);
  });
});
