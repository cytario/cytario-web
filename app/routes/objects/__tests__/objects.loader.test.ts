import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import { clientLoader } from "~/routes/objects/objects.clientLoader";
import { loader } from "~/routes/objects/objects.loader";
import mock from "~/utils/__tests__/__mocks__";
import { CorsLikelyError } from "~/utils/signedFetch";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_ctx, next) => next()),
}));

vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: vi.fn(),
}));

const listObjectsClient = vi.fn();
vi.mock("~/utils/listObjects/listObjectsClient", () => ({
  listObjectsClient: (...args: unknown[]) => listObjectsClient(...args),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");
const { getConnection } = await import("~/routes/connections/connections.server");

const buildContext = () => ({
  get: vi.fn((ctx) => {
    if (ctx === authContext) {
      return {
        user: mock.user(),
        credentials: { "test-conn": mock.credentials() },
      };
    }
    return undefined;
  }),
});

describe("objects loader (C-193)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listObjectsClient.mockReset();
    vi.mocked(getConnection).mockResolvedValue(
      mock.connectionConfig({ id: "test-conn", name: "test-conn", prefix: "" }),
    );
  });

  test("server loader returns metadata only (no listing) and flags zarr early-out", async () => {
    const request = new Request("http://localhost/connections/test-conn/image.zarr");
    const response = await loader({
      request,
      params: { id: "test-conn", "*": "image.zarr" },
      context: buildContext() as never,
      pattern: "",
      url: new URL(request.url),
    });

    // Cache-Control: no-store, private is attached via the route-level
    // `headers` export in `objects.route.tsx` rather than a `data()`
    // wrapper — the latter breaks RR v8 single-fetch unwrapping.
    const result = response;
    expect(result.serverDeterminedSingleFile).toBe(true);
    expect(result.isSingleFile).toBe(true);
    expect(result.nodes).toEqual([]);
    // SSR has no listing yet, so the route component should know to
    // render a loading skeleton rather than the empty state.
    expect(result.pendingClientLoad).toBe(true);
  });

  test("throws 400 Response when urlPath contains '..' segments", async () => {
    vi.mocked(getConnection).mockResolvedValue(
      mock.connectionConfig({ id: "test-conn", name: "test-conn", prefix: "scope" }),
    );

    const request = new Request("http://localhost/connections/test-conn/../etc");
    await expect(
      loader({
        request,
        params: { id: "test-conn", "*": "../etc" },
        context: buildContext() as never,
        pattern: "",
        url: new URL(request.url),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test("clientLoader passes zarr server flag straight through as single-file", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "image.zarr",
      pathName: "image.zarr",
      name: "image.zarr",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig(),
      serverDeterminedSingleFile: true,
      pendingClientLoad: true,
    });

    const request = new Request("http://localhost/connections/test-conn/image.zarr");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "image.zarr" },
      serverLoader,
    } as never);

    expect(result.isSingleFile).toBe(true);
    expect(listObjectsClient).not.toHaveBeenCalled();
  });

  test("clientLoader builds a level tree from a non-empty listing", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "",
      pathName: "",
      name: "test-conn",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: ["image.zarr/", "czi/", "results/"],
      isCapped: false,
    });

    const request = new Request("http://localhost/connections/test-conn");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "" },
      serverLoader,
    } as never);

    expect(result.nodes.map((n) => n.name)).toEqual(["image.zarr", "czi", "results"]);
    expect(result.isSingleFile).toBeFalsy();
    expect(result.notification).toBeUndefined();
  });

  test("clientLoader surfaces a warning notification when the listing is capped", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "",
      pathName: "",
      name: "test-conn",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockResolvedValueOnce({
      contents: [{ Key: "file.tif" }],
      commonPrefixes: [],
      isCapped: true,
    });

    const request = new Request("http://localhost/connections/test-conn");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "" },
      serverLoader,
    } as never);

    expect(result.notification?.status).toBe("warning");
    expect(result.notification?.message).toMatch(/truncated/i);
  });

  test("clientLoader falls back to isSingleFile when the listing is empty", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "some/file.tif",
      pathName: "some/file.tif",
      name: "file.tif",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: [],
      isCapped: false,
    });

    const request = new Request("http://localhost/connections/test-conn/some/file.tif");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "some/file.tif" },
      serverLoader,
    } as never);

    expect(result.isSingleFile).toBe(true);
    expect(result.nodes).toEqual([]);
  });

  test("clientLoader flips pendingClientLoad to false once it resolves", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "",
      pathName: "",
      name: "test-conn",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockResolvedValueOnce({
      contents: [],
      commonPrefixes: ["a/", "b/"],
      isCapped: false,
    });

    const request = new Request("http://localhost/connections/test-conn");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "" },
      serverLoader,
    } as never);

    expect(result.pendingClientLoad).toBe(false);
  });

  test("clientLoader surfaces a CORS-specific notification on CorsLikelyError", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "",
      pathName: "",
      name: "test-conn",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockRejectedValueOnce(
      new CorsLikelyError("bucket.s3.amazonaws.com", "https://app.cytario.com"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/connections/test-conn");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "" },
      serverLoader,
    } as never);

    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/CORS/);
    expect(result.notification?.message).toMatch(/test-conn/);
  });

  test("clientLoader surfaces an error notification when listObjectsClient throws", async () => {
    const serverLoader = vi.fn().mockResolvedValue({
      connectionId: "test-conn",
      connectionName: "test-conn",
      bucketName: "b",
      urlPath: "",
      pathName: "",
      name: "test-conn",
      credentials: mock.credentials(),
      connectionConfig: mock.connectionConfig({ prefix: "" }),
      serverDeterminedSingleFile: false,
      pendingClientLoad: true,
    });

    listObjectsClient.mockRejectedValueOnce(new Error("nope"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/connections/test-conn");
    const result = await clientLoader({
      request,
      params: { id: "test-conn", "*": "" },
      serverLoader,
    } as never);

    expect(result.nodes).toEqual([]);
    expect(result.notification?.status).toBe("error");
  });
});
