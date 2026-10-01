import { getDtypeBitDepth, getDtypeDepthLabel, getDtypeMax } from "../getDtypeMax";

describe("getDtypeMax", () => {
  test.each([
    ["Uint8", 255],
    ["Uint16", 65535],
    ["Uint32", 4294967295],
    ["Int8", 127],
    ["Int16", 32767],
    ["Int32", 2147483647],
    ["Float32", 1],
    ["Float64", 1],
  ] as const)("maps %s to %i", (dtype, expected) => {
    expect(getDtypeMax(dtype)).toBe(expected);
  });

  test("defaults to the 16-bit ceiling when no dtype is given", () => {
    expect(getDtypeMax()).toBe(65535);
  });
});

describe("getDtypeBitDepth", () => {
  test.each([
    ["Uint8", 8],
    ["Int8", 8],
    ["Uint16", 16],
    ["Int16", 16],
    ["Uint32", 32],
    ["Int32", 32],
    ["Float32", 32],
    ["Float64", 32],
  ] as const)("maps %s to %i", (dtype, expected) => {
    expect(getDtypeBitDepth(dtype)).toBe(expected);
  });
});

describe("getDtypeDepthLabel", () => {
  test.each([
    ["Uint8", "8-bit"],
    ["Int8", "8-bit"],
    ["Uint16", "16-bit"],
    ["Int16", "16-bit"],
    ["Uint32", "32-bit"],
    ["Int32", "32-bit"],
    ["Float32", "32-bit float"],
    ["Float64", "64-bit float"],
  ] as const)("labels %s as %s", (dtype, expected) => {
    expect(getDtypeDepthLabel(dtype)).toBe(expected);
  });
});
