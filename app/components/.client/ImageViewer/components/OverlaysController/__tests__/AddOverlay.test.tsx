import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddOverlay } from "../AddOverlay";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

// --- Mocks ---

const mockUseFetcherLoad = vi.fn();
let mockFetcherData: { nodes: TreeNode[] } | undefined;
let mockFetcherState: string;

vi.mock("react-router", () => ({
  useFetcher: () => ({
    load: mockUseFetcherLoad,
    data: mockFetcherData,
    state: mockFetcherState,
  }),
}));

vi.mock("~/utils/connectionsStore", () => ({
  useConnectionsStore: {
    getState: vi.fn(() => ({
      connections: {
        "aws-test-bucket": {
          credentials: { accessKeyId: "key", secretAccessKey: "secret" },
          connectionConfig: { bucketName: "test-bucket", provider: "aws" },
        },
      },
    })),
  },
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

// --- Helpers ---

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
    mockFetcherData = undefined;
    mockFetcherState = "idle";
  });

  test("fetches files on mount with correct search query for parquet", () => {
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    expect(mockUseFetcherLoad).toHaveBeenCalledWith("/search?query=parquet");
  });

  test("fetches files on mount with correct search query for csv", () => {
    mockFetcherState = "idle";

    render(<AddOverlay query="csv" />);

    expect(mockUseFetcherLoad).toHaveBeenCalledWith("/search?query=csv");
  });

  test("shows loading state while fetcher is loading", () => {
    mockFetcherState = "loading";

    render(<AddOverlay query="parquet" />);

    expect(screen.getByTestId("lava-loader")).toBeInTheDocument();
  });

  test("shows empty state when no files found", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    expect(
      screen.getByText("No .parquet files found in connected buckets."),
    ).toBeInTheDocument();
  });

  test("renders tree with file nodes", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    expect(screen.getByText("analysis")).toBeInTheDocument();
    expect(screen.getByText("cells.parquet")).toBeInTheDocument();
    expect(screen.getByText("markers.parquet")).toBeInTheDocument();
  });

  test("renders search input with correct placeholder for parquet", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    expect(
      screen.getByPlaceholderText("Search .parquet files..."),
    ).toBeInTheDocument();
  });

  test("Load button is disabled when no file is selected", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    const loadButton = screen.getByRole("button", { name: "Load" });
    expect(loadButton).toBeDisabled();
  });

  test("shows Convert button for csv query", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="csv" />);

    expect(
      screen.getByRole("button", { name: "Convert" }),
    ).toBeInTheDocument();
  });

  test("shows Cancel button when callback is provided", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";
    const callback = vi.fn();

    render(<AddOverlay query="parquet" callback={callback} />);

    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  test("does not show Cancel button when callback is not provided", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="parquet" />);

    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  test("calls callback when Cancel is pressed", async () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";
    const callback = vi.fn();
    const user = userEvent.setup();

    render(<AddOverlay query="parquet" callback={callback} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(callback).toHaveBeenCalledOnce();
  });
});
