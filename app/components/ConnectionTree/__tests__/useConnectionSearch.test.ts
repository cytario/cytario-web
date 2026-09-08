import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useConnectionSearch } from "../useConnectionSearch";

const searchMock = vi.hoisted(() => vi.fn());

vi.mock("~/utils/searchConnection", () => ({
  searchConnection: searchMock,
}));

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => {
  const state = {
    connections: {
      c1: {
        connectionConfig: { id: "c1", name: "conn" },
        credentials: {},
        provider: {},
      },
    },
  };
  const useConnectionsStore = ((selector: (s: typeof state) => unknown) =>
    selector(state)) as unknown as {
    getState: () => typeof state;
    (selector: (s: typeof state) => unknown): unknown;
  };
  useConnectionsStore.getState = () => state;
  return { useConnectionsStore };
});

function scanResult(children: unknown[], isCapped = false) {
  return { node: { children }, isCapped, error: false, corsBlocked: false };
}

describe("useConnectionSearch", () => {
  beforeEach(() => {
    searchMock.mockReset();
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
});
