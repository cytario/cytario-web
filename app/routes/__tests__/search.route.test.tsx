import { beforeEach, describe, expect, test, vi } from "vitest";

import { clientLoader, handle } from "~/routes/search.route";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { CorsLikelyError } from "~/utils/signedFetch";

const listObjectsClient = vi.fn();
vi.mock("~/utils/listObjects/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

/**
 * Seeds `useConnectionsStore` via the same `setConnections` action that
 * `useInitConnections` calls at route mount, so the test exercises the
 * production mapping rather than a parallel copy of it. Auto-fills
 * credentials for configs that didn't appear in `credentialsByName`.
 */
const seedConnectionsStore = (
  configs: ReturnType<typeof mock.connectionConfig>[],
  credentialsByName: Record<string, ReturnType<typeof mock.credentials>> = {},
) => {
  const credentials = Object.fromEntries(
    configs.map((c) => [c.id, credentialsByName[c.name] ?? mock.credentials()]),
  );
  useConnectionsStore.getState().setConnections(configs, credentials);
};

describe("SearchRoute", () => {
  beforeEach(() => {
    listObjectsClient.mockReset();
    useConnectionsStore.setState({ connections: {} });
  });

  test("clientLoader propagates errors-per-connection and continues with the rest", async () => {
    const ok = mock.connectionConfig({ id: "ok", name: "ok", prefix: "" });
    const broken = mock.connectionConfig({ id: "broken", name: "broken", prefix: "" });

    listObjectsClient.mockImplementation(async (config) => {
      if (config.name === "broken") throw new Error("AccessDenied");
      return { contents: [{ Key: "match.tif" }], commonPrefixes: [], isCapped: false };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    seedConnectionsStore([ok, broken]);

    const request = new Request("http://localhost/search?query=match");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.searchQuery).toBe("match");
    expect(result.nodes.map((n) => n.name)).toEqual(["ok"]);
  });

  test("clientLoader emits an error notification when a connection fails", async () => {
    const ok = mock.connectionConfig({ id: "ok", name: "ok", prefix: "" });
    const broken = mock.connectionConfig({ id: "broken", name: "broken", prefix: "" });

    listObjectsClient.mockImplementation(async (config) => {
      if (config.name === "broken") throw new Error("AccessDenied");
      return { contents: [{ Key: "match.tif" }], commonPrefixes: [], isCapped: false };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    seedConnectionsStore([ok, broken]);

    const request = new Request("http://localhost/search?query=match");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.notification).toBeDefined();
    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/broken/);
    expect(result.notification?.message).not.toMatch(/\bok\b/);
  });

  test("clientLoader combines error + warning when both failures and caps occur", async () => {
    const ok = mock.connectionConfig({ id: "ok", name: "ok", prefix: "" });
    const huge = mock.connectionConfig({ name: "huge", prefix: "" });
    const broken = mock.connectionConfig({ id: "broken", name: "broken", prefix: "" });

    listObjectsClient.mockImplementation(async (config) => {
      if (config.name === "broken") throw new Error("AccessDenied");
      if (config.name === "huge") {
        return { contents: [{ Key: "x.tif" }], commonPrefixes: [], isCapped: true };
      }
      return { contents: [{ Key: "y.tif" }], commonPrefixes: [], isCapped: false };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    seedConnectionsStore([ok, huge, broken]);

    const request = new Request("http://localhost/search?query=tif");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/broken/);
    expect(result.notification?.message).toMatch(/huge/);
  });

  test("clientLoader bounds concurrent listings to a small limit", async () => {
    const configs = Array.from({ length: 20 }, (_, i) =>
      mock.connectionConfig({ id: `conn-${i}`, name: `conn-${i}`, prefix: "" }),
    );

    const inFlight = { current: 0, peak: 0 };
    listObjectsClient.mockImplementation(async () => {
      inFlight.current++;
      inFlight.peak = Math.max(inFlight.peak, inFlight.current);
      await new Promise((r) => setTimeout(r, 1));
      inFlight.current--;
      return { contents: [], commonPrefixes: [], isCapped: false };
    });

    seedConnectionsStore(configs);

    const request = new Request("http://localhost/search?query=x");
    await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    // SEARCH_CONCURRENCY = 6
    expect(inFlight.peak).toBeLessThanOrEqual(6);
    expect(inFlight.peak).toBeGreaterThan(0);
    expect(listObjectsClient).toHaveBeenCalledTimes(configs.length);
  });

  test("clientLoader forwards request.signal into each listObjectsClient call", async () => {
    const config = mock.connectionConfig({ id: "a", name: "a", prefix: "" });
    listObjectsClient.mockResolvedValue({ contents: [], commonPrefixes: [], isCapped: false });

    seedConnectionsStore([config]);

    const request = new Request("http://localhost/search?query=q");
    await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(listObjectsClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ signal: request.signal }),
    );
  });

  test("surfaces a CORS-specific notification when a connection throws CorsLikelyError", async () => {
    const blocked = mock.connectionConfig({ name: "blocked", prefix: "" });
    const ok = mock.connectionConfig({ id: "ok", name: "ok", prefix: "" });

    listObjectsClient.mockImplementation(async (config) => {
      if (config.name === "blocked") {
        throw new CorsLikelyError("blocked.s3.amazonaws.com", "https://app.cytario.com");
      }
      return { contents: [{ Key: "match.tif" }], commonPrefixes: [], isCapped: false };
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    seedConnectionsStore([blocked, ok]);

    const request = new Request("http://localhost/search?query=match");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/CORS/);
    expect(result.notification?.message).toMatch(/blocked/);
  });

  test("handle exposes the route as a virtual breadcrumb node", () => {
    expect(handle.node()).toMatchObject({ name: "Search", connectionName: "", type: "directory" });
  });

  test("clientLoader fans out one listing per connection scoped to its own prefix", async () => {
    const alphaConfig = mock.connectionConfig({
      id: "alpha",
      name: "Alpha Lab",
      bucketName: "shared-bucket",
      prefix: "Alpha Lab/",
    });
    const betaConfig = mock.connectionConfig({
      id: "beta",
      name: "Beta Lab",
      bucketName: "shared-bucket",
      prefix: "Beta Lab/",
    });

    listObjectsClient.mockImplementation(async (config, _creds, options) => {
      const prefix = options?.prefix;
      if (prefix === "Alpha Lab/") {
        return {
          contents: [{ Key: "Alpha Lab/results/demo.parquet" }],
          commonPrefixes: [],
          isCapped: false,
        };
      }
      if (prefix === "Beta Lab/") {
        return {
          contents: [
            {
              Key: "Beta Lab/results/sample-001.ome.tif/results/total.csv.parquet",
            },
          ],
          commonPrefixes: [],
          isCapped: false,
        };
      }
      return { contents: [], commonPrefixes: [], isCapped: false };
    });

    seedConnectionsStore([alphaConfig, betaConfig]);

    const request = new Request("http://localhost/search?query=parquet");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(listObjectsClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alpha Lab", bucketName: "shared-bucket" }),
      expect.anything(),
      expect.objectContaining({
        query: "parquet",
        prefix: "Alpha Lab/",
        recursive: true,
      }),
    );
    expect(listObjectsClient).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Beta Lab", bucketName: "shared-bucket" }),
      expect.anything(),
      expect.objectContaining({
        query: "parquet",
        prefix: "Beta Lab/",
        recursive: true,
      }),
    );

    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.map((n) => n.name)).toEqual(["Alpha Lab", "Beta Lab"]);

    const alphaChildNames = (result.nodes[0].children ?? []).map((c) => c.name);
    expect(alphaChildNames).not.toContain("Beta Lab");
    expect(alphaChildNames).toContain("results");

    const betaTree = result.nodes[1];
    expect(betaTree.children![0].name).toBe("results");
    expect(betaTree.children![0].children![0].name).toBe("sample-001.ome.tif");
    expect(betaTree.children![0].children![0].pathName).toBe("results/sample-001.ome.tif/");
  });

  test("clientLoader surfaces a warning notification when any connection is capped", async () => {
    const huge = mock.connectionConfig({
      id: "huge",
      name: "Huge Bucket",
      bucketName: "huge",
      prefix: "Huge Bucket/",
    });
    const small = mock.connectionConfig({
      id: "small",
      name: "Small Bucket",
      bucketName: "small",
      prefix: "Small Bucket/",
    });

    listObjectsClient.mockImplementation(async (config) => {
      if (config.name === "Huge Bucket") {
        return { contents: [{ Key: "Huge Bucket/x.tif" }], commonPrefixes: [], isCapped: true };
      }
      return { contents: [{ Key: "Small Bucket/y.tif" }], commonPrefixes: [], isCapped: false };
    });

    seedConnectionsStore([huge, small]);

    const request = new Request("http://localhost/search?query=tif");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.notification).toBeDefined();
    expect(result.notification?.status).toBe("warning");
    expect(result.notification?.message).toMatch(/Huge Bucket/);
    expect(result.notification?.message).not.toMatch(/Small Bucket/);
  });

  test("clientLoader omits the notification when nothing was capped", async () => {
    const config = mock.connectionConfig();

    listObjectsClient.mockResolvedValue({
      contents: [{ Key: "x/y.tif" }],
      commonPrefixes: [],
      isCapped: false,
    });

    seedConnectionsStore([config]);

    const request = new Request("http://localhost/search?query=tif");
    const result = await clientLoader({ request, params: {}, serverLoader: vi.fn() } as never);

    expect(result.notification).toBeUndefined();
  });
});
