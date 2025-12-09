import { render, screen } from "@testing-library/react";

import { Placeholder } from "../Placeholder";

describe("Placeholder", () => {
  test("renders title and description", () => {
    render(<Placeholder title="Test Title" description="Test description." />);
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Test description.")).toBeInTheDocument();
  });

  test("renders icon if provided", () => {
    render(<Placeholder title="Test" description="Desc" icon="X" />);
    const icon = screen.getByRole("img");
    expect(icon).toBeInTheDocument();
  });

  test("renders cta if provided", () => {
    render(
      <Placeholder
        title="Test"
        description="Desc"
        cta={<button>Click me</button>}
      />
    );
    expect(
      screen.getByRole("button", { name: /click me/i })
    ).toBeInTheDocument();
  });
});
