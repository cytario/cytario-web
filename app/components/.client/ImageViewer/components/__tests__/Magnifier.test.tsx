import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { type ViewState, type ViewerStore } from "../../state/store/types";
import {
  Magnifier,
  magnificationFromZoom,
  zoomFromMagnification,
} from "../Magnifier";

vi.mock("../Image/ResetViewStateButton", () => ({
  ResetViewStateButton: () => (
    <button type="button">Reset</button>
  ),
}));

const makeViewState = (zoom = 0): ViewState =>
  ({
    zoom,
    width: 800,
    height: 600,
    rotationX: 0,
    rotationOrbit: 0,
    target: [0, 0] as [number, number],
    minRotationX: 0,
    maxRotationX: 0,
    minZoom: -5,
    maxZoom: 5,
    transitionDuration: 0,
  }) as ViewState;

describe("Magnifier", () => {
  const setViewStateActive = vi.fn();

  const defaultProps = {
    metadata: null as ViewerStore["metadata"] | null,
    viewStateActive: makeViewState(),
    setViewStateActive,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("renders all magnification preset buttons", () => {
    render(<Magnifier {...defaultProps} />);

    for (const mag of [5, 10, 20, 40, 80]) {
      expect(screen.getByRole("radio", { name: `${mag}x` })).toBeInTheDocument();
    }
  });

  test("displays current magnification in the input", () => {
    const viewState = makeViewState(0); // zoom 0 = 20x at objectivePower 20
    render(<Magnifier {...defaultProps} viewStateActive={viewState} />);

    expect(screen.getByRole("textbox")).toHaveValue("20.0");
  });

  test("displays magnification for non-zero zoom", () => {
    const viewState = makeViewState(1); // zoom 1 = 40x
    render(<Magnifier {...defaultProps} viewStateActive={viewState} />);

    expect(screen.getByRole("textbox")).toHaveValue("40.0");
  });

  test("clicking a preset button sets the correct zoom", async () => {
    const user = userEvent.setup();
    render(<Magnifier {...defaultProps} />);

    await user.click(screen.getByRole("radio", { name: "40x" }));

    expect(setViewStateActive).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: zoomFromMagnification(40),
      }),
    );
  });

  test("clicking a preset does nothing when viewStateActive is null", async () => {
    const user = userEvent.setup();
    render(
      <Magnifier {...defaultProps} viewStateActive={null} />,
    );

    await user.click(screen.getByRole("radio", { name: "20x" }));

    expect(setViewStateActive).not.toHaveBeenCalled();
  });

  test("displays 20.0 when viewStateActive is null (default zoom 0)", () => {
    render(<Magnifier {...defaultProps} viewStateActive={null} />);

    expect(screen.getByRole("textbox")).toHaveValue("20.0");
  });

  test("renders the segmented control with correct aria-label", () => {
    render(<Magnifier {...defaultProps} />);

    expect(
      screen.getByRole("radiogroup", { name: "Magnification presets" }),
    ).toBeInTheDocument();
  });
});

describe("zoomFromMagnification", () => {
  test("returns 0 for magnification equal to objective power", () => {
    expect(zoomFromMagnification(20, 20)).toBe(0);
  });

  test("returns 1 for double the objective power", () => {
    expect(zoomFromMagnification(40, 20)).toBe(1);
  });

  test("returns -2 for 5x at 20x objective", () => {
    expect(zoomFromMagnification(5, 20)).toBe(-2);
  });
});

describe("magnificationFromZoom", () => {
  test("returns objective power at zoom 0", () => {
    expect(magnificationFromZoom(0, 20)).toBe(20);
  });

  test("returns double objective power at zoom 1", () => {
    expect(magnificationFromZoom(1, 20)).toBe(40);
  });

  test("returns half objective power at zoom -1", () => {
    expect(magnificationFromZoom(-1, 20)).toBe(10);
  });
});
