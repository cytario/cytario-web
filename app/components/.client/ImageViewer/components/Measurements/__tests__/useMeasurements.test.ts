import { renderHook } from "@testing-library/react";
import { Mock } from "vitest";

import { useViewerStore } from "../../../state/ViewerStoreContext";
import { useMeasurements } from "../useMeasurements";

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("../../../state/useViewState", () => ({
  useCurrentViewState: vi.fn(() => ({
    width: 500,
    height: 400,
    zoom: 1,
    target: [256, 256],
  })),
  useActiveViewState: vi.fn(() => ({
    width: 500,
    height: 400,
    zoom: 1,
    target: [256, 256],
  })),
}));

describe("useMeasurements", () => {
  const mockViewState = {
    width: 500,
    height: 400,
    zoom: 1,
    target: [256, 256],
  };

  const mockMetadata = {
    Pixels: {
      SizeX: 512,
      SizeY: 512,
      PhysicalSizeX: 0.5,
      PhysicalSizeY: 0.5,
      PhysicalSizeXUnit: "mm",
    },
  };

  test(`returns correct measurements`, () => {
    (useViewerStore as Mock).mockImplementation((selector) =>
      selector({ viewStateActive: mockViewState, metadata: mockMetadata })
    );
    const { result } = renderHook(() => useMeasurements());
    expect(result.current).toEqual({
      // widthTotalMm: 0,
      // heightTotalMm: 0,
      // viewPortWidth: 0,
      // viewPortHeight: 0,
      // imageWidthScreen: 0,
      // imageHeightScreen: 0,
      // screenOffsetLeft: 0,
      // screenOffsetRight: 0,
      // screenOffsetTop: 0,
      // screenOffsetBottom: 0,
      // metricOffsetLeft: 0,
      // metricOffsetTop: 0,
      // metricOffsetRight: 0,
      // metricOffsetBottom: 0,
      // one_mm: 0,
      // zoom: 0,
      // target: [0, 0],
      widthTotalMm: 256,
      heightTotalMm: 256,
      imageWidthScreen: 1024,
      imageHeightScreen: 1024,
      viewPortWidth: 500,
      viewPortHeight: 400,
      screenOffsetLeft: -262,
      screenOffsetRight: 762,
      screenOffsetTop: -312,
      screenOffsetBottom: 712,
      metricOffsetLeft: 65.5,
      metricOffsetTop: 78,
      metricOffsetRight: 190.5,
      metricOffsetBottom: 178,
      one_mm: 4,
      target: [256, 256],
      zoom: 1,
    });
  });

  // test(`throws error if called w/o viewState and metadata`, () => {
  //   (useViewerStore as Mock).mockImplementation((selector) =>
  //     selector({ viewState: null, metadata: null })
  //   );
  //   expect(() => renderHook(() => useMeasurements())).toThrow();
  // });
});
