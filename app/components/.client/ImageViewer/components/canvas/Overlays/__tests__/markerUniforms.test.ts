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

  describe("cycling behavior for markers >= 8 (C-180 regression)", () => {
    // The shader does color[i % 8] for marker bit i, so markers at indices
    // 0 and 8 unavoidably share slot 0. The fix here is first-wins: slot 0's
    // colour comes from marker 0, not marker 8. Editing marker 0's colour
    // (the visible scenario for users) therefore propagates to the GPU.
    test("first-wins: marker at index 0 owns slot 0 even when marker 8 exists", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 8; i++) {
        markers[`marker${i}`] = { color: [i * 10, i * 10, i * 10, 1] };
      }

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([0, 0, 0, 1.0]);
    });

    test("first-wins: editing marker 0's colour propagates to color0 (C-180)", () => {
      const markers: Record<string, { color: RGBA }> = {};
      for (let i = 0; i <= 16; i++) {
        markers[`marker${i}`] = { color: [255, 0, 0, 1] };
      }
      // User flips marker 0 to magenta. Slot 0 must follow.
      markers["marker0"] = { color: [255, 0, 255, 1] };

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([255, 0, 255, 1.0]);
    });

    test("slots beyond the marker count default to transparent black", () => {
      const markers: Record<string, { color: RGBA }> = {
        marker0: { color: [255, 0, 0, 1] },
      };

      const result = createMarkerProps(markers, 0.8);

      expect(result.color0).toEqual([255, 0, 0, 1.0]);
      expect(result.color1).toEqual([0, 0, 0, 0]);
      expect(result.color7).toEqual([0, 0, 0, 0]);
    });
  });

  describe("opacity", () => {
    test("passes through opacity value unchanged", () => {
      const result = createMarkerProps({}, 0.42);
      expect(result.opacity).toBe(0.42);
    });
  });
});
