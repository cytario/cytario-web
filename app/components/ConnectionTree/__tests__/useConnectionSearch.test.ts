import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useConnectionSearch } from "../useConnectionSearch";

const searchMock = vi.hoisted(() => vi.fn());

vi.mock("~/utils/searchConnection", () => ({
  searchConnection: searchMock,
}));

const storeState = vi.hoisted(() => ({
  connections: {
    c1: {
      connectionConfig: { id: "c1", name: "conn" },
      credentials: {},
      provider: {},
    },
    public: {
      connectionConfig: { id: "public", name: "public-conn" },
      credentials: null,
      provider: { isPublic: true },
    },
    locked: {
      connectionConfig: { id: "locked", name: "locked-conn" },
      credentials: null,
      provider: { isPublic: false },
    },
  } as Record<string, unknown>,
  lockedConnections: [] as Array<{ id: string }>,
}));

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => {
  const useConnectionsStore = ((selector: (s: typeof storeState) => unknown) =>
    selector(storeState)) as unknown as {
    getState: () => typeof storeState;
    (selector: (s: typeof storeState) => unknown): unknown;
  };
  useConnectionsStore.getState = () => storeState;
  return { useConnectionsStore };
});

function scanResult(children: unknown[], isCapped = false) {
  return { node: { children }, isCapped, error: false, corsBlocked: false };
}

describe("useConnectionSearch", () => {
  beforeEach(() => {
    searchMock.mockReset();
    storeState.lockedConnections = [];
  });

  test("runs the scan when only the extension filter is set (empty query)", async () => {
    searchMock.mockResolvedValue(scanResult([{ id: "n1" }]));
    const { result } = renderHook(() => useConnectionSearch("c1", "", { extensions: ["parquet"] }));

    await waitFor(() => expect(result.current.isSearching).toBe(false));

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock.mock.calls[0][0].query).toBe("");
    expect(result.current.nodes).toEqual([{ id: "n1" }]);
    expect(result.current.isCapped).toBe(false);
  });

  test("surfaces isCapped from the scan", async () => {
    searchMock.mockResolvedValue(scanResult([], true));
    const { result } = renderHook(() => useConnectionSearch("c1", "query"));

    await waitFor(() => expect(result.current.isSearching).toBe(false));

    expect(result.current.isCapped).toBe(true);
  });

  test("stays idle with no query and no filters", () => {
    const { result } = renderHook(() => useConnectionSearch("c1", "", undefined));

    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.isCapped).toBe(false);
  });

  test("searches a public (credential-less) connection", async () => {
    searchMock.mockResolvedValue(scanResult([{ id: "n1" }]));
    const { result } = renderHook(() => useConnectionSearch("public", "query"));

    await waitFor(() => expect(result.current.isSearching).toBe(false));

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(result.current.nodes).toEqual([{ id: "n1" }]);
    expect(result.current.error).toBe(false);
  });

  test("refuses a gate-locked connection without issuing a scan", async () => {
    // The bucket is private and the host holds no credential for it by design;
    // reaching S3 anyway would be the leak the lock exists to prevent.
    storeState.lockedConnections = [{ id: "locked" }];

    const { result } = renderHook(() => useConnectionSearch("locked", "query"));

    await waitFor(() => expect(result.current.error).toBe(true));

    expect(searchMock).not.toHaveBeenCalled();
    expect(result.current.isSearching).toBe(false);
    expect(result.current.nodes).toEqual([]);
  });
});
