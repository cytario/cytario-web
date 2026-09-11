import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ZAxisSection } from "../ZAxisSection";

vi.mock("~/components/Section/Section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../state/SpatialDataStoreContext", () => ({
  useSpatialDataStore: vi.fn((selector: (state: unknown) => unknown) => selector(storeState)),
}));

const setElementZIndex = vi.fn();

let storeState: {
  elements: Record<string, unknown>;
  setElementZIndex: typeof setElementZIndex;
};

const element = (overrides: Record<string, unknown> = {}) => ({
  elementType: "image",
  elementKey: "z_image",
  isVisible: true,
  opacity: 1,
  ...overrides,
});

const renderSection = (elements: Record<string, unknown>) => {
  storeState = { elements, setElementZIndex };
  return render(<ZAxisSection />);
};

describe("ZAxisSection", () => {
  test("renders a slider bounded by the resolved zSize for a visible z-bearing element", () => {
    renderSection({ "image:z_image": element({ zIndex: 3, zSize: 16 }) });

    const slider = screen.getByRole("slider", { name: "image z_image z plane" });
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "15");
    expect(slider).toHaveAttribute("value", "3");
    expect(screen.getByText("z 3/15")).toBeInTheDocument();
  });

  test("omits the section when no visible raster element has more than one plane", () => {
    renderSection({
      "image:flat": element({ elementKey: "flat", zSize: 1 }),
      "image:hidden_z": element({ elementKey: "hidden_z", isVisible: false, zSize: 16 }),
      "points:transcripts": element({
        elementType: "points",
        elementKey: "transcripts",
      }),
    });

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("slider changes call the store action with the element id and plane", () => {
    renderSection({ "image:z_image": element({ zIndex: 0, zSize: 16 }) });

    const slider = screen.getByRole("slider", {
      name: "image z_image z plane",
    }) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(slider, "7");
    slider.dispatchEvent(new Event("change", { bubbles: true }));

    expect(setElementZIndex).toHaveBeenCalledWith("image:z_image", 7);
  });
});
