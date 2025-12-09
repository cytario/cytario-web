import { render } from "@testing-library/react";

import { Tick } from "../Tick"; // Adjust the import path as needed

describe("Tick", () => {
  test.each([
    {
      description: "renders a horizontal tick without a label (minor tick)",
      props: { offset: 10 },
      expectedOffset: 7, // Math.floor(10) - 3
      expectedRotation: false,
      expectedLabel: null,
      expectedHeight: "h-2",
    },

    {
      description: "renders a horizontal tick with a label (major tick)",
      props: { offset: 10, number: 5 },
      expectedOffset: 7, // Math.floor(10) - 3
      expectedRotation: false,
      expectedLabel: "5",
      expectedHeight: "h-4",
    },

    {
      description: "renders a vertical tick without a label (minor tick)",
      props: { offset: 10, vertical: true },
      expectedOffset: 8, // Math.floor(10) - 2
      expectedRotation: true,
      expectedLabel: null,
      expectedHeight: "h-2",
    },

    {
      description: "renders a vertical tick with a label (major tick)",
      props: { offset: 10, number: 5, vertical: true },
      expectedOffset: 8, // Math.floor(10) - 2
      expectedRotation: true,
      expectedLabel: "5",
      expectedHeight: "h-4",
    },
  ])(
    "$description",
    ({ props, expectedOffset, expectedRotation, expectedLabel, expectedHeight }) => {
      const { container } = render(<Tick {...props} />);

      // Check div element exists
      const div = container.querySelector("div");
      expect(div).toBeInTheDocument();

      // Check transform style
      expect(div).toHaveStyle({
        transform: `translateX(${expectedOffset}px)`,
      });

      // Check rotation class
      if (expectedRotation) {
        expect(div).toHaveClass("rotate-90");
      } else {
        expect(div).not.toHaveClass("rotate-90");
      }

      // Check height class
      expect(div).toHaveClass(expectedHeight);

      // Check label (span) content
      const span = container.querySelector("span");
      if (expectedLabel) {
        expect(span).toBeInTheDocument();
        expect(span).toHaveTextContent(expectedLabel);
      } else {
        expect(span).not.toBeInTheDocument();
      }
    }
  );
});
