import { GeoJsonLayer } from "@deck.gl/layers";
import { describe, expect, test } from "vitest";

import { scalePixelSizes } from "../scalePixelSizes";

describe("scalePixelSizes", () => {
  test("scales the pixel minimums that keep zoomed-out outlines visible", () => {
    const layer = new GeoJsonLayer({
      id: "annotations-0",
      data: [],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pointRadiusMinPixels: 4,
    });

    const scaled = scalePixelSizes(layer, 2.5);

    expect(scaled.id).toBe("annotations-0");
    expect(scaled.props.lineWidthMinPixels).toBe(2.5);
    expect(scaled.props.pointRadiusMinPixels).toBe(10);
    // World-unit widths already follow the zoom.
    expect(scaled.props.lineWidthScale).toBe(1);
  });

  test("scales pixel-unit widths and radii", () => {
    const layer = new GeoJsonLayer({
      id: "annotations-0-selection-0",
      data: [],
      lineWidthUnits: "pixels",
      pointRadiusUnits: "pixels",
      lineWidthScale: 2,
    });

    const scaled = scalePixelSizes(layer, 3);

    expect(scaled.props.lineWidthScale).toBe(6);
    expect(scaled.props.pointRadiusScale).toBe(3);
  });

  test("leaves a layer without pixel-sized marks untouched", () => {
    const layer = new GeoJsonLayer({ id: "plain", data: [], lineWidthMinPixels: 0 });
    expect(scalePixelSizes(layer, 3)).toBe(layer);
  });
});
