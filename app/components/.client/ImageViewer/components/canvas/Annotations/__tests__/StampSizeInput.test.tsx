import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import type { Image } from "../../../../state/store/core/ome.tif.types";
import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import { StampSizeInput } from "../StampSizeInput";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

const metadata = {
  Pixels: {
    SizeX: 5120,
    SizeY: 5120,
    PhysicalSizeX: 0.5,
    PhysicalSizeY: 0.25,
    PhysicalSizeXUnit: "µm",
  },
} as unknown as Image;

const setup = (displayUnit: "metric" | "pixels") => {
  useViewerDisplayStore.setState({
    displayUnit,
    scaleBarVisible: true,
    rulersVisible: true,
  });
  currentStore = createViewerStore("test-conn/images/nm.ome.tif", "me");
  currentStore.getState().setMetadata(metadata);
  render(<StampSizeInput />);
  return screen.getByLabelText("Stamp size in display units");
};

describe("StampSizeInput unit conversion", () => {
  test("metric mode displays nanometers and commits per axis", () => {
    // Default 512 px at 0.5 µm/px (X) → 256000 nm; at 0.25 µm/px (Y) → 128000 nm,
    // shown against the X axis.
    const input = setup("metric");
    expect((input as HTMLInputElement).value).toBe("256000");

    fireEvent.change(input, { target: { value: "125000" } });
    fireEvent.blur(input);

    // 125000 nm = 0.125 mm → 250 px on X (0.5 µm/px), 500 px on Y (0.25 µm/px).
    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 250,
      heightPx: 500,
    });
    expect((input as HTMLInputElement).value).toBe("125000");
  });

  test("pixel mode is a direct level-0 pixel value on both axes", () => {
    const input = setup("pixels");
    expect((input as HTMLInputElement).value).toBe("512");

    fireEvent.change(input, { target: { value: "100" } });
    fireEvent.blur(input);

    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 100,
      heightPx: 100,
    });
  });

  test("the displayed value re-derives when the unit flips", () => {
    const input = setup("metric");
    expect((input as HTMLInputElement).value).toBe("256000");

    act(() => {
      useViewerDisplayStore.setState({ displayUnit: "pixels" });
    });
    // 512 px shown directly, no stale metric draft.
    expect((input as HTMLInputElement).value).toBe("512");

    act(() => {
      useViewerDisplayStore.setState({ displayUnit: "metric" });
    });
    expect((input as HTMLInputElement).value).toBe("256000");
  });

  test("Enter commits without blur", () => {
    const input = setup("pixels");
    input.focus();
    fireEvent.change(input, { target: { value: "200" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 200,
      heightPx: 200,
    });
  });

  test.each(["abc", "-5", "0", ""])(
    "invalid input %j is rejected and the previous value restored",
    (invalid) => {
      const input = setup("pixels");
      fireEvent.change(input, { target: { value: invalid } });
      fireEvent.blur(input);

      // The store keeps its prior size; the input re-derives from it.
      expect(currentStore.getState().annotationStampSize).toEqual({
        widthPx: 512,
        heightPx: 512,
      });
      expect((input as HTMLInputElement).value).toBe("512");
    },
  );
});
