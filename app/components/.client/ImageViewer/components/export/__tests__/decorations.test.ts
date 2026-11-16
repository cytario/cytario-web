import { describe, expect, test, vi } from "vitest";

import { pickMetricScaleBar, SCALE_BAR_LAYOUT } from "../../canvas/Measurements/scaleBarGeometry";
import { millimetersPerUnit } from "../../canvas/Measurements/utils";
import {
  decorationFontPx,
  legendFontPx,
  drawLegendDecoration,
  drawScaleBarDecoration,
  exportScaleBar,
  resolveDecorationTheme,
  type DecorationTheme,
} from "../decorations";

const THEME: DecorationTheme = {
  background: "slate-900",
  foreground: "slate-50",
  mutedForeground: "slate-400",
  fontFamily: "Montserrat",
};

const context = () =>
  ({
    canvas: { width: 1920, height: 1080 },
    fillStyle: "",
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    font: "",
    textBaseline: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
  }) as unknown as CanvasRenderingContext2D;

describe("exportScaleBar", () => {
  test("at the viewer's 12 px font it picks exactly what the viewer shows", () => {
    // 0.25 µm per px: 20 µm is the longest step within 140 px.
    expect(exportScaleBar(0.00025, 12)).toEqual(pickMetricScaleBar(4000));
    expect(exportScaleBar(0.00025, 12).label).toBe("20 µm");
  });

  test("a larger font scales the maximum width with it, like the viewer zoomed", () => {
    // 50 px font = 50/12 × the viewer's 140 px: 100 µm = 400 px fits 583 px.
    expect(exportScaleBar(0.00025, 50)).toEqual({ width: 400, label: "100 µm" });
  });
});

describe("resolveDecorationTheme", () => {
  test("reads the theme tokens resolved for the element", () => {
    // Browsers inherit the tokens from the viewer's [data-theme] scope; happy-dom
    // does not, so the tokens are set on the element itself here.
    const canvas = document.createElement("canvas");
    canvas.style.setProperty("--color-background", "rgb(15, 23, 42)");
    canvas.style.setProperty("--color-foreground", "rgb(248, 250, 252)");
    canvas.style.setProperty("--color-muted-foreground", "rgb(148, 163, 184)");
    canvas.style.fontFamily = "Montserrat, sans-serif";
    document.body.appendChild(canvas);

    expect(resolveDecorationTheme(canvas)).toEqual({
      background: "rgb(15, 23, 42)",
      foreground: "rgb(248, 250, 252)",
      mutedForeground: "rgb(148, 163, 184)",
      fontFamily: "Montserrat, sans-serif",
    });

    canvas.remove();
  });

  test("falls back to the system colors outside a themed scope", () => {
    const theme = resolveDecorationTheme(document.createElement("canvas"));
    expect(theme).toMatchObject({
      background: "Canvas",
      foreground: "CanvasText",
      mutedForeground: "GrayText",
    });
  });
});

