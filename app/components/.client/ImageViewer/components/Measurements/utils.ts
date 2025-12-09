import { WavelengthUnit } from "../../state/ome.tif.types";

export const absoluteToMetricFactory =
  (physicalSize: number, unit: WavelengthUnit) =>
  (size: number): number => {
    const scale = unit === "µm" ? 0.001 : 1;
    return physicalSize * size * scale;
  };

export const metricToAbsoluteFactory =
  (physicalSize: number, unit: WavelengthUnit) =>
  (sizeMetric: number): number => {
    const scale = unit === "µm" ? 0.001 : 1;
    return sizeMetric / (physicalSize * scale);
  };
