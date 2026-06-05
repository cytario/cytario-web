import { render } from "@testing-library/react";

import { HistogramChannel } from "../HistogramChannel";

describe("HistogramChannel", () => {
  const defaultProps = {
    channelIndex: 0,
    maxValue: 100,
    logScaleX: false,
    logScaleY: true,
    width: 200,
    height: 160,
    histogram: [10, 50, 100, 50, 10],
    color: "rgb(255, 0, 0)",
    contrastLimit: [50, 200] as [number, number],
    range: 255,
  };

  test("renders SVG group with clip path", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} />
      </svg>,
    );

    const clipPath = container.querySelector("clipPath");
    expect(clipPath).toBeInTheDocument();
    expect(clipPath).toHaveAttribute("id", "clip-0");
  });

  test("renders min and max lines at correct positions", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} />
      </svg>,
    );

    const lines = container.querySelectorAll("line");
    expect(lines).toHaveLength(2);

    // Min line at scaledMin = (50 / 255) * 200 ≈ 39.2
    const minLine = lines[0];
    expect(minLine).toHaveAttribute("stroke", "rgb(255, 0, 0)");

    // Max line at scaledMax = (200 / 255) * 200 ≈ 156.9
    const maxLine = lines[1];
    expect(maxLine).toHaveAttribute("stroke", "rgb(255, 0, 0)");
  });

  test("renders two polygons for histogram", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} />
      </svg>,
    );

    const polygons = container.querySelectorAll("polygon");
    expect(polygons).toHaveLength(2);

    // First polygon (low opacity, full histogram)
    expect(polygons[0]).toHaveAttribute("fill", "rgb(255, 0, 0)");
    expect(polygons[0]).toHaveAttribute("fill-opacity", "0.1");

    // Second polygon (higher opacity, clipped to contrast limits)
    expect(polygons[1]).toHaveAttribute("fill", "rgb(255, 0, 0)");
    expect(polygons[1]).toHaveAttribute("fill-opacity", "0.5");
    expect(polygons[1]).toHaveAttribute("clip-path", "url(#clip-0)");
  });

  test("uses unique clip path id based on channel index", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} channelIndex={3} />
      </svg>,
    );

    const clipPath = container.querySelector("clipPath");
    expect(clipPath).toHaveAttribute("id", "clip-3");

    const clippedPolygon = container.querySelectorAll("polygon")[1];
    expect(clippedPolygon).toHaveAttribute("clip-path", "url(#clip-3)");
  });

  test("calculates clip rect width from contrast limits", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} />
      </svg>,
    );

    const rect = container.querySelector("clipPath rect");
    expect(rect).toBeInTheDocument();

    // scaledMin = (50 / 255) * 200 ≈ 39.2
    // scaledMax = (200 / 255) * 200 ≈ 156.9
    // rectWidth = scaledMax - scaledMin ≈ 117.6
    const x = parseFloat(rect!.getAttribute("x") || "0");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(x).toBeCloseTo(39.2, 0);
    expect(width).toBeCloseTo(117.6, 0);
  });

  test("renders with different colors", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} color="rgb(0, 255, 0)" />
      </svg>,
    );

    const polygons = container.querySelectorAll("polygon");
    expect(polygons[0]).toHaveAttribute("fill", "rgb(0, 255, 0)");
    expect(polygons[1]).toHaveAttribute("fill", "rgb(0, 255, 0)");

    const lines = container.querySelectorAll("line");
    expect(lines[0]).toHaveAttribute("stroke", "rgb(0, 255, 0)");
    expect(lines[1]).toHaveAttribute("stroke", "rgb(0, 255, 0)");
  });

  test("generates points string from histogram data", () => {
    const simpleHistogram = [0, 100, 0];
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} histogram={simpleHistogram} />
      </svg>,
    );

    const polygon = container.querySelector("polygon");
    const points = polygon?.getAttribute("points");

    // Points start with "0,height" then include normalized coordinates
    expect(points).toMatch(/^0,160/);
  });

  test("handles full range contrast limits", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} contrastLimit={[0, 255]} range={255} />
      </svg>,
    );

    const rect = container.querySelector("clipPath rect");
    const x = parseFloat(rect!.getAttribute("x") || "0");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(x).toBe(0);
    expect(width).toBe(200); // Full width
  });

  test("scales peak bin to full height regardless of log/linear", () => {
    // Bin equal to maxValue must reach y=0 (full height) in both modes.
    const peak = [100];
    const log = render(
      <svg>
        <HistogramChannel {...defaultProps} histogram={peak} logScaleY={true} />
      </svg>,
    );
    const linear = render(
      <svg>
        <HistogramChannel {...defaultProps} histogram={peak} logScaleY={false} />
      </svg>,
    );

    const peakY = (container: HTMLElement) => {
      const points = container.querySelector("polygon")!.getAttribute("points")!;
      // points = "0,160 <x>,<y>" — the second coord is the single bin.
      return parseFloat(points.split(" ")[1].split(",")[1]);
    };

    expect(peakY(log.container)).toBeCloseTo(0, 5);
    expect(peakY(linear.container)).toBeCloseTo(0, 5);
  });

  test("midrange bin sits higher (smaller y) in log than linear", () => {
    const mid = [10];
    const log = render(
      <svg>
        <HistogramChannel {...defaultProps} histogram={mid} logScaleY={true} />
      </svg>,
    );
    const linear = render(
      <svg>
        <HistogramChannel {...defaultProps} histogram={mid} logScaleY={false} />
      </svg>,
    );

    const binY = (container: HTMLElement) => {
      const points = container.querySelector("polygon")!.getAttribute("points")!;
      return parseFloat(points.split(" ")[1].split(",")[1]);
    };

    // log lifts the low-count bin: smaller y = taller bar.
    expect(binY(log.container)).toBeLessThan(binY(linear.container));
  });

  test("log X axis repositions the contrast clip rect", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} logScaleX={true} />
      </svg>,
    );

    // c = 255 / 100 = 2.55; symlog scaledMin ≈ 131.1 (vs 39.2 linear)
    const rect = container.querySelector("clipPath rect");
    const x = parseFloat(rect!.getAttribute("x") || "0");
    expect(x).toBeCloseTo(131.1, 0);
  });

  test("handles zero-width contrast limits", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} contrastLimit={[100, 100]} range={255} />
      </svg>,
    );

    const rect = container.querySelector("clipPath rect");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(width).toBe(0);
  });

  test("clamps width to zero when min exceeds max", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} contrastLimit={[200, 50]} range={255} />
      </svg>,
    );

    const rect = container.querySelector("clipPath rect");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(width).toBe(0);
  });
});
