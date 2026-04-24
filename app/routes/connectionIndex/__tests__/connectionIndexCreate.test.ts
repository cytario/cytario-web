import { ActionFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnection = vi.fn();
const mockGetS3Client = vi.fn();
const mockDuckRun = vi.fn();
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from("fake-parquet"));
const mockUnlink = vi.fn().mockResolvedValue(undefined);

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
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    provider: "aws",
    prefix: "data",
    ownerScope: "org1/lab",
  });

  const createContext = () => ({
    get: () => ({
      user,
      credentials: { "test-bucket": credentials },
    }),
    set: vi.fn(),
  });

  const invoke = async (
    params: Record<string, string>,
    context: unknown = createContext(),
  ) => {
    const { connectionIndexCreate } = await import(
      "~/routes/connectionIndex/connectionIndexCreate"
    );
    return connectionIndexCreate({
      params,
      context,
      request: new Request("http://localhost/connectionIndex/x", {
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

  test("returns 400 when connectionName is missing", async () => {
    const response = (await invoke({})) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 404 when connection config not found", async () => {
    mockGetConnection.mockResolvedValue(null);
    const response = (await invoke({ connectionName: "missing" })) as Response;
    expect(response.status).toBe(404);
  });

  test("returns 401 when no credentials for bucket", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const response = (await invoke(
      { connectionName: "test-conn" },
      { get: () => ({ user, credentials: {} }), set: vi.fn() },
    )) as Response;
    expect(response.status).toBe(401);
  });

  test("redirects to /connections/:name on success", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi.fn().mockResolvedValue({ Contents: [] });
    mockGetS3Client.mockResolvedValue({ send: sendMock });

    const response = (await invoke({ connectionName: "test-conn" })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/connections/test-conn");
  });

  test("applies the connectionIndex filter while listing (drops zarr chunks + .cytario/)", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi.fn().mockImplementation((cmd) => {
      const commandName = cmd?.constructor?.name ?? "";
      if (commandName === "ListObjectsV2Command") {
        return {
          Contents: [
            { Key: "data/a.txt", Size: 1, ETag: '"a"', LastModified: new Date() },
            { Key: "data/sample.zarr/.zattrs", Size: 2, ETag: '"z1"', LastModified: new Date() },
            { Key: "data/sample.zarr/0/0", Size: 3, ETag: '"z2"', LastModified: new Date() }, // dropped
            { Key: "data/.cytario/index.parquet", Size: 9, ETag: '"c"', LastModified: new Date() }, // dropped
          ],
        };
      }
      return {};
    });
    mockGetS3Client.mockResolvedValue({ send: sendMock });

    await invoke({ connectionName: "test-conn" });

    // Both the ListObjectsV2 and PutObject calls happened; PutObject's Metadata
    // reflects the filtered count (2: a.txt + .zattrs).
    const putCall = sendMock.mock.calls.find(
      ([c]) => c?.constructor?.name === "PutObjectCommand",
    );
    expect(putCall?.[0].input.Metadata["object-count"]).toBe("2");
  });

  test("returns 500 on S3 failure", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockRejectedValue(new Error("S3 connection failed"));
    const response = (await invoke({ connectionName: "test-conn" })) as Response;
    expect(response.status).toBe(500);
  });
});
