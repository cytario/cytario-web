import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddOverlay } from "../AddOverlay";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

// --- Mocks ---

const mockUseSearchAcrossConnections = vi.fn();
mockUseSearchAcrossConnections.mockReturnValue({
  nodes: [] as TreeNode[],
  isLoading: false,
});

vi.mock("~/routes/connectionIndex/useSearchAcrossConnections", () => ({
  useSearchAcrossConnections: (q: string) => mockUseSearchAcrossConnections(q),
}));

vi.mock("~/utils/db/convertCsvToParquet", () => ({
  convertCsvToParquet: vi.fn(),
}));

vi.mock("~/utils/resourceId", () => ({
  createResourceId: (provider: string, bucket: string, path: string) =>
    `${provider}/${bucket}/${path}`,
}));

vi.mock("~/components/LavaLoader", () => ({
  LavaLoader: () => <div data-testid="lava-loader" />,
}));

const mockToast = vi.fn();

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    useToast: () => ({ toast: mockToast }),
  };
});

function makeTreeNodes(): TreeNode[] {
  return [
    {
      id: "analysis/",
      connectionName: "aws-test-bucket",
      name: "analysis",
      type: "directory",
      pathName: "analysis/",
      children: [
        {
          id: "analysis/cells.parquet",
          connectionName: "aws-test-bucket",
          name: "cells.parquet",
          type: "file",
          pathName: "analysis/cells.parquet",
          children: [],
        },
        {
          id: "analysis/markers.parquet",
          connectionName: "aws-test-bucket",
          name: "markers.parquet",
          type: "file",
          pathName: "analysis/markers.parquet",
          children: [],
        },
      ],
    },
  ];
}

// --- Tests ---

describe("AddOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: [],
      isLoading: false,
    });
  });

  test("calls the search hook with the parquet query on mount", () => {
    render(<AddOverlay query="parquet" />);
    expect(mockUseSearchAcrossConnections).toHaveBeenCalledWith("parquet");
  });

  test("calls the search hook with the csv query on mount", () => {
    render(<AddOverlay query="csv" />);
    expect(mockUseSearchAcrossConnections).toHaveBeenCalledWith("csv");
  });

  test("shows loading state while the search is in flight", () => {
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: [],
      isLoading: true,
    });

    render(<AddOverlay query="parquet" />);

    expect(screen.getByTestId("lava-loader")).toBeInTheDocument();
  });

  test("shows empty state when no files found", () => {
    render(<AddOverlay query="parquet" />);

    expect(
      screen.getByText("No .parquet files found in connected buckets."),
    ).toBeInTheDocument();
  });

  test("renders tree with file nodes", () => {
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: makeTreeNodes(),
      isLoading: false,
    });

    render(<AddOverlay query="parquet" />);

    expect(screen.getByText("analysis")).toBeInTheDocument();
    expect(screen.getByText("cells.parquet")).toBeInTheDocument();
    expect(screen.getByText("markers.parquet")).toBeInTheDocument();
  });

  test("renders search input with correct placeholder for parquet", () => {
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: makeTreeNodes(),
      isLoading: false,
    });

    render(<AddOverlay query="parquet" />);

    expect(
      screen.getByPlaceholderText("Search .parquet files..."),
    ).toBeInTheDocument();
  });

  test("Load button is disabled when no file is selected", () => {
    mockUseSearchAcrossConnections.mockReturnValue({
      nodes: makeTreeNodes(),
      isLoading: false,
    });

    render(<AddOverlay query="parquet" />);

    const loadButton = screen.getByRole("button", { name: "Load" });
    expect(loadButton).toBeDisabled();
  });

  test("shows Convert button for csv query", () => {
    render(<AddOverlay query="csv" />);

    expect(
      screen.getByRole("button", { name: "Convert" }),
    ).toBeInTheDocument();
  });

  test("shows Cancel button when callback is provided", () => {
    const callback = vi.fn();

    render(<AddOverlay query="parquet" callback={callback} />);

    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  test("does not show Cancel button when callback is not provided", () => {
    render(<AddOverlay query="parquet" />);

    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  test("calls callback when Cancel is pressed", async () => {
    const callback = vi.fn();
    const user = userEvent.setup();

    render(<AddOverlay query="parquet" callback={callback} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(callback).toHaveBeenCalledOnce();
  });
});
