import { describe, expect, test } from "vitest";

import { hexToRgb, hexToRgba, isValidHex, rgbToHex } from "../colorUtils";

describe("isValidHex", () => {
  test.each([
    ["#FF0000", true],
    ["FF0000", true],
    ["#ff0000", true],
    ["  #FF0000  ", true],
    ["#FFF", false],
    ["FFF", false],
    ["#FFFFFFFF", false],
    ["#ZZZZZZ", false],
    ["", false],
    ["#GG0000", false],
    ["123456", true],
  ])("isValidHex(%j) -> %s", (input, expected) => {
    expect(isValidHex(input)).toBe(expected);
  });
});

describe("hexToRgb", () => {
  test("with leading hash", () => {
    expect(hexToRgb("#FF0000")).toEqual([255, 0, 0]);
  });

  test("without leading hash", () => {
    expect(hexToRgb("00FF00")).toEqual([0, 255, 0]);
  });

  test("lowercase", () => {
    expect(hexToRgb("#a1ffc2")).toEqual([161, 255, 194]);
  });

  test.each(["#FFF", "", "#ZZZZZZ", "FFFFF", "FFFFFFF"])(
    "rejects %j",
    (input) => {
      expect(hexToRgb(input)).toBeNull();
    },
  );
});

describe("hexToRgba", () => {
  test("default alpha 255", () => {
    expect(hexToRgba("#FF0000")).toEqual([255, 0, 0, 255]);
  });

  test("preserves caller-supplied alpha", () => {
    expect(hexToRgba("#FF0000", 128)).toEqual([255, 0, 0, 128]);
  });

  test("invalid hex returns null", () => {
    expect(hexToRgba("#ZZZ")).toBeNull();
  });
});

describe("rgbToHex", () => {
  test("RGB tuple", () => {
    expect(rgbToHex([255, 0, 0])).toBe("#FF0000");
  });

  test("RGBA tuple ignores alpha", () => {
    expect(rgbToHex([0, 128, 255, 128])).toBe("#0080FF");
  });

  test("clamps + rounds out-of-range values", () => {
    expect(rgbToHex([300, -10, 127.6])).toBe("#FF0080");
  });

  test("round-trip with hexToRgb", () => {
    const hex = "#A1FFC2";
    expect(rgbToHex(hexToRgb(hex)!)).toBe(hex);
  });
});
