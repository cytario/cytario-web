import { render } from "@testing-library/react";

import { Tick } from "../Tick";

describe("Tick", () => {
  test.each([
    {
      description: "renders a minor tick without a label",
      props: { offset: 10 },
      expectedOffset: 8, // offset - 2
      expectedLabel: null,
      expectedHeight: "h-2",
    },
    {
      description: "renders a major tick with a label",
      props: { offset: 10, number: 5 },
      expectedOffset: 8, // offset - 2
      expectedLabel: "5",
      expectedHeight: "h-4",
    },
  ])("$description", ({ props, expectedOffset, expectedLabel, expectedHeight }) => {
    const { container } = render(<Tick {...props} />);

    const div = container.querySelector("div");
    expect(div).toBeInTheDocument();

    expect(div).toHaveStyle({
      transform: `translateX(${expectedOffset}px)`,
    });

    expect(div).toHaveClass(expectedHeight);

    const span = container.querySelector("span");
    if (expectedLabel) {
      expect(span).toBeInTheDocument();
      expect(span).toHaveTextContent(expectedLabel);
    } else {
      expect(span).not.toBeInTheDocument();
    }
  });
});
