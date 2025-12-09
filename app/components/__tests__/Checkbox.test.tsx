import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { Checkbox } from "../Controls/Checkbox";

describe("Checkbox component", () => {
  it("renders correctly", () => {
    const { asFragment } = render(
      <Checkbox checked={false} onChange={() => {}} />
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("renders as checked when checked prop is true", () => {
    const { asFragment } = render(
      <Checkbox checked={true} onChange={() => {}} />
    );
    expect(asFragment()).toMatchSnapshot();
  });

  it("calls onChange when clicked", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <Checkbox checked={false} onChange={handleChange} />
    );
    fireEvent.click(getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it("does not call onChange when disabled", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <Checkbox checked={false} onChange={handleChange} disabled />
    );
    fireEvent.click(getByRole("checkbox"));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("matches snapshot when checked", () => {
    const { asFragment } = render(
      <Checkbox checked={true} onChange={() => {}} />
    );
    expect(asFragment()).toMatchSnapshot(); // Snapshot when checked
  });

  it("matches snapshot when not checked", () => {
    const { asFragment } = render(
      <Checkbox checked={false} onChange={() => {}} />
    );
    expect(asFragment()).toMatchSnapshot(); // Snapshot when not checked
  });
});
