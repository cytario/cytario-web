import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("react-router", () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}));

vi.mock("~/components/DirectoryView/queryIndex", () => ({
  searchIndex: vi.fn().mockResolvedValue([]),
  getIndexedBuckets: vi.fn().mockReturnValue([]),
}));

import { GlobalSearch } from "../GlobalSearch";

describe("GlobalSearch", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders the search bar", () => {
    render(<GlobalSearch />);
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  test("updates the query state on input change", () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "test" } });
    expect(input).toHaveValue("test");
  });

  test("clears the results when input is cleared", () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "test" } });

    const clearButton = screen.getByRole("button");
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
  });
});
