import { type S3Client } from "@aws-sdk/client-s3";
import { ActionFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockContextGet = vi.fn();
const mockDuckRun = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from("fake-parquet"));
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock("~/.server/connection/connectionMiddleware", () => ({
  connectionContext: { get: vi.fn() },
  connectionMiddleware: vi.fn(),
}));

// Stub DuckDB + fs so the test doesn't actually spin up the native engine.
vi.mock("@duckdb/node-api", () => ({
  DuckDBInstance: {
    create: async () => ({
      connect: async () => ({ run: mockDuckRun }),
    }),
  },
}));
vi.mock("fs/promises", () => {
  const fns = {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  };
  return { ...fns, default: fns };
});

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("connectionIndexCreate (POST /connectionIndex/:connectionName)", () => {
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    provider: "aws",
    prefix: "data",
    ownerScope: "org1/lab",
  });

  const seedContext = (sendMock: ReturnType<typeof vi.fn>) => {
    mockContextGet.mockReturnValue({
      connectionConfig,
      credentials: mock.credentials(),
      s3Client: { send: sendMock } as unknown as S3Client,
    });
  };

  const invoke = async () => {
    const { connectionIndexCreate } = await import(
      "~/routes/connectionIndex/connectionIndexCreate"
    );
    return connectionIndexCreate({
      params: { connectionName: "test-conn" },
      context: { get: mockContextGet, set: vi.fn() } as never,
      request: new Request("http://localhost/connectionIndex/test-conn", {
        method: "POST",
      }),
    } as unknown as ActionFunctionArgs);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDuckRun.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from("fake-parquet"));
    mockUnlink.mockResolvedValue(undefined);
  });

  test("redirects to /connections/:name on success", async () => {
    seedContext(vi.fn().mockResolvedValue({ Contents: [] }));

    const response = (await invoke()) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/connections/test-conn");
  });

  test("applies the connectionIndex filter while listing (drops zarr chunks; .cytario/ entries are kept)", async () => {
    const sendMock = vi.fn().mockImplementation((cmd) => {
      const commandName = cmd?.constructor?.name ?? "";
      if (commandName === "ListObjectsV2Command") {
        return {
          Contents: [
            { Key: "data/a.txt", Size: 1, ETag: '"a"', LastModified: new Date() },
            { Key: "data/sample.zarr/.zattrs", Size: 2, ETag: '"z1"', LastModified: new Date() },
            { Key: "data/sample.zarr/0/0", Size: 3, ETag: '"z2"', LastModified: new Date() }, // dropped (zarr chunk)
            { Key: "data/.cytario/index.parquet", Size: 9, ETag: '"c"', LastModified: new Date() }, // kept
          ],
        };
      }
      return {};
    });
    seedContext(sendMock);

    await invoke();

    const putCall = sendMock.mock.calls.find(
      ([c]) => c?.constructor?.name === "PutObjectCommand",
    );
    expect(putCall?.[0].input.Metadata["object-count"]).toBe("3");
  });

  test("returns 500 on S3 failure", async () => {
    seedContext(vi.fn().mockRejectedValue(new Error("S3 connection failed")));
    const response = (await invoke()) as Response;
    expect(response.status).toBe(500);
  });
});
