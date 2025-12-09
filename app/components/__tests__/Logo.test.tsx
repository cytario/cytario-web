import { render } from "@testing-library/react";

import { Logo } from "../Logo";

test("it renders the Logo component correctly", () => {
  const { container } = render(<Logo />);
  expect(container).toBeInTheDocument();
});

test("it matches the snapshot", () => {
  const { asFragment } = render(<Logo />);
  expect(asFragment()).toMatchSnapshot();
});
