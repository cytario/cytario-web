import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mock } from "vitest";

import { type ViewState } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { Magnifier, magnificationFromZoom, zoomFromMagnification } from "../Magnifier";

vi.mock("../Image/ResetViewStateButton", () => ({
  ResetViewStateButton: () => <button type="button">Reset</button>,
}));

vi.mock("../Image/ImagePreview", () => ({
  ImagePreview: () => <div data-testid="image-preview" />,
}));

vi.mock("../../state/store/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("~/components/FeatureItem/useFeatureItem", () => ({
  useFeatureItemStore: vi.fn(() => ({ isOpen: true, setIsOpen: vi.fn() })),
  FeatureItemStoreProvider: ({ children }: { children: React.ReactNode }) => children,
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

const setViewStateActive = vi.fn();

const mockStore = (viewStateActive: ViewState | null = makeViewState()) =>
  (useViewerStore as Mock).mockImplementation((selector) =>
    selector({
      metadata: null,
      viewStateActive,
      setViewStateActive,
    }),
  );

describe("Magnifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore();
  });

  test("renders all magnification preset buttons", () => {
    render(<Magnifier />);

    for (const mag of [1, 2, 5, 10, 20, 40, 80]) {
      expect(screen.getByRole("radio", { name: `${mag}x` })).toBeInTheDocument();
    }
  });

  test("displays current magnification in the input", () => {
    mockStore(makeViewState(0)); // zoom 0 = 20x at objectivePower 20
    render(<Magnifier />);

    expect(screen.getByRole("textbox")).toHaveValue("20.0");
  });

  test("displays magnification for non-zero zoom", () => {
    mockStore(makeViewState(1)); // zoom 1 = 40x
    render(<Magnifier />);

    expect(screen.getByRole("textbox")).toHaveValue("40.0");
  });

  test("clicking a preset button sets the correct zoom", async () => {
    const user = userEvent.setup();
    render(<Magnifier />);

    await user.click(screen.getByRole("radio", { name: "40x" }));

    expect(setViewStateActive).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: zoomFromMagnification(40),
      }),
    );
  });

  test("clicking a preset does nothing when viewStateActive is null", async () => {
    mockStore(null);
    const user = userEvent.setup();
    render(<Magnifier />);

    await user.click(screen.getByRole("radio", { name: "20x" }));

    expect(setViewStateActive).not.toHaveBeenCalled();
  });

  test("displays 20.0 when viewStateActive is null (default zoom 0)", () => {
    mockStore(null);
    render(<Magnifier />);

    expect(screen.getByRole("textbox")).toHaveValue("20.0");
  });

  test("renders the segmented control with correct aria-label", () => {
    render(<Magnifier />);

    expect(screen.getByRole("radiogroup", { name: "Magnification presets" })).toBeInTheDocument();
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
