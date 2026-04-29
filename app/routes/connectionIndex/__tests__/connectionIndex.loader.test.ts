import { type S3Client, NotFound } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockContextGet = vi.fn();

vi.mock("~/.server/connection/connectionMiddleware", () => ({
  connectionContext: { get: vi.fn() },
  connectionMiddleware: vi.fn(),
}));

async function runLoader(
  args: {
    sendMock?: ReturnType<typeof vi.fn>;
    url?: string;
  } = {},
) {
  const send = args.sendMock ?? vi.fn();
  mockContextGet.mockReturnValue({
    connectionConfig: mock.connectionConfig({
      name: "test-conn",
      bucketName: "test-bucket",
      prefix: "",
    }),
    credentials: mock.credentials(),
    s3Client: { send } as unknown as S3Client,
  });

  const { loader } = await import(
    "~/routes/connectionIndex/connectionIndex.loader"
  );
  try {
    const result = await loader({
      params: { connectionName: "test-conn" },
      context: { get: mockContextGet, set: vi.fn() } as never,
      request: new Request(args.url ?? "http://localhost/connectionIndex/test-conn"),
    } as unknown as LoaderFunctionArgs);
    return { result, thrown: undefined as undefined | Response };
  } catch (error) {
    if (error instanceof Response) return { result: undefined as never, thrown: error };
    throw error;
  }
}

describe("loader (GET /connectionIndex/:connectionName)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns exists:true with metadata + sizeBytes when index exists", async () => {
    const { result } = await runLoader({
      sendMock: vi.fn().mockResolvedValue({
        Metadata: { "object-count": "1500" },
        LastModified: new Date("2025-06-15T12:00:00Z"),
        ContentLength: 204800,
      }),
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
    const { result } = await runLoader({
      sendMock: vi
        .fn()
        .mockRejectedValue(new NotFound({ message: "Not found", $metadata: {} })),
    });

    expect(result).toEqual({ connectionName: "test-conn", exists: false });
  });

  test("rethrows non-NotFound errors", async () => {
    await expect(
      runLoader({ sendMock: vi.fn().mockRejectedValue(new Error("Network error")) }),
    ).rejects.toThrow("Network error");
  });

  test("returns objectCount 0 when metadata has no object-count", async () => {
    const { result } = await runLoader({
      sendMock: vi.fn().mockResolvedValue({
        Metadata: {},
        LastModified: new Date("2025-06-15T12:00:00Z"),
        ContentLength: 0,
      }),
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
    const { result } = await runLoader({
      sendMock: vi.fn().mockResolvedValue({
        Metadata: { "object-count": "100" },
        LastModified: new Date("2025-06-15T12:00:00Z"),
      }),
    });

    expect(result).toMatchObject({ sizeBytes: null });
  });

  describe("?slice=… live slice", () => {
    test("omits liveSlice when ?slice is absent", async () => {
      const { result } = await runLoader({
        sendMock: vi.fn().mockResolvedValue({
          Metadata: { "object-count": "10" },
          LastModified: new Date(),
          ContentLength: 100,
        }),
      });

      expect(result).not.toHaveProperty("liveSlice");
    });

    test("includes liveSlice built from ListObjectsV2(Delimiter=/) when ?slice present", async () => {
      const sendMock = vi
        .fn()
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
        .mockResolvedValueOnce({
          Metadata: { "object-count": "123" },
          LastModified: new Date("2025-06-14T09:00:00Z"),
          ContentLength: 4096,
        });

      const { result } = await runLoader({
        sendMock,
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
      const sendMock = vi
        .fn()
        .mockResolvedValueOnce({ Contents: [], CommonPrefixes: [] })
        .mockRejectedValueOnce(new NotFound({ message: "nf", $metadata: {} }));

      const { result } = await runLoader({
        sendMock,
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
