import { Checkbox } from "@cytario/design";
import { render, fireEvent } from "@testing-library/react";
import { describe, test, expect, vi } from "vitest";


describe("Checkbox component", () => {
  test("renders correctly", () => {
    const { asFragment } = render(
      <Checkbox isSelected={false} onChange={() => {}} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  test("renders as checked when isSelected prop is true", () => {
    const { asFragment } = render(
      <Checkbox isSelected={true} onChange={() => {}} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  test("calls onChange when clicked", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <Checkbox isSelected={false} onChange={handleChange} />,
    );
    fireEvent.click(getByRole("checkbox"));
    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  test("does not call onChange when disabled", () => {
    const handleChange = vi.fn();
    const { getByRole } = render(
      <Checkbox isSelected={false} onChange={handleChange} isDisabled />,
    );
    fireEvent.click(getByRole("checkbox"));
    expect(handleChange).not.toHaveBeenCalled();
  });

  test("matches snapshot when checked", () => {
    const { asFragment } = render(
      <Checkbox isSelected={true} onChange={() => {}} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });

  test("matches snapshot when not checked", () => {
    const { asFragment } = render(
      <Checkbox isSelected={false} onChange={() => {}} />,
    );
    expect(asFragment()).toMatchSnapshot();
  });
});
