import { describe, expect, test, vi } from "vitest";

import {
  memoryPressureRatio,
  startMemoryWatchdog,
  type MemoryWatchdogOptions,
} from "../memoryWatchdog";

function makeWatchdog(
  memory: () => { usedJSHeapSize: number; jsHeapSizeLimit: number } | undefined,
) {
  const onPressure = vi.fn();
  const ticks: (() => void)[] = [];
  const cancelSchedules: (() => void)[] = [];
  const options: MemoryWatchdogOptions = {
    getMemoryInfo: memory,
    onPressure,
    schedule: (callback) => {
      ticks.push(callback);
      return () => {};
    },
  };
  const cancel = startMemoryWatchdog(options);
  cancelSchedules.push(cancel);
  return { options, fire: () => ticks.forEach((t) => t()), cancel, onPressure };
}

const heap = (used: number, limit = 1000) => ({ usedJSHeapSize: used, jsHeapSizeLimit: limit });

describe("memoryPressureRatio", () => {
  test("computes used/limit", () => {
    expect(memoryPressureRatio(heap(800, 1000))).toBe(0.8);
  });

  test("null when limit is zero", () => {
    expect(memoryPressureRatio(heap(800, 0))).toBeNull();
  });
});

describe("startMemoryWatchdog", () => {
  test("no-ops while performance.memory is unavailable", () => {
    const wd = makeWatchdog(() => undefined);
    wd.fire();
    wd.fire();
    expect(wd.onPressure).not.toHaveBeenCalled();
  });

  test("fires once after two consecutive hot samples, not on a single spike", () => {
    const wd = makeWatchdog(() => heap(900));
    wd.fire();
    expect(wd.onPressure).not.toHaveBeenCalled();

    wd.fire();
    expect(wd.onPressure).toHaveBeenCalledTimes(1);

    wd.fire();
    expect(wd.onPressure).toHaveBeenCalledTimes(1);
  });

  test("a GC dip between hot samples resets confirmation", () => {
    const dip = makeWatchdog(() => heap(500));
    dip.fire();

    const hot = makeWatchdog(() => heap(900));
    hot.fire();
    hot.fire();
    expect(hot.onPressure).toHaveBeenCalledTimes(1);
  });

  test("a dip after notification re-arms the warning", () => {
    const level = { used: 900 };
    const wd = makeWatchdog(() => heap(level.used));
    wd.fire();
    wd.fire();
    expect(wd.onPressure).toHaveBeenCalledTimes(1);

    level.used = 200;
    wd.fire();
    level.used = 900;
    wd.fire();
    wd.fire();
    expect(wd.onPressure).toHaveBeenCalledTimes(2);
  });

  test("does nothing below the threshold", () => {
    const wd = makeWatchdog(() => heap(700));
    wd.fire();
    wd.fire();
    wd.fire();
    expect(wd.onPressure).not.toHaveBeenCalled();
  });

  test("honors a custom warn threshold", () => {
    const ticks: (() => void)[] = [];
    const onPressure = vi.fn();
    startMemoryWatchdog({
      getMemoryInfo: () => heap(600),
      onPressure,
      schedule: (cb) => {
        ticks.push(cb);
        return () => {};
      },
      warnThreshold: 0.5,
    });
    const last = ticks[ticks.length - 1]!;
    last();
    last();
    expect(onPressure).toHaveBeenCalledTimes(1);
  });
});
