import { countToRatio, intensityToRatio, logXOffset, ratioToIntensity } from "../axisScale";

describe("axisScale", () => {
  describe("logXOffset", () => {
    test("is one percent of the range", () => {
      expect(logXOffset(65535)).toBeCloseTo(655.35, 2);
    });
  });

  describe("intensityToRatio", () => {
    test("returns 0 for a non-positive range", () => {
      expect(intensityToRatio(100, 0, false)).toBe(0);
      expect(intensityToRatio(100, 0, true)).toBe(0);
    });

    test("maps endpoints to 0 and 1 in linear mode", () => {
      expect(intensityToRatio(0, 255, false)).toBe(0);
      expect(intensityToRatio(255, 255, false)).toBe(1);
      expect(intensityToRatio(128, 255, false)).toBeCloseTo(0.502, 3);
    });

    test("maps endpoints to 0 and 1 in log mode", () => {
      expect(intensityToRatio(0, 255, true)).toBe(0);
      expect(intensityToRatio(255, 255, true)).toBeCloseTo(1, 5);
    });

    test("lifts low intensities above their linear position in log mode", () => {
      // 12 sits at ~4.7% linearly but is pushed right under symlog.
      expect(intensityToRatio(12, 255, false)).toBeCloseTo(0.047, 3);
      expect(intensityToRatio(12, 255, true)).toBeCloseTo(0.377, 3);
    });
  });

  describe("ratioToIntensity", () => {
    test("returns 0 for a non-positive range", () => {
      expect(ratioToIntensity(0.5, 0, false)).toBe(0);
      expect(ratioToIntensity(0.5, 0, true)).toBe(0);
    });

    test("maps the midpoint correctly per scale", () => {
      expect(ratioToIntensity(0.5, 255, false)).toBeCloseTo(127.5, 1);
      expect(ratioToIntensity(0.5, 255, true)).toBeCloseTo(23.08, 1);
    });

    test("is the inverse of intensityToRatio", () => {
      for (const logScaleX of [false, true]) {
        for (const v of [0, 37, 1000, 40000, 65535]) {
          const roundTrip = ratioToIntensity(
            intensityToRatio(v, 65535, logScaleX),
            65535,
            logScaleX,
          );
          expect(roundTrip).toBeCloseTo(v, 3);
        }
      }
    });
  });

  describe("countToRatio", () => {
    test("clamps the peak bin to 1 in both scales", () => {
      expect(countToRatio(100, 100, true)).toBeCloseTo(1, 5);
      expect(countToRatio(100, 100, false)).toBe(1);
    });

    test("lifts a low-count bin higher in log than linear", () => {
      expect(countToRatio(10, 100, true)).toBeGreaterThan(countToRatio(10, 100, false));
    });

    test("returns 0 when the max is non-positive", () => {
      expect(countToRatio(0, 0, false)).toBe(0);
      expect(countToRatio(0, 0, true)).toBe(0);
    });
  });
});
