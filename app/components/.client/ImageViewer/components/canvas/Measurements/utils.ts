// OME length symbols, matched case-sensitively ("Mm" is a megameter, not a
// millimeter). Both micro signs (U+00B5, U+03BC) and both angstrom signs
// (U+00C5, U+212B) occur in real metadata.
const MILLIMETERS_PER_SYMBOL: Record<string, number> = {
  pm: 1e-9,
  "\u00c5": 1e-7,
  "\u212b": 1e-7,
  nm: 1e-6,
  "\u00b5m": 1e-3,
  "\u03bcm": 1e-3,
  um: 1e-3,
  mm: 1,
  cm: 10,
  dm: 100,
  m: 1000,
};

// Spelled-out units as NGFF axes carry them (UDUNITS-2 names), matched
// case-insensitively, singular or plural, "-meter" or "-metre".
const MILLIMETERS_PER_NAME: Record<string, number> = {
  picometer: 1e-9,
  angstrom: 1e-7,
  nanometer: 1e-6,
  micrometer: 1e-3,
  micron: 1e-3,
  millimeter: 1,
  centimeter: 10,
  decimeter: 100,
  meter: 1000,
};

/** Millimeters per length unit, or null for a unit this viewer cannot read
 *  as a length — no unit is guessed. */
export const millimetersPerUnit = (unit: string): number | null => {
  const trimmed = unit.trim();
  const name = trimmed.toLowerCase().replace(/metre/, "meter").replace(/s$/, "");
  return MILLIMETERS_PER_SYMBOL[trimmed] ?? MILLIMETERS_PER_NAME[name] ?? null;
};

/** Millimeters per level-0 pixel along each image axis. */
export interface PhysicalPixelSize {
  x: number;
  y: number;
}

interface PhysicalSizeMetadata {
  PhysicalSizeX?: number;
  PhysicalSizeY?: number;
  PhysicalSizeXUnit?: string;
  PhysicalSizeYUnit?: string;
}

// OME's default unit for a physical size that declares none.
const DEFAULT_LENGTH_UNIT = "\u00b5m";

const axisMillimeters = (size: number | undefined, unit: string | undefined): number | null => {
  if (size === undefined || !Number.isFinite(size) || size <= 0) return null;
  const perUnit = millimetersPerUnit(unit || DEFAULT_LENGTH_UNIT);
  return perUnit === null ? null : size * perUnit;
};

/** The image's physical pixel size, or null when it has no trustworthy one —
 *  a missing or non-positive size, or an unreadable unit. Callers must fall
 *  back to pixel units rather than assume a scale. A missing Y size means
 *  square pixels; a missing Y unit is the X unit. */
export const physicalPixelSize = (pixels: PhysicalSizeMetadata): PhysicalPixelSize | null => {
  const x = axisMillimeters(pixels.PhysicalSizeX, pixels.PhysicalSizeXUnit);
  if (x === null) return null;
  const yUnit = pixels.PhysicalSizeYUnit || pixels.PhysicalSizeXUnit;
  return { x, y: axisMillimeters(pixels.PhysicalSizeY, yUnit) ?? x };
};
