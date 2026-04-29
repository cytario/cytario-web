import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { GlobalSearch } from "../GlobalSearch";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

const mockSetSearchParams = vi.fn();
const mockSearchParams = new URLSearchParams();
const mockUseSearchAcrossConnections = vi.fn();
mockUseSearchAcrossConnections.mockReturnValue({
  nodes: [] as TreeNode[],
  isLoading: false,
});

vi.mock("react-router", () => ({
  useSearchParams: vi.fn(() => [mockSearchParams, mockSetSearchParams]),
}));

vi.mock("~/routes/connectionIndex/useSearchAcrossConnections", () => ({
  useSearchAcrossConnections: (q: string) => mockUseSearchAcrossConnections(q),
}));

describe("GlobalSearch", () => {
  beforeEach(() => {
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: [],
      isLoading: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test("renders the search bar", () => {
    render(<GlobalSearch />);
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  test("updates the query state on input change", () => {
    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText("Search...");

    fireEvent.change(input, { target: { value: "test" } });
    expect(input).toHaveValue("test");
  });

  test("calls the search hook with the typed value after debounce", async () => {
    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText("Search...");

    fireEvent.change(input, { target: { value: "test" } });

    await waitFor(() => {
      expect(mockUseSearchAcrossConnections).toHaveBeenCalledWith("test");
    });
  });

  test("clears the input on clear-button press", () => {
    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText("Search...");
    fireEvent.change(input, { target: { value: "test" } });

    const clearButton = screen.getByRole("button");
    fireEvent.click(clearButton);

    expect(input).toHaveValue("");
  });
});
