import type { RGBA } from "../../../../state/types";
import { createMarkerProps } from "../markerUniforms";

describe("createMarkerProps", () => {
  describe("basic functionality", () => {
    test("returns default black colors for empty fileMarkers", () => {
      const result = createMarkerProps({}, 0.8);

      expect(result.color0).toEqual([0, 0, 0, 0]);
      expect(result.color7).toEqual([0, 0, 0, 0]);
      expect(result.opacity).toBe(0.8);
    });

    test("maps markers 0-7 to their corresponding color slots", () => {
      const fileMarkers: Record<string, { color: RGBA }> = {
        marker0: { color: [255, 0, 0, 1] },
        marker1: { color: [0, 255, 0, 1] },
        marker2: { color: [0, 0, 255, 1] },
      };

      const result = createMarkerProps(fileMarkers, 0.5);

      expect(result.color0).toEqual([255, 0, 0, 1.0]);
      expect(result.color1).toEqual([0, 255, 0, 1.0]);
      expect(result.color2).toEqual([0, 0, 255, 1.0]);
      expect(result.color3).toEqual([0, 0, 0, 0]); // No marker at index 3
    });

    test("normalizes alpha to 1.0 regardless of input", () => {
      const fileMarkers: Record<string, { color: RGBA }> = {
        marker0: { color: [100, 150, 200, 0.5] },
      };

      const result = createMarkerProps(fileMarkers, 0.8);

      expect(result.color0).toEqual([100, 150, 200, 1.0]);
    });
  });

  describe("cycling behavior for markers >= 8", () => {
    test("marker at index 8 maps to color slot 0 (8 % 8 = 0)", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 8; i++) {
        markers[`marker${i}`] = { color: [i * 10, i * 10, i * 10, 1] };
      }

      const result = createMarkerProps(markers, 0.8);

      // Marker 8 should override slot 0 (last one wins)
      expect(result.color0).toEqual([80, 80, 80, 1.0]);
    });

    test("marker at index 9 maps to color slot 1 (9 % 8 = 1)", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 9; i++) {
        markers[`marker${i}`] = { color: [i * 10, i * 10, i * 10, 1] };
      }

      const result = createMarkerProps(markers, 0.8);

      // Marker 9 should override slot 1
      expect(result.color1).toEqual([90, 90, 90, 1.0]);
    });

    test("last marker in each slot wins when multiple markers map to same slot", () => {
      // Create 17 markers so indices 0, 8, 16 all map to slot 0
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 16; i++) {
        markers[`marker${i}`] = { color: [i * 10, i * 10, i * 10, 1] };
      }

      const result = createMarkerProps(markers, 0.8);

      // Index 16 maps to slot 0 (16 % 8 = 0), overriding indices 0 and 8
      expect(result.color0).toEqual([160, 160, 160, 1.0]);
      // Index 9 maps to slot 1 (9 % 8 = 1), overriding index 1
      expect(result.color1).toEqual([90, 90, 90, 1.0]);
    });
  });

  describe("opacity", () => {
    test("passes through opacity value unchanged", () => {
      const result = createMarkerProps({}, 0.42);
      expect(result.opacity).toBe(0.42);
    });
  });
});
