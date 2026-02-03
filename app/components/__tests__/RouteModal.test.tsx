import { fireEvent, render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { RouteModal } from "../RouteModal";

const onClose = vi.fn();

const RemixStub = createRoutesStub([
  {
    path: "/connect-bucket",
    Component: () => (
      <RouteModal title="Connect Bucket" onClose={onClose}>
        <div>Modal Content</div>
      </RouteModal>
    ),
  },
]);

describe("RouteModal", () => {
  test("renders title and children", () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    expect(screen.getByText("Connect Bucket")).toBeInTheDocument();
    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  // Click-outside behavior is handled by Headless UI Dialog internally
  // and tested by the library itself

  test("does not call onClose when clicking inside dialog content", () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    fireEvent.click(screen.getByText("Modal Content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("calls onClose when clicking close button", () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    fireEvent.click(screen.getByRole("button", { name: /close modal/i }));
    expect(onClose).toHaveBeenCalled();
  });

  test("calls onClose when Escape key is pressed", () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
