import { renderHook, waitFor } from "@testing-library/react";
import { useFetcher } from "react-router";
import { type Mock } from "vitest";

import { useDriftCheck } from "../useDriftCheck";
import type { ConnectionIndexLoaderData } from "~/routes/connectionIndex/connectionIndex.loader";

vi.mock("react-router", () => ({
  useFetcher: vi.fn(),
}));

type FetcherLike = {
  state: "idle" | "loading" | "submitting";
  data: unknown;
  load: ReturnType<typeof vi.fn>;
  submit: ReturnType<typeof vi.fn>;
};

/** First useFetcher() = liveFetcher (slice fetch); second = rebuildFetcher (POST). */
function setupFetchers(
  liveState: { state?: FetcherLike["state"]; data?: unknown } = {},
) {
  const liveLoad = vi.fn();
  const liveFetcher: FetcherLike = {
    state: liveState.state ?? "idle",
    data: liveState.data ?? null,
    load: liveLoad,
    submit: vi.fn(),
  };
  const rebuildSubmit = vi.fn();
  const rebuildFetcher: FetcherLike = {
    state: "idle",
    data: null,
    load: vi.fn(),
    submit: rebuildSubmit,
  };
  (useFetcher as Mock)
    .mockReturnValueOnce(liveFetcher)
    .mockReturnValueOnce(rebuildFetcher);
  return { liveLoad, rebuildSubmit };
}

describe("useDriftCheck", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("does nothing when disabled", () => {
    const { liveLoad, rebuildSubmit } = setupFetchers();

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [],
        enabled: false,
      }),
    );

    expect(liveLoad).not.toHaveBeenCalled();
    expect(rebuildSubmit).not.toHaveBeenCalled();
  });

  test("fires liveFetcher.load on mount when enabled", () => {
    const { liveLoad } = setupFetchers();

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [],
        enabled: true,
      }),
    );

    expect(liveLoad).toHaveBeenCalledWith(
      "/connectionIndex/Exchange?slice=foo%2F",
    );
  });

  test("no rebuild when liveSlice matches index rows", async () => {
    const liveData: ConnectionIndexLoaderData = {
      connectionName: "Exchange",
      exists: true,
      objectCount: 2,
      builtAt: null,
      sizeBytes: null,
      liveSlice: {
        prefix: "foo/",
        objects: [
          { key: "foo/a.txt", size: 1, etag: "A", lastModified: null },
          { key: "foo/b.txt", size: 2, etag: "B", lastModified: null },
        ],
        directories: [],
      },
    };
    const { rebuildSubmit } = setupFetchers({ state: "idle", data: liveData });

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [
          { Key: "foo/a.txt", Size: 1, ETag: "A" },
          { Key: "foo/b.txt", Size: 2, ETag: "B" },
        ],
        enabled: true,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(rebuildSubmit).not.toHaveBeenCalled();
  });

  test("fires a full rebuild when a new live key appears", async () => {
    const liveData: ConnectionIndexLoaderData = {
      connectionName: "Exchange",
      exists: true,
      objectCount: 2,
      builtAt: null,
      sizeBytes: null,
      liveSlice: {
        prefix: "foo/",
        objects: [
          { key: "foo/a.txt", size: 1, etag: "A", lastModified: null },
          { key: "foo/NEW.txt", size: 3, etag: "C", lastModified: null },
        ],
        directories: [],
      },
    };
    const { rebuildSubmit } = setupFetchers({ state: "idle", data: liveData });

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [{ Key: "foo/a.txt", Size: 1, ETag: "A" }],
        enabled: true,
      }),
    );

    await waitFor(() => expect(rebuildSubmit).toHaveBeenCalledTimes(1));
    expect(rebuildSubmit).toHaveBeenCalledWith(null, {
      method: "POST",
      action: "/connectionIndex/Exchange",
    });
  });

  test("fires a full rebuild when etag differs (in-place modification)", async () => {
    const liveData: ConnectionIndexLoaderData = {
      connectionName: "Exchange",
      exists: true,
      objectCount: 1,
      builtAt: null,
      sizeBytes: null,
      liveSlice: {
        prefix: "foo/",
        objects: [
          { key: "foo/a.txt", size: 1, etag: "NEW-ETAG", lastModified: null },
        ],
        directories: [],
      },
    };
    const { rebuildSubmit } = setupFetchers({ state: "idle", data: liveData });

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [{ Key: "foo/a.txt", Size: 1, ETag: "OLD-ETAG" }],
        enabled: true,
      }),
    );

    await waitFor(() => expect(rebuildSubmit).toHaveBeenCalledTimes(1));
  });

  test("ignores rows outside the slice prefix when computing the subset", async () => {
    // Index contains deeper entries; we only compare depth-1 children of the slice.
    const liveData: ConnectionIndexLoaderData = {
      connectionName: "Exchange",
      exists: true,
      objectCount: 1,
      builtAt: null,
      sizeBytes: null,
      liveSlice: {
        prefix: "foo/",
        objects: [
          { key: "foo/a.txt", size: 1, etag: "A", lastModified: null },
        ],
        directories: [],
      },
    };
    const { rebuildSubmit } = setupFetchers({ state: "idle", data: liveData });

    renderHook(() =>
      useDriftCheck({
        connectionName: "Exchange",
        urlPath: "foo/",
        indexRows: [
          { Key: "foo/a.txt", Size: 1, ETag: "A" },
          // Not depth-1: should be ignored when comparing.
          { Key: "foo/sub/b.txt", Size: 2, ETag: "B" },
        ],
        enabled: true,
      }),
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(rebuildSubmit).not.toHaveBeenCalled();
  });
});
