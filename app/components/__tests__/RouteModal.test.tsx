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

function createStub(isDismissable?: boolean) {
  return createRoutesStub([
    {
      path: "/connect-bucket",
      Component: () => (
        <RouteModal
          title="Connect Bucket"
          onClose={onClose}
          isDismissable={isDismissable}
        >
          <div>Modal Content</div>
        </RouteModal>
      ),
    },
  ]);
}

describe("RouteModal", () => {
  beforeEach(() => {
    onClose.mockClear();
  });

  test("renders title and children", () => {
    const Stub = createStub();
    render(<Stub initialEntries={["/connect-bucket"]} />);

    expect(screen.getByText("Connect Bucket")).toBeInTheDocument();
    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  test("does not call onClose when clicking inside dialog content", async () => {
    const Stub = createStub();
    render(<Stub initialEntries={["/connect-bucket"]} />);

    await userEvent.click(screen.getByText("Modal Content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  test("calls onClose when pressing Escape key", async () => {
    const Stub = createStub();
    render(<Stub initialEntries={["/connect-bucket"]} />);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  describe("isDismissable={false}", () => {
    test("calls onClose when pressing Escape key", async () => {
      const Stub = createStub(false);
      render(<Stub initialEntries={["/connect-bucket"]} />);

      await userEvent.keyboard("{Escape}");
      expect(onClose).toHaveBeenCalled();
    });

    test("calls onClose when clicking close button", async () => {
      const Stub = createStub(false);
      render(<Stub initialEntries={["/connect-bucket"]} />);

      await userEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalled();
    });

    test("does not call onClose when clicking inside dialog content", async () => {
      const Stub = createStub(false);
      render(<Stub initialEntries={["/connect-bucket"]} />);

      await userEvent.click(screen.getByText("Modal Content"));
      expect(onClose).not.toHaveBeenCalled();
    });

    test("renders title and children", () => {
      const Stub = createStub(false);
      render(<Stub initialEntries={["/connect-bucket"]} />);

      expect(screen.getByText("Connect Bucket")).toBeInTheDocument();
      expect(screen.getByText("Modal Content")).toBeInTheDocument();
    });
  });
});
