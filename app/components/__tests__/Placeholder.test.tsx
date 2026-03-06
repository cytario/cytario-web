import { EmptyState } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";

vi.mock("@cytario/design", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
  };
});

describe("EmptyState (migrated from Placeholder)", () => {
  test("renders title and description", () => {
    render(
      <EmptyState title="Test Title" description="Test description." />,
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test description.")).toBeInTheDocument();
  });

  test("renders icon if provided", () => {
    render(
      <EmptyState
        title="Test"
        description="Desc"
        icon={X}
      />,
    );
    // EmptyState renders the Lucide icon component
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  test("renders action if provided", () => {
    render(
      <EmptyState
        title="Test"
        description="Desc"
        action={<button>Click me</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: /click me/i }),
    ).toBeInTheDocument();
  });
});
