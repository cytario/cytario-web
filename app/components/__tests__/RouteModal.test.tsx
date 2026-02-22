import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

import { RouteModal } from "../RouteModal";

const onClose = vi.fn();

vi.mock("@cytario/design", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
  };
});

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
  beforeEach(() => {
    onClose.mockClear();
  });

  test("renders title and children", () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    expect(screen.getByText("Connect Bucket")).toBeInTheDocument();
    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  test("does not call onClose when clicking inside dialog content", async () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    await userEvent.click(screen.getByText("Modal Content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("calls onClose when pressing Escape key", async () => {
    render(<RemixStub initialEntries={["/connect-bucket"]} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});
