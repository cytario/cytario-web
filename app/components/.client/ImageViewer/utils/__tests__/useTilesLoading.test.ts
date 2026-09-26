import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useTilesLoading } from "../useTilesLoading";

// A zoom step fires a load/finish pair per tile per channel. Each used to write
// the outstanding count straight to the store, so every tile event re-rendered
// the panel (and serialized the persisted store). The hook now coalesces those
// writes to at most one per animation frame.
describe("useTilesLoading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("coalesces a burst of tile events into a single store write per frame", () => {
    const setIsTilesLoading = vi.fn();
    const { result } = renderHook(() => useTilesLoading(0, setIsTilesLoading));

    act(() => {
      result.current.loadTile("a");
      result.current.loadTile("b");
      result.current.loadTile("c");
    });

    // Nothing written synchronously — the frame has not run yet.
    expect(setIsTilesLoading).not.toHaveBeenCalled();

    act(() => {
      vi.runAllTimers();
    });

    expect(setIsTilesLoading).toHaveBeenCalledTimes(1);
    expect(setIsTilesLoading).toHaveBeenCalledWith(0, 3);
  });

  test("does not re-report an unchanged count", () => {
    const setIsTilesLoading = vi.fn();
    const { result } = renderHook(() => useTilesLoading(0, setIsTilesLoading));

    act(() => {
      result.current.loadTile("a");
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(setIsTilesLoading).toHaveBeenCalledTimes(1);

    // load + finish of an already-known tile leaves the count at 1.
    act(() => {
      result.current.loadTile("a");
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(setIsTilesLoading).toHaveBeenCalledTimes(1);
  });

  test("reports the count dropping to zero after tiles finish", () => {
    const setIsTilesLoading = vi.fn();
    const { result } = renderHook(() => useTilesLoading(2, setIsTilesLoading));

    act(() => {
      result.current.loadTile("a");
      result.current.loadTile("b");
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(setIsTilesLoading).toHaveBeenLastCalledWith(2, 2);

    act(() => {
      result.current.finishTile("a");
      result.current.finishTile("b");
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(setIsTilesLoading).toHaveBeenLastCalledWith(2, 0);
  });
});
