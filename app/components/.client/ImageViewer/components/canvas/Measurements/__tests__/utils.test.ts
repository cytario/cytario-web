import { millimetersPerUnit, physicalPixelSize } from "../utils";

describe("millimetersPerUnit", () => {
  test.each([
    // OME symbols, both micro signs and both angstrom signs.
    ["pm", 1e-9],
    ["\u00c5", 1e-7],
    ["\u212b", 1e-7],
    ["nm", 1e-6],
    ["\u00b5m", 1e-3],
    ["\u03bcm", 1e-3],
    ["um", 1e-3],
    ["mm", 1],
    ["cm", 10],
    ["m", 1000],
    // NGFF axis units are spelled out; nanometer and millimeter were read as µm.
    ["nanometer", 1e-6],
    ["micrometer", 1e-3],
    ["millimeter", 1],
    ["angstrom", 1e-7],
    ["Micrometers", 1e-3],
    ["micrometre", 1e-3],
    ["microns", 1e-3],
    [" nm ", 1e-6],
  ])("%s → %s mm", (unit, expected) => {
    expect(millimetersPerUnit(unit)).toBe(expected);
  });

  test.each(["pixel", "reference frame", "furlong", "Mm", "", "NM"])(
    "%j is not a length it can read — no unit is guessed",
    (unit) => {
      expect(millimetersPerUnit(unit)).toBeNull();
    },
  );
});

describe("physicalPixelSize", () => {
  test("converts each axis to millimeters per level-0 pixel", () => {
    expect(
      physicalPixelSize({
        PhysicalSizeX: 0.25,
        PhysicalSizeXUnit: "micrometer",
        PhysicalSizeY: 0.5,
        PhysicalSizeYUnit: "\u00b5m",
      }),
    ).toEqual({ x: 0.00025, y: 0.0005 });
  });

  test("reads a missing unit as OME's default, micrometers", () => {
    expect(physicalPixelSize({ PhysicalSizeX: 2 })).toEqual({ x: 0.002, y: 0.002 });
  });

  test("a missing Y unit is the X unit", () => {
    expect(
      physicalPixelSize({ PhysicalSizeX: 4, PhysicalSizeY: 8, PhysicalSizeXUnit: "nm" }),
    ).toEqual({ x: 4e-6, y: 8e-6 });
  });

  test("a missing Y size means square pixels", () => {
    expect(physicalPixelSize({ PhysicalSizeX: 4, PhysicalSizeXUnit: "nm" })).toEqual({
      x: 4e-6,
      y: 4e-6,
    });
  });

  test.each([
    ["no physical size", {}],
    ["a zero size", { PhysicalSizeX: 0, PhysicalSizeXUnit: "\u00b5m" }],
    ["a negative size", { PhysicalSizeX: -1, PhysicalSizeXUnit: "\u00b5m" }],
    ["a NaN size", { PhysicalSizeX: Number.NaN, PhysicalSizeXUnit: "\u00b5m" }],
    ["an unreadable unit", { PhysicalSizeX: 0.25, PhysicalSizeXUnit: "pixel" }],
  ])("is null for %s — never an assumed scale", (_case, pixels) => {
    expect(physicalPixelSize(pixels)).toBeNull();
  });
});
