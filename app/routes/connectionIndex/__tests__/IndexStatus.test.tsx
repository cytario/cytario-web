import { render, screen } from "@testing-library/react";
import { useFetcher } from "react-router";
import { type Mock } from "vitest";

vi.mock("react-router", () => ({
  useFetcher: vi.fn(),
}));

const { IndexStatus } = await import("../IndexStatus");

type FetcherLike = {
  state: "idle" | "loading" | "submitting";
  data: unknown;
  load: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
};

function mockFetchers(status: Partial<FetcherLike>, rebuild: Partial<FetcherLike>) {
  const statusFetcher: FetcherLike = {
    state: status.state ?? "idle",
    data: status.data ?? null,
    load: status.load ?? vi.fn(),
    submit: status.submit ?? vi.fn(),
  };
  const rebuildFetcher: FetcherLike = {
    state: rebuild.state ?? "idle",
    data: rebuild.data ?? null,
    load: rebuild.load ?? vi.fn(),
    submit: rebuild.submit ?? vi.fn(),
  };
  (useFetcher as Mock)
    .mockReturnValueOnce(statusFetcher)
    .mockReturnValueOnce(rebuildFetcher);
  return { statusFetcher, rebuildFetcher };
}

describe("IndexStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("loads the connection index on mount via useFetcher", () => {
    const statusLoad = vi.fn();
    mockFetchers({ load: statusLoad }, {});

    render(<IndexStatus connectionName="test-connection" />);

    expect(statusLoad).toHaveBeenCalledWith("/connectionIndex/test-connection");
  });

  test("renders indexed count when loader data has exists:true", () => {
    mockFetchers(
      {
        data: {
          connectionName: "test-connection",
          exists: true,
          objectCount: 1234,
          builtAt: "2025-01-01",
          sizeBytes: 2048,
        },
      },
      {},
    );

    render(<IndexStatus connectionName="test-connection" />);

    expect(screen.getByText("1,234 indexed")).toBeInTheDocument();
  });

  test("renders 'No index' when loader data has exists:false", () => {
    mockFetchers(
      { data: { connectionName: "test-connection", exists: false } },
      {},
    );

    render(<IndexStatus connectionName="test-connection" />);

    expect(screen.getByText("No index")).toBeInTheDocument();
  });

  test("renders 'Loading index…' before status arrives", () => {
    mockFetchers({ state: "loading", data: null }, {});

    render(<IndexStatus connectionName="test-connection" />);

    expect(screen.getByText("Loading index…")).toBeInTheDocument();
  });

  test("rebuild button submits POST to the route URL", () => {
    const rebuildSubmit = vi.fn();
    mockFetchers(
      { data: { connectionName: "test-connection", exists: false } },
      { submit: rebuildSubmit },
    );

    render(<IndexStatus connectionName="test-connection" />);
    screen.getByRole("button", { name: /index/i }).click();

    expect(rebuildSubmit).toHaveBeenCalledWith(null, {
      method: "POST",
      action: "/connectionIndex/test-connection",
    });
  });

  test("disables the button while rebuilding", () => {
    mockFetchers(
      { data: { connectionName: "test-connection", exists: false } },
      { state: "submitting" },
    );

    render(<IndexStatus connectionName="test-connection" />);

    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("Indexing…")).toBeInTheDocument();
  });
});