describe("drawScaleBarDecoration", () => {
  const drawnRects = (fontPx: number) => {
    const ctx = context();
    drawScaleBarDecoration(ctx, {
      millimetersPerPixel: 0.00025 * (12 / fontPx),
      fontPx,
      theme: THEME,
    });
    return {
      ctx,
      rects: (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls as number[][],
      pill: (ctx.roundRect as ReturnType<typeof vi.fn>).mock.calls[0] as number[],
    };
  };

  test("at 12 px it draws the viewer's ScaleBar geometry in CSS px, 12 px from the border", () => {
    const { ctx, rects, pill } = drawnRects(12);
    const { barPadding, tickHeight, tickWidth, lineThickness, labelPadding } = SCALE_BAR_LAYOUT;
    const cornerOffset = 12;
    // 20 µm at 4000 px/mm = 80 px bar; label measures 10 px.
    const barWidth = 80;
    const pillHeight = tickHeight + 2 * barPadding;
    const top = 1080 - cornerOffset - pillHeight + barPadding;
    const lineWidth = (barWidth - 2 * tickWidth - 10 - 2 * labelPadding) / 2;

    expect(pill).toEqual([
      cornerOffset,
      1080 - cornerOffset - pillHeight,
      barWidth + 2 * barPadding,
      pillHeight,
      pillHeight / 2,
    ]);
    expect(rects).toEqual([
      [cornerOffset + barPadding, top, tickWidth, tickHeight],
      [cornerOffset + barPadding + barWidth - tickWidth, top, tickWidth, tickHeight],
      [
        cornerOffset + barPadding + tickWidth,
        top + tickHeight / 2 - lineThickness / 2,
        lineWidth,
        lineThickness,
      ],
      [
        cornerOffset + barPadding + barWidth - tickWidth - lineWidth,
        top + tickHeight / 2 - lineThickness / 2,
        lineWidth,
        lineThickness,
      ],
    ]);
    expect(ctx.fillText).toHaveBeenCalledWith(
      "20 µm",
      cornerOffset + barPadding + barWidth / 2,
      top + tickHeight / 2,
    );
    expect(ctx.fillStyle).toBe(THEME.mutedForeground);
  });

  test("at a preset's font every dimension scales by fontPx / 12", () => {
    const viewer = drawnRects(12);
    const preset = drawnRects(48);
    const scale = 4;
    // The 1080 px canvas edge is the only unscaled anchor; compare from it.
    const fromBottom = ([x, y, width, height]: number[]) => [x, 1080 - y, width, height];
    // Line segments shrink by the unscaled 10 px label, so compare the ticks and pill.
    expect(fromBottom(preset.rects[0])).toEqual(
      fromBottom(viewer.rects[0]).map((value) => value * scale),
    );
    expect(fromBottom(preset.rects[1])).toEqual(
      fromBottom(viewer.rects[1]).map((value) => value * scale),
    );
    expect(fromBottom(preset.pill)).toEqual(fromBottom(viewer.pill).map((value) => value * scale));
  });
});

describe("decorationFontPx", () => {
  test("one 7 pt font across presets — px = 7 × DPI / 72", () => {
    expect(decorationFontPx(72)).toBeCloseTo(7, 5);
    expect(decorationFontPx(180)).toBeCloseTo(17.5, 5);
    expect(decorationFontPx(600)).toBeCloseTo(58.33, 2);
  });

  test("the legend is set larger, at 9 pt", () => {
    expect(legendFontPx(72)).toBeCloseTo(9, 5);
    expect(legendFontPx(600)).toBeCloseTo(75, 5);
  });
});

describe("drawLegendDecoration", () => {
  const legend = {
    channels: [
      { name: "DAPI", color: [0, 0, 255] as [number, number, number] },
      { name: "CD8", color: [255, 0, 0] as [number, number, number] },
    ],
    overlays: [{ name: "cd68", color: [0, 255, 255, 255] as [number, number, number, number] }],
  };

  test("stacks the entries vertically in the bottom-right corner", () => {
    const ctx = context();
    drawLegendDecoration(ctx, legend, 12, THEME);

    // 12 px font: the bar padding, 12 px rows, 8 px gaps, 1 px divider, 12 px inset.
    const { barPadding } = SCALE_BAR_LAYOUT;
    const boxHeight = 3 * 12 + 2 * 8 + (1 + 8) + 2 * barPadding;
    const [boxX, boxY, boxWidth, height, radius] = (ctx.roundRect as ReturnType<typeof vi.fn>).mock
      .calls[0] as number[];
    expect([boxY, height]).toEqual([1080 - 12 - boxHeight, boxHeight]);
    expect(boxX + boxWidth).toBe(1920 - 12);
    // Corners match the single-row bars beside it.
    expect(radius).toBe((12 + 2 * barPadding) / 2);

    const labels = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    expect(labels.map(([name]) => name)).toEqual(["DAPI", "CD8", "cd68"]);
    // Same x for every row; rows descend.
    expect(new Set(labels.map(([, x]) => x)).size).toBe(1);
    expect(labels[1][2]).toBeGreaterThan(labels[0][2]);
  });

  test("a larger legend font keeps the other decorations' inset", () => {
    const ctx = context();
    drawLegendDecoration(ctx, legend, 18, THEME, 12);
    const [boxX, boxY, boxWidth, boxHeight] = (ctx.roundRect as ReturnType<typeof vi.fn>).mock
      .calls[0] as number[];
    expect(boxX + boxWidth).toBe(1920 - 12);
    expect(boxY + boxHeight).toBe(1080 - 12);
  });

  test("draws a divider between channels and overlays", () => {
    const ctx = context();
    drawLegendDecoration(ctx, legend, 12, THEME);
    const rects = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls as number[][];
    // Two channel chips, the 1 px divider, one overlay chip.
    expect(rects).toHaveLength(4);
    expect(rects[2][3]).toBe(1);
    const labels = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls;
    expect(rects[2][1]).toBeGreaterThan(labels[1][2]);
    expect(rects[2][1]).toBeLessThan(labels[2][2]);
  });

  test("no divider when only one group has entries", () => {
    const ctx = context();
    drawLegendDecoration(ctx, { channels: legend.channels, overlays: [] }, 12, THEME);
    expect(ctx.fillRect).toHaveBeenCalledTimes(2);
  });

  test("draws nothing with no items", () => {
    const ctx = context();
    drawLegendDecoration(ctx, { channels: [], overlays: [] }, 12, THEME);
    expect(ctx.roundRect).not.toHaveBeenCalled();
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
  });
});

describe("millimetersPerUnit", () => {
  test("maps OME/NGFF units to millimeters", () => {
    expect(millimetersPerUnit("µm")).toBe(1e-3);
    expect(millimetersPerUnit("um")).toBe(1e-3);
    expect(millimetersPerUnit("nm")).toBe(1e-6);
    expect(millimetersPerUnit("mm")).toBe(1);
    expect(millimetersPerUnit("cm")).toBe(10);
  });

  test("unknown units are not guessed", () => {
    expect(millimetersPerUnit("parsecs")).toBeNull();
  });
});
