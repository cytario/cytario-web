import { act, renderHook } from "@testing-library/react";

import { useDisplayUnitStore } from "../useDisplayUnitStore";

describe("useDisplayUnitStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useDisplayUnitStore.setState({ displayUnit: "metric" });
  });

  test("defaults to metric", () => {
    const { result } = renderHook(() => useDisplayUnitStore());
    expect(result.current.displayUnit).toBe("metric");
  });

  test("toggle flips between metric and pixels", () => {
    const { result } = renderHook(() => useDisplayUnitStore());
    act(() => result.current.toggleDisplayUnit());
    expect(result.current.displayUnit).toBe("pixels");
    act(() => result.current.toggleDisplayUnit());
    expect(result.current.displayUnit).toBe("metric");
  });

  test("persists across store rehydration", () => {
    const { result } = renderHook(() => useDisplayUnitStore());
    act(() => result.current.toggleDisplayUnit());
    expect(JSON.parse(localStorage.getItem("cytario-display-unit") ?? "{}")).toMatchObject({
      state: { displayUnit: "pixels" },
    });
  });
});
