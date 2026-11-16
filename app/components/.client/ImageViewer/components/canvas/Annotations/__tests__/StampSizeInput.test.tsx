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

const setup = (displayUnit: "metric" | "pixels", image: Image = metadata) => {
  useViewerDisplayStore.setState({
    displayUnit,
    scaleBarVisible: true,
    rulersVisible: true,
  });
  currentStore = createViewerStore("test-conn/images/nm.ome.tif", "me");
  currentStore.getState().setMetadata(image);
  render(<StampSizeInput />);
  return screen.getByLabelText("Stamp size in display units");
};

describe("StampSizeInput unit conversion", () => {
  test("metric mode shows the scale bar's unit and commits per axis", () => {
    // Default 512 px at 0.5 µm/px (X) → 256 µm, shown against the X axis.
    const input = setup("metric");
    expect((input as HTMLInputElement).value).toBe("256");
    expect(input.closest("label")?.textContent).toBe("Size\u00b5m");

    fireEvent.change(input, { target: { value: "125" } });
    fireEvent.blur(input);

    // 125 µm = 0.125 mm → 250 px on X (0.5 µm/px), 500 px on Y (0.25 µm/px).
    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 250,
      heightPx: 500,
    });
    expect((input as HTMLInputElement).value).toBe("125");
  });

  test("a value typed in the shown unit moves to a larger unit once it reaches 1", () => {
    const input = setup("metric");

    fireEvent.change(input, { target: { value: "2000" } });
    fireEvent.blur(input);

    // 2000 µm = 2 mm → 4000 px on X, 8000 px on Y.
    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 4000,
      heightPx: 8000,
    });
    expect((input as HTMLInputElement).value).toBe("2");
    expect(input.closest("label")?.textContent).toBe("Sizemm");
  });

  test("moving to a smaller unit with the same number re-derives the field", () => {
    const input = setup("metric");
    fireEvent.change(input, { target: { value: "5000" } });
    fireEvent.blur(input);
    expect((input as HTMLInputElement).value).toBe("5");
    expect(input.closest("label")?.textContent).toBe("Sizemm");

    // 0.005 mm = 5 µm: the number stays 5, the unit changes.
    fireEvent.change(input, { target: { value: "0.005" } });
    fireEvent.blur(input);

    expect(currentStore.getState().annotationStampSize.widthPx).toBeCloseTo(10, 10);
    expect((input as HTMLInputElement).value).toBe("5");
    expect(input.closest("label")?.textContent).toBe("Size\u00b5m");
  });

  test("retyping the current size normalizes the field", () => {
    const input = setup("metric");
    fireEvent.change(input, { target: { value: "256.0" } });
    fireEvent.blur(input);

    expect(currentStore.getState().annotationStampSize.widthPx).toBe(512);
    expect((input as HTMLInputElement).value).toBe("256");
  });

  test("each valid keystroke applies to the stamp, with no blur needed", () => {
    // Clicking the canvas to stamp does not reliably blur the field (deck.gl
    // prevents the pointer default), so the size must already be applied.
    const input = setup("metric");
    act(() => input.focus());

    fireEvent.change(input, { target: { value: "1" } });
    expect(currentStore.getState().annotationStampSize).toEqual({ widthPx: 2, heightPx: 4 });

    fireEvent.change(input, { target: { value: "10" } });
    expect(currentStore.getState().annotationStampSize).toEqual({ widthPx: 20, heightPx: 40 });
    expect(document.activeElement).toBe(input);
  });

  test("the unit holds while typing and settles on blur", () => {
    const input = setup("metric");
    act(() => input.focus());

    for (const text of ["2", "20", "200", "2000"]) {
      fireEvent.change(input, { target: { value: text } });
    }
    // Still read and labelled in µm while editing — no jump to mm mid-typing.
    expect(currentStore.getState().annotationStampSize.widthPx).toBe(4000);
    expect((input as HTMLInputElement).value).toBe("2000");
    expect(input.closest("label")?.textContent).toBe("Size\u00b5m");

    act(() => input.blur());
    expect((input as HTMLInputElement).value).toBe("2");
    expect(input.closest("label")?.textContent).toBe("Sizemm");
  });

  test("a comma is read as the decimal separator", () => {
    const input = setup("metric");
    fireEvent.change(input, { target: { value: "12,5" } });

    expect(currentStore.getState().annotationStampSize.widthPx).toBeCloseTo(25, 10);
  });

  test("the field is plain text with a decimal keyboard — no spinner arrows", () => {
    const input = setup("metric") as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("decimal");
  });

  test("decimals are accepted in the shown unit", () => {
    const input = setup("metric");

    fireEvent.change(input, { target: { value: "0.5" } });
    fireEvent.blur(input);

    // 0.5 µm → 1 px on X; the size now reads in nm.
    expect(currentStore.getState().annotationStampSize.widthPx).toBeCloseTo(1, 10);
    expect((input as HTMLInputElement).value).toBe("500");
    expect(input.closest("label")?.textContent).toBe("Sizenm");
  });

  test("an untouched field keeps the stored size despite the rounded display", () => {
    const input = setup("metric");
    act(() => {
      currentStore.getState().setAnnotationStampSize(333.3, 666.6);
    });
    // 333.3 px × 0.5 µm = 166.65 µm, shown to three significant digits.
    expect((input as HTMLInputElement).value).toBe("167");

    fireEvent.blur(input);

    expect(currentStore.getState().annotationStampSize).toEqual({
      widthPx: 333.3,
      heightPx: 666.6,
    });
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
    expect((input as HTMLInputElement).value).toBe("256");

    act(() => {
      useViewerDisplayStore.setState({ displayUnit: "pixels" });
    });
    // 512 px shown directly, no stale metric draft.
    expect((input as HTMLInputElement).value).toBe("512");

    act(() => {
      useViewerDisplayStore.setState({ displayUnit: "metric" });
    });
    expect((input as HTMLInputElement).value).toBe("256");
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

  test("without a physical pixel size the input stays in pixels, never guessed nm", () => {
    const input = setup("metric", {
      Pixels: { SizeX: 5120, SizeY: 5120 },
    } as unknown as Image);

    expect((input as HTMLInputElement).value).toBe("512");
    expect(input.closest("label")?.textContent).toBe("Sizepx");
  });
});
