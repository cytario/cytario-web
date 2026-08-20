import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SearchInput } from "../SearchInput";

describe("SearchInput", () => {
  test("renders with aria-label and placeholder", () => {
    render(<SearchInput onQueryChange={vi.fn()} aria-label="Search items" placeholder="Find…" />);
    expect(screen.getByLabelText("Search items")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Find…")).toBeInTheDocument();
  });

  test("defaults placeholder to Search…", () => {
    render(<SearchInput onQueryChange={vi.fn()} aria-label="Search" />);
    expect(screen.getByPlaceholderText("Search…")).toBeInTheDocument();
  });

  test("passes id to the input element", () => {
    render(<SearchInput onQueryChange={vi.fn()} aria-label="Search" id="my-input" />);
    expect(screen.getByRole("textbox")).toHaveAttribute("id", "my-input");
  });

  test("applies custom wrapper className", () => {
    const { container } = render(
      <SearchInput
        onQueryChange={vi.fn()}
        aria-label="Search"
        className="flex items-center gap-1 px-2"
      />,
    );
    expect(container.firstChild).toHaveClass("px-2");
  });

  test("debounces onQueryChange by 300ms", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    render(<SearchInput onQueryChange={onQueryChange} aria-label="Search" />);

    const input = screen.getByLabelText("Search");
    fireEvent.change(input, { target: { value: "hello" } });

    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onQueryChange).toHaveBeenCalledWith("hello");
    vi.useRealTimers();
  });

  test("clears value and calls onQueryChange with empty string", () => {
    vi.useFakeTimers();
    const onQueryChange = vi.fn();
    render(<SearchInput onQueryChange={onQueryChange} aria-label="Search" />);

    const input = screen.getByLabelText("Search") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(input.value).toBe("hello");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

    expect(input.value).toBe("");
    expect(onQueryChange).toHaveBeenLastCalledWith("");
    vi.useRealTimers();
  });

  test("does not show clear button when empty", () => {
    render(<SearchInput onQueryChange={vi.fn()} aria-label="Search" />);
    expect(screen.queryByRole("button", { name: "Clear search" })).not.toBeInTheDocument();
  });
});
