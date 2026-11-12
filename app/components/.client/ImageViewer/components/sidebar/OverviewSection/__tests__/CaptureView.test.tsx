import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { OverviewSection } from "../OverviewSection";

vi.mock("../../../canvas/ResetViewStateButton", () => ({
  ResetViewStateButton: () => <button type="button">Reset</button>,
}));

vi.mock("../../../canvas/ImagePreview", () => ({
  ImagePreview: () => <div data-testid="image-preview" />,
}));

vi.mock("../../../export/CaptureExportSection", () => ({
  CaptureExportSection: () => <div data-testid="capture-section" />,
}));

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ objectivePower: 20 }),
}));

const mockToggleSection = vi.fn();
let mockSections: Record<string, { isOpen: boolean }> = {};

vi.mock("../../../useViewerSidebarStore", () => ({
  useViewerSidebarStore: {
    getState: () => ({
      sections: mockSections,
      toggleSection: mockToggleSection,
    }),
  },
}));

const setSidebarSections = (sections: Record<string, { isOpen: boolean }>) => {
  mockSections = sections;
};

describe("Capture view action", () => {
  test("renders in the section header next to the reset action", () => {
    render(<OverviewSection />);

    const captureButton = screen.getByRole("button", { name: "Capture view" });
    expect(captureButton).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  test("the capture button carries the camera glyph", () => {
    render(<OverviewSection />);

    const captureButton = screen.getByRole("button", { name: "Capture view" });
    expect(captureButton.querySelector("svg")).not.toBeNull();
  });

  test("expands a collapsed Capture and export section and scrolls it into view", async () => {
    const scrollIntoView = vi.fn();
    const closest = vi.fn(() => ({ scrollIntoView }));
    const getElementById = vi.fn(() => ({ closest }));

    Object.defineProperty(document, "getElementById", {
      configurable: true,
      value: getElementById,
    });

    setSidebarSections({ capture: { isOpen: false } });

    const user = userEvent.setup();
    render(<OverviewSection />);

    await user.click(screen.getByRole("button", { name: "Capture view" }));

    expect(mockToggleSection).toHaveBeenCalledWith("capture");
    expect(getElementById).toHaveBeenCalledWith("section-capture-content");
    expect(scrollIntoView).toHaveBeenCalled();
  });

  test("an already-open capture section is not re-toggled, only scrolled into view", async () => {
    const scrollIntoView = vi.fn();
    const closest = vi.fn(() => ({ scrollIntoView }));
    const getElementById = vi.fn(() => ({ closest }));

    Object.defineProperty(document, "getElementById", {
      configurable: true,
      value: getElementById,
    });

    setSidebarSections({});
    mockToggleSection.mockClear();

    const user = userEvent.setup();
    render(<OverviewSection />);

    await user.click(screen.getByRole("button", { name: "Capture view" }));

    expect(mockToggleSection).not.toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalled();
  });
});
