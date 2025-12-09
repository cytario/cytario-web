import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFetcher } from "react-router";
import { Mock, vi } from "vitest";

import { GlobalSearch } from "../GlobalSearch";

const mockSetSearchParams = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("react-router", () => ({
  useFetcher: vi.fn(),
  useSearchParams: vi.fn(() => [mockSearchParams, mockSetSearchParams]),
}));

describe("GlobalSearch", () => {
  const mockSubmit = vi.fn();
  const mockFetcher = {
    submit: mockSubmit,
    data: null,
  };

  beforeEach(() => {
    (useFetcher as Mock).mockReturnValue(mockFetcher);
  });

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

  test("submits the query after debounce duration", async () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox");

    fireEvent.change(input, { target: { value: "test" } });

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalledWith(
        { query: "test" },
        { method: "get", action: "/search" }
      );
    });
  });

  test("clears the results when input is cleared", () => {
    render(<GlobalSearch />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "test" } });

    const clearButton = screen.getByRole("button");
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
    expect(mockFetcher.data).toBeNull();
  });
});
