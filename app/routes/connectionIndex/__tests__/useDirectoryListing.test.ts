import { renderHook, waitFor } from "@testing-library/react";

import { useDirectoryListing } from "../useDirectoryListing";
import mock from "~/utils/__tests__/__mocks__";

const mockListPrefix = vi.fn();

vi.mock("~/routes/connectionIndex/connectionIndexRead", () => ({
  connectionIndexRead: (...args: unknown[]) => mockListPrefix(...args),
}));

describe("useDirectoryListing", () => {
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    prefix: "data",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns empty + not loading when disabled", () => {
    const { result } = renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/foo/",
        urlPath: "foo/",
        enabled: false,
      }),
    );

    expect(mockListPrefix).not.toHaveBeenCalled();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.rows).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("exposes raw rows alongside built nodes", async () => {
    const fetched = [
      {
        key: "data/foo/a.txt",
        size: 10,
        lastModified: "2025-06-15T12:00:00Z",
        etag: "abc",
      },
    ];
    mockListPrefix.mockResolvedValue(fetched);

    const { result } = renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/foo/",
        urlPath: "foo/",
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.rows).toEqual(fetched);
    expect(result.current.nodes).toHaveLength(1);
  });

  test("calls connectionIndexRead with the current prefix as listPath", async () => {
    mockListPrefix.mockResolvedValue([]);

    renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/foo/",
        urlPath: "foo/",
        enabled: true,
      }),
    );

    await waitFor(() => expect(mockListPrefix).toHaveBeenCalledTimes(1));
    expect(mockListPrefix).toHaveBeenCalledWith({
      connection: { connectionConfig, credentials },
      listPath: "data/foo/",
    });
  });

  test("builds tree nodes from index rows", async () => {
    mockListPrefix.mockResolvedValue([
      {
        key: "data/foo/bar.txt",
        size: 42,
        lastModified: "2025-06-15T12:00:00Z",
        etag: "abc",
      },
      {
        key: "data/foo/baz.png",
        size: 1024,
        lastModified: "2025-06-16T08:30:00Z",
        etag: "def",
      },
    ]);

    const { result } = renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/foo/",
        urlPath: "foo/",
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.nodes).toHaveLength(2);
    expect(result.current.nodes[0].name).toBe("bar.txt");
    expect(result.current.nodes[1].name).toBe("baz.png");
  });

  test("captures errors and clears nodes", async () => {
    mockListPrefix.mockRejectedValue(new Error("DuckDB exploded"));

    const { result } = renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/",
        urlPath: "",
        enabled: true,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("DuckDB exploded");
    expect(result.current.nodes).toEqual([]);
  });

  test("ignores resolved listPrefix after unmount", async () => {
    let resolveListPrefix: (rows: unknown[]) => void = () => {};
    mockListPrefix.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListPrefix = resolve as (rows: unknown[]) => void;
        }),
    );

    const { result, unmount } = renderHook(() =>
      useDirectoryListing({
        connection: { connectionConfig, credentials },
        prefix: "data/",
        urlPath: "",
        enabled: true,
      }),
    );

    unmount();
    resolveListPrefix([
      { key: "data/late.txt", size: 1, lastModified: null, etag: "x" },
    ]);
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.nodes).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });
});
