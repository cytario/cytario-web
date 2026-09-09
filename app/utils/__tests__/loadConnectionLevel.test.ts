import { beforeEach, describe, expect, test, vi } from "vitest";

import mock from "./__mocks__";
import {
  __resetConnectionTreeStore,
  useConnectionTreeStore,
} from "../connectionsStore/useConnectionTreeStore";
import { TREE_CACHE_TTL_MS } from "../listingLimits";
import { loadConnectionLevel } from "../loadConnectionLevel";

const listObjectsClient = vi.fn();
vi.mock("../listObjects/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

const args = (overrides: Partial<Parameters<typeof loadConnectionLevel>[0]> = {}) => ({
  connectionConfig: mock.connectionConfig({ name: "conn", prefix: "scope" }),
  credentials: mock.credentials(),
  connectionId: "conn-id",
  connectionName: "conn",
  urlPath: "sub/",
  ...overrides,
});

describe("loadConnectionLevel (cached)", () => {
  beforeEach(() => {
    vi.useRealTimers();
    listObjectsClient.mockReset();
    __resetConnectionTreeStore();
  });

  test("composes the listing prefix from connectionConfig.prefix + urlPath", async () => {
    listObjectsClient.mockResolvedValueOnce({ contents: [], commonPrefixes: [], isCapped: false });

    await loadConnectionLevel(args());

    const opts = listObjectsClient.mock.calls[0][2] as { prefix?: string };
    expect(opts.prefix).toBe("scope/sub/");
  });

  test("builds a level tree from contents + commonPrefixes", async () => {
    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "scope/sub/file.tif" }],
      commonPrefixes: ["scope/sub/nested/"],
      isCapped: false,
    });

    const { nodes, isCapped } = await loadConnectionLevel(args({ urlPath: "sub" }));

    expect(isCapped).toBe(false);
    expect(nodes.map((n) => n.name)).toEqual(["nested", "file.tif"]);
  });

  test("propagates isCapped from the underlying listing", async () => {
    listObjectsClient.mockResolvedValueOnce({ contents: [], commonPrefixes: [], isCapped: true });

    const { isCapped } = await loadConnectionLevel(
      args({ connectionConfig: mock.connectionConfig({ prefix: "" }), urlPath: "" }),
    );

    expect(isCapped).toBe(true);
  });

  test("forwards an AbortSignal to listObjectsClient", async () => {
    listObjectsClient.mockResolvedValueOnce({ contents: [], commonPrefixes: [], isCapped: false });
    const controller = new AbortController();

    await loadConnectionLevel(
      args({
        connectionConfig: mock.connectionConfig({ prefix: "" }),
        urlPath: "",
        signal: controller.signal,
      }),
    );

    const opts = listObjectsClient.mock.calls[0][2] as { signal?: AbortSignal };
    expect(opts.signal).toBe(controller.signal);
  });

  test("second load of the same level hits the cache — one S3 call, same nodes", async () => {
    listObjectsClient.mockResolvedValue({ contents: [], commonPrefixes: [], isCapped: false });

    const first = await loadConnectionLevel(args());
    const second = await loadConnectionLevel(args());

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    expect(second.nodes).toBe(first.nodes);
  });

  test("expired entries refetch after the TTL", async () => {
    vi.useFakeTimers();
    listObjectsClient.mockResolvedValue({ contents: [], commonPrefixes: [], isCapped: false });

    await loadConnectionLevel(args());
    vi.setSystemTime(new Date(Date.now() + TREE_CACHE_TTL_MS + 1));
    await loadConnectionLevel(args());

    expect(listObjectsClient).toHaveBeenCalledTimes(2);
  });

  test("parallel loads of the same level share one request", async () => {
    let resolveListing!: (v: unknown) => void;
    listObjectsClient.mockReturnValueOnce(
      new Promise((r) => {
        resolveListing = r;
      }),
    );

    const pending = Promise.all([loadConnectionLevel(args()), loadConnectionLevel(args())]);
    resolveListing({ contents: [], commonPrefixes: [], isCapped: false });
    const [a, b] = await pending;

    expect(listObjectsClient).toHaveBeenCalledTimes(1);
    expect(a.nodes).toBe(b.nodes);
  });

  test("failed loads are not cached", async () => {
    listObjectsClient
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ contents: [], commonPrefixes: [], isCapped: false });

    await expect(loadConnectionLevel(args())).rejects.toThrow("boom");
    await expect(loadConnectionLevel(args())).resolves.toBeDefined();

    expect(listObjectsClient).toHaveBeenCalledTimes(2);
  });
});

describe("useConnectionTreeStore.invalidate", () => {
  beforeEach(() => {
    vi.useRealTimers();
    listObjectsClient.mockReset();
    __resetConnectionTreeStore();
  });

  test("drops the entry and its descendants, keeps siblings", async () => {
    const listing = { contents: [], commonPrefixes: [], isCapped: false };
    listObjectsClient.mockResolvedValue(listing);

    await loadConnectionLevel(args({ urlPath: "" }));
    await loadConnectionLevel(args({ urlPath: "sub/" }));
    await loadConnectionLevel(args({ urlPath: "sub/deep/" }));
    await loadConnectionLevel(args({ urlPath: "sibling/" }));
    expect(listObjectsClient).toHaveBeenCalledTimes(4);

    useConnectionTreeStore.getState().invalidate("conn-id", "scope/sub/");
    await loadConnectionLevel(args({ urlPath: "" })); // still cached
    await loadConnectionLevel(args({ urlPath: "sub/" })); // refetched
    await loadConnectionLevel(args({ urlPath: "sub/deep/" })); // refetched
    await loadConnectionLevel(args({ urlPath: "sibling/" })); // still cached

    expect(listObjectsClient).toHaveBeenCalledTimes(6);
  });

  test("without a prefix, drops the whole connection but not other connections", async () => {
    const listing = { contents: [], commonPrefixes: [], isCapped: false };
    listObjectsClient.mockResolvedValue(listing);

    await loadConnectionLevel(args());
    await loadConnectionLevel(args({ connectionId: "other-conn", connectionName: "other" }));

    useConnectionTreeStore.getState().invalidate("conn-id");
    await loadConnectionLevel(args());
    await loadConnectionLevel(args({ connectionId: "other-conn", connectionName: "other" }));

    expect(listObjectsClient).toHaveBeenCalledTimes(3);
  });
});
