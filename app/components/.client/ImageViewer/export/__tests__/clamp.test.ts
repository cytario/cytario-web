import { describe, expect, test } from "vitest";

import { capAtNativeResolution, clampExportSize, type ExportRenderLimits } from "../clamp";

const limits = (over: Partial<ExportRenderLimits> = {}): ExportRenderLimits => ({
  maxCanvasSide: 16384,
  areaLimit: 16384 * 16384,
  ...over,
});

describe("clampExportSize", () => {
  test("returns the requested size when it fits every limit", () => {
    const result = clampExportSize({
      viewport: { width: 800, height: 600 },
      scale: 2,
      limits: limits(),
    });

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    expect(result.clamped).toBe(false);
  });

  test("applies each resolution scale (1×, 2×, 4×)", () => {
    const viewport = { width: 640, height: 480 };
    for (const [scale, expectedWidth] of [
      [1, 640],
      [2, 1280],
      [4, 2560],
    ] as const) {
      const result = clampExportSize({ viewport, scale, limits: limits() });
      expect(result.width).toBe(expectedWidth);
    }
  });

  test("clamps to the canvas side cap while keeping the aspect", () => {
    const result = clampExportSize({
      viewport: { width: 9000, height: 6000 },
      scale: 2,
      limits: limits({ maxCanvasSide: 8192 }),
    });

    expect(result.width).toBeLessThanOrEqual(8192);
    expect(result.height).toBeLessThanOrEqual(8192);
    // 9000×6000 scaled 2× is 18000×12000 → factor 8192/18000 ≈ 0.4551.
    expect(result.width).toBe(8192);
    expect(result.height).toBe(Math.floor((12000 * 8192) / 18000 / 2) * 2);
    expect(result.clamped).toBe(true);
  });

  test("clamps to the area limit even when both sides individually fit", () => {
    const result = clampExportSize({
      viewport: { width: 12000, height: 10000 },
      scale: 2,
      // Side caps would allow 16384, but the area cap is tighter.
      limits: limits({ areaLimit: 100_000_000 }),
    });

    expect(result.width * result.height).toBeLessThanOrEqual(100_000_000);
    expect(result.clamped).toBe(true);
    // Aspect preserved: 12000/10000 = 1.2.
    expect(result.width / result.height).toBeCloseTo(1.2, 1);
  });

  test("floors to even dimensions", () => {
    const result = clampExportSize({
      viewport: { width: 401, height: 301 },
      scale: 1,
      limits: limits(),
    });

    expect(result.width % 2).toBe(0);
    expect(result.height % 2).toBe(0);
    expect(result.width).toBe(400);
    expect(result.height).toBe(300);
  });

  test("a size that fits after clamping is not marked clamped", () => {
    const result = clampExportSize({
      viewport: { width: 4096, height: 4096 },
      scale: 1,
      limits: limits({ maxCanvasSide: 4096 }),
    });

    expect(result.width).toBe(4096);
    expect(result.height).toBe(4096);
    expect(result.clamped).toBe(false);
  });
});

describe("capAtNativeResolution", () => {
  test("passes through a size at or below the native extent", () => {
    const result = capAtNativeResolution(
      { width: 1000, height: 800 },
      { width: 2000, height: 1600 },
    );

    expect(result.width).toBe(1000);
    expect(result.height).toBe(800);
    expect(result.upscaled).toBe(false);
  });

  test("flags upscaled up to 2× beyond native and keeps it", () => {
    const result = capAtNativeResolution(
      { width: 3600, height: 2800 },
      { width: 2000, height: 1600 },
    );

    expect(result.width).toBe(3600);
    expect(result.height).toBe(2800);
    expect(result.upscaled).toBe(true);
  });

  test("caps at 2× beyond the native extent", () => {
    const result = capAtNativeResolution(
      { width: 9000, height: 7000 },
      { width: 2000, height: 1600 },
    );

    expect(result.width).toBe(4000);
    expect(result.height).toBe(3200);
    expect(result.upscaled).toBe(true);
  });

  test("flags upscaled when only one axis exceeds native", () => {
    const result = capAtNativeResolution(
      { width: 3000, height: 1000 },
      { width: 2000, height: 1600 },
    );

    expect(result.upscaled).toBe(true);
  });
});
