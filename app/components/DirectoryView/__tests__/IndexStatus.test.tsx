import { render, screen } from "@testing-library/react";
import { useFetcher } from "react-router";
import { type Mock } from "vitest";

vi.mock("react-router", () => ({
  useFetcher: vi.fn(),
}));

vi.mock("~/utils/connectionIndex", () => ({
  probeIndex: vi.fn(),
}));

const mockSetConnectionIndex = vi.fn();
let mockBucketIndex: {
  status: string;
  objectCount: number;
  builtAt: string | null;
} | null = null;

vi.mock("~/utils/connectionsStore", () => ({
  useConnectionsStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setConnectionIndex: mockSetConnectionIndex,
    }),
  selectConnectionIndex: () => () => mockBucketIndex,
}));

// Must import after vi.mock hoisting
const { IndexStatus } = await import("../IndexStatus");

describe("IndexStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBucketIndex = null;
  });

  function setupFetcher(state = "idle", data: unknown = null) {
    (useFetcher as Mock).mockReturnValue({
      state,
      data,
      submit: vi.fn(),
    });
  }

  test("calls setConnectionIndex with error state when fetcher data fails validation", () => {
    setupFetcher("idle", { error: "unexpected server error" });

    render(<IndexStatus alias="test-alias" />);

    expect(mockSetConnectionIndex).toHaveBeenCalledWith("test-alias", {
      status: "error",
      objectCount: 0,
      builtAt: null,
    });
  });

  test("calls setConnectionIndex with ready state when fetcher data is valid", () => {
    setupFetcher("idle", { objectCount: 42, builtAt: "2025-01-01T00:00:00Z" });

    render(<IndexStatus alias="test-alias" />);

    expect(mockSetConnectionIndex).toHaveBeenCalledWith("test-alias", {
      status: "ready",
      objectCount: 42,
      builtAt: "2025-01-01T00:00:00Z",
    });
  });

  test("does not call setConnectionIndex when fetcher is loading", () => {
    setupFetcher("submitting", null);

    render(<IndexStatus alias="test-alias" />);

    expect(mockSetConnectionIndex).not.toHaveBeenCalled();
  });

  test("does not call setConnectionIndex when fetcher has no data", () => {
    setupFetcher("idle", null);

    render(<IndexStatus alias="test-alias" />);

    expect(mockSetConnectionIndex).not.toHaveBeenCalled();
  });

  test("renders indexed count when status is ready", () => {
    mockBucketIndex = { status: "ready", objectCount: 1234, builtAt: "2025-01-01" };
    setupFetcher();

    render(<IndexStatus alias="test-alias" />);

    expect(screen.getByText("1,234 indexed")).toBeInTheDocument();
  });

  test("renders 'No index' when status is missing", () => {
    mockBucketIndex = { status: "missing", objectCount: 0, builtAt: null };
    setupFetcher();

    render(<IndexStatus alias="test-alias" />);

    expect(screen.getByText("No index")).toBeInTheDocument();
  });

  test("renders 'Index error' when status is error", () => {
    mockBucketIndex = { status: "error", objectCount: 0, builtAt: null };
    setupFetcher();

    render(<IndexStatus alias="test-alias" />);

    expect(screen.getByText("Index error")).toBeInTheDocument();
  });
});
