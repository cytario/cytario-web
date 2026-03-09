import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mock } from "vitest";

import { select } from "../../../state/selectors";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { AddOverlay } from "../AddOverlay";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

// --- Mocks ---

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

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
          connectionConfig: { name: "test-bucket", provider: "aws" },
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

const mockAddOverlaysState = vi.fn();
const mockToast = vi.fn();

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    useToast: () => ({ toast: mockToast }),
  };
});

function setupViewerStore() {
  (useViewerStore as Mock).mockImplementation((selector) => {
    if (selector === select.addOverlaysState) return mockAddOverlaysState;
    return undefined;
  });
}

function makeTreeNodes(): TreeNode[] {
  return [
    {
      alias: "aws-test-bucket",
      provider: "aws",
      bucketName: "test-bucket",
      name: "analysis",
      type: "directory",
      pathName: "analysis/",
      children: [
        {
          alias: "aws-test-bucket",
          provider: "aws",
          bucketName: "test-bucket",
          name: "cells.parquet",
          type: "file",
          pathName: "analysis/cells.parquet",
          children: [],
        },
        {
          alias: "aws-test-bucket",
          provider: "aws",
          bucketName: "test-bucket",
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
    setupViewerStore();
  });

  test("fetches files on mount with correct search query for parquet", () => {
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    expect(mockUseFetcherLoad).toHaveBeenCalledWith(
      "/search?query=parquet",
    );
  });

  test("fetches files on mount with correct search query for csv", () => {
    mockFetcherState = "idle";

    render(<AddOverlay query="convert-overlay" />);

    expect(mockUseFetcherLoad).toHaveBeenCalledWith("/search?query=csv");
  });

  test("shows loading state while fetcher is loading", () => {
    mockFetcherState = "loading";

    render(<AddOverlay query="load-overlay" />);

    expect(screen.getByTestId("lava-loader")).toBeInTheDocument();
  });

  test("shows empty state when no files found", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    expect(
      screen.getByText("No .parquet files found in connected buckets."),
    ).toBeInTheDocument();
  });

  test("renders tree with file nodes", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    expect(screen.getByText("analysis")).toBeInTheDocument();
    expect(screen.getByText("cells.parquet")).toBeInTheDocument();
    expect(screen.getByText("markers.parquet")).toBeInTheDocument();
  });

  test("renders search input with correct placeholder for parquet", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    expect(
      screen.getByPlaceholderText("Search .parquet files..."),
    ).toBeInTheDocument();
  });

  test("Load button is disabled when no file is selected", () => {
    mockFetcherData = { nodes: makeTreeNodes() };
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    const loadButton = screen.getByRole("button", { name: "Load" });
    expect(loadButton).toBeDisabled();
  });

  test("shows Convert button for csv query", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="convert-overlay" />);

    expect(
      screen.getByRole("button", { name: "Convert" }),
    ).toBeInTheDocument();
  });

  test("shows Cancel button when callback is provided", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";
    const callback = vi.fn();

    render(<AddOverlay query="load-overlay" callback={callback} />);

    expect(
      screen.getByRole("button", { name: "Cancel" }),
    ).toBeInTheDocument();
  });

  test("does not show Cancel button when callback is not provided", () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";

    render(<AddOverlay query="load-overlay" />);

    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
  });

  test("calls callback when Cancel is pressed", async () => {
    mockFetcherData = { nodes: [] };
    mockFetcherState = "idle";
    const callback = vi.fn();
    const user = userEvent.setup();

    render(<AddOverlay query="load-overlay" callback={callback} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(callback).toHaveBeenCalledOnce();
  });
});
