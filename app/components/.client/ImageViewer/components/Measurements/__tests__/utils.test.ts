import { WavelengthUnit } from "../../../state/ome.tif.types";
import { absoluteToMetricFactory, metricToAbsoluteFactory } from "../utils";

describe("absoluteToMetricFactory", () => {
  const testCases: {
    physicalSize: number;
    size: number;
    unit: WavelengthUnit;
    expected: number;
  }[] = [
    { physicalSize: 10, size: 100, unit: "mm", expected: 1000 },
    { physicalSize: 50, size: 100, unit: "mm", expected: 5000 },
    { physicalSize: 10, size: 100, unit: "µm", expected: 1 },
    { physicalSize: 50, size: 100, unit: "µm", expected: 5 },
  ];

  test.each(testCases)(
    "correctly converts absolute to metric with $unit unit",
    ({ physicalSize, size, unit, expected }) => {
      const absoluteToMetric = absoluteToMetricFactory(physicalSize, unit);
      expect(absoluteToMetric(size)).toBe(expected);
    }
  );
});

describe("metricToAbsoluteFactory", () => {
  const testCases: {
    physicalSize: number;
    sizeMetric: number;
    unit: WavelengthUnit;
    expected: number;
  }[] = [
    { physicalSize: 10, sizeMetric: 1000, unit: "mm", expected: 100 },
    { physicalSize: 5, sizeMetric: 2000, unit: "mm", expected: 400 },
    { physicalSize: 10, sizeMetric: 1000, unit: "µm", expected: 100000 },
    { physicalSize: 5, sizeMetric: 2000, unit: "µm", expected: 400000 },
  ];

  test.each(testCases)(
    "correctly converts metric to absolute with $unit unit",
    ({ physicalSize, sizeMetric, unit, expected }) => {
      const metricToAbsolute = metricToAbsoluteFactory(physicalSize, unit);
      expect(metricToAbsolute(sizeMetric)).toBe(expected);
    }
  );
});
