import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AnnotationThumb } from "../AnnotationThumb";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const makeFeature = (overrides?: Partial<AnnotationFeature>): AnnotationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [100, 200] },
  properties: { id: "feat-1" },
  ...overrides,
});

const defaultProps = {
  feature: makeFeature(),
  selected: false,
  color: "rgba(255, 0, 0, 255)",
  editable: true,
  onSelect: vi.fn(),
  onZoom: vi.fn(),
  onDelete: vi.fn(),
};

describe("AnnotationThumb", () => {
  test("aria-pressed is false when not selected", () => {
    render(<AnnotationThumb {...defaultProps} selected={false} />);

    expect(screen.getByRole("button", { name: "" })).toHaveAttribute("aria-pressed", "false");
  });

  test("aria-pressed is true when selected", () => {
    render(<AnnotationThumb {...defaultProps} selected={true} />);

    expect(screen.getByRole("button", { name: "" })).toHaveAttribute("aria-pressed", "true");
  });

  test("calls onSelect when the thumbnail button is clicked", () => {
    const onSelect = vi.fn();
    render(<AnnotationThumb {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("Delete menu item is disabled when editable is false", () => {
    render(<AnnotationThumb {...defaultProps} editable={false} />);

    // Open the actions menu
    fireEvent.click(screen.getByRole("button", { name: "Annotation actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("Delete menu item is enabled when editable is true", () => {
    render(<AnnotationThumb {...defaultProps} editable={true} />);

    fireEvent.click(screen.getByRole("button", { name: "Annotation actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("Zoom menu item is present in the actions menu", () => {
    render(<AnnotationThumb {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Annotation actions" }));

    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
  });

  test("calls onZoom when Zoom menu item is activated", () => {
    const onZoom = vi.fn();
    render(<AnnotationThumb {...defaultProps} onZoom={onZoom} />);

    fireEvent.click(screen.getByRole("button", { name: "Annotation actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Zoom to annotation" }));

    expect(onZoom).toHaveBeenCalledTimes(1);
  });
});
