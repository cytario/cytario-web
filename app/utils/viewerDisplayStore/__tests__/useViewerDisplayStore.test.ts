import { act, renderHook } from "@testing-library/react";

import { useViewerDisplayStore } from "../useViewerDisplayStore";

describe("useViewerDisplayStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useViewerDisplayStore.setState({
      displayUnit: "metric",
      scaleBarVisible: true,
      rulersVisible: true,
    });
  });

  test("defaults to metric units with scale bar and rulers visible", () => {
    const { result } = renderHook(() => useViewerDisplayStore());
    expect(result.current.displayUnit).toBe("metric");
    expect(result.current.scaleBarVisible).toBe(true);
    expect(result.current.rulersVisible).toBe(true);
  });

  test("toggleDisplayUnit flips between metric and pixels", () => {
    const { result } = renderHook(() => useViewerDisplayStore());
    act(() => result.current.toggleDisplayUnit());
    expect(result.current.displayUnit).toBe("pixels");
    act(() => result.current.toggleDisplayUnit());
    expect(result.current.displayUnit).toBe("metric");
  });

  test("visibility toggles flip the scale bar and rulers independently", () => {
    const { result } = renderHook(() => useViewerDisplayStore());
    act(() => result.current.toggleScaleBar());
    expect(result.current.scaleBarVisible).toBe(false);
    expect(result.current.rulersVisible).toBe(true);
    act(() => result.current.toggleRulers());
    expect(result.current.rulersVisible).toBe(false);
    expect(result.current.scaleBarVisible).toBe(false);
  });

  test("persists to the legacy storage key across rehydration", () => {
    const { result } = renderHook(() => useViewerDisplayStore());
    act(() => result.current.toggleDisplayUnit());
    act(() => result.current.toggleScaleBar());
    expect(JSON.parse(localStorage.getItem("cytario-display-unit") ?? "{}")).toMatchObject({
      state: { displayUnit: "pixels", scaleBarVisible: false },
    });
  });
});
