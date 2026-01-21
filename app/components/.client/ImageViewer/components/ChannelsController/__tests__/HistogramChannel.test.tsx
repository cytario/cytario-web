import { render } from "@testing-library/react";

import { HistogramChannel } from "../HistogramChannel";

describe("HistogramChannel", () => {
  const defaultProps = {
    channelIndex: 0,
    maxLogValue: Math.log(100 + 1),
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
      </svg>
    );

    const clipPath = container.querySelector("clipPath");
    expect(clipPath).toBeInTheDocument();
    expect(clipPath).toHaveAttribute("id", "clip-0");
  });

  test("renders min and max lines at correct positions", () => {
    const { container } = render(
      <svg>
        <HistogramChannel {...defaultProps} />
      </svg>
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
      </svg>
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
      </svg>
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
      </svg>
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
      </svg>
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
      </svg>
    );

    const polygon = container.querySelector("polygon");
    const points = polygon?.getAttribute("points");

    // Points start with "0,height" then include normalized coordinates
    expect(points).toMatch(/^0,160/);
  });

  test("handles full range contrast limits", () => {
    const { container } = render(
      <svg>
        <HistogramChannel
          {...defaultProps}
          contrastLimit={[0, 255]}
          range={255}
        />
      </svg>
    );

    const rect = container.querySelector("clipPath rect");
    const x = parseFloat(rect!.getAttribute("x") || "0");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(x).toBe(0);
    expect(width).toBe(200); // Full width
  });

  test("handles zero-width contrast limits", () => {
    const { container } = render(
      <svg>
        <HistogramChannel
          {...defaultProps}
          contrastLimit={[100, 100]}
          range={255}
        />
      </svg>
    );

    const rect = container.querySelector("clipPath rect");
    const width = parseFloat(rect!.getAttribute("width") || "0");

    expect(width).toBe(0);
  });
});
