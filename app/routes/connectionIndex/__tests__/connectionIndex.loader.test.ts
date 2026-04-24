import { NotFound } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnection = vi.fn();
const mockGetS3Client = vi.fn();

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: { get: vi.fn() },
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: (...args: unknown[]) => mockGetS3Client(...args),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
}));

async function runLoader(
  args: {
    params?: Record<string, string>;
    context?: unknown;
    url?: string;
  } = {},
) {
  const { loader } = await import(
    "~/routes/connectionIndex/connectionIndex.loader"
  );
  try {
    const result = await loader({
      params: args.params ?? {},
      context: args.context,
      request: new Request(args.url ?? "http://localhost/connectionIndex/x"),
    } as unknown as LoaderFunctionArgs);
    return { result, thrown: undefined as undefined | Response };
  } catch (error) {
    if (error instanceof Response) {
      return {
        result: undefined as never,
        thrown: error,
      };
    }
    throw error;
  }
}

describe("loader (GET /connectionIndex/:connectionName)", () => {
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    prefix: "",
  });

  const createContext = () => ({
    get: () => ({
      user,
      credentials: { "test-bucket": credentials },
    }),
    set: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("throws 400 Response when connectionName is missing", async () => {
    const { thrown } = await runLoader({ context: createContext() });
    expect(thrown?.status).toBe(400);
  });

  test("throws 404 Response when connection config not found", async () => {
    mockGetConnection.mockResolvedValue(null);

    const { thrown } = await runLoader({
      params: { connectionName: "nonexistent" },
      context: createContext(),
    });

    expect(thrown?.status).toBe(404);
  });

  test("throws 401 Response when no credentials for bucket", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);

    const { thrown } = await runLoader({
      params: { connectionName: "test-conn" },
      context: {
        get: () => ({ user, credentials: {} }),
        set: vi.fn(),
      },
    });

    expect(thrown?.status).toBe(401);
  });

  test("returns exists:true with metadata + sizeBytes when index exists", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Metadata: { "object-count": "1500" },
        LastModified: new Date("2025-06-15T12:00:00Z"),
        ContentLength: 204800,
      }),
    });

    const { result } = await runLoader({
      params: { connectionName: "test-conn" },
      context: createContext(),
    });

    expect(result).toEqual({
      connectionName: "test-conn",
      exists: true,
      objectCount: 1500,
      builtAt: "2025-06-15T12:00:00.000Z",
      sizeBytes: 204800,
    });
  });

  test("returns exists:false when index file not found", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi
        .fn()
        .mockRejectedValue(new NotFound({ message: "Not found", $metadata: {} })),
    });

    const { result } = await runLoader({
      params: { connectionName: "test-conn" },
      context: createContext(),
    });

    expect(result).toEqual({ connectionName: "test-conn", exists: false });
  });

  test("rethrows non-NotFound errors", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const { loader } = await import(
      "~/routes/connectionIndex/connectionIndex.loader"
    );

    await expect(
      loader({
        params: { connectionName: "test-conn" },
        context: createContext(),
        request: new Request(
          "http://localhost/connectionIndex/test-conn",
        ),
      } as unknown as LoaderFunctionArgs),
    ).rejects.toThrow("Network error");
  });

  test("returns objectCount 0 when metadata has no object-count", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Metadata: {},
        LastModified: new Date("2025-06-15T12:00:00Z"),
        ContentLength: 0,
      }),
    });

    const { result } = await runLoader({
      params: { connectionName: "test-conn" },
      context: createContext(),
    });

    expect(result).toEqual({
      connectionName: "test-conn",
      exists: true,
      objectCount: 0,
      builtAt: "2025-06-15T12:00:00.000Z",
      sizeBytes: 0,
    });
  });

  test("returns sizeBytes: null when ContentLength is missing", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Metadata: { "object-count": "100" },
        LastModified: new Date("2025-06-15T12:00:00Z"),
      }),
    });

    const { result } = await runLoader({
      params: { connectionName: "test-conn" },
      context: createContext(),
    });

    expect(result).toMatchObject({ sizeBytes: null });
  });

  describe("?slice=… live slice", () => {
    test("omits liveSlice when ?slice is absent", async () => {
      mockGetConnection.mockResolvedValue(connectionConfig);
      mockGetS3Client.mockResolvedValue({
        send: vi.fn().mockResolvedValue({
          Metadata: { "object-count": "10" },
          LastModified: new Date(),
          ContentLength: 100,
        }),
      });

      const { result } = await runLoader({
        params: { connectionName: "test-conn" },
        context: createContext(),
      });

      expect(result).not.toHaveProperty("liveSlice");
    });

    test("includes liveSlice built from ListObjectsV2(Delimiter=/) when ?slice present", async () => {
      mockGetConnection.mockResolvedValue(connectionConfig);
      const sendMock = vi
        .fn()
        // first call: ListObjectsV2 for the slice
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: "foo/a.txt",
              Size: 10,
              ETag: '"etag-a"',
              LastModified: new Date("2025-06-15T12:00:00Z"),
            },
            {
              Key: "foo/b.png",
              Size: 20,
              ETag: '"etag-b"',
              LastModified: new Date("2025-06-16T08:00:00Z"),
            },
          ],
          CommonPrefixes: [{ Prefix: "foo/sub/" }],
        })
        // second call: HeadObject probe
        .mockResolvedValueOnce({
          Metadata: { "object-count": "123" },
          LastModified: new Date("2025-06-14T09:00:00Z"),
          ContentLength: 4096,
        });
      mockGetS3Client.mockResolvedValue({ send: sendMock });

      const { result } = await runLoader({
        params: { connectionName: "test-conn" },
        context: createContext(),
        url: "http://localhost/connectionIndex/test-conn?slice=foo/",
      });

      expect(result.exists).toBe(true);
      expect("liveSlice" in result && result.liveSlice).toEqual({
        prefix: "foo/",
        objects: [
          {
            key: "foo/a.txt",
            size: 10,
            etag: "etag-a",
            lastModified: "2025-06-15T12:00:00.000Z",
          },
          {
            key: "foo/b.png",
            size: 20,
            etag: "etag-b",
            lastModified: "2025-06-16T08:00:00.000Z",
          },
        ],
        directories: ["foo/sub/"],
      });
    });

    test("liveSlice still populated when index is missing", async () => {
      mockGetConnection.mockResolvedValue(connectionConfig);
      const sendMock = vi
        .fn()
        // ListObjectsV2 returns fine
        .mockResolvedValueOnce({ Contents: [], CommonPrefixes: [] })
        // HeadObject 404s
        .mockRejectedValueOnce(
          new NotFound({ message: "nf", $metadata: {} }),
        );
      mockGetS3Client.mockResolvedValue({ send: sendMock });

      const { result } = await runLoader({
        params: { connectionName: "test-conn" },
        context: createContext(),
        url: "http://localhost/connectionIndex/test-conn?slice=",
      });

      expect(result).toEqual({
        connectionName: "test-conn",
        exists: false,
        liveSlice: { prefix: "", objects: [], directories: [] },
      });
    });
  });
});
