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

export const millimetersPerUnit = (unit: WavelengthUnit | string): number =>
  MILLIMETERS_PER_UNIT[unit.trim().toLowerCase()] ?? 1e-3;

/** Scale-bar ladder — [bar length in mm, label], coarse→fine. The on-screen
 *  ScaleBar and the export decorations pick from the same table. */
export const SCALE_BAR_METRIC_SIZES: [number, string][] = [
  [100, "10 cm"],
  [50, "5 cm"],
  [20, "2 cm"],
  [10, "1 cm"],
  [5, "5 mm"],
  [2, "2 mm"],
  [1, "1 mm"],
  [0.5, "500 µm"],
  [0.2, "200 µm"],
  [0.1, "100 µm"],
  [0.05, "50 µm"],
  [0.02, "20 µm"],
  [0.01, "10 µm"],
  [0.005, "5 µm"],
  [0.002, "2 µm"],
  [0.001, "1 µm"],
  [0.0005, "500 nm"],
  [0.0002, "200 nm"],
  [0.0001, "100 nm"],
  [0.00005, "50 nm"],
  [0.00002, "20 nm"],
  [0.00001, "10 nm"],
  [0.000005, "5 nm"],
  [0.000002, "2 nm"],
  [0.000001, "1 nm"],
];

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
