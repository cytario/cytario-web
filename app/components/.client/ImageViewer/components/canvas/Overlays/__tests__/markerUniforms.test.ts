import type { RGBA } from "../../../../state/store/types";
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

  describe("independent slots for markers >= 8", () => {
    // Each marker bit has its own color slot, so markers past index 7 no
    // longer share a slot with 0-7; editing any marker's colour is independent.
    test("marker at index 8 owns color8, not color0", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 8; i++) {
        markers[`marker${i}`] = { color: [i * 10, i * 10, i * 10, 1] };
      }

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([0, 0, 0, 1.0]);
      expect(result.color8).toEqual([80, 80, 80, 1.0]);
    });

    test("editing marker 8's colour does not affect marker 0's slot", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 8; i++) {
        markers[`marker${i}`] = { color: [255, 0, 0, 1] };
      }
      markers["marker8"] = { color: [0, 255, 0, 1] };

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([255, 0, 0, 1.0]);
      expect(result.color8).toEqual([0, 255, 0, 1.0]);
    });

    test("slots beyond the marker count default to transparent black", () => {
      const markers: Record<string, { color: RGBA }> = {
        marker0: { color: [255, 0, 0, 1] },
      };

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([255, 0, 0, 1.0]);
      expect(result.color1).toEqual([0, 0, 0, 0]);
      expect(result.color31).toEqual([0, 0, 0, 0]);
    });
  });

  describe("opacity", () => {
    test("passes through opacity value unchanged", () => {
      const result = createMarkerProps({}, 0.42);
      expect(result.opacity).toBe(0.42);
    });
  });
});
