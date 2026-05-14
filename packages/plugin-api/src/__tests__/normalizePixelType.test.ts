import { normalizePixelType } from "../image";

describe("normalizePixelType", () => {
  test.each([
    ["uint8", "Uint8"],
    ["Uint8", "Uint8"],
    ["UINT8", "Uint8"],
    ["uint16", "Uint16"],
    ["Uint16", "Uint16"],
    ["uint32", "Uint32"],
    ["int8", "Int8"],
    ["Int8", "Int8"],
    ["int16", "Int16"],
    ["int32", "Int32"],
    ["float32", "Float32"],
    ["Float32", "Float32"],
    ["float64", "Float64"],
  ])("normalises %s to %s", (input, expected) => {
    expect(normalizePixelType(input)).toBe(expected);
  });

  test.each([
    "Uint128",
    "float16",
    "int4",
    "uint",
    "",
    "not-a-dtype",
  ])("throws on unknown pixel type: %s", (input) => {
    expect(() => normalizePixelType(input)).toThrow(/Unknown pixel type/);
  });

  test("error message lists allowed values", () => {
    expect(() => normalizePixelType("bogus")).toThrow(/Uint8.*Uint16.*Float32/);
  });
});
