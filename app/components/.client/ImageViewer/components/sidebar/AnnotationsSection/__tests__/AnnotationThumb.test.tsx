import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { AnnotationThumb } from "../AnnotationThumb";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const makeFeature = (overrides?: Partial<AnnotationFeature>): AnnotationFeature => ({
  type: "Feature",
  id: "feat-1",
  geometry: { type: "Point", coordinates: [100, 200] },
  properties: {},
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

    expect(screen.getByRole("button", { name: "Unclassified point" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("aria-pressed is true when selected", () => {
    render(<AnnotationThumb {...defaultProps} selected={true} />);

    expect(screen.getByRole("button", { name: "Unclassified point" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("calls onSelect when the thumbnail button is clicked", () => {
    const onSelect = vi.fn();
    render(<AnnotationThumb {...defaultProps} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Unclassified point" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  test("Delete menu item is enabled", () => {
    render(<AnnotationThumb {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));

    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("Delete menu item is disabled on a read-only connection", () => {
    render(<AnnotationThumb {...defaultProps} editable={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));

    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  test("Zoom menu item is present in the actions menu", () => {
    render(<AnnotationThumb {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));

    expect(screen.getByRole("menuitem", { name: "Zoom to annotation" })).toBeInTheDocument();
  });

  test("calls onZoom when Zoom menu item is activated", () => {
    const onZoom = vi.fn();
    render(<AnnotationThumb {...defaultProps} onZoom={onZoom} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Zoom to annotation" }));

    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  test("displays the annotation name below the thumbnail", () => {
    const feature = makeFeature({ properties: { name: "My Region" } });
    render(<AnnotationThumb {...defaultProps} feature={feature} />);

    expect(screen.getByText("My Region")).toBeInTheDocument();
  });

  test("displays 'ID: <id>' fallback when no name is set", () => {
    render(<AnnotationThumb {...defaultProps} />);

    expect(screen.getByText("ID: feat-1")).toBeInTheDocument();
  });

  test("Rename menu item is present when onRename is provided", () => {
    const onRename = vi.fn();
    render(<AnnotationThumb {...defaultProps} onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));

    expect(screen.getByRole("menuitem", { name: "Rename annotation" })).toBeInTheDocument();
  });

  test("Rename menu item is absent when the connection is read-only", () => {
    render(<AnnotationThumb {...defaultProps} editable={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));

    expect(screen.queryByRole("menuitem", { name: "Rename annotation" })).toBeNull();
  });

  test("calls onRename with the edited name when Enter is pressed", () => {
    const onRename = vi.fn();
    const feature = makeFeature({ properties: { name: "Old Name" } });
    render(<AnnotationThumb {...defaultProps} feature={feature} onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename annotation" }));

    const input = screen.getByLabelText("Rename Old Name");
    fireEvent.change(input, { target: { value: "New Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).toHaveBeenCalledWith("New Name");
  });

  test("does not call onRename when the name is unchanged", () => {
    const onRename = vi.fn();
    const feature = makeFeature({ properties: { name: "Same Name" } });
    render(<AnnotationThumb {...defaultProps} feature={feature} onRename={onRename} />);

    fireEvent.click(screen.getByRole("button", { name: "Actions for Unclassified point" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename annotation" }));

    const input = screen.getByLabelText("Rename Same Name");
    fireEvent.change(input, { target: { value: "Same Name" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onRename).not.toHaveBeenCalled();
  });
});
