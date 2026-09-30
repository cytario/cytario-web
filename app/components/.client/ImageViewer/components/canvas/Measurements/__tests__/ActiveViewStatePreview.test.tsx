import { render } from "@testing-library/react";
import { Mock } from "vitest";

import { useViewerStore } from "../../../../state/store/core/ViewerStoreContext";
import { ActiveViewStatePreview } from "../ActiveViewStatePreview";
import { useMeasurements } from "../useMeasurements";

vi.mock("../useMeasurements", () => ({
  useMeasurements: vi.fn(),
}));

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("../../../state/store/selectors", () => ({
  select: {
    viewStateActive: (state: Record<string, unknown>) => state.viewStateActive,
    viewStatePreview: (state: Record<string, unknown>) => state.viewStatePreview,
  },
}));

const activeMeasurements = {
  zoom: 1,
  viewPortWidth: 500,
  viewPortHeight: 400,
  screenOffsetLeft: 10,
  screenOffsetTop: 20,
};

const previewMeasurements = {
  zoom: 0,
  viewPortWidth: 250,
  viewPortHeight: 200,
  screenOffsetLeft: 5,
  screenOffsetTop: 8,
};

/** The component calls useMeasurements(active) then useMeasurements(preview). */
const mockMeasurements = (active: object, preview: object) => {
  (useMeasurements as Mock).mockReset();
  (useMeasurements as Mock).mockReturnValueOnce(active).mockReturnValueOnce(preview);
};

describe("ActiveViewStatePreview", () => {
  beforeEach(() => {
    (useViewerStore as Mock).mockReturnValue(undefined);
  });

  test(`renders the active-viewport indicator rects when geometry is finite`, () => {
    mockMeasurements(activeMeasurements, previewMeasurements);

    const { container } = render(<ActiveViewStatePreview />);

    const rects = container.querySelectorAll("rect");
    expect(rects).toHaveLength(2);
    // scaleFactor = 2^(0 - 1) = 0.5 → width 250, height 200, x 0, y -2.
    expect(rects[0]).toHaveAttribute("x", "0");
    expect(rects[0]).toHaveAttribute("y", "-2");
    expect(rects[0]).toHaveAttribute("width", "250");
    expect(rects[0]).toHaveAttribute("height", "200");
  });

  test(`renders nothing while any geometry value is NaN`, () => {
    mockMeasurements({ ...activeMeasurements, zoom: Number.NaN }, previewMeasurements);

    const { container } = render(<ActiveViewStatePreview />);

    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("rect")).toBeNull();
  });

  test(`renders nothing while the preview viewport is unmeasured`, () => {
    mockMeasurements(activeMeasurements, {
      ...previewMeasurements,
      viewPortWidth: Number.NaN,
    });

    const { container } = render(<ActiveViewStatePreview />);

    expect(container.querySelector("svg")).toBeNull();
  });
});
