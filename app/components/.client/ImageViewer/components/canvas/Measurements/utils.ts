import { WavelengthUnit } from "../../../state/store/core/ome.tif.types";

// Millimeters per metadata length unit (NGFF/OME axis units). Unknown units
// fall back to µm, the default unit this app assumes elsewhere.
const MILLIMETERS_PER_UNIT: Record<string, number> = {
  nm: 1e-6,
  µm: 1e-3,
  um: 1e-3,
  mm: 1,
  cm: 10,
  dm: 100,
  m: 1000,
};

const millimetersPerUnit = (unit: WavelengthUnit): number =>
  MILLIMETERS_PER_UNIT[unit.trim().toLowerCase()] ?? 1e-3;

export const absoluteToMetricFactory =
  (physicalSize: number, unit: WavelengthUnit) =>
  (size: number): number => {
    // Metadata units (physicalSize) → millimeters.
    return physicalSize * size * millimetersPerUnit(unit);
  };

export const metricToAbsoluteFactory =
  (physicalSize: number, unit: WavelengthUnit) =>
  (sizeMetric: number): number => {
    return sizeMetric / (physicalSize * millimetersPerUnit(unit));
  };
