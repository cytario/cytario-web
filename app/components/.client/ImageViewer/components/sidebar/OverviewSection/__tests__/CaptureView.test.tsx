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

vi.mock("../../../export/ExportDialog", () => ({
  ExportDialog: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="export-dialog" /> : null,
}));

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ objectivePower: 20 }),
}));

describe("Capture view action", () => {
  test("renders in the section header next to the reset action", () => {
    render(<OverviewSection />);

    const captureButton = screen.getByRole("button", { name: "Capture view" });
    expect(captureButton).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  test("opens the Export dialog", async () => {
    const user = userEvent.setup();
    render(<OverviewSection />);

    expect(screen.queryByTestId("export-dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Capture view" }));

    // The dialog is React.lazy — wait for the chunk to resolve.
    expect(await screen.findByTestId("export-dialog")).toBeInTheDocument();
  });

  test("the capture button carries the camera glyph", () => {
    render(<OverviewSection />);

    const captureButton = screen.getByRole("button", { name: "Capture view" });
    expect(captureButton.querySelector("svg")).not.toBeNull();
  });
});
