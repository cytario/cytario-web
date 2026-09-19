import { render, screen } from "@testing-library/react";

import { SectionSlider } from "../SectionSlider";

describe("SectionSlider", () => {
  test("renders the design slider with an accessible label", () => {
    render(<SectionSlider aria-label="Channels opacity" value={0.5} onChange={() => {}} />);

    expect(screen.getByRole("slider", { name: "Channels opacity" })).toBeInTheDocument();
  });
});
